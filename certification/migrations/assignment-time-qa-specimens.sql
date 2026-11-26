-- Which hosted Assignments can each mounted QA scenario actually use?
-- Picking specimens from real data rather than assuming one exists for every shape.
select
  'qaspec' as question_id,
  'row'    as kind,
  json_build_object(
    'known_hours_specimens', (
      select coalesce(json_agg(json_build_object(
        'assignment_id', sa.id, 'subject_type', sa.subject_type,
        'person_id', sa.subject_person_id, 'room', sa.room_location_id,
        'weekdays', (select json_agg(i.weekday order by i.weekday) from public.assignment_weekday_intervals i where i.assignment_id=sa.id),
        'hours', (select json_agg(distinct i.start_time::text||'-'||i.end_time::text) from public.assignment_weekday_intervals i where i.assignment_id=sa.id and i.start_time is not null)
      )), '[]'::json)
      from public.schedule_assignments sa
      where exists (select 1 from public.assignment_weekday_intervals i where i.assignment_id=sa.id and i.start_time is not null)
    ),
    'unknown_hours_specimens', (
      select coalesce(json_agg(json_build_object(
        'assignment_id', sa.id, 'subject_type', sa.subject_type, 'person_id', sa.subject_person_id,
        'weekdays', (select json_agg(i.weekday order by i.weekday) from public.assignment_weekday_intervals i where i.assignment_id=sa.id)
      )), '[]'::json)
      from public.schedule_assignments sa
      where exists (select 1 from public.assignment_weekday_intervals i where i.assignment_id=sa.id and i.start_time is null)
    ),
    'staff_shapes', (
      select coalesce(json_agg(json_build_object(
        'assignment_id', sa.id, 'person_id', sa.subject_person_id,
        'has_room', sa.room_location_id is not null, 'site', sa.site_location_id
      )), '[]'::json)
      from public.schedule_assignments sa where sa.subject_type='staff'
    ),
    'child_assignments', (
      select coalesce(json_agg(sa.id), '[]'::json) from public.schedule_assignments sa where sa.subject_type='child'
    ),
    'observed_at', now()::text
  )::text as payload;
