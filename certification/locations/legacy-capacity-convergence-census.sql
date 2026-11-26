-- Read-only census: what is actually stored in the LEGACY location capacity field,
-- and does the canonical capacity system already say the same thing?
--
-- WHY THIS FILE EXISTS
-- `childcare_capacity_rules` is the canonical seat-limit authority: capacity_kind is
-- CHECK-constrained to physical | licensed | operational, scoped org->site->program->room,
-- effective-dated, and its own table comment says it RETIRES the location capacity EAV.
-- Binding capacity is the most restrictive applicable limit -- never a sum.
--
-- Meanwhile `locations.metadata.capacity` is still authored in Add Room and Room detail as
-- a single UNTYPED number, and at least four Settings surfaces SUM it: the site capacity
-- summary, the site overview, the Locations landing portfolio total, and -- most
-- consequentially -- a program's "N children" figure. With topology in place those sums now
-- add a physical room's seats to the seats of the classrooms inside it.
--
-- Retiring the legacy field safely needs to know what is in it. The field carries no
-- capacity_kind, so nothing in the schema can tell us whether an operator meant physical,
-- licensed or operational. This census measures whether that ambiguity is even load-bearing:
-- how many rows exist, on which topology roles, and whether a canonical rule already covers
-- them (in which case the legacy value is redundant rather than ambiguous).
--
-- POSITIVE CONTROLS
-- `control_locations` and `control_capacity_rules` count the underlying tables. If the legacy
-- counts come back zero AND a control is zero, the probe did not reach data and a zero
-- proves nothing. A zero legacy count with a NON-zero control is a real finding.
--
-- Reader contract: column 1 is the question id, column 2 a fixed literal, and every
-- identifying fact travels inside the JSON payload so nothing is positionally swallowed.
--
-- One statement. No DDL. No writes.

select question_id, 'data' as row_kind, payload from (
    -- 1. Every location carrying a legacy capacity value, with the topology context that
    --    determines what a migration could even mean for it.
    select
        'legacy_capacity_rows'::text as question_id,
        json_build_object(
            'org_id', l.org_id,
            'location_id', l.id,
            'label', l.label,
            'location_type', l.location_type,
            'effective_role', public.location_unit_role(l.id),
            'stored_unit_role', l.unit_role,
            'site_id', public.location_site_id(l.id),
            'is_nested', (l.parent_location_id IS DISTINCT FROM public.location_site_id(l.id)),
            'is_active', l.is_active,
            'legacy_capacity', l.metadata ->> 'capacity',
            'legacy_ratio', l.metadata ->> 'student_teacher_ratio',
            'legacy_category', l.metadata ->> 'category',
            'canonical_room_rules', (
                select count(*) from public.childcare_capacity_rules r
                where r.room_location_id = l.id
            ),
            'live_placements', (
                select count(*) from public.child_placements p
                where p.room_location_id = l.id and p.status in ('planned','active','ending')
            ),
            'any_placements', (
                select count(*) from public.child_placements p where p.room_location_id = l.id
            )
        )::text as payload
    from public.locations l
    where l.metadata ? 'capacity'
      and nullif(btrim(l.metadata ->> 'capacity'), '') is not null
    order by l.org_id, l.label
    limit 500
) q1

union all

select question_id, 'data' as row_kind, payload from (
    -- 2. Shape of the legacy population by topology role, so we can see whether the
    --    ambiguity concentrates on classrooms (one reading) or spans physical rooms too.
    select
        'legacy_shape_by_role'::text as question_id,
        json_build_object(
            'org_id', l.org_id,
            'location_type', l.location_type,
            'effective_role', public.location_unit_role(l.id),
            'is_nested', (l.parent_location_id IS DISTINCT FROM public.location_site_id(l.id)),
            'n', count(*),
            'distinct_values', count(distinct l.metadata ->> 'capacity')
        )::text as payload
    from public.locations l
    where l.metadata ? 'capacity'
      and nullif(btrim(l.metadata ->> 'capacity'), '') is not null
    group by l.org_id, l.location_type, public.location_unit_role(l.id),
             (l.parent_location_id IS DISTINCT FROM public.location_site_id(l.id))
) q2

