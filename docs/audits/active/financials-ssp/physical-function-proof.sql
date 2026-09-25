-- Financials account fact bundle — LEDGER and PHYSICAL proof on the deployed primary.
--
-- A ledger row saying "applied" is a label. This asks the catalog what actually exists: the
-- function, its argument signature, whether it is SECURITY INVOKER (prosecdef = false, which is
-- the whole security argument — a DEFINER version would have removed RLS for non-service callers),
-- and whether search_path is pinned. It also counts org predicates in the body, because org
-- isolation is the one thing that must not have been lost in transit.
--
-- Catalog-only, one statement, read only.
select
    'financials_bundle_physical' as question_id,
    'row' as kind,
    json_build_object(
        'ledger_has_20261024120000', (
            select count(*) from supabase_migrations.schema_migrations where version = '20261024120000'),
        'newest_applied', (select max(version) from supabase_migrations.schema_migrations),
        'function_exists', (
            select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle'),
        'signature', (
            select pg_get_function_identity_arguments(p.oid) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'returns', (
            select pg_catalog.format_type(p.prorettype, null) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'security_definer', (
            select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'volatility', (
            select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'search_path_pinned', (
            select coalesce(array_to_string(p.proconfig, ','), 'NONE') from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'org_predicate_count', (
            select (length(p.prosrc) - length(replace(p.prosrc, 'org_id = p_org_id', ''))) / length('org_id = p_org_id')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'fact_set_count', (
            select (length(p.prosrc) - length(replace(p.prosrc, 'coalesce((', ''))) / length('coalesce((')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'grantees', (
            select coalesce(string_agg(distinct grantee, ','), 'NONE')
            from information_schema.routine_privileges
            where routine_schema = 'public' and routine_name = 'financials_account_fact_bundle')
    )::text as payload;
