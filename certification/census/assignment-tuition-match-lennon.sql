-- Assignment tuition match evidence (Lennon Kurzman, Toddler 2, M-F) — read only.
-- One statement, one row: question_id | kind | payload(json). No personal fields are emitted.
with m as (
    select cm.id, cm.org_id
    from public.customer_members cm
    where lower(cm.first_name) = 'lennon' and lower(cm.last_name) = 'kurzman'
),
ocm as (
    select o.id, o.org_id, o.opportunity_id, o.schedule_type, o.program_category_id, o.location_id,
           o.start_date, o.metadata -> 'requested_days_per_week' as requested_days_per_week
    from public.opportunity_customer_members o
    join m on m.id = o.customer_member_id and m.org_id = o.org_id
),
agr as (
    select a.id, a.status, a.opportunity_customer_member_id
    from public.child_enrollment_agreements a
    join ocm on ocm.id = a.opportunity_customer_member_id
),
plc as (
    select p.enrollment_agreement_id, p.program_category_id, p.room_location_id, p.site_location_id, p.start_date, p.end_date, p.status
    from public.child_placements p
    join agr on agr.id = p.enrollment_agreement_id
),
sa as (
    select s.enrollment_agreement_id, s.schedule_pattern_id, s.start_date, s.end_date, s.status,
           sp.schedule_type_key, sp.weekdays
    from public.schedule_assignments s
    join agr on agr.id = s.enrollment_agreement_id
    left join public.schedule_patterns sp on sp.id = s.schedule_pattern_id
),
orgs as (select distinct org_id from ocm),
pi as (
    select p.id, p.process_key, p.context_id, p.state, p.metadata
    from public.process_instances p
    join m on m.id = p.subject_id and m.org_id = p.org_id
)
select
    'assignment_tuition_match' as question_id,
    'row' as kind,
    json_build_object(
        'members', (select count(*) from m),
        'process_instances', (select json_agg(json_build_object(
            'id', pi.id, 'process_key', pi.process_key, 'state', pi.state,
            'program_category_id', pi.metadata -> 'program_category_id',
            'program_key', (select l.key from public.location_program_categories l where l.id::text = pi.metadata ->> 'program_category_id'),
            'room', pi.metadata -> 'program_room_cohort_key', 'room_location_id', pi.metadata -> 'room_location_id',
            'schedule_type', pi.metadata -> 'schedule_type', 'weekdays', pi.metadata -> 'weekdays',
            'requested_days_per_week', pi.metadata -> 'requested_days_per_week',
            'start_date', pi.metadata -> 'start_date', 'end_date', pi.metadata -> 'end_date',
            'location_id', pi.metadata -> 'location_id')) from pi),
        'ocm', (select json_agg(json_build_object(
            'id', ocm.id, 'schedule_type', ocm.schedule_type, 'program_category_id', ocm.program_category_id,
            'program_key', (select l.key from public.location_program_categories l where l.id = ocm.program_category_id),
            'location_id', ocm.location_id, 'start_date', ocm.start_date,
            'requested_days_per_week', ocm.requested_days_per_week)) from ocm),
        'agreements', (select json_agg(json_build_object('id', id, 'status', status)) from agr),
        'placements', (select json_agg(json_build_object(
            'program_category_id', plc.program_category_id,
            'program_key', (select l.key from public.location_program_categories l where l.id = plc.program_category_id),
            'room_location_id', plc.room_location_id, 'site_location_id', plc.site_location_id,
            'start_date', plc.start_date, 'end_date', plc.end_date, 'status', plc.status)) from plc),
        'schedule_assignments', (select json_agg(json_build_object(
            'pattern_id', sa.schedule_pattern_id, 'schedule_type_key', sa.schedule_type_key,
            'weekdays', sa.weekdays, 'start_date', sa.start_date, 'end_date', sa.end_date, 'status', sa.status)) from sa),
        'room_toddler_2', (select json_agg(json_build_object(
            'id', loc.id, 'program_category_id', loc.metadata ->> 'program_category_id',
            'program_key', (select l.key from public.location_program_categories l where l.id::text = loc.metadata ->> 'program_category_id'),
            'age_from', loc.metadata ->> 'age_range_from', 'age_to', loc.metadata ->> 'age_range_to', 'age_unit', loc.metadata ->> 'age_range_unit'))
            from public.locations loc where loc.org_id in (select org_id from orgs) and lower(loc.label) = 'toddler 2'),
        'program_categories', (select json_agg(json_build_object('id', l.id, 'key', l.key, 'location_id', l.location_id, 'is_active', l.is_active))
            from public.location_program_categories l where l.org_id in (select org_id from orgs)),
        'schedule_pattern_types', (select json_agg(distinct json_build_object('schedule_type_key', sp.schedule_type_key, 'days', coalesce(array_length(sp.weekdays, 1), 0))::text)
            from public.schedule_patterns sp where sp.org_id in (select org_id from orgs)),
        'offerings', (select json_agg(json_build_object(
            'id', po.id, 'program_key', po.program_key, 'attendance_type', po.attendance_type, 'status', po.status,
            'is_active', po.is_active, 'effective_start', po.effective_start, 'effective_end', po.effective_end,
            'variants', (select json_agg(json_build_object(
                'id', v.id, 'label', v.label, 'quantity_type', v.quantity_type, 'quantity_value', v.quantity_value,
                'status', v.status, 'is_active', v.is_active,
                'rates', (select json_agg(json_build_object(
                    'id', r.id, 'cadence_key', r.cadence_key, 'payer_type', r.payer_type, 'location_id', r.location_id,
                    'rate_cents', r.rate_cents, 'not_offered', r.not_offered, 'is_active', r.is_active,
                    'effective_start', r.effective_start, 'effective_end', r.effective_end))
                    from public.commercial_tuition_rates r where r.variant_id = v.id)))
                from public.program_offering_variants v where v.offering_id = po.id)))
            from public.program_offerings po where po.org_id in (select org_id from orgs))
    )::text as payload;
