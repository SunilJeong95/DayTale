-- 0004_claim_next_job.sql — claim_next_job() RPC (WS-C dependency)
--
-- Source of truth: .omc/plans/autopilot-impl.md §2.1 step 3: the worker
-- poll loop needs
--   UPDATE generation_jobs SET status='processing', locked_at=now(),
--     attempts=attempts+1
--   WHERE id = (SELECT id FROM generation_jobs WHERE status='queued' ...
--     FOR UPDATE SKIP LOCKED LIMIT 1)
--   RETURNING *
-- but supabase-js's PostgREST query builder cannot express a correlated
-- subquery with `FOR UPDATE SKIP LOCKED` — there is no builder method for
-- row-locking clauses. The plan itself calls out two acceptable options: a
-- small SQL function, or a raw `pg`/direct-Postgres-connection client in the
-- worker. This migration takes the SQL-function route so the worker keeps a
-- single client (@supabase/supabase-js, service-role key) instead of adding
-- a `pg` dependency plus a new `DATABASE_URL` env var (not part of
-- .env.example) alongside the existing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
-- pair. Same SECURITY DEFINER + pinned search_path pattern as
-- reap_stale_jobs() (0003_rpc.sql); granted to service_role only — the
-- worker's poll loop is the only intended caller.
create or replace function public.claim_next_job()
returns setof public.generation_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.generation_jobs
  set status = 'processing',
      locked_at = now(),
      attempts = attempts + 1
  where id = (
    select gj.id
    from public.generation_jobs gj
    where gj.status = 'queued'
    order by gj.created_at asc
    for update skip locked
    limit 1
  )
  returning *;
end;
$$;

grant execute on function public.claim_next_job() to service_role;
