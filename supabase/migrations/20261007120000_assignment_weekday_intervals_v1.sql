-- ASSIGNMENT OWNS ITS RECURRING TIME.
--
-- Until now an Assignment's hours were a property of the schedule PATTERN it was
-- created from, read out of `schedule_patterns.metadata` by `readPatternDefaultHours`.
-- Two people on one pattern therefore shared hours by construction, and one person
-- working Mon/Wed/Fri 08:00–16:30 and Tue/Thu 09:00–17:30 could not be expressed as
-- one Assignment at all — it needed two Assignments on two patterns, which then reads
-- as two jobs.
--
-- After this migration the pattern is a reusable TEMPLATE that seeds an Assignment,
-- and the Assignment owns the answer. Editing a pattern later does not rewrite an
-- Assignment that was already materialized from it.
--
-- ── UNKNOWN HOURS ARE REPRESENTED, NOT INVENTED ──
--
-- Some patterns carry weekdays and no usable default hours. That is "recurrence known,
-- hours unknown", and it is a THIRD state — not all-day, not site hours, not midnight
-- to midnight, and not a reason to drop the Assignment. It is stored as a row whose
-- times are both NULL, and the shape constraint makes a half-known interval
-- impossible, so a NULL can only ever mean "unknown", never "not filled in yet".
--
-- One weekday is either known (one or more timed intervals) or unknown (exactly one
-- untimed row). Mixing the two on one weekday would make the day mean two things at
-- once, so a trigger refuses it. Both partial unique indexes exist because NULLs are
-- distinct to a normal unique index, which would otherwise permit many "unknown"
-- rows for the same day.

create table if not exists public.assignment_weekday_intervals (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null,
    assignment_id uuid not null,

    -- 0 = Sunday, the convention schedule_patterns.weekdays, childcare_operating_windows
    -- and staff_availability_windows all already use.
    weekday smallint not null,

    -- Both null together = hours unknown for this weekday.
    start_time time,
    end_time time,

    -- How this row came to exist: seeded from a pattern, authored by an operator, or
    -- materialized by the backfill. Provenance, so a later reader can tell a real
    -- operator decision from an inherited default.
    source_key text not null default 'operator',

    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint assignment_weekday_intervals_weekday_range
        check (weekday >= 0 and weekday <= 6),

    -- Invariants 3 and 4 in one place: a partial interval cannot exist, and a known
    -- interval must end after it starts.
    constraint assignment_weekday_intervals_hours_shape
        check (
            (start_time is null and end_time is null)
            or (start_time is not null and end_time is not null and end_time > start_time)
        ),

    constraint assignment_weekday_intervals_source_key_nonempty
        check (char_length(btrim(source_key)) > 0)
);

-- Tenancy is not re-asserted by hand; it is carried by a composite foreign key, so an
-- interval cannot belong to one org and its Assignment to another.
create unique index if not exists schedule_assignments_id_org_key
    on public.schedule_assignments (id, org_id);

alter table public.assignment_weekday_intervals
    drop constraint if exists assignment_weekday_intervals_assignment_fk;

alter table public.assignment_weekday_intervals
    add constraint assignment_weekday_intervals_assignment_fk
    foreign key (assignment_id, org_id)
    references public.schedule_assignments (id, org_id)
    on delete cascade;

-- Several timed intervals per weekday are legal (a split day). The same start twice
-- on one weekday is not.
create unique index if not exists assignment_weekday_intervals_known_idx
    on public.assignment_weekday_intervals (assignment_id, weekday, start_time)
    where start_time is not null;

-- At most one "unknown" row per weekday.
create unique index if not exists assignment_weekday_intervals_unknown_idx
    on public.assignment_weekday_intervals (assignment_id, weekday)
    where start_time is null;

create index if not exists assignment_weekday_intervals_assignment_idx
    on public.assignment_weekday_intervals (org_id, assignment_id, weekday);

-- Two intervals on one weekday must not overlap: overlapping rows would double-count
-- the same person in the same hour once staffing reads this authority.
alter table public.assignment_weekday_intervals
    drop constraint if exists assignment_weekday_intervals_no_overlap;

alter table public.assignment_weekday_intervals
    add constraint assignment_weekday_intervals_no_overlap
    exclude using gist (
        assignment_id with =,
        weekday with =,
        int4range(
            (extract(hour from start_time) * 60 + extract(minute from start_time))::int,
            (extract(hour from end_time) * 60 + extract(minute from end_time))::int
        ) with &&
    )
    where (start_time is not null);

create or replace function public.validate_assignment_weekday_interval_knownness()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    -- A weekday is known or unknown, never both. Checked in both directions so the
    -- order rows arrive in cannot decide whether the invariant holds.
    if new.start_time is null then
        if exists (
            select 1 from public.assignment_weekday_intervals i
            where i.assignment_id = new.assignment_id
              and i.weekday = new.weekday
              and i.start_time is not null
              and i.id <> new.id
        ) then
            raise exception 'assignment % weekday % already has known hours; an unknown row would make the day mean two things',
                new.assignment_id, new.weekday
                using errcode = 'check_violation';
        end if;
    else
        if exists (
            select 1 from public.assignment_weekday_intervals i
            where i.assignment_id = new.assignment_id
              and i.weekday = new.weekday
              and i.start_time is null
              and i.id <> new.id
        ) then
            raise exception 'assignment % weekday % is recorded as hours-unknown; remove that row before adding known hours',
                new.assignment_id, new.weekday
                using errcode = 'check_violation';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists validate_assignment_weekday_interval_knownness
    on public.assignment_weekday_intervals;
create trigger validate_assignment_weekday_interval_knownness
    before insert or update on public.assignment_weekday_intervals
    for each row execute function public.validate_assignment_weekday_interval_knownness();

drop trigger if exists set_assignment_weekday_intervals_updated_at
    on public.assignment_weekday_intervals;
create trigger set_assignment_weekday_intervals_updated_at
    before update on public.assignment_weekday_intervals
    for each row execute function public.set_updated_at();

alter table public.assignment_weekday_intervals enable row level security;

-- Mirrors the parent ledger's policies exactly, including its user_roles shape, so
-- interval visibility can never exceed Assignment visibility.
drop policy if exists assignment_weekday_intervals_select_org on public.assignment_weekday_intervals;
create policy assignment_weekday_intervals_select_org
    on public.assignment_weekday_intervals
    for select to authenticated
    using (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.org_id = assignment_weekday_intervals.org_id
        )
    );

drop policy if exists assignment_weekday_intervals_mutate_crm on public.assignment_weekday_intervals;
create policy assignment_weekday_intervals_mutate_crm
    on public.assignment_weekday_intervals
    for all to authenticated
    using (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.org_id = assignment_weekday_intervals.org_id
              and ur.role = any (array['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    with check (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.org_id = assignment_weekday_intervals.org_id
              and ur.role = any (array['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

drop policy if exists assignment_weekday_intervals_service_all on public.assignment_weekday_intervals;
create policy assignment_weekday_intervals_service_all
    on public.assignment_weekday_intervals
    for all to authenticated
    using (auth.role() = 'service_role'::text)
    with check (auth.role() = 'service_role'::text);

grant select, insert, update, delete on table public.assignment_weekday_intervals to authenticated;
grant all on table public.assignment_weekday_intervals to service_role;

comment on table public.assignment_weekday_intervals is
    'Assignment-owned recurring weekday intervals. The Assignment, not its schedule pattern, is the authority for operational hours. Both times NULL means recurrence known and hours unknown.';
