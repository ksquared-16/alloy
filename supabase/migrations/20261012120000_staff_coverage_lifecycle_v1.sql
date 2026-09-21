-- COVERAGE LIFECYCLE — ONE TRANSACTION PER OPERATOR INTENT.
--
-- The Phase 1 exclusion constraint is scoped `where lifecycle_state = 'active'`, which
-- is what lets history coexist with the plan that replaced it. It also means a
-- revision CANNOT be "insert the replacement, then retire the predecessor": for the
-- instant between those statements both are active and overlapping, and the database
-- correctly refuses the replacement.
--
-- So each operator intent is one function and one transaction, and the predecessor is
-- retired BEFORE the replacement is written. Exclusivity is never weakened to make
-- lineage convenient; the order of operations absorbs the tension instead.
--
-- This also gives the atomicity the command runtime needs. supabase-js has no
-- multi-statement transaction, so an application-side revise would have a window in
-- which the predecessor is cancelled and the replacement failed — an operator shown
-- success over a day with no plan at all.
--
-- ── REVISION IS NOT CORRECTION ──
--
--   revision  — the plan genuinely changed (Alex now moves at 09:30)
--   correction — the stored plan was wrong (we typed Preschool 2, we meant Toddler 1)
--
-- Both supersede. Only the transition type says which happened, and an operator
-- reading the history needs that difference: one says the day changed, the other says
-- the record did.

create or replace function public.staff_coverage_plan(
    p_org_id uuid,
    p_employment_id uuid,
    p_service_date date,
    p_start_time time,
    p_end_time time,
    p_site_location_id uuid,
    p_room_location_id uuid default null,
    p_reason_key text default null,
    p_note text default null,
    p_source_key text default 'operator',
    p_actor uuid default null
) returns uuid
language plpgsql
as $$
declare
    v_id uuid;
begin
    insert into public.staff_coverage_allocations
        (org_id, employment_id, service_date, start_time, end_time,
         site_location_id, room_location_id, reason_key, note, source_key, created_by)
    values
        (p_org_id, p_employment_id, p_service_date, p_start_time, p_end_time,
         p_site_location_id, p_room_location_id, p_reason_key, p_note, p_source_key, p_actor)
    returning id into v_id;

    -- A plan with no predecessor roots its own lineage, so every allocation belongs to
    -- exactly one chain and history is walkable from any member.
    update public.staff_coverage_allocations set lineage_root_id = v_id where id = v_id;
    return v_id;
end;
$$;

/**
 * Supersede one allocation with another. `p_transition` carries the meaning.
 * The predecessor is retired first so the active-only exclusion constraint never
 * sees the old and new allocation overlapping.
 */
create or replace function public.staff_coverage_supersede(
    p_coverage_id uuid,
    p_transition text,
    p_service_date date default null,
    p_start_time time default null,
    p_end_time time default null,
    p_site_location_id uuid default null,
    p_room_location_id uuid default null,
    p_room_explicit boolean default false,
    p_reason_key text default null,
    p_note text default null,
    p_actor uuid default null
) returns uuid
language plpgsql
as $$
declare
    prior public.staff_coverage_allocations%rowtype;
    v_id uuid;
