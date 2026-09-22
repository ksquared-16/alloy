select 'slice6_qa_facts' as question_id, 'row' as kind,
  json_build_object(
    'availability_exceptions', (select coalesce(json_agg(json_build_object(
            'id', e.id, 'employment_id', e.employment_id, 'kind', e.exception_kind,
            'reason', e.reason, 'active', e.is_active) order by e.id),'[]'::json)
        from public.staff_availability_exceptions e
        where e.exception_date = date '2027-04-01' and e.is_active),
    'coverage_on_date', (select coalesce(json_agg(json_build_object(
            'id', a.id, 'employment', a.employment_id, 'state', a.lifecycle_state,
            'start', a.start_time::text, 'end', a.end_time::text, 'reason', a.reason_key) order by a.created_at),'[]'::json)
        from public.staff_coverage_allocations a
        where a.service_date = date '2027-04-01'),
    'coverage_effective_anywhere', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'observed_at', now()::text)::text as payload;
