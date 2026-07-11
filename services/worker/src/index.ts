/**
 * services/worker/src/index.ts — generation worker poll-loop entrypoint (WS-C).
 *
 * Flow (plan §2.1 step 3, §2.2, §2.4):
 *   claim -> route by mode (clarify vs generate) -> call gemini.ts
 *     -> on success: jobs.completeJob*() + (generate-only) push.ts notify
 *     -> on failure: jobs.failOrRetryJob() [CRITIC FIX #3 retry-requeue]
 *   plus a periodic reap_stale_jobs() sweep (CRITIC FIX #3 stale-job reaper).
 *
 * Env-var validation and the poll-interval knob are kept as established by
 * the M0 stub (`WORKER_POLL_INTERVAL_MS`, `WORKER_STALE_JOB_MINUTES`).
 */

import type { GenerationJobRow } from "@daytale/shared";
import {
  claimNextJob,
  completeClarifyJob,
  completeGenerateJob,
  failOrRetryJob,
  fetchAuthorPushToken,
  fetchDiaryEntriesForJob,
  reapStaleJobs,
} from "./jobs";
import { generateClarifyingQuestions, generateEpisode } from "./gemini";
import { sendGenerationCompletePush } from "./push";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
const STALE_JOB_MINUTES = Number(process.env.WORKER_STALE_JOB_MINUTES ?? 10);
// reap_stale_jobs() hardcodes its own 10-minute staleness threshold
// (supabase/migrations/0003_rpc.sql); WORKER_STALE_JOB_MINUTES here only
// tunes how often this worker *sweeps* for stale jobs — run at roughly half
// the staleness window (min 1 minute) so orphaned jobs are recovered
// reasonably close to when they actually go stale.
const REAP_INTERVAL_MS = Math.max(60_000, (STALE_JOB_MINUTES * 60_000) / 2);

function assertEnv(name: string): void {
  if (!process.env[name]) {
    // eslint-disable-next-line no-console
    console.warn(`[worker] missing env var ${name} — see root .env.example`);
  }
}

function validateEnv(): void {
  assertEnv("SUPABASE_URL");
  assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertEnv("GEMINI_API_KEY");
}

async function processClarifyJob(job: GenerationJobRow): Promise<void> {
  const diaryEntries = await fetchDiaryEntriesForJob(job);
  const questions = await generateClarifyingQuestions({
    diaryEntries,
    genre: job.genre,
    tone: job.tone,
    batchLabel: job.batch_label,
  });
  // mode='clarify' completion sets status='awaiting_input' with the
  // questions — NOT a "novel ready" push (plan §2.2 / WS-C spec).
  await completeClarifyJob(job, questions);
}

async function processGenerateJob(job: GenerationJobRow): Promise<void> {
  const diaryEntries = await fetchDiaryEntriesForJob(job);
  const { title, content } = await generateEpisode({
    diaryEntries,
    genre: job.genre,
    tone: job.tone,
    batchLabel: job.batch_label,
    clarifyingQuestions: job.clarifying_questions,
    clarifyingAnswers: job.clarifying_answers,
  });

  await completeGenerateJob(job, title, content);

  if (job.episode_id) {
    try {
      const expoPushToken = await fetchAuthorPushToken(job.author_id);
      await sendGenerationCompletePush({
        authorId: job.author_id,
        expoPushToken,
        episodeId: job.episode_id,
        episodeTitle: title,
      });
    } catch (err) {
      // Push failure must never fail the (already-completed) job — Realtime
      // is the belt-and-suspenders channel (plan §2.1 step 4).
      // eslint-disable-next-line no-console
      console.error(`[worker] push notification failed for job ${job.id}`, err);
    }
  }
}

async function processJob(job: GenerationJobRow): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] claimed job ${job.id} (mode=${job.mode}, attempt=${job.attempts})`);

  try {
    if (job.mode === "clarify") {
      await processClarifyJob(job);
    } else {
      await processGenerateJob(job);
    }
    // eslint-disable-next-line no-console
    console.log(`[worker] job ${job.id} finished successfully (mode=${job.mode})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[worker] job ${job.id} failed`, err);
    const { willRetry } = await failOrRetryJob(job, message);
    // eslint-disable-next-line no-console
    console.log(
      `[worker] job ${job.id} ${willRetry ? "requeued for retry" : "marked failed (max_attempts reached)"}`
    );
  }
}

let isPolling = false;

async function pollOnce(): Promise<void> {
  if (isPolling) return; // avoid overlapping ticks if a claim/process runs long
  isPolling = true;
  try {
    const job = await claimNextJob();
    if (!job) return;
    await processJob(job);
  } finally {
    isPolling = false;
  }
}

let isReaping = false;

async function reapOnce(): Promise<void> {
  if (isReaping) return;
  isReaping = true;
  try {
    await reapStaleJobs();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[worker] reap_stale_jobs sweep failed", err);
  } finally {
    isReaping = false;
  }
}

async function main(): Promise<void> {
  validateEnv();
  // eslint-disable-next-line no-console
  console.log(
    `[worker] starting poll loop: interval=${POLL_INTERVAL_MS}ms, reapInterval=${REAP_INTERVAL_MS}ms`
  );

  setInterval(() => {
    pollOnce().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[worker] poll tick failed", err);
    });
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    reapOnce().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[worker] reap tick failed", err);
    });
  }, REAP_INTERVAL_MS);

  // Run an initial reap on startup to recover anything orphaned by a
  // previous crash before the first sweep interval elapses.
  await reapOnce();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal startup error", err);
  process.exit(1);
});
