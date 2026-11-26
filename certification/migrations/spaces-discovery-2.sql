select 'spaces_discovery_2' as question_id, 'row' as kind,
  json_build_object(
    'units', (
      select coalesce(json_agg(json_build_object(
          'label', l.label,
          'role', coalesce(l.unit_role,'(null)'),
          'parent_role', (select coalesce(p.unit_role,'(null)') from public.locations p where p.id=l.parent_location_id),
          'parent_is_site', (select p.location_type='site' from public.locations p where p.id=l.parent_location_id),
          'metadata_capacity', l.metadata->>'capacity',
          'active', l.is_active) order by l.label),'[]'::json)
      from public.locations l where l.location_type='unit'),
    'child_attendance_by_target_role', (
      select coalesce(json_agg(x order by x->>'role'),'[]'::json) from (
        select json_build_object(
          'role', coalesce(t.unit_role,'(null=>operational_group)'),
          'events', count(*)) as x
        from public.child_attendance_events e
        join public.locations t on t.id = e.room_location_id
        group by coalesce(t.unit_role,'(null=>operational_group)')) s),
    'child_attendance_events_total', (select count(*) from public.child_attendance_events),
    'child_attendance_with_room', (select count(*) from public.child_attendance_events where room_location_id is not null),
    'staff_presence_by_target_role', (
      select coalesce(json_agg(x order by x->>'role'),'[]'::json) from (
        select json_build_object(
          'role', coalesce(t.unit_role,'(null=>operational_group)'),
          'events', count(*)) as x
        from public.staff_presence_events e
        join public.locations t on t.id = e.room_location_id
        group by coalesce(t.unit_role,'(null=>operational_group)')) s),
    'schedule_assignments_by_target_role', (
      select coalesce(json_agg(x order by x->>'role'),'[]'::json) from (
        select json_build_object(
          'role', coalesce(t.unit_role,'(null=>operational_group)'),
          'subject', a.subject_type,
          'rows', count(*)) as x
        from public.schedule_assignments a
        join public.locations t on t.id = a.room_location_id
        group by coalesce(t.unit_role,'(null=>operational_group)'), a.subject_type) s),
    'capacity_rules', (
      select coalesce(json_agg(json_build_object(
          'kind', r.capacity_kind, 'scope', r.scope_type, 'capacity', r.capacity,
          'room', (select l.label from public.locations l where l.id=r.room_location_id),
          'room_role', (select coalesce(l.unit_role,'(null)') from public.locations l where l.id=r.room_location_id),
          'effective_start', r.effective_start::text, 'effective_end', r.effective_end::text)
        order by r.capacity_kind),'[]'::json)
      from public.childcare_capacity_rules r),
    'observed_at', now()::text)::text as payload;
