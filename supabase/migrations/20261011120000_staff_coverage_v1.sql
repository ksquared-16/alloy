-- COVERAGE — WHERE A STAFF MEMBER IS PLANNED TO WORK ON A SPECIFIC DAY.
--
-- Assignment owns the durable normal operating plan and keeps owning it. Coverage
-- specializes one date: a float posted to Toddler 1 from 08:00, Preschool 2 from
-- 10:00 and Infant 1 after lunch is three Coverage rows and ZERO changes to their
-- Assignment. Nothing here rewrites baseline intent, Availability or Presence.
--
-- ── WHY THIS IS ITS OWN AUTHORITY ──
--
-- operational_expectations is a real durable expectation authority and this does not
-- claim otherwise. It is deliberately NON-exclusive: several authorities may assert
-- overlapping things about one subject, and it carries no unique or exclusion
-- constraint on subject plus window. Coverage asserts the opposite kind of fact --
-- a person occupies ONE place at a time -- and that invariant has to live beside the
-- fact it governs. Enforced anywhere else it becomes application etiquette, which is
-- where parallel truth begins.
--
-- ── HALF-OPEN INTERVALS ──
--
-- [start, end). So 08:00-10:00 and 10:00-12:00 are ADJACENT, not overlapping, and a
-- handover at the hour is expressible. 08:00-10:01 against 10:00-12:00 genuinely
-- overlaps and is refused. The range type below encodes exactly that.
--
-- ── NO OVERNIGHT IN V1 ──
--
-- end_time > start_time, matching staff_availability_windows. A row ending before it
-- starts is a data error far more often than an intent, and accepting it would make
-- every resolver guess which service day the end belongs to. Named here rather than
-- discovered later.

create table if not exists public.staff_coverage_allocations (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete cascade,

    -- Employment, not person: Coverage plans the work of a specific employment
    -- relationship, and a person may hold more than one.
    employment_id uuid not null references public.employments (id) on delete restrict,

    -- The local operating day, same concept attendance and presence already key on.
    service_date date not null,
    start_time time not null,
    end_time time not null,

    -- Place. Site is required; room is optional and a null room is LEGITIMATE
    -- site-level Coverage, never a reason to invent a placeholder room.
    site_location_id uuid not null references public.locations (id) on delete restrict,
    room_location_id uuid references public.locations (id) on delete restrict,

    -- Append-oriented lifecycle, modelled on the expectation grammar deliberately:
    -- the discipline is reused even though the ledger is not the owner.
    --   revise  — the plan genuinely changed
    --   correct — the stored plan was wrong
    -- Collapsing those into one UPDATE loses the only signal that tells an operator
    -- whether the day changed or the record did.
    lifecycle_state text not null default 'active',
    transition_type text,
    supersedes_coverage_id uuid references public.staff_coverage_allocations (id) on delete restrict,
    lineage_root_id uuid references public.staff_coverage_allocations (id) on delete restrict,

    reason_key text,
    note text,
    source_key text not null default 'operator',
    created_by uuid,
    created_at timestamptz not null default now(),
    cancelled_by uuid,
    cancelled_at timestamptz,

    constraint staff_coverage_allocations_time_order
        check (end_time > start_time),
    constraint staff_coverage_allocations_lifecycle_check
        check (lifecycle_state in ('active', 'superseded', 'cancelled')),
    constraint staff_coverage_allocations_transition_check
        check (
            (supersedes_coverage_id is null and transition_type is null)
            or (supersedes_coverage_id is not null and transition_type in ('revision', 'correction'))
        ),
    constraint staff_coverage_allocations_cancel_shape
        check (
            (lifecycle_state = 'cancelled' and cancelled_at is not null)
            or (lifecycle_state <> 'cancelled' and cancelled_at is null)
        ),
    constraint staff_coverage_allocations_no_self_supersede
        check (supersedes_coverage_id is null or supersedes_coverage_id <> id),
    constraint staff_coverage_allocations_source_key_nonempty
        check (char_length(btrim(source_key)) > 0)
);

-- Tenancy carried by composite foreign keys rather than restated by hand, so a
-- Coverage row cannot belong to one org while its employment or site belong to
-- another.
create unique index if not exists employments_id_org_key on public.employments (id, org_id);
create unique index if not exists locations_id_org_key on public.locations (id, org_id);

alter table public.staff_coverage_allocations
    drop constraint if exists staff_coverage_allocations_employment_org_fk;
alter table public.staff_coverage_allocations
    add constraint staff_coverage_allocations_employment_org_fk
    foreign key (employment_id, org_id) references public.employments (id, org_id);

alter table public.staff_coverage_allocations
    drop constraint if exists staff_coverage_allocations_site_org_fk;
alter table public.staff_coverage_allocations
    add constraint staff_coverage_allocations_site_org_fk
    foreign key (site_location_id, org_id) references public.locations (id, org_id);

alter table public.staff_coverage_allocations
    drop constraint if exists staff_coverage_allocations_room_org_fk;
alter table public.staff_coverage_allocations
    add constraint staff_coverage_allocations_room_org_fk
    foreign key (room_location_id, org_id) references public.locations (id, org_id);

-- THE EXCLUSIVITY INVARIANT — the reason this is a dedicated authority.
-- One employment, one service date, no overlapping ACTIVE interval. Superseded and
-- cancelled rows are excluded from the constraint so history can coexist with the
-- plan that replaced it.
alter table public.staff_coverage_allocations
    drop constraint if exists staff_coverage_allocations_no_overlap;
