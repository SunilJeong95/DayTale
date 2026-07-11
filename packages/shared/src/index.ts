/**
 * @daytale/shared — WS-D "Shared contract"
 *
 * Source of truth: `.omc/plans/autopilot-impl.md` §1.5 (data model, including
 * all "CRITIC FIX" corrections, which are authoritative) and §2 (async
 * pipeline / generation_jobs payload shapes).
 *
 * This package has NO runtime dependency on Supabase or the worker — it is
 * pure types + zod schemas + enums, consumed by:
 *   - apps/mobile (WS-B..WS-I): typed Supabase client, form validation
 *   - services/worker (WS-C): typed row access, job payload validation
 *   - supabase/ (WS-A): not consumed directly (SQL), but this file must stay
 *     in lockstep with the migrations WS-A writes.
 *
 * Do not add Supabase-client or React-Native-specific code here.
 */

import { z } from "zod";

// =============================================================================
// Genre / Tone enums (plan §4 — "Genre/tone options live in packages/shared
// as enums ... rendered in Korean")
// =============================================================================

/** Machine-facing genre codes. Stored as `episodes.genre` / `generation_jobs.genre` (text). */
export const GENRES = [
  "romance",
  "fantasy",
  "mystery",
  "daily",
  "adventure",
] as const;

export type GenreCode = (typeof GENRES)[number];

/** Korean display labels for each genre, for UI rendering. */
export const GENRE_LABEL_KO: Record<GenreCode, string> = {
  romance: "로맨스",
  fantasy: "판타지",
  mystery: "미스터리",
  daily: "일상",
  adventure: "모험",
};

/** Machine-facing tone codes. Stored as `episodes.tone` / `generation_jobs.tone` (text). */
export const TONES = ["warm", "dramatic", "comedic", "nostalgic"] as const;

export type ToneCode = (typeof TONES)[number];

/** Korean display labels for each tone, for UI rendering. */
export const TONE_LABEL_KO: Record<ToneCode, string> = {
  warm: "따뜻한",
  dramatic: "드라마틱한",
  comedic: "코믹한",
  nostalgic: "향수 어린",
};

export const GenreCodeSchema = z.enum(GENRES);
export const ToneCodeSchema = z.enum(TONES);

// =============================================================================
// Shared primitive aliases
// =============================================================================

/** UUID string (Postgres `uuid`). Not branded — kept as `string` for ergonomics. */
export type UUID = string;

/** ISO date string, Postgres `date` (e.g. "2026-07-09"), no time component. */
export type ISODateString = string;

/** ISO timestamp string, Postgres `timestamptz` (e.g. "2026-07-09T12:34:56.000Z"). */
export type ISODateTimeString = string;

