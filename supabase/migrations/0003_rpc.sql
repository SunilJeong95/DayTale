-- 0003_rpc.sql — RPC functions + auth.users trigger (WS-A)
--
-- Source of truth: .omc/plans/autopilot-impl.md §1.5 (CRITIC FIX #4, #7),
-- §2.1 steps 2/6, §2.1 CRITIC FIX #3 (retry semantics, implemented in the
-- worker itself per services/worker — reap_stale_jobs() here only recovers
-- orphaned "processing" rows).
--
-- All three RPCs are `security definer` because they need to write across
-- rows/tables a plain authenticated-user RLS policy would not allow in one
-- statement (series + episodes + episode_sources + generation_jobs in one
-- transaction; renumbering other users' episodes is not applicable here
-- since publish_episode only ever touches the caller's own series, but the
-- multi-row episodes update itself still needs definer privileges since
-- individual UPDATE statements inside a function are still subject to RLS
-- unless the function is security definer). `search_path` is pinned to
-- avoid search_path-hijacking, standard practice for SECURITY DEFINER
-- functions.

-- =============================================================================
-- enqueue_generation(diary_entry_ids, genre, tone[, batch_label])
--
-- [CRITIC FIX #4]: series + placeholder-episode creation moves from
-- client-side (which raced on unique(owner_id)) into this single
-- transactional RPC: upserts the caller's series (on conflict (owner_id) do
-- nothing), inserts the placeholder episodes row (status='draft',
-- episode_number=null, sort_date=min(entry_date) of the batch) + its
-- episode_sources rows, and inserts the generation_jobs row with
-- active_job_key set so the partial unique index
-- (generation_jobs_active_key_uniq) rejects a concurrent duplicate enqueue
-- for the same author+batch.
--
-- `batch_label` is an optional 4th parameter (default null) to cover the
-- full EnqueueGenerationInputSchema shape in packages/shared/src/index.ts;
-- the plan's prose signature only names 3 args but the shared zod schema and
-- the generation_jobs.batch_label column both call for it.
-- =============================================================================
create or replace function public.enqueue_generation(
  diary_entry_ids uuid[],
  genre text,
  tone text,
  batch_label text default null
)
returns table (job_id uuid, episode_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_variable
declare
  v_author_id uuid := auth.uid();
  v_series_id uuid;
  v_episode_id uuid;
  v_job_id uuid;
  v_sort_date date;
  v_sorted_ids uuid[];
  v_active_key text;
begin
  if v_author_id is null then
    raise exception 'not authenticated';
  end if;

  if diary_entry_ids is null or array_length(diary_entry_ids, 1) is null then
    raise exception 'diary_entry_ids must not be empty';
  end if;

  -- Guard: every diary entry in the batch must belong to the caller.
  if exists (
    select 1
    from public.diary_entries d
    where d.id = any(diary_entry_ids)
      and d.author_id <> v_author_id
  ) then
    raise exception 'diary_entry_ids must all belong to the caller';
  end if;

  select min(d.entry_date) into v_sort_date
  from public.diary_entries d
  where d.id = any(diary_entry_ids);

  if v_sort_date is null then
    raise exception 'no matching diary_entries found for diary_entry_ids';
  end if;

  -- 1) upsert the caller's series (1:1 via unique(owner_id))
  insert into public.series (owner_id)
  values (v_author_id)
  on conflict (owner_id) do nothing;

  select s.id into v_series_id
  from public.series s
  where s.owner_id = v_author_id;

  -- 2) placeholder episode: draft, no number yet, sort_date = min(entry_date)
  insert into public.episodes (
    series_id, author_id, episode_number, sort_date, status, genre, tone
  ) values (
    v_series_id, v_author_id, null, v_sort_date, 'draft', genre, tone
  )
  returning id into v_episode_id;

  -- 3) episode_sources — fails (unique(diary_entry_id) violation) if any
  -- diary entry in the batch is already consumed by another episode
  -- (CRITIC FIX #5), aborting the whole transaction as intended.
  insert into public.episode_sources (episode_id, diary_entry_id)
  select v_episode_id, d_id
  from unnest(diary_entry_ids) as d_id;

  -- 4) active_job_key = author_id:sorted(diary_entry_ids) — CRITIC FIX #4
  select array_agg(x order by x) into v_sorted_ids
  from unnest(diary_entry_ids) as x;

  v_active_key := v_author_id::text || ':' || array_to_string(v_sorted_ids, ',');

  begin
    insert into public.generation_jobs (
      author_id, episode_id, diary_entry_ids, genre, tone, batch_label,
      mode, status, active_job_key
    ) values (
      v_author_id, v_episode_id, diary_entry_ids, genre, tone, batch_label,
      'generate', 'queued', v_active_key
    )
    returning id into v_job_id;
  exception when unique_violation then
    raise exception 'a generation job is already in progress for this diary batch'
      using errcode = '23505';
  end;

  return query select v_job_id, v_episode_id;
