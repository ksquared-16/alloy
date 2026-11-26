select 'spaces_discovery_1' as question_id, 'row' as kind,
  json_build_object(
    'units_by_effective_role', (
      select coalesce(json_agg(x order by x->>'role'),'[]'::json) from (
        select json_build_object(
          'role', coalesce(l.unit_role,'(null=>operational_group)'),
          'total', count(*),
          'active', count(*) filter (where l.is_active),
          'with_metadata_capacity', count(*) filter (where l.metadata ? 'capacity'),
          'with_children', count(*) filter (where exists (
              select 1 from public.locations c where c.parent_location_id = l.id))
        ) as x
        from public.locations l
        where l.location_type = 'unit'
        group by coalesce(l.unit_role,'(null=>operational_group)')
      ) s),
    'classrooms_nested_in_physical', (
      select count(*) from public.locations c
      join public.locations p on p.id = c.parent_location_id
      where c.location_type='unit' and p.location_type='unit'),
    'capacity_rules_by_kind_scope', (
      select coalesce(json_agg(x order by x->>'kind', x->>'scope'),'[]'::json) from (
        select json_build_object(
          'kind', r.capacity_kind, 'scope', r.scope_type,
          'rows', count(*),
          'open_ended', count(*) filter (where r.effective_end is null),
          'distinct_rooms', count(distinct r.room_location_id)
        ) as x
        from public.childcare_capacity_rules r
        group by r.capacity_kind, r.scope_type
      ) s),
    'rooms_with_more_than_one_capacity_version', (
      select count(*) from (
        select room_location_id, capacity_kind, count(*) c
        from public.childcare_capacity_rules
        where room_location_id is not null
        group by room_location_id, capacity_kind having count(*) > 1) v),
    'attendance_location_columns', (
      select coalesce(json_agg(json_build_object(
          'table', c.table_name, 'column', c.column_name) order by c.table_name, c.column_name),'[]'::json)
      from information_schema.columns c
      where c.table_schema='public'
        and c.table_name in ('child_attendance_events','staff_presence_events','schedule_assignments')
        and c.column_name like '%location%'),
    'observed_at', now()::text)::text as payload;
