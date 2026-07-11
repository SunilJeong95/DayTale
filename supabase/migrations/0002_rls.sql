-- 0002_rls.sql — Row Level Security policies + public read views (WS-A)
--
-- Source of truth: .omc/plans/autopilot-impl.md §1.5 "RLS policies". Every
-- table gets RLS enabled. The `service_role` key (used only by the worker,
-- services/worker) bypasses RLS entirely by Supabase platform convention
-- (the service_role Postgres role has BYPASSRLS) — no policy below scopes a
-- write to auth.uid() in a way that would block it; nothing extra is needed
-- for the worker path.

-- =============================================================================
-- profiles — public SELECT of nickname/avatar only (via public_profiles
-- view below), self-only full-row SELECT, self-only UPDATE.
-- =============================================================================
alter table public.profiles enable row level security;

create policy profiles_select_self on public.profiles
  for select
  using (auth.uid() = id);

create policy profiles_update_self on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Public slice of profiles (id, nickname, avatar_url only) — this view is
-- owned by the migration role (table owner), so per Postgres RLS semantics
-- it bypasses profiles' own self-only RLS and can expose the public columns
-- to any authenticated user. This is the standard Supabase idiom for
-- "public profile" data and is what the plan's "Consider a public_profiles
-- view" note asks for.
create view public.public_profiles as
select id, nickname, avatar_url
from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- =============================================================================
-- series — not explicitly listed in the plan's RLS "must-have" bullets, but
-- RLS must be enabled on every table, and the reader flow (series/[id].tsx,
-- plan §4) needs to read *other* users' series metadata (title) to render a
-- serial reader. Policy mirrors episodes' own/published+not-blocked shape
-- for consistency: self always, or the series has >=1 published episode and
-- no bidirectional block exists. See executor report for this addition.
-- =============================================================================
alter table public.series enable row level security;

create policy series_select on public.series
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.episodes e
      where e.series_id = series.id
        and e.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = series.owner_id)
             or (b.blocker_id = series.owner_id and b.blocked_id = auth.uid())
        )
    )
  );

create policy series_insert_own on public.series
  for insert
  with check (owner_id = auth.uid());

create policy series_update_own on public.series
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy series_delete_own on public.series
  for delete
  using (owner_id = auth.uid());

-- =============================================================================
-- diary_entries — owner-only, all ops (plan §1.5 RLS bullets)
-- =============================================================================
alter table public.diary_entries enable row level security;

create policy diary_entries_owner_all on public.diary_entries
  for all
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- =============================================================================
-- episodes — SELECT: own rows OR (published AND no bidirectional block).
-- INSERT/UPDATE/DELETE: own rows only.
--
-- [CRITIC FIX #6]: the naive predicate `status='published' OR author=auth.uid()`
-- let a blocked-by user deep-link straight to a blocked author's content,
-- bypassing the feed view's filter. This bidirectional not-exists check is
-- enforced here on every read path (feed view helper, direct fetch,
-- realtime), not only the feed view.
-- =============================================================================
alter table public.episodes enable row level security;

create policy episodes_select on public.episodes
  for select
  using (
    author_id = auth.uid()
    or (
      status = 'published'
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = episodes.author_id)
           or (b.blocker_id = episodes.author_id and b.blocked_id = auth.uid())
      )
    )
  );

create policy episodes_insert_own on public.episodes
  for insert
  with check (author_id = auth.uid());

create policy episodes_update_own on public.episodes
  for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy episodes_delete_own on public.episodes
  for delete
  using (author_id = auth.uid());

-- =============================================================================
-- episode_sources — not explicitly listed in the plan's RLS bullets. Writes
-- happen only through the enqueue_generation() RPC (security definer,
-- bypasses RLS) per CRITIC FIX #4, so clients never need direct INSERT.
-- SELECT is scoped to the owning episode's author, so review mode
-- (episode/[id].tsx) can show the original diary alongside the episode.
-- =============================================================================
alter table public.episode_sources enable row level security;

create policy episode_sources_owner_select on public.episode_sources
  for select
  using (
    exists (
      select 1
      from public.episodes e
      where e.id = episode_sources.episode_id
        and e.author_id = auth.uid()
    )
  );

-- =============================================================================
-- generation_jobs — owner-only, all ops (plan §1.5 RLS bullets)
-- =============================================================================
alter table public.generation_jobs enable row level security;

create policy generation_jobs_owner_all on public.generation_jobs
  for all
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- =============================================================================
-- reports — owner (reporter)-only, all ops (plan §1.5 RLS bullets)
-- =============================================================================
alter table public.reports enable row level security;

create policy reports_owner_all on public.reports
  for all
  using (auth.uid() = reporter_id)
  with check (auth.uid() = reporter_id);

-- =============================================================================
-- blocks — owner (blocker)-only, all ops (plan §1.5 RLS bullets)
-- =============================================================================
alter table public.blocks enable row level security;

create policy blocks_owner_all on public.blocks
  for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

-- =============================================================================
-- public_feed_series — PublicFeed is not a table, it's this view (plan
-- §1.5): published episodes grouped by series/author, authors with >=1
-- published episode + counts.
--
-- This view is definer-mode (default: runs as the owning/migration role, not
-- the querying role), so it does NOT go through episodes'/series' RLS — it
-- keeps its own explicit not-exists-blocks filter, matching the plan's
-- framing exactly: "kept per plan as a query-planner optimization even
-- though RLS is now the real boundary" for *direct* reads of episodes/series
-- (e.g. series/[id].tsx, episode/[id].tsx), which do go through real RLS.
-- =============================================================================
create view public.public_feed_series as
select
  s.id as series_id,
  s.owner_id,
  s.title,
  p.nickname as author_nickname,
  p.avatar_url as author_avatar_url,
  count(e.id) as published_episode_count,
  max(e.published_at) as latest_published_at
from public.series s
join public.profiles p on p.id = s.owner_id
join public.episodes e
  on e.series_id = s.id
 and e.status = 'published'
where not exists (
  select 1
  from public.blocks b
  where (b.blocker_id = auth.uid() and b.blocked_id = s.owner_id)
     or (b.blocker_id = s.owner_id and b.blocked_id = auth.uid())
)
group by s.id, s.owner_id, s.title, p.nickname, p.avatar_url;

grant select on public.public_feed_series to authenticated;
