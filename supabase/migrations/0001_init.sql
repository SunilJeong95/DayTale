-- 0001_init.sql — DayTale core schema (WS-A · Database & RLS)
--
-- Source of truth: .omc/plans/autopilot-impl.md §1.5 ("Data model"). All
-- [CRITIC FIX #n] annotations below correspond 1:1 to the plan's authoritative
-- corrections and must match packages/shared/src/index.ts row types exactly.
--
-- Note: gen_random_uuid() is built into PostgreSQL core since v13 (no
-- pgcrypto/uuid-ossp extension required); config.toml pins major_version=15.

-- =============================================================================
-- Utility: updated_at auto-touch trigger
-- =============================================================================
-- The plan states "created_at/updated_at timestamptz default now()" for all
-- tables, and packages/shared/src/index.ts Update types (e.g. DiaryEntryUpdate,
-- EpisodeUpdate) never let clients set updated_at directly — so it must be
-- server-maintained via trigger, not left to drift at its created_at value.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- profiles — extends auth.users
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- [CRITIC FIX #7]: nullable + unique, NOT "unique not null". A constant
  -- default nickname would violate uniqueness for every user after the
  -- first; nickname stays null until onboarding sets it via a unique-checked
  -- UPDATE (see onboarding/nickname.tsx, WS-B).
  nickname text unique,
  avatar_url text,
  provider text check (provider in ('google', 'apple', 'kakao')),
  expo_push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- series — one per user (created lazily on first episode)
-- =============================================================================
create table public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger series_set_updated_at
  before update on public.series
  for each row execute function public.set_updated_at();

-- =============================================================================
-- diary_entries — one row per (author, day); edits update the same row
-- =============================================================================
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  text text not null,
  -- Generated column: server-computed, can't be spoofed by the client and
  -- never drifts from `text` (plan §1.5 "minor fix").
  char_count int not null generated always as (char_length(text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, entry_date)
);

create trigger diary_entries_set_updated_at
  before update on public.diary_entries
  for each row execute function public.set_updated_at();

-- =============================================================================
-- episodes
-- =============================================================================
create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  -- [CRITIC FIX #1]: nullable — was `not null`, which contradicted the
  -- draft-placeholder insert (created before any number exists). Assigned
  -- only inside publish_episode() (plan §2.1 step 6 / 0003_rpc.sql).
  episode_number int,
  -- [CRITIC FIX #2]: new column = min(entry_date) across the episode's
  -- episode_sources diary entries. Ordering/numbering derive from this, not
  -- from publish order.
  sort_date date not null,
  title text,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'private', 'published')),
  genre text not null,
  tone text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- NULLs are distinct in a unique index/constraint, so multiple concurrent
  -- drafts (episode_number is null) coexist fine; only published rows are
  -- constrained to distinct numbers per series (plan §1.5).
  --
  -- Declared DEFERRABLE (and explicitly named) so publish_episode() can defer
  -- this check to end-of-transaction: CRITIC FIX #2's renumbering formula
  -- shifts a contiguous run of published episode_number values up by one in
  -- a single UPDATE, which — checked IMMEDIATE, the Postgres default — can
  -- transiently collide mid-statement (e.g. 3,4,5 -> 4,5,6 may momentarily
  -- produce two rows numbered 4 depending on per-row check order). Deferring
  -- to commit avoids that false-positive constraint violation while still
  -- fully enforcing uniqueness by the time the transaction completes.
  constraint episodes_series_episode_number_uniq
    unique (series_id, episode_number) deferrable initially immediate
);

create index episodes_author_id_idx on public.episodes(author_id);
create index episodes_series_id_status_idx on public.episodes(series_id, status);
create index episodes_status_published_at_idx on public.episodes(status, published_at);

create trigger episodes_set_updated_at
  before update on public.episodes
  for each row execute function public.set_updated_at();

-- =============================================================================
-- episode_sources — N diary entries -> 1 episode (batch support)
-- =============================================================================
create table public.episode_sources (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  diary_entry_id uuid not null references public.diary_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (episode_id, diary_entry_id),
  -- [CRITIC FIX #5]: was missing; without it the same diary day could be
  -- pulled into two different episodes. A diary entry now belongs to at
  -- most one episode.
  unique (diary_entry_id)
);

-- =============================================================================
-- generation_jobs — the async queue
-- =============================================================================
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  -- Plan text does not specify "on delete cascade" here (unlike
  -- diary_entries.author_id / episodes.author_id, which explicitly do) —
  -- kept as default NO ACTION to match the plan literally; see executor
  -- report for the implication (profile deletion blocked while jobs exist).
  author_id uuid not null references public.profiles(id),
  episode_id uuid references public.episodes(id) on delete cascade,
  diary_entry_ids uuid[] not null,
  genre text not null,
  tone text not null,
  batch_label text,
  mode text not null default 'generate' check (mode in ('clarify', 'generate')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'awaiting_input', 'completed', 'failed')),
  clarifying_questions jsonb,
  clarifying_answers jsonb,
  attempts int not null default 0,
  max_attempts int not null default 3,
  error text,
  locked_at timestamptz,
  -- [CRITIC FIX #4]: app/RPC-set value = author_id::text || ':' ||
  -- sorted(diary_entry_ids). Set by enqueue_generation() (0003_rpc.sql), not
  -- written directly by clients. NOT a DB `generated always as` column: a
  -- generated column expression cannot use a subquery/ORDER BY to sort the
  -- array, so sorting happens in the RPC body instead.
  active_job_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [CRITIC FIX #4]: partial unique index — a second enqueue for the same
-- author+diary-batch while one is still in flight fails fast (client shows
-- "already generating") instead of creating a duplicate job/placeholder
-- episode from a double-tap.
create unique index generation_jobs_active_key_uniq
  on public.generation_jobs (active_job_key)
  where status in ('queued', 'processing', 'awaiting_input');

create index generation_jobs_status_idx on public.generation_jobs(status);
create index generation_jobs_author_id_idx on public.generation_jobs(author_id);

create trigger generation_jobs_set_updated_at
  before update on public.generation_jobs
  for each row execute function public.set_updated_at();

-- =============================================================================
-- reports
-- =============================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  -- No "on delete cascade" specified in the plan for reporter_id (unlike
  -- e.g. diary_entries.author_id) — kept literal.
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('episode', 'user')),
  target_id uuid not null,
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- =============================================================================
-- blocks
-- =============================================================================
create table public.blocks (
  -- No "on delete cascade" specified in the plan for blocker_id/blocked_id —
  -- kept literal.
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);