begin
    if p_transition not in ('revision', 'correction') then
        raise exception 'staff_coverage: transition must be revision or correction, got %', p_transition
            using errcode = '22023';
    end if;

    select * into prior from public.staff_coverage_allocations where id = p_coverage_id for update;
    if not found then
        raise exception 'staff_coverage: allocation % not found', p_coverage_id using errcode = 'no_data_found';
    end if;
    if prior.lifecycle_state <> 'active' then
        raise exception 'staff_coverage: allocation % is already % and cannot be superseded',
            p_coverage_id, prior.lifecycle_state using errcode = '22023';
    end if;

    -- Retire FIRST. See the header: the reverse order is refused by the constraint
    -- that makes one-place-at-a-time true.
    update public.staff_coverage_allocations
       set lifecycle_state = 'superseded'
     where id = prior.id;

    insert into public.staff_coverage_allocations
        (org_id, employment_id, service_date, start_time, end_time,
         site_location_id, room_location_id,
         lifecycle_state, transition_type, supersedes_coverage_id, lineage_root_id,
         reason_key, note, source_key, created_by)
    values
        (prior.org_id,
         prior.employment_id,
         coalesce(p_service_date, prior.service_date),
         coalesce(p_start_time, prior.start_time),
         coalesce(p_end_time, prior.end_time),
         coalesce(p_site_location_id, prior.site_location_id),
         -- Room needs an explicit flag: coalesce alone could never move an allocation
         -- from a room back to site-level, because NULL would read as "unchanged".
         case when p_room_explicit then p_room_location_id else prior.room_location_id end,
         'active', p_transition, prior.id, coalesce(prior.lineage_root_id, prior.id),
         coalesce(p_reason_key, prior.reason_key), p_note, prior.source_key, p_actor)
    returning id into v_id;

    return v_id;
end;
$$;

/**
 * Cancellation is a lifecycle state, never a delete. A cancelled allocation stops
 * being effective and stays auditable — "we planned this and then we did not" is
 * operational history, not noise.
 */
create or replace function public.staff_coverage_cancel(
    p_coverage_id uuid,
    p_reason_key text default null,
    p_actor uuid default null
) returns void
language plpgsql
as $$
declare
    prior public.staff_coverage_allocations%rowtype;
begin
    select * into prior from public.staff_coverage_allocations where id = p_coverage_id for update;
    if not found then
        raise exception 'staff_coverage: allocation % not found', p_coverage_id using errcode = 'no_data_found';
    end if;
    if prior.lifecycle_state <> 'active' then
        raise exception 'staff_coverage: allocation % is already %', p_coverage_id, prior.lifecycle_state
            using errcode = '22023';
    end if;

    update public.staff_coverage_allocations
       set lifecycle_state = 'cancelled',
           cancelled_at = now(),
           cancelled_by = p_actor,
           reason_key = coalesce(p_reason_key, reason_key)
     where id = p_coverage_id;
end;
$$;

/*
 * THE TWO READS SHARE ONE PREDICATE.
 *
 * Employment-first and place-first are different questions, and the failure they
 * invite is two interpretations of "effective". Both are defined below over the same
 * `lifecycle_state = 'active'` filter and the same ordering, so they cannot drift.
 */
create or replace function public.staff_coverage_effective_for_employment(
    p_org_id uuid,
    p_employment_id uuid,
    p_date_from date,
    p_date_to date
) returns setof public.staff_coverage_allocations
language sql
stable
as $$
    select * from public.staff_coverage_allocations
    where org_id = p_org_id
      and employment_id = p_employment_id
      and service_date between p_date_from and p_date_to
      and lifecycle_state = 'active'
    order by service_date, start_time, id;
$$;

create or replace function public.staff_coverage_effective_for_site(
    p_org_id uuid,
    p_site_location_id uuid,
    p_date_from date,
    p_date_to date,
    p_room_location_id uuid default null
) returns setof public.staff_coverage_allocations
language sql
stable
as $$
    select * from public.staff_coverage_allocations
    where org_id = p_org_id
      and site_location_id = p_site_location_id
      and service_date between p_date_from and p_date_to
      and lifecycle_state = 'active'
      and (p_room_location_id is null or room_location_id = p_room_location_id)
    order by service_date, start_time, employment_id, id;
$$;

comment on function public.staff_coverage_supersede(uuid, text, date, time, time, uuid, uuid, boolean, text, text, uuid) is
    'Retires an allocation and writes its replacement in one transaction. Predecessor first, because the active-only overlap exclusion would otherwise refuse the replacement it is meant to allow.';
