-- Payment-views convergence — migration high-water and privilege posture before extending.
--
-- The version must not collide and must sit above the hosted high-water; the on-disk lineage is
-- not proof of the hosted one. This also reads the CURRENT EXECUTE grants on the account fact
-- bundle, because the next migration tightens them and a guess about the runtime role set would
-- be exactly the wrong thing to lock in.
--
-- Catalog-only, one statement, read only.
select
    'payment_views_precheck' as question_id,
    'row' as kind,
    json_build_object(
        'newest_applied', (select max(version) from supabase_migrations.schema_migrations),
        'total_applied', (select count(*) from supabase_migrations.schema_migrations),
        'has_20261025120000', (select count(*) from supabase_migrations.schema_migrations where version = '20261025120000'),
        'bundle_grants', (
            select coalesce(json_agg(json_build_object('grantee', grantee, 'privilege', privilege_type))::text, 'NONE')
            from information_schema.routine_privileges
            where routine_schema = 'public' and routine_name = 'financials_account_fact_bundle'),
        'bundle_acl', (
            select coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT(PUBLIC)')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'payments_rls', (
            select relrowsecurity from pg_class where oid = 'public.payments'::regclass),
        'charges_rls', (
            select relrowsecurity from pg_class where oid = 'public.charges'::regclass),
        'customers_rls', (
            select relrowsecurity from pg_class where oid = 'public.customers'::regclass)
    )::text as payload;
