-- Where do the unknown-hours Assignments live, so mounted QA can actually look at one?
select 'unkloc' as question_id, 'row' as kind,
  json_build_object(
    'rows', (
      select coalesce(json_agg(json_build_object(
        'assignment_id', sa.id, 'subject_type', sa.subject_type,
        'site', sa.site_location_id, 'room', sa.room_location_id,
        'member', sa.customer_member_id, 'status', sa.status,
        'start', sa.start_date::text, 'end', coalesce(sa.end_date::text,'open'),
        'weekdays', (select json_agg(i.weekday order by i.weekday) from public.assignment_weekday_intervals i where i.assignment_id=sa.id)
      )), '[]'::json)
      from public.schedule_assignments sa
      where exists (select 1 from public.assignment_weekday_intervals i where i.assignment_id=sa.id and i.start_time is null)
    ),
    'observed_at', now()::text)::text as payload;
