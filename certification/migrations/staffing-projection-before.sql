select 'staffing_projection_before' as question_id, 'row' as kind,
  json_build_object(
    'schedule_assignments_staff', (select count(*) from public.schedule_assignments
        where subject_type='staff' and commitment_kind='committed' and status in ('planned','active','ending')),
    'schedule_assignments_child', (select count(*) from public.schedule_assignments
        where subject_type='child' and status in ('planned','active','ending')),
    'assignment_weekday_intervals', (select count(*) from public.assignment_weekday_intervals),
    'assignment_interval_digest', (select md5(string_agg(
            a.assignment_id::text||'|'||a.weekday||'|'||coalesce(a.start_time::text,'-')||'|'||coalesce(a.end_time::text,'-')||'|'||a.source_key,
            ',' order by a.assignment_id, a.weekday, a.start_time))
        from public.assignment_weekday_intervals a),
    'participation_by_type', (select coalesce(json_agg(json_build_object(
            'id', t.id, 'participation', t.staffing_participation) order by t.id),'[]'::json)
        from public.operational_assignment_types t),
    'coverage_total', (select count(*) from public.staff_coverage_allocations),
    'coverage_effective', (select count(*) from public.staff_coverage_allocations where lifecycle_state='active'),
    'coverage_digest', (select md5(string_agg(
            c.id::text||'|'||c.lifecycle_state||'|'||coalesce(c.transition_type,'-')||'|'||coalesce(c.reason_key,'-')||'|'||coalesce(c.cancel_reason_key,'-'),
            ',' order by c.id))
        from public.staff_coverage_allocations c),
    'availability_windows', (select count(*) from public.staff_availability_windows),
    'availability_exceptions', (select count(*) from public.staff_availability_exceptions),
    'presence_events', (select count(*) from public.staff_presence_events),
    'attendance_events', (select count(*) from public.child_attendance_events),
    'enrollment_agreements', (select count(*) from public.child_enrollment_agreements),
    'projection_tables_created', (select count(*) from information_schema.tables
        where table_schema='public' and table_name like '%staffing_projection%'),
    'observed_at', now()::text)::text as payload;
