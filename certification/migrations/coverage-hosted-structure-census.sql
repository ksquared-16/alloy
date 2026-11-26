select 'coverage_structure' as question_id, 'row' as kind,
  json_build_object(
    'table_present',        (select count(*) from information_schema.tables
                             where table_schema='public' and table_name='staff_coverage_allocations'),
    'rls_enabled',          (select coalesce(bool_or(relrowsecurity),false) from pg_class c
                             join pg_namespace n on n.oid=c.relnamespace
                             where n.nspname='public' and c.relname='staff_coverage_allocations'),
    'policies',             (select coalesce(json_agg(policyname order by policyname),'[]'::json) from pg_policies
                             where schemaname='public' and tablename='staff_coverage_allocations'),
    'foreign_keys',         (select coalesce(json_agg(conname order by conname),'[]'::json) from pg_constraint
                             where conrelid=to_regclass('public.staff_coverage_allocations') and contype='f'),
    'check_constraints',    (select coalesce(json_agg(conname order by conname),'[]'::json) from pg_constraint
                             where conrelid=to_regclass('public.staff_coverage_allocations') and contype='c'),
    'exclusion_constraints',(select coalesce(json_agg(json_build_object('name',conname,'def',pg_get_constraintdef(oid)) order by conname),'[]'::json)
                             from pg_constraint
                             where conrelid=to_regclass('public.staff_coverage_allocations') and contype='x'),
    'indexes',              (select coalesce(json_agg(indexname order by indexname),'[]'::json) from pg_indexes
                             where schemaname='public' and tablename='staff_coverage_allocations'),
    'triggers',             (select coalesce(json_agg(tgname order by tgname),'[]'::json) from pg_trigger
                             where tgrelid=to_regclass('public.staff_coverage_allocations') and not tgisinternal),
    'place_trigger_body',   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='validate_staff_coverage_place'
                               and pg_get_functiondef(p.oid) like '%location_site_id%'),
    'site_as_room_guard',   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='validate_staff_coverage_place'
                               and pg_get_functiondef(p.oid) like '%room_location_id = new.site_location_id%'),
    'lifecycle_columns',    (select coalesce(json_agg(column_name order by column_name),'[]'::json)
                             from information_schema.columns
                             where table_schema='public' and table_name='staff_coverage_allocations'
                               and column_name in ('lifecycle_state','transition_type','supersedes_coverage_id',
                                                   'lineage_root_id','cancelled_at','cancelled_by','created_by','source_key')),
    'grants_non_service',   (select coalesce(json_agg(json_build_object('grantee',grantee,'priv',privilege_type)
                                                      order by grantee, privilege_type),'[]'::json)
                             from information_schema.role_table_grants
                             where table_schema='public' and table_name='staff_coverage_allocations'
                               and grantee in ('anon','authenticated','PUBLIC','public')),
    'rpcs',                 (select coalesce(json_agg(p.proname order by p.proname),'[]'::json)
                             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname like 'staff\_coverage\_%'),
    'supersede_retires_first', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='staff_coverage_supersede'
                               and position('update public.staff_coverage_allocations' in pg_get_functiondef(p.oid))
                                 < position('insert into public.staff_coverage_allocations' in pg_get_functiondef(p.oid))),
    'ledger_versions',      (select coalesce(json_agg(version order by version),'[]'::json)
                             from supabase_migrations.schema_migrations
                             where version in ('20261011120000','20261012120000')),
    'observed_at', now()::text)::text as payload;
