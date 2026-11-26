select 'coverage_baseline_before_cleanup' as question_id, 'row' as kind,
  json_build_object(
    'staff_assignments_live', (select count(*) from public.schedule_assignments
        where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'staff_assignments_supply', (select count(*) from public.schedule_assignments sa
        join public.operational_assignment_types t on t.id=sa.operational_assignment_type_id
        where sa.subject_type='staff' and sa.commitment_kind='committed'
          and sa.status in ('planned','active','ending') and t.staffing_participation='supply'),
    'child_demand_assignments', (select count(*) from public.schedule_assignments
        where subject_type='child' and status in ('planned','active','ending')),
    'assignment_weekday_intervals', (select count(*) from public.assignment_weekday_intervals),
    'participation_by_type', (select coalesce(json_agg(json_build_object(
            'id', t.id, 'participation', t.staffing_participation) order by t.id),'[]'::json)
        from public.operational_assignment_types t),
    'availability_windows', (select count(*) from public.staff_availability_windows),
    'availability_exceptions', (select count(*) from public.staff_availability_exceptions),
    'presence_events', (select count(*) from public.staff_presence_events),
    'coverage_total', (select count(*) from public.staff_coverage_allocations),
    'coverage_effective', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'coverage_effective_outside_qa_date', (select count(*) from public.staff_coverage_allocations
        where lifecycle_state='active' and service_date <> date '2027-04-01'),
    'other_org_subject', (select coalesce(json_agg(json_build_object(
            'org_id', e.org_id, 'person_id', e.person_id, 'employment_id', e.id) order by e.id),'[]'::json)
        from (select e.* from public.employments e
              where e.employment_status <> 'canceled'
                and e.org_id <> '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
              limit 1) e),
    'observed_at', now()::text)::text as payload;
