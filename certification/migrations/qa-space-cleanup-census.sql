select 'qa_space_cleanup_census' as question_id, 'row' as kind,
  json_build_object(
    'north_campus_units', (
      select coalesce(json_agg(json_build_object(
          'id', l.id, 'label', l.label,
          'role', coalesce(l.unit_role,'(null)'),
          'parent_id', l.parent_location_id,
          'parent_label', (select p.label from public.locations p where p.id = l.parent_location_id),
          'active', l.is_active,
          'created_at', l.created_at::text,
          'updated_at', l.updated_at::text,
          'metadata_keys', (select coalesce(json_agg(k order by k),'[]'::json) from jsonb_object_keys(l.metadata) k),
          'children_count', (select count(*) from public.locations c where c.parent_location_id = l.id))
        order by l.created_at),'[]'::json)
      from public.locations l
      where l.location_type = 'unit'
        and (l.parent_location_id = '1a5644a7-45c4-413b-9021-5f556118b6e2'::uuid
             or l.parent_location_id in (select id from public.locations where parent_location_id = '1a5644a7-45c4-413b-9021-5f556118b6e2'::uuid))),
    'tables_referencing_locations', (
      select coalesce(json_agg(json_build_object(
          'table', c.conrelid::regclass::text,
          'column', a.attname) order by c.conrelid::regclass::text, a.attname),'[]'::json)
      from pg_constraint c
      join unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.contype = 'f'
        and c.confrelid = 'public.locations'::regclass),
    'observed_at', now()::text)::text as payload;
