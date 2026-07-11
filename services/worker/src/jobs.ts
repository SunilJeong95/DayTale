/**
 * services/worker/src/jobs.ts — job claim/complete/fail logic (WS-C).
 *
 * All access here goes through the **service-role** Supabase client, which
 * bypasses RLS — this is the one place in the whole system allowed to touch
 * other users' rows (plan §1.5 "Service-role key (worker only) bypasses RLS
 * to update episodes/jobs.").
 *
 * `FOR UPDATE SKIP LOCKED` choice: supabase-js's PostgREST query builder
 * cannot express the correlated-subquery-with-row-locking poll query from
 * plan §2.1 step 3. Rather than add a `pg`/direct-Postgres dependency (which
 * would need a new `DATABASE_URL` env var not present in .env.example), the
 * SKIP LOCKED semantics live in a small SQL function,
 * `supabase/migrations/0004_claim_next_job.sql`, called here via `.rpc()`.
 * This keeps the worker on a single client and matches the existing
 * SECURITY DEFINER RPC pattern already used for `enqueue_generation`,
 * `publish_episode`, and `reap_stale_jobs` (0003_rpc.sql).
 *
 * Note on typing: the client is intentionally constructed *without* the
 * `@daytale/shared` `Database` generic. The `Database` type (WS-D) predates
 * `@supabase/supabase-js`'s newer PostgREST typings, which require each
 * table to declare a `Relationships` array; without it every `.insert()`/
 * `.update()` call here type-errors to `never`. Rather than reshape WS-D's
 * shared `Database` type (owned by another workstream) to satisfy one
 * library's internal typing contract, this module uses the client
 * untyped (defaults to `any` schema) and relies on the explicit
 * `@daytale/shared` row types below for its own function signatures and
 * return-value casts — the actual compile-time safety boundary for callers
 * of this module.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ClarifyingQuestion,
  DiaryEntryRow,
  GenerationJobRow,
} from "@daytale/shared";

let serviceClient: SupabaseClient | null = null;

/** Lazily-constructed singleton service-role Supabase client. */
export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see root .env.example"
    );
  }

  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

/**
 * Claim the next queued job (plan §2.1 step 3). Calls the `claim_next_job()`
 * RPC, which atomically does:
 *   UPDATE generation_jobs SET status='processing', locked_at=now(),
 *     attempts=attempts+1
 *   WHERE id = (SELECT id FROM generation_jobs WHERE status='queued' ...
 *     FOR UPDATE SKIP LOCKED LIMIT 1)
 *   RETURNING *
 * Returns `null` when the queue is empty.
 */
export async function claimNextJob(): Promise<GenerationJobRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("claim_next_job");
  if (error) {
    throw new Error(`[worker] claim_next_job RPC failed: ${error.message}`);
  }
  const rows = (data ?? []) as GenerationJobRow[];
  return rows[0] ?? null;
}

/** Diary entries for a job's batch, ordered oldest-first for narrative continuity. */
export async function fetchDiaryEntriesForJob(
  job: Pick<GenerationJobRow, "diary_entry_ids">
): Promise<DiaryEntryRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("diary_entries")
    .select("*")
    .in("id", job.diary_entry_ids);
  if (error) {
    throw new Error(`[worker] fetching diary_entries failed: ${error.message}`);
  }
  const rows = (data ?? []) as DiaryEntryRow[];
  return [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

/**
 * `mode='generate'` success path: write the generated title/content onto
 * the placeholder episode and mark the job completed.
 */
export async function completeGenerateJob(
  job: GenerationJobRow,
  title: string,
  content: string
): Promise<void> {
  if (!job.episode_id) {
    throw new Error(
      `[worker] generation_jobs.${job.id} has no episode_id — cannot write generated content`
    );
  }

  const supabase = getServiceClient();

  const { error: episodeError } = await supabase
    .from("episodes")
    .update({ title, content })
    .eq("id", job.episode_id);
  if (episodeError) {
    throw new Error(`[worker] writing episode content failed: ${episodeError.message}`);
  }

  const { error: jobError } = await supabase
    .from("generation_jobs")
    .update({ status: "completed", locked_at: null, error: null })
    .eq("id", job.id);
  if (jobError) {
    throw new Error(`[worker] marking job completed failed: ${jobError.message}`);
  }
}

/**
 * `mode='clarify'` success path (plan §2.2): store the questions and move
 * the job to `awaiting_input` — NOT a "novel ready" completion.
 */
export async function completeClarifyJob(
  job: GenerationJobRow,
  questions: ClarifyingQuestion[]
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({
      status: "awaiting_input",
      clarifying_questions: questions,
      locked_at: null,
      error: null,
    })
    .eq("id", job.id);
  if (error) {
    throw new Error(`[worker] marking job awaiting_input failed: ${error.message}`);
  }
}

/**
 * [CRITIC FIX #3] On error: if `attempts < max_attempts`, requeue
 * (`status='queued'`, `locked_at=null`) so the `status='queued'`-only poll
 * re-picks it — this is what actually implements "retry up to 3 attempts".
 * Only once `attempts >= max_attempts` does the job become `status='failed'`
 * for good. `job.attempts` here already reflects the increment done by
 * `claim_next_job()` for this attempt.
 */
export async function failOrRetryJob(
  job: GenerationJobRow,
  errorMessage: string
): Promise<{ willRetry: boolean }> {
  const supabase = getServiceClient();
  const willRetry = job.attempts < job.max_attempts;

  const { error } = await supabase
    .from("generation_jobs")
    .update({
      status: willRetry ? "queued" : "failed",
      locked_at: willRetry ? null : job.locked_at,
      error: errorMessage,
    })
    .eq("id", job.id);
  if (error) {
    throw new Error(`[worker] failOrRetryJob update failed: ${error.message}`);
  }
  return { willRetry };
}

/**
 * Stale-job reaper (plan §2.1 step 3): resets rows stuck in
 * `status='processing'` with `locked_at` older than the RPC's threshold back
 * to `status='queued'` (or `'failed'` once `max_attempts` is exceeded).
 * Meant to be called periodically from the poll loop (see index.ts).
 */
export async function reapStaleJobs(): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.rpc("reap_stale_jobs");
  if (error) {
    throw new Error(`[worker] reap_stale_jobs RPC failed: ${error.message}`);
  }
}

/** `profiles.expo_push_token` for a job's author (plan §2.4). */
export async function fetchAuthorPushToken(authorId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .eq("id", authorId)
    .maybeSingle();
  if (error) {
    throw new Error(`[worker] fetching push token failed: ${error.message}`);
  }
  return data?.expo_push_token ?? null;
}

/** Null out a stale Expo push token (plan §2.4, `DeviceNotRegistered`). */
export async function clearAuthorPushToken(authorId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("profiles")
    .update({ expo_push_token: null })
    .eq("id", authorId);
  if (error) {
    throw new Error(`[worker] clearing stale push token failed: ${error.message}`);
  }
}
