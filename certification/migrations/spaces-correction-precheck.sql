select 'spaces_correction_precheck' as question_id, 'row' as kind,
  json_build_object(
    'capacity_rules_all', (
      select coalesce(json_agg(json_build_object(
          'id', r.id, 'kind', r.capacity_kind, 'scope', r.scope_type, 'capacity', r.capacity,
          'room', (select l.label from public.locations l where l.id = r.room_location_id),
          'room_id', r.room_location_id,
          'room_role', (select coalesce(l.unit_role,'(null)') from public.locations l where l.id = r.room_location_id),
          'age_group', r.age_group_key,
          'effective_start', r.effective_start::text,
          'effective_end', r.effective_end::text,
          'source', r.source_key,
          'metadata', r.metadata,
          'created_at', r.created_at::text)
        order by r.capacity_kind, r.created_at),'[]'::json)
      from public.childcare_capacity_rules r),
    'toddler_rooms', (
      select coalesce(json_agg(json_build_object(
          'id', l.id, 'label', l.label, 'role', coalesce(l.unit_role,'(null)'),
          'site', (select p.label from public.locations p where p.id = l.parent_location_id),
          'metadata_capacity', l.metadata->>'capacity') order by l.label),'[]'::json)
      from public.locations l
      where l.location_type='unit' and l.label in ('Toddler 1','Toddler 2')),
    'observed_at', now()::text)::text as payload;