alter table public.staff_coverage_allocations
    add constraint staff_coverage_allocations_no_overlap
    exclude using gist (
        employment_id with =,
        service_date with =,
        int4range(
            (extract(hour from start_time) * 60 + extract(minute from start_time))::int,
            (extract(hour from end_time) * 60 + extract(minute from end_time))::int
        ) with &&
    )
    where (lifecycle_state = 'active');

create index if not exists staff_coverage_allocations_employment_date_idx
    on public.staff_coverage_allocations (org_id, employment_id, service_date)
    where lifecycle_state = 'active';
create index if not exists staff_coverage_allocations_site_date_idx
    on public.staff_coverage_allocations (org_id, site_location_id, service_date)
    where lifecycle_state = 'active';
create index if not exists staff_coverage_allocations_room_date_idx
    on public.staff_coverage_allocations (org_id, room_location_id, service_date)
    where lifecycle_state = 'active' and room_location_id is not null;
create index if not exists staff_coverage_allocations_lineage_idx
    on public.staff_coverage_allocations (lineage_root_id);

/*
 * ROOM MUST BELONG TO THE COVERAGE SITE — AND THAT IS A TRIGGER, NOT A CHECK.
 *
 * `public.location_site_id()` is STABLE, not IMMUTABLE, so it cannot appear in a
 * CHECK constraint. The same rule is enforced the same way for child_placements.
 * It also walks the ancestor chain rather than comparing parent_location_id: a group
 * nested inside a physical space has the SPACE as its parent, and a direct
 * comparison silently hides exactly those classrooms.
 */
create or replace function public.validate_staff_coverage_place()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_site_type text;
    v_room_type text;
    v_room_site uuid;
    v_emp_start date;
    v_emp_end date;
    v_emp_status text;
begin
    select l.location_type into v_site_type from public.locations l where l.id = new.site_location_id;
    if v_site_type is distinct from 'site' then
        raise exception 'staff_coverage: site_location_id % is not a site', new.site_location_id
            using errcode = '23514';
    end if;

    if new.room_location_id is not null then
        -- A SITE IS NOT A ROOM. location_site_id() answers the site itself for a site
        -- row, so the ancestry test alone would accept room = site -- which would count
        -- one person as both site-level and room-level Coverage for the same hour.
        -- Site-level Coverage is expressed by a NULL room, never by naming the site.
        if new.room_location_id = new.site_location_id then
            raise exception 'staff_coverage: site-level Coverage uses a null room, not the site id'
                using errcode = '23514';
        end if;
        select l.location_type into v_room_type from public.locations l where l.id = new.room_location_id;
        if v_room_type is null or v_room_type = 'site' then
            raise exception 'staff_coverage: room_location_id % is not an operational place', new.room_location_id
                using errcode = '23514';
        end if;

        v_room_site := public.location_site_id(new.room_location_id);
        if v_room_site is distinct from new.site_location_id then
            raise exception 'staff_coverage: room % does not belong to site %',
                new.room_location_id, new.site_location_id using errcode = '23514';
        end if;
    end if;

    -- Coverage is planned work for an employment, so the day must fall inside it.
    -- Planning someone into a room on a date they are not employed is not a schedule,
    -- it is a mistake with a room number attached.
    select e.start_date, e.end_date, e.employment_status
      into v_emp_start, v_emp_end, v_emp_status
      from public.employments e where e.id = new.employment_id;
    if v_emp_status = 'canceled' then
        raise exception 'staff_coverage: employment % is canceled', new.employment_id
            using errcode = '23514';
    end if;
    if v_emp_start is null or new.service_date < v_emp_start
       or (v_emp_end is not null and new.service_date > v_emp_end) then
        raise exception 'staff_coverage: service_date % is outside employment % (% to %)',
            new.service_date, new.employment_id, v_emp_start, coalesce(v_emp_end::text, 'open')
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists validate_staff_coverage_place on public.staff_coverage_allocations;
create trigger validate_staff_coverage_place
    before insert or update on public.staff_coverage_allocations
    for each row execute function public.validate_staff_coverage_place();

alter table public.staff_coverage_allocations enable row level security;
revoke all on public.staff_coverage_allocations from authenticated, anon;

drop policy if exists staff_coverage_allocations_select_org on public.staff_coverage_allocations;
create policy staff_coverage_allocations_select_org
    on public.staff_coverage_allocations for select to authenticated
    using (exists (select 1 from public.user_roles ur
                   where ur.user_id = auth.uid() and ur.org_id = staff_coverage_allocations.org_id));

drop policy if exists staff_coverage_allocations_mutate_ops on public.staff_coverage_allocations;
create policy staff_coverage_allocations_mutate_ops
    on public.staff_coverage_allocations for all to authenticated
    using (exists (select 1 from public.user_roles ur
                   where ur.user_id = auth.uid() and ur.org_id = staff_coverage_allocations.org_id
                     and ur.role = any (array['owner','admin','ops'])))
    with check (exists (select 1 from public.user_roles ur
                   where ur.user_id = auth.uid() and ur.org_id = staff_coverage_allocations.org_id
                     and ur.role = any (array['owner','admin','ops'])));

grant select, insert, update on table public.staff_coverage_allocations to authenticated;
grant all on table public.staff_coverage_allocations to service_role;

comment on table public.staff_coverage_allocations is
    'Date-specific planned Staff allocation: employment x service_date x [start,end) x site [x room]. Specializes the baseline Assignment for one day; never rewrites it. Append-oriented; one employment cannot hold overlapping active Coverage.';
