select 'locations_lifecycle_columns' as question_id, 'row' as kind,
  json_build_object(
    'locations_columns', (
      select coalesce(json_agg(json_build_object(
          'column', c.column_name, 'type', c.data_type, 'nullable', c.is_nullable,
          'default', c.column_default) order by c.ordinal_position),'[]'::json)
      from information_schema.columns c
      where c.table_schema='public' and c.table_name='locations'),
    'status_key_values', (
      select coalesce(json_agg(json_build_object('status_key', s.status_key, 'rows', s.n)
          order by s.n desc),'[]'::json)
      from (select status_key, count(*) n from public.locations group by status_key) s),
    'archived_at_tables', (
      select coalesce(json_agg(c.table_name order by c.table_name),'[]'::json)
      from information_schema.columns c
      where c.table_schema='public' and c.column_name='archived_at'),
    'location_status_catalog', (
      select coalesce(json_agg(t.table_name order by t.table_name),'[]'::json)
      from information_schema.tables t
      where t.table_schema='public' and (t.table_name like '%status%' or t.table_name like '%lifecycle%')),
    'observed_at', now()::text)::text as payload;