end;
$$;

grant execute on function public.enqueue_generation(uuid[], text, text, text) to authenticated;

-- =============================================================================
-- publish_episode(episode_id)
--
-- [CRITIC FIX #2]: assigns episode_number by chronological sort_date order
-- (not publish-click order): episode_number = count(published episodes in
-- the same series with sort_date <= this one) + 1, and renumbers already-
-- published episodes in the same series whose sort_date is later than this
-- one (+1 each) so the sequence stays contiguous and chronologically
-- correct. Sets status='published', published_at=now(). Enforces the caller
-- owns the episode.
--
-- The renumbering UPDATE shifts a contiguous run of unique episode_number
-- values up by one in a single statement; checked IMMEDIATE (the default)
-- this can transiently collide mid-statement even though the final state is
-- valid. episodes_series_episode_number_uniq is declared DEFERRABLE
-- (0001_init.sql) precisely so this function can defer the check to the end
-- of the transaction via `set constraints ... deferred`.
-- =============================================================================
create or replace function public.publish_episode(episode_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_variable
declare
  v_caller uuid := auth.uid();
  v_series_id uuid;
  v_author_id uuid;
  v_sort_date date;
  v_status text;
  v_new_number int;
begin
  set constraints public.episodes_series_episode_number_uniq deferred;

  select e.series_id, e.author_id, e.sort_date, e.status
    into v_series_id, v_author_id, v_sort_date, v_status
  from public.episodes e
  where e.id = episode_id
  for update;

  if v_series_id is null then
    raise exception 'episode not found';
  end if;

  if v_author_id <> v_caller then
    raise exception 'not authorized to publish this episode';
  end if;

  if v_status = 'published' then
    -- Already published; idempotent no-op (guards double-tap on the
    -- publish button without erroring the client).
    return;
  end if;

  -- Renumber already-published episodes with a later sort_date, making room
  -- for this episode to slot into its chronological position.
  update public.episodes
  set episode_number = episode_number + 1
  where series_id = v_series_id
    and status = 'published'
    and sort_date > v_sort_date;

  select count(*) + 1 into v_new_number
  from public.episodes e
  where e.series_id = v_series_id
    and e.status = 'published'
    and e.sort_date <= v_sort_date;

  update public.episodes
  set episode_number = v_new_number,
      status = 'published',
      published_at = now()
  where id = episode_id;
end;
$$;

grant execute on function public.publish_episode(uuid) to authenticated;

-- =============================================================================
-- reap_stale_jobs()
--
-- [CRITIC FIX #3]: recovers generation_jobs rows orphaned by a worker
-- crash/restart mid-processing. Resets status='processing' rows with
-- locked_at older than 10 minutes back to status='queued' (respecting
-- attempts < max_attempts); once attempts >= max_attempts they are marked
-- status='failed' for good instead. Meant to be called by pg_cron or the
-- worker's own periodic sweep — granted to service_role only (not exposed
-- to app clients).
-- =============================================================================
create or replace function public.reap_stale_jobs()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.generation_jobs
  set status = 'queued',
      locked_at = null,
      error = case
        when error is null or error = '' then 'reaped: stale processing lock'
        else error || '; reaped: stale processing lock'
      end
  where status = 'processing'
    and locked_at < now() - interval '10 minutes'
    and attempts < max_attempts;

  update public.generation_jobs
  set status = 'failed',
      error = case
        when error is null or error = '' then 'reaped: exceeded max_attempts while stuck processing'
        else error || '; reaped: exceeded max_attempts while stuck processing'
      end
  where status = 'processing'
    and locked_at < now() - interval '10 minutes'
    and attempts >= max_attempts;
end;
$$;

grant execute on function public.reap_stale_jobs() to service_role;

-- =============================================================================
-- auth.users insert trigger -> profiles row
--
-- [CRITIC FIX #7]: nickname is left null; onboarding (onboarding/nickname.tsx,
-- WS-B) sets it later via a unique-checked UPDATE. `provider` is best-effort
-- from auth metadata, defensively nulled if it doesn't match one of the 3
-- supported values so an unexpected metadata shape can never break signup
-- via the profiles.provider check constraint.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider text;
begin
  v_provider := new.raw_app_meta_data->>'provider';
  if v_provider not in ('google', 'apple', 'kakao') then
    v_provider := null;
  end if;

  insert into public.profiles (id, provider)
  values (new.id, v_provider)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
