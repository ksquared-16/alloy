select 'coverage_rls' as question_id, 'row' as kind,
  json_build_object(
    'policies', (select coalesce(json_agg(json_build_object(
            'name', policyname, 'cmd', cmd, 'roles', roles::text,
            'using', qual, 'with_check', with_check) order by policyname),'[]'::json)
        from pg_policies where schemaname='public' and tablename='staff_coverage_allocations'),
    'grants_all', (select coalesce(json_agg(json_build_object(
            'grantee', grantee, 'priv', privilege_type) order by grantee, privilege_type),'[]'::json)
        from information_schema.role_table_grants
        where table_schema='public' and table_name='staff_coverage_allocations'),
    'anon_or_public_grants', (select count(*) from information_schema.role_table_grants
        where table_schema='public' and table_name='staff_coverage_allocations'
          and grantee in ('anon','PUBLIC')),
    'rls_enabled', (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='staff_coverage_allocations'),
    'rls_forced', (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='staff_coverage_allocations'),
    'rpc_security', (select coalesce(json_agg(json_build_object(
            'name', p.proname, 'security_definer', p.prosecdef) order by p.proname),'[]'::json)
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'staff_coverage%'),
    'index_defs', (select coalesce(json_agg(json_build_object(
            'name', indexname, 'def', indexdef) order by indexname),'[]'::json)
        from pg_indexes where schemaname='public' and tablename='staff_coverage_allocations'),
    'time_order_check', (select pg_get_constraintdef(oid) from pg_constraint
        where conrelid=to_regclass('public.staff_coverage_allocations')
          and conname='staff_coverage_allocations_time_order'),
    'transition_check', (select pg_get_constraintdef(oid) from pg_constraint
        where conrelid=to_regclass('public.staff_coverage_allocations')
          and conname='staff_coverage_allocations_transition_check'),
    'observed_at', now()::text)::text as payload;
