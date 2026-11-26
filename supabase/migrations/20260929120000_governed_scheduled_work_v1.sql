-- =============================================================================
-- Governed Scheduled Work V1 — the platform's one clock-driven runtime.
--
-- Three tables, because three different things are being recorded:
--
--   scheduled_work              the STANDING INTENT — what should happen, and when next
--   scheduled_work_occurrences  one LOGICAL DUE MOMENT — the unit of consequence
--   scheduled_work_attempts     one EXECUTION TRY — the unit of audit
--
-- The distinction between the second and third is the whole design. Delivery is
-- at-least-once: a duplicate wake, a worker crash, an expired lease and a retry
-- can all produce several attempts at one occurrence. Exactly one of them may
-- reach a terminal domain consequence, so identity lives on the OCCURRENCE and
-- audit lives on the ATTEMPT.
--
-- ── OCCURRENCE IDENTITY IS DERIVED, NOT ALLOCATED ──
--
-- `(scheduled_work_id, due_at)` is unique. One schedule cannot have two occurrences
-- for the same due moment however many times the clock fires, so a duplicate wake
-- converges onto the existing row instead of minting a second one. Identity comes
-- from the schedule and the logical due moment — never from the worker.
--
-- ── THE SCHEDULER OWNS NO ECONOMICS ──
--
-- `handler_key` names code. `domain_ref` is opaque: the scheduler stores it and
-- hands it back, and never reads inside it. Nothing here knows what billing,
-- aging or autopay mean, and a migration that started to would be the first step
-- toward the scheduler owning consequences it cannot reason about.
--
-- ── A FAILED OCCURRENCE IS NOT A DISABLED SCHEDULE ──
--
-- One Billing run failing on Tuesday must not silently stop Billing forever, so
-- terminal failure is recorded on the OCCURRENCE and the schedule keeps
-- materializing its next legitimate one. Only a domain may deactivate a schedule.
-- =============================================================================

create table if not exists public.scheduled_work (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references public.orgs(id) on delete cascade,

    -- Names a REGISTERED server handler. Never a URL, never code.
    handler_key text not null check (char_length(btrim(handler_key)) > 0),

    -- Deliberately small. Anything richer is the domain computing its own next
    -- due moment and telling us, which `domain_computed` exists for.
    recurrence_kind text not null default 'one_time'
        check (recurrence_kind in ('one_time', 'daily', 'interval', 'domain_computed')),
    interval_seconds integer check (interval_seconds is null or interval_seconds > 0),

    /*
     * The next moment this schedule should produce an occurrence for. Null means
     * nothing further is owed — a completed one-time schedule, or a recurrence a
     * domain has wound down — which is a different state from `is_active = false`
     * (deliberately stopped).
     */
    next_due_at timestamptz,
    is_active boolean not null default true,

    -- Opaque to the scheduler. Handed back to the handler untouched.
    domain_ref jsonb not null default '{}'::jsonb,
    label text,

    created_by uuid,
    created_at timestamptz not null default now(),
    updated_by uuid,
    updated_at timestamptz not null default now(),

    constraint scheduled_work_interval_requires_seconds
        check (recurrence_kind <> 'interval' or interval_seconds is not null)
);

create index if not exists scheduled_work_due_idx
    on public.scheduled_work (next_due_at)
    where is_active and next_due_at is not null;

