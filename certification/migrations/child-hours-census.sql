select 'child_hours' as question_id, 'row' as kind,
  json_build_object(
    'child_assignments', (select coalesce(json_agg(json_build_object(
            'id', sa.id, 'status', sa.status, 'start', sa.start_date, 'end', sa.end_date,
            'pattern', sa.schedule_pattern_id,
            'interval_rows', (select count(*) from public.assignment_weekday_intervals i where i.assignment_id = sa.id),
            'known_rows', (select count(*) from public.assignment_weekday_intervals i
                           where i.assignment_id = sa.id and i.start_time is not null)) order by sa.id),'[]'::json)
        from public.schedule_assignments sa
        where sa.subject_type='child' and sa.status in ('planned','active','ending')),
    'staff_assignments', (select coalesce(json_agg(json_build_object(
            'id', sa.id,
            'interval_rows', (select count(*) from public.assignment_weekday_intervals i where i.assignment_id = sa.id)) order by sa.id),'[]'::json)
        from public.schedule_assignments sa
        where sa.subject_type='staff' and sa.commitment_kind='committed' and sa.status in ('planned','active','ending')),
    'agreements_operational', (select count(*) from public.child_enrollment_agreements
        where status in ('pending_start','active','ending')),
    'placements_operational', (select count(*) from public.child_placements
        where status in ('planned','active','ending')),
    'observed_at', now()::text)::text as payload;
