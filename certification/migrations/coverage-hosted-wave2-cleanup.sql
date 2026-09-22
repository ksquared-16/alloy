select 'coverage_wave2_cleanup' as question_id, 'row' as kind,
  json_build_object(
    'effective_anywhere', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'effective_on_wave2_date', (select count(*) from public.staff_coverage_allocations
        where lifecycle_state='active' and service_date = date '2027-04-02'),
    'total_rows', (select count(*) from public.staff_coverage_allocations),
    'by_state', (select coalesce(json_object_agg(lifecycle_state, n),'{}'::json) from (
        select lifecycle_state, count(*) as n from public.staff_coverage_allocations group by 1) s),
    'authored_reasons_preserved', (select coalesce(json_agg(json_build_object(
            'id', a.id, 'state', a.lifecycle_state, 'transition', a.transition_type,
            'reason', a.reason_key, 'cancel_reason', a.cancel_reason_key) order by a.created_at, a.id),'[]'::json)
        from public.staff_coverage_allocations a where a.service_date = date '2027-04-02'),
    'staff_assignments_live', (select count(*) from public.schedule_assignments
        where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'staff_assignments_supply', (select count(*) from public.schedule_assignments sa
        join public.operational_assignment_types t on t.id=sa.operational_assignment_type_id
        where sa.subject_type='staff' and sa.commitment_kind='committed'
          and sa.status in ('planned','active','ending') and t.staffing_participation='supply'),
    'child_demand_assignments', (select count(*) from public.schedule_assignments
        where subject_type='child' and status in ('planned','active','ending')),
    'assignment_weekday_intervals', (select count(*) from public.assignment_weekday_intervals),
    'availability_windows', (select count(*) from public.staff_availability_windows),
    'availability_exceptions', (select count(*) from public.staff_availability_exceptions),
    'presence_events', (select count(*) from public.staff_presence_events),
    'observed_at', now()::text)::text as payload;