union all

select question_id, 'data' as row_kind, payload from (
    -- 3. The canonical side: what kinds and scopes are actually authored today.
    select
        'canonical_rules_shape'::text as question_id,
        json_build_object(
            'org_id', r.org_id,
            'scope_type', r.scope_type,
            'capacity_kind', r.capacity_kind,
            'n', count(*),
            'open_ended', count(*) filter (where r.effective_end is null)
        )::text as payload
    from public.childcare_capacity_rules r
    group by r.org_id, r.scope_type, r.capacity_kind
) q3

union all

select question_id, 'data' as row_kind, payload from (
    -- 4. The decisive comparison: for each room that has BOTH a legacy value and a canonical
    --    room-scoped rule, do they agree? Agreement means the legacy row is redundant;
    --    disagreement means a migration would have to choose, and choosing is a claim.
    select
        'legacy_vs_canonical'::text as question_id,
        json_build_object(
            'org_id', l.org_id,
            'location_id', l.id,
            'label', l.label,
            'effective_role', public.location_unit_role(l.id),
            'legacy_capacity', l.metadata ->> 'capacity',
            'canonical_kind', r.capacity_kind,
            'canonical_capacity', r.capacity,
            'effective_start', r.effective_start,
            'effective_end', r.effective_end,
            'agrees', (
                (l.metadata ->> 'capacity') ~ '^[0-9]+$'
                and (l.metadata ->> 'capacity')::int = r.capacity
            )
        )::text as payload
    from public.locations l
    join public.childcare_capacity_rules r on r.room_location_id = l.id
    where l.metadata ? 'capacity'
      and nullif(btrim(l.metadata ->> 'capacity'), '') is not null
    order by l.org_id, l.label
    limit 500
) q4

union all

select question_id, 'data' as row_kind, payload from (
    -- 5. Rooms the canonical system already covers, legacy value or not. Establishes how far
    --    canonical adoption has actually got, which decides whether retirement is a cleanup
    --    or a migration.
    select
        'canonical_coverage'::text as question_id,
        json_build_object(
            'org_id', l.org_id,
            'units_total', count(*),
            'units_with_legacy', count(*) filter (where l.metadata ? 'capacity'
                and nullif(btrim(l.metadata ->> 'capacity'), '') is not null),
            'units_with_canonical_room_rule', count(*) filter (where exists (
                select 1 from public.childcare_capacity_rules r where r.room_location_id = l.id
            )),
            'units_with_neither', count(*) filter (where
                not (l.metadata ? 'capacity' and nullif(btrim(l.metadata ->> 'capacity'), '') is not null)
                and not exists (select 1 from public.childcare_capacity_rules r where r.room_location_id = l.id)
            )
        )::text as payload
    from public.locations l
    where l.location_type = 'unit'
    group by l.org_id
) q5

union all

select question_id, 'data' as row_kind, payload from (
    -- 6. POSITIVE CONTROL. If this is zero the probe never reached the locations table and a
    --    zero legacy count above proves nothing at all.
    select
        'control_locations'::text as question_id,
        json_build_object(
            'locations_total', count(*),
            'units_total', count(*) filter (where location_type = 'unit'),
            'sites_total', count(*) filter (where location_type = 'site'),
            'orgs_with_locations', count(distinct org_id)
        )::text as payload
    from public.locations
) q6

union all

select question_id, 'data' as row_kind, payload from (
    -- 7. POSITIVE CONTROL for the canonical side.
    select
        'control_capacity_rules'::text as question_id,
        json_build_object(
            'rules_total', count(*),
            'orgs_with_rules', count(distinct org_id),
            'room_scoped', count(*) filter (where scope_type = 'room'),
            'site_scoped', count(*) filter (where scope_type = 'site')
        )::text as payload
    from public.childcare_capacity_rules
) q7