/** Auth provider recorded on `profiles.provider` (informational only). */
export const AUTH_PROVIDERS = ["google", "apple", "kakao"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// =============================================================================
// Table row types — plan §1.5, "CRITIC FIX" annotations applied (authoritative)
// =============================================================================

/**
 * `profiles` — extends `auth.users`.
 * [CRITIC FIX #7]: `nickname` is nullable until onboarding completes; the
 * post-login trigger inserts a profile with `nickname=null`, and
 * `onboarding/nickname.tsx` sets it via a unique-checked UPDATE.
 */
export type ProfileRow = {
  id: UUID;
  nickname: string | null;
  avatar_url: string | null;
  provider: AuthProvider | null;
  expo_push_token: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

/**
 * `series` — one per user (1:1 via `unique(owner_id)`), created lazily on
 * first episode.
 */
export type SeriesRow = {
  id: UUID;
  owner_id: UUID;
  title: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

/**
 * `diary_entries` — one row per (author, day); edits update the same row.
 * `char_count` is a generated column (`generated always as (char_length(text)) stored`)
 * — never write/trust a client-supplied value for it.
 */
export type DiaryEntryRow = {
  id: UUID;
  author_id: UUID;
  entry_date: ISODateString;
  text: string;
  /** Generated column — server-computed, read-only from clients. */
  char_count: number;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

/** `episodes.status` lifecycle. */
export const EPISODE_STATUSES = ["draft", "private", "published"] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

/**
 * `episodes`.
 * [CRITIC FIX #1]: `episode_number` is nullable — it is assigned only inside
 * `publish_episode` (plan §2.1 step 6), not at draft-creation time.
 * [CRITIC FIX #2]: `sort_date` is `min(entry_date)` across the episode's
 * `episode_sources`; ordering/numbering derive from this, not publish order.
 */
export type EpisodeRow = {
  id: UUID;
  series_id: UUID;
  author_id: UUID;
  /** Null until published; assigned/renumbered transactionally by `publish_episode`. */
  episode_number: number | null;
  /** = min(entry_date) of source diary entries. Drives chronological ordering. */
  sort_date: ISODateString;
  title: string | null;
  content: string;
  status: EpisodeStatus;
  genre: GenreCode;
  tone: ToneCode;
  published_at: ISODateTimeString | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

/**
 * `episode_sources` — join table, N diary entries -> 1 episode (batch support).
 * [CRITIC FIX #5]: `diary_entry_id` is unique at the DB level — a diary entry
 * belongs to at most one episode. Modeled here as a required, non-repeating
 * key so callers know not to reuse a `diary_entry_id` across episodes; actual
 * uniqueness enforcement is the DB constraint (WS-A), not this type.
 */
export type EpisodeSourceRow = {
  episode_id: UUID;
  /** Unique across all episode_sources rows (DB constraint) — at most 1 episode per diary entry. */
  diary_entry_id: UUID;
  created_at: ISODateTimeString;
};

/** `generation_jobs.mode`. */
export const GENERATION_JOB_MODES = ["clarify", "generate"] as const;
export type GenerationJobMode = (typeof GENERATION_JOB_MODES)[number];

/** `generation_jobs.status`. */
export const GENERATION_JOB_STATUSES = [
  "queued",
  "processing",
  "awaiting_input",
  "completed",
  "failed",
] as const;
export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];

/**
 * `generation_jobs` — the async queue (plan §1.5, §2.1, §2.2).
 * [CRITIC FIX #4]: `active_job_key` (author_id + sorted diary_entry_ids) is
 * paired with a partial unique index in the DB (`WHERE status IN
 * ('queued','processing','awaiting_input')`) so a duplicate enqueue for the
 * same author+batch while one is in flight is rejected. Set by the
 * `enqueue_generation` RPC, not written directly by clients.
 * [CRITIC FIX #3]: retries are implemented by re-setting `status='queued'`
 * (not `'failed'`) while `attempts < max_attempts`; only the final failure
 * sets `status='failed'`.
 */
export type GenerationJobRow = {
  id: UUID;
  author_id: UUID;
  episode_id: UUID | null;
  diary_entry_ids: UUID[];
  genre: GenreCode;
  tone: ToneCode;
  batch_label: string | null;
  mode: GenerationJobMode;
  status: GenerationJobStatus;
  clarifying_questions: ClarifyingQuestion[] | null;
  clarifying_answers: ClarifyingAnswer[] | null;
  attempts: number;
  max_attempts: number;
  error: string | null;
  locked_at: ISODateTimeString | null;
  /** `author_id:sorted(diary_entry_ids)` — set by `enqueue_generation` RPC. See CRITIC FIX #4. */
  active_job_key: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

/** `reports.target_type`. */
export const REPORT_TARGET_TYPES = ["episode", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** `reports`. */
export type ReportRow = {
  id: UUID;
  reporter_id: UUID;
  target_type: ReportTargetType;
  target_id: UUID;
  reason: string | null;
  /** Free-form status text; MVP only ever writes 'open' (plan §7 — unactioned reports gap). */
  status: string;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

/** `blocks` — composite PK (blocker_id, blocked_id). */
export type BlockRow = {
  blocker_id: UUID;
  blocked_id: UUID;
  created_at: ISODateTimeString;
};

/**
 * `public_feed_series` — not a table, a view (plan §1.5): authors with >=1
 * published episode + counts, feed-view-filtered by blocks (query-planner
 * optimization; RLS on `episodes` is the real security boundary, CRITIC FIX #6).
 */
export type PublicFeedSeriesRow = {
  series_id: UUID;
  owner_id: UUID;
  title: string | null;
  author_nickname: string | null;
  author_avatar_url: string | null;
  published_episode_count: number;
  latest_published_at: ISODateTimeString | null;
};

/** `public_profiles` — view exposing only nickname+avatar (plan §1.5 RLS notes). */
export type PublicProfileRow = {
  id: UUID;
  nickname: string | null;
  avatar_url: string | null;
};

// =============================================================================
// Insert/Update helper types (omit server-generated columns)
// =============================================================================

export type ProfileUpdate = Partial<
  Pick<ProfileRow, "nickname" | "avatar_url" | "provider" | "expo_push_token">
>;

export type DiaryEntryInsert = Pick<
  DiaryEntryRow,
  "author_id" | "entry_date" | "text"
>;

export type DiaryEntryUpdate = Pick<DiaryEntryRow, "text">;

export type EpisodeUpdate = Partial<
  Pick<EpisodeRow, "title" | "content">
>;

// =============================================================================
// Supabase `Database` typing convenience (for `createClient<Database>()`)
// =============================================================================

/**
 * NOTE on `Relationships: []`: @supabase/postgrest-js's `GenericTable` /
 * `GenericView` constraints require a `Relationships` field on every table
 * and view (this is what `supabase gen types` always emits). Without it,
 * `Database` fails to satisfy `GenericSchema` and postgrest-js's generic
 * inference silently collapses `.insert()`/`.update()` argument types to
 * `never` for every table — hand-written here since there is no real
 * Supabase project yet to generate types from; no FK-based embedding is
 * used by this app, so the array stays empty.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, "id">;
        Update: ProfileUpdate;
        Relationships: [];
      };
      series: {
        Row: SeriesRow;
        Insert: Pick<SeriesRow, "owner_id"> & Partial<Pick<SeriesRow, "title">>;
        Update: Partial<Pick<SeriesRow, "title">>;
        Relationships: [];
      };
      diary_entries: {
        Row: DiaryEntryRow;
        Insert: DiaryEntryInsert;
        Update: DiaryEntryUpdate;
        Relationships: [];
      };
      episodes: {
        Row: EpisodeRow;
        Insert: Partial<EpisodeRow> &
          Pick<EpisodeRow, "series_id" | "author_id" | "genre" | "tone" | "sort_date">;
        Update: EpisodeUpdate;
        Relationships: [];
      };
      episode_sources: {
        Row: EpisodeSourceRow;
        Insert: Pick<EpisodeSourceRow, "episode_id" | "diary_entry_id">;
        Update: never;
        Relationships: [];
      };
      generation_jobs: {
        Row: GenerationJobRow;
        Insert: Partial<GenerationJobRow> &
          Pick<GenerationJobRow, "author_id" | "diary_entry_ids" | "genre" | "tone">;
        Update: Partial<GenerationJobRow>;
        Relationships: [];
      };
      reports: {
        Row: ReportRow;
        Insert: Pick<ReportRow, "reporter_id" | "target_type" | "target_id"> &
          Partial<Pick<ReportRow, "reason">>;
        Update: Partial<Pick<ReportRow, "status">>;
        Relationships: [];
      };
      blocks: {
        Row: BlockRow;
        Insert: Pick<BlockRow, "blocker_id" | "blocked_id">;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      public_feed_series: { Row: PublicFeedSeriesRow; Relationships: [] };
      public_profiles: { Row: PublicProfileRow; Relationships: [] };
    };
    /**
     * RPCs from supabase/migrations/0003_rpc.sql. `reap_stale_jobs` is
     * service_role-only (worker-side) and intentionally omitted here since
     * the app client never calls it.
     */
    Functions: {
      enqueue_generation: {
        Args: {
          diary_entry_ids: UUID[];
          genre: GenreCode;
          tone: ToneCode;
          batch_label?: string | null;
        };
        Returns: { job_id: UUID; episode_id: UUID }[];
      };
      publish_episode: {
        Args: { episode_id: UUID };
        Returns: void;
      };
    };
  };
}

// =============================================================================
// Zod schemas — generation_jobs payload shapes (plan §2.1, §2.2)
// =============================================================================

/** A single AI-generated clarifying question (plan §2.2). */
export const ClarifyingQuestionSchema = z.object({
  id: z.string(),
  question_ko: z.string().min(1),
});
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

/** A single user-submitted answer to a clarifying question (plan §2.2). */
export const ClarifyingAnswerSchema = z.object({
  question_id: z.string(),
  answer_ko: z.string().min(1),
});
export type ClarifyingAnswer = z.infer<typeof ClarifyingAnswerSchema>;

export const ClarifyingQuestionsSchema = z.array(ClarifyingQuestionSchema).max(3);
export const ClarifyingAnswersSchema = z.array(ClarifyingAnswerSchema);

export const GenerationJobModeSchema = z.enum(GENERATION_JOB_MODES);
export const GenerationJobStatusSchema = z.enum(GENERATION_JOB_STATUSES);

/**
 * Input payload for the `enqueue_generation(diary_entry_ids, genre, tone)` RPC
 * (plan §1.5 CRITIC FIX #4 / §2.1 step 2). This is what `generate.tsx` (WS-F)
 * sends; the RPC itself does the series-upsert + placeholder-episode +
 * generation_jobs insert transactionally.
 */
export const EnqueueGenerationInputSchema = z.object({
  diary_entry_ids: z.array(z.string().uuid()).min(1),
  genre: GenreCodeSchema,
  tone: ToneCodeSchema,
  batch_label: z.string().min(1).nullable().optional(),
});
export type EnqueueGenerationInput = z.infer<typeof EnqueueGenerationInputSchema>;

/**
 * Full shape of a `generation_jobs` row's mutable/job-relevant fields, for
 * validating worker-side reads/writes and client-side status rendering.
 * Mirrors `GenerationJobRow` but as a zod schema for runtime validation
 * (e.g. validating worker responses or Realtime payloads before use).
 */
export const GenerationJobPayloadSchema = z.object({
  id: z.string().uuid(),
  author_id: z.string().uuid(),
  episode_id: z.string().uuid().nullable(),
  diary_entry_ids: z.array(z.string().uuid()).min(1),
  genre: GenreCodeSchema,
  tone: ToneCodeSchema,
  batch_label: z.string().nullable(),
  mode: GenerationJobModeSchema,
  status: GenerationJobStatusSchema,
  clarifying_questions: ClarifyingQuestionsSchema.nullable(),
  clarifying_answers: ClarifyingAnswersSchema.nullable(),
  attempts: z.number().int().min(0),
  max_attempts: z.number().int().min(1),
  error: z.string().nullable(),
  locked_at: z.string().nullable(),
  active_job_key: z.string().nullable(),
});
export type GenerationJobPayload = z.infer<typeof GenerationJobPayloadSchema>;

/**
 * Payload the app submits to move an `awaiting_input` job back to `queued`
 * with `mode='generate'` after the user answers clarifying questions
 * (plan §2.2 CRITIC FIX — same job re-queued, not a new job).
 */
export const SubmitClarifyingAnswersInputSchema = z.object({
  job_id: z.string().uuid(),
  clarifying_answers: ClarifyingAnswersSchema.min(1),
});
export type SubmitClarifyingAnswersInput = z.infer<
  typeof SubmitClarifyingAnswersInputSchema
>;

// =============================================================================
// Diary entry validation (plan §2.1 step 1 — >=50 char hint, not a hard block)
// =============================================================================

export const DIARY_RECOMMENDED_MIN_CHARS = 50;

export const DiaryEntryUpsertInputSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "entry_date must be YYYY-MM-DD"),
  text: z.string().min(1, "일기 내용을 입력해주세요"),
});
export type DiaryEntryUpsertInput = z.infer<typeof DiaryEntryUpsertInputSchema>;