create table if not exists public.scheduled_work_occurrences (
    id uuid primary key default gen_random_uuid(),
    scheduled_work_id uuid not null references public.scheduled_work(id) on delete cascade,
    org_id uuid references public.orgs(id) on delete cascade,
    handler_key text not null,

    /* The logical due moment. With the unique index below, this IS the identity. */
    due_at timestamptz not null,

    status text not null default 'pending'
        check (status in ('pending', 'claimed', 'completed', 'failed')),

    /*
     * The lease. A claim is an atomic UPDATE that sets both, and a worker whose
     * lease has expired can no longer finalize — `claim_token` is re-checked on
     * write, so a process that stalled past its lease cannot overwrite the result
     * of the worker that took over.
     */
    claim_token uuid,
    claimed_by text,
    lease_expires_at timestamptz,

    attempt_count integer not null default 0,
    first_failure_at timestamptz,
    last_failure_at timestamptz,
    failure_reason text,
    completed_at timestamptz,
    domain_ref jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- IDENTITY. One schedule, one due moment, one occurrence — however often the
-- clock fires. This single index is what makes duplicate wakes converge.
create unique index if not exists scheduled_work_occurrences_identity_idx
    on public.scheduled_work_occurrences (scheduled_work_id, due_at);

-- The claim query's index: due, unfinished, and either unleased or expired.
create index if not exists scheduled_work_occurrences_claimable_idx
    on public.scheduled_work_occurrences (due_at)
    where status in ('pending', 'claimed');

create index if not exists scheduled_work_occurrences_failed_idx
    on public.scheduled_work_occurrences (last_failure_at)
    where status = 'failed';

create table if not exists public.scheduled_work_attempts (
    id uuid primary key default gen_random_uuid(),
    occurrence_id uuid not null references public.scheduled_work_occurrences(id) on delete cascade,
    org_id uuid references public.orgs(id) on delete cascade,
    handler_key text not null,
    attempt_number integer not null check (attempt_number > 0),
    worker_id text not null,
    claim_token uuid,

    started_at timestamptz not null default now(),
    finished_at timestamptz,
    -- COMPLETED includes a domain no-op: "nothing was due" is a successful run.
    outcome text check (outcome in ('completed', 'retryable_failure', 'terminal_failure')),
    diagnostic jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);

create index if not exists scheduled_work_attempts_occurrence_idx
    on public.scheduled_work_attempts (occurrence_id, attempt_number desc);

-- ---------------------------------------------------------------------------
-- SECURITY.
--
-- This runtime executes as the system, through the service role. No browser
-- principal claims work or writes attempts, so every grant is revoked from
-- `authenticated` and RLS admits the service role plus an owner/admin READ for
-- the observability surface. A scheduler an operator could claim from the
-- browser would be a second worker nobody accounted for.
-- ---------------------------------------------------------------------------
alter table public.scheduled_work enable row level security;
alter table public.scheduled_work_occurrences enable row level security;
alter table public.scheduled_work_attempts enable row level security;

revoke all on public.scheduled_work from authenticated, anon;
revoke all on public.scheduled_work_occurrences from authenticated, anon;
revoke all on public.scheduled_work_attempts from authenticated, anon;

drop policy if exists scheduled_work_service_all on public.scheduled_work;
create policy scheduled_work_service_all on public.scheduled_work for all
    using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists scheduled_work_org_read on public.scheduled_work;
create policy scheduled_work_org_read on public.scheduled_work for select
    using (org_id is not null and has_org_role(org_id, array['owner', 'admin']));

drop policy if exists scheduled_work_occ_service_all on public.scheduled_work_occurrences;
create policy scheduled_work_occ_service_all on public.scheduled_work_occurrences for all
    using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists scheduled_work_occ_org_read on public.scheduled_work_occurrences;
create policy scheduled_work_occ_org_read on public.scheduled_work_occurrences for select
    using (org_id is not null and has_org_role(org_id, array['owner', 'admin']));

drop policy if exists scheduled_work_att_service_all on public.scheduled_work_attempts;
create policy scheduled_work_att_service_all on public.scheduled_work_attempts for all
    using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists scheduled_work_att_org_read on public.scheduled_work_attempts;
create policy scheduled_work_att_org_read on public.scheduled_work_attempts for select
    using (org_id is not null and has_org_role(org_id, array['owner', 'admin']));

comment on table public.scheduled_work is
    'Standing intent for clock-driven work. handler_key names registered code; domain_ref is opaque to the scheduler.';
comment on table public.scheduled_work_occurrences is
    'One logical due moment. (scheduled_work_id, due_at) is the identity, so duplicate wakes converge rather than duplicating consequence.';
comment on table public.scheduled_work_attempts is
    'One execution try. Many attempts may serve one occurrence; only one occurrence may reach a terminal domain consequence.';
