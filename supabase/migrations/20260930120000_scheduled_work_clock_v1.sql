-- GOVERNED SCHEDULED WORK V1 — THE CLOCK LEAVES A MARK.
--
-- The runtime records occurrences and attempts, but only when something was DUE.
-- An environment with no schedules yet — which is every environment on the day the
-- scheduler ships — absorbs a wake and records nothing. That makes the one question
-- an operator actually asks unanswerable: "is the clock running?" It also makes a
-- real external wake impossible to tell apart from a cron that never fired, or one
-- that fired and was refused for a missing secret.
--
-- So every wake is recorded, whether or not it had work. One row, updated in place:
-- a liveness signal must not be a table that grows forever to say "still fine".
--
-- Re-runnable by construction: a failed apply does not roll back DDL already issued.

create table if not exists public.scheduled_work_clock (
    id text primary key default 'singleton' check (id = 'singleton'),
    first_wake_at timestamptz,
    last_wake_at timestamptz,
    wake_count bigint not null default 0,
    last_worker_id text,
    last_summary jsonb
);

insert into public.scheduled_work_clock (id) values ('singleton')
on conflict (id) do nothing;

alter table public.scheduled_work_clock enable row level security;

-- A default privilege would otherwise grant `authenticated` SELECT on a new public
-- table, leaving RLS as the only boundary. The clock is system-owned; nobody signs
-- in to read it.
revoke all on public.scheduled_work_clock from authenticated, anon;

-- The increment is atomic in the database rather than read-then-write in the app:
-- two wakes may legitimately overlap, and a liveness counter that silently loses
-- ticks under exactly the condition it exists to observe would be worse than none.
create or replace function public.record_scheduled_work_wake(
    p_worker_id text,
    p_summary jsonb
) returns timestamptz
language sql
as $$
    insert into public.scheduled_work_clock (id, first_wake_at, last_wake_at, wake_count, last_worker_id, last_summary)
    values ('singleton', now(), now(), 1, p_worker_id, p_summary)
    on conflict (id) do update set
        last_wake_at   = now(),
        -- Database time, not the caller's: the caller's clock is the thing under test.
        first_wake_at  = coalesce(scheduled_work_clock.first_wake_at, now()),
        wake_count     = scheduled_work_clock.wake_count + 1,
        last_worker_id = excluded.last_worker_id,
        last_summary   = excluded.last_summary
    returning last_wake_at;
$$;

revoke all on function public.record_scheduled_work_wake(text, jsonb) from public, authenticated, anon;
