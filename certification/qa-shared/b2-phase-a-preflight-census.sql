-- B2 Phase A preflight — Shared QA Run Capability.
-- READ-ONLY census of alloy_deployed_primary (ALLOY_STAGING).
--
-- Proves the deployed staging database still carries the five audited access
-- functions B1's QA-run path calls, the seed_default_rbac org trigger and seeded
-- role package, and department/site scope support. Also reports whether the
-- frozen QA Shared / QA Secondary organizations already exist (they must NOT be
-- created during B2) and that Firefly remains a distinct forbidden tenant.
--
-- Email/payment deployment secrets (RESEND_API_KEY, Stripe keys) are NOT in the
-- database; this census records only DB-visible payment-structure readiness.
-- Deployment-wide email fallback is a separate hosted-env gate.
--
-- Output shape: question_id | kind | payload (trusted-host census parser).
select question_id, kind, payload
from (
    select 'b2a00_identity'::text as question_id, 'data'::text as kind,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'ledger_rows', (select count(*) from supabase_migrations.schema_migrations),
               'current_database', current_database(),
               'server_version', version()
           )::text as payload,
           '00'::text as sort_key

    union all

    -- 1. THE FIVE AUDITED FUNCTIONS B1 CALLS.
    select 'b2a01_audited_functions', 'check',
           'create_role_definition_audited ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'create_role_definition_audited'), 'false'),
           '01a'
    union all
    select 'b2a01_audited_functions', 'check',
           'replace_role_permission_grants ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'replace_role_permission_grants'), 'false'),
           '01b'
    union all
    select 'b2a01_audited_functions', 'check',
           'assign_member_role_audited ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'assign_member_role_audited'), 'false'),
           '01c'
    union all
    select 'b2a01_audited_functions', 'check',
           'replace_member_access_scope_audited ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'replace_member_access_scope_audited'), 'false'),
           '01d'
    union all
    select 'b2a01_audited_functions', 'check',
           'remove_member_access_audited ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'remove_member_access_audited'), 'false'),
           '01e'
    union all
    select 'b2a01_audited_functions', 'check',
           'assign_member_role_audited ~ bounded ~ calls_assert_assignment_delegation_ceiling ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%assert_assignment_delegation_ceiling%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'assign_member_role_audited'
                        order by p.oid limit 1), 'false'),
           '01f'
    union all
    select 'b2a01_audited_functions', 'check',
           'replace_member_access_scope_audited ~ args ~ department_and_site ~ '
           || coalesce((select (
                          pg_get_function_identity_arguments(p.oid) like '%p_department_scope%'
                          and pg_get_function_identity_arguments(p.oid) like '%p_department_ids%'
                          and pg_get_function_identity_arguments(p.oid) like '%p_site_scope%'
                          and pg_get_function_identity_arguments(p.oid) like '%p_site_location_ids%'
                        )::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'replace_member_access_scope_audited'
                        order by p.oid limit 1), 'false'),
           '01g'

    union all

    -- 2. SEED_DEFAULT_RBAC TRIGGER + SEEDED ROLE PACKAGE.
    select 'b2a02_seed_rbac', 'check',
           'orgs ~ trigger ~ orgs_seed_default_rbac ~ '
           || coalesce((select (count(*) = 1)::text
                        from pg_trigger t
                        where t.tgrelid = 'public.orgs'::regclass
                          and not t.tgisinternal
                          and t.tgname = 'orgs_seed_default_rbac'), 'false'),
           '02a'
    union all
    select 'b2a02_seed_rbac', 'check',
           'orgs_seed_default_rbac ~ calls_seed_default_rbac ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%seed_default_rbac(new.id)%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'orgs_seed_default_rbac'
                        order by p.oid limit 1), 'false'),
           '02b'
    union all
    select 'b2a02_seed_rbac', 'check',
           'seed_default_rbac ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'seed_default_rbac'), 'false'),
           '02c'
    union all
    select 'b2a02_seed_rbac', 'check',
           'seed_default_role_definitions ~ installed ~ '
           || coalesce((select (count(*) >= 1)::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'seed_default_role_definitions'), 'false'),
           '02d'
    union all
    select 'b2a02_seed_rbac', 'check',
           'seed_default_role_definitions ~ names_seeded_roles ~ '
           || coalesce((select (
                          src like '%admin%'
                          and src like '%ops%'
                          and src like '%regional_lead%'
                          and src like '%school_director%'
                        )::text
                        from (select pg_get_functiondef(p.oid) as src
                              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'seed_default_role_definitions'
                              order by p.oid limit 1) s), 'false'),
           '02e'
    union all
    select 'b2a02_seed_rbac', 'check',
           'seed_default_rbac ~ calls_seed_default_role_definitions ~ '
           || coalesce((select (pg_get_functiondef(p.oid) like '%seed_default_role_definitions%')::text
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'seed_default_rbac'
                        order by p.oid limit 1), 'false'),
           '02f'

    union all

    -- 3. FROZEN QA ORGS — PRESENCE ONLY (must remain absent until separately approved).
    select 'b2a03_qa_orgs', 'data',
           json_build_object(
               'qa_shared_id', '4acc9386-c485-486f-aa1f-05d83499d142',
               'qa_shared_present', (select exists(select 1 from public.orgs where id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)),
               'qa_shared_name', (select name from public.orgs where id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid),
               'qa_secondary_id', 'ad53fee2-2570-460f-9300-f0e106c473b6',
               'qa_secondary_present', (select exists(select 1 from public.orgs where id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)),
               'qa_secondary_name', (select name from public.orgs where id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid),
               'firefly_id', '93667019-bd28-49b5-a688-acc9bb1e0a19',
               'firefly_present', (select exists(select 1 from public.orgs where id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid)),
               'firefly_name', (select name from public.orgs where id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid)
           )::text,
           '03a'

    union all

    -- 4. PAYMENT-STRUCTURE READINESS (no secrets). Stripe customer columns exist;
    --    org_settings exists for payout metadata. Secret keys are out of band.
    select 'b2a04_payment_structure', 'check',
           'customers ~ column ~ stripe_customer_id ~ '
           || coalesce((select (count(*) = 1)::text
                        from information_schema.columns
                        where table_schema = 'public' and table_name = 'customers'
                          and column_name = 'stripe_customer_id'), 'false'),
           '04a'
    union all
    select 'b2a04_payment_structure', 'check',
           'customer_payment_methods ~ column ~ stripe_payment_method_id ~ '
           || coalesce((select (count(*) = 1)::text
                        from information_schema.columns
                        where table_schema = 'public' and table_name = 'customer_payment_methods'
                          and column_name = 'stripe_payment_method_id'), 'false'),
           '04b'
    union all
    select 'b2a04_payment_structure', 'check',
           'org_settings ~ table ~ present ~ '
           || coalesce((select (to_regclass('public.org_settings') is not null)::text), 'false'),
           '04c'
    union all
    select 'b2a04_payment_structure', 'data',
           json_build_object(
               'org_settings_rows', (select count(*) from public.org_settings),
               'note', 'Stripe/Resend secret material is deployment-env only; not readable here'
           )::text,
           '04d'
) q
order by sort_key;
