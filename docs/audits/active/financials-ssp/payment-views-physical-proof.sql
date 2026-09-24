-- Payment-views convergence — LEDGER, PHYSICAL DEFINITION and PRIVILEGE on the deployed primary.
--
-- A ledger row saying "applied" is a label, and a GRANT statement in a migration file is an
-- intention. This asks the catalog what is actually true after deployment: that the migration is
-- recorded, that the function still carries the security posture it claims (prosecdef FALSE, pinned
-- search_path, org predicates intact), that it now returns the payment-view fact sets, and — the
-- point of this slice's hardening — that PUBLIC can no longer execute it while the one inspected
-- runtime caller still can.
--
-- Catalog-only, one statement, read only.
select
    'payment_views_physical' as question_id,
    'row' as kind,
    json_build_object(
        'ledger_has_20261025120000', (
            select count(*) from supabase_migrations.schema_migrations where version = '20261025120000'),
        'newest_applied', (select max(version) from supabase_migrations.schema_migrations),
        'security_definer', (
            select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'search_path_pinned', (
            select coalesce(array_to_string(p.proconfig, ','), 'NONE') from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'org_predicate_count', (
            select (length(p.prosrc) - length(replace(p.prosrc, 'org_id = p_org_id', ''))) / length('org_id = p_org_id')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        -- The new fact sets must be physically present in the deployed definition.
        'has_payments_for_views', (
            select position('payments_for_views' in p.prosrc) > 0 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'has_payment_refunds', (
            select position('payment_refunds' in p.prosrc) > 0 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'has_payer_customers', (
            select position('payer_customers' in p.prosrc) > 0 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'has_charges_for_allocations', (
            select position('charges_for_allocations' in p.prosrc) > 0 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        -- The resolver's own rule must NOT have moved into SQL.
        'sql_filters_direction', (
            select position('direction = ''inbound''' in p.prosrc) > 0 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'sql_filters_voided', (
            select position('status <> ''voided''' in p.prosrc) > 0 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        -- PRIVILEGE: the point of the hardening.
        'acl', (
            select coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT(PUBLIC)')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'financials_account_fact_bundle' limit 1),
        'public_can_execute', has_function_privilege(
            'public', 'public.financials_account_fact_bundle(uuid,uuid,uuid)', 'EXECUTE'),
        'service_role_can_execute', has_function_privilege(
            'service_role', 'public.financials_account_fact_bundle(uuid,uuid,uuid)', 'EXECUTE'),
        'authenticated_can_execute', has_function_privilege(
            'authenticated', 'public.financials_account_fact_bundle(uuid,uuid,uuid)', 'EXECUTE')
    )::text as payload;
