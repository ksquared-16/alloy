-- =============================================================================
-- Trust Runtime V1 — Slice 1 FULL-CHAIN certification
-- =============================================================================
-- These assertions are only meaningful against a database built by replaying
-- the complete repository migration chain. The isolated fixture suite
-- (00_fixture.sql + 01_slice1_invariants.sql) proves the Trust invariants in
-- a schema that contains nothing but Trust; this file proves the things that
-- can only go wrong when the Trust migration lands inside the real schema:
--
--   F1–F6   collision — no Trust object silently reused, replaced or skipped
--   F7–F10  schema shape — the four tables are exactly as specified
--   F11–F13 topology — FKs point where they should and nothing depends on Trust
--   F14–F16 RLS, policy inventory, and the EFFECTIVE posture of `authenticated`
--
-- Run with: certification/trust-runtime-v1/run-fullchain.sh
--
-- NOTE ON GRANTS. Assertion 21 of 01_slice1_invariants.sql ("authenticated
-- holds no write grant on Trust tables") PASSES against the isolated fixture
-- and FAILS against the full chain, because Supabase's schema-wide
-- ALTER DEFAULT PRIVILEGES grants ALL on every table in `public` to anon and
-- authenticated before any repository migration runs. That is a platform-wide
-- condition (253/253 public tables), not a Trust regression. F16 therefore
-- asserts what actually protects the data — that RLS refuses the write anyway,
-- for a real authenticated user who can see the row.
-- =============================================================================

\set ON_ERROR_STOP on

DO $fc$
DECLARE
    v_org uuid := '11111111-1111-1111-1111-111111111111';
    v_org_b uuid := '99999999-9999-9999-9999-999999999999';
    v_user uuid := '22222222-2222-2222-2222-222222222222';
    v_contract uuid;
    v_pkg uuid;
    v_count integer;
    v_txt text;
    v_passed integer := 0;
    c_tables text[] := ARRAY['trust_decision_contracts','trust_decision_packages',
                             'trust_decision_observations','trust_reasoning_usage'];
    c_functions text[] := ARRAY['enforce_trust_decision_contract_immutability',
                                'refuse_trust_decision_contract_delete',
                                'refuse_trust_decision_package_mutation',
                                'refuse_trust_decision_observation_mutation',
                                'refuse_trust_reasoning_usage_mutation',
                                'enforce_trust_observation_tenancy',
                                'enforce_trust_package_tenancy'];
    c_triggers text[] := ARRAY['trg_trust_decision_contract_immutability',
                               'trg_trust_decision_contract_no_delete',
                               'trg_trust_decision_package_immutable',
                               'trg_trust_decision_observation_append_only',
                               'trg_trust_reasoning_usage_append_only',
                               'trg_trust_observation_tenancy',
                               'trg_trust_package_tenancy'];
    c_indexes text[] := ARRAY['idx_tdc_org_class_created','idx_tdc_correlation',
                              'idx_tdp_org_class_created','idx_tdp_org_outcome','idx_tdp_lineage',
                              'idx_tdo_package','idx_tdo_org_kind','idx_tru_org_class_recorded'];
    c_policies text[] := ARRAY['trust_decision_contracts_select_org',
                               'trust_decision_packages_select_org',
                               'trust_decision_observations_select_org',
                               'trust_reasoning_usage_select_org'];
    v_name text;
BEGIN
    -- =========================================================================
    -- F1 — the Trust migration is recorded exactly once in the ledger
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM supabase_migrations.schema_migrations WHERE version = '20260802090000';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 1: Trust migration recorded % times, expected exactly 1', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F1  — the Trust migration is recorded exactly once in the migration ledger';

    -- =========================================================================
    -- F2 — no duplicate migration versions anywhere in the chain
    -- =========================================================================
    SELECT count(*) INTO v_count FROM (
        SELECT version FROM supabase_migrations.schema_migrations
        GROUP BY version HAVING count(*) > 1
    ) q;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 2: % duplicated migration version(s) in the ledger', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F2  — no migration version is recorded twice';

    -- =========================================================================
    -- F3 — each Trust table name is used exactly once in the whole database
    --      (CREATE TABLE IF NOT EXISTS silently skips a pre-existing table, so
    --       a name collision would produce a table with the WRONG shape)
    -- =========================================================================
    FOREACH v_name IN ARRAY c_tables LOOP
        SELECT count(*) INTO v_count
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_name AND c.relkind = 'r'
          AND n.nspname NOT IN ('pg_catalog','information_schema');
        IF v_count <> 1 THEN
            RAISE EXCEPTION 'FULLCHAIN FAIL 3: relation % exists % times, expected exactly 1', v_name, v_count;
        END IF;
    END LOOP;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F3  — each of the four Trust tables exists exactly once, in public, with no shadow copy';

    -- =========================================================================
    -- F4 — each Trust function name resolves to exactly one function
    --      (CREATE OR REPLACE would silently overwrite a pre-existing one)
    -- =========================================================================
    FOREACH v_name IN ARRAY c_functions LOOP
        SELECT count(*) INTO v_count FROM pg_proc WHERE proname = v_name;
        IF v_count <> 1 THEN
            RAISE EXCEPTION 'FULLCHAIN FAIL 4: function % exists % times — CREATE OR REPLACE may have replaced a non-Trust function', v_name, v_count;
        END IF;
    END LOOP;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F4  — each of the seven Trust functions is unique; none replaced an existing function';

    -- =========================================================================
    -- F5 — each Trust trigger exists exactly once AND is attached to a Trust
    --      table (DROP TRIGGER IF EXISTS would otherwise have dropped someone
    --      else's trigger of the same name)
    -- =========================================================================
    FOREACH v_name IN ARRAY c_triggers LOOP
        SELECT count(*) INTO v_count
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = v_name AND NOT t.tgisinternal;
        IF v_count <> 1 THEN
            RAISE EXCEPTION 'FULLCHAIN FAIL 5: trigger % exists % times, expected exactly 1', v_name, v_count;
        END IF;
        SELECT count(*) INTO v_count
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = v_name AND NOT t.tgisinternal AND c.relname = ANY(c_tables);
        IF v_count <> 1 THEN
            RAISE EXCEPTION 'FULLCHAIN FAIL 5: trigger % is attached to a NON-Trust table', v_name;
        END IF;
    END LOOP;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F5  — all seven Trust triggers are unique and attached only to Trust tables';

    -- =========================================================================
    -- F6 — each Trust index exists exactly once and sits on a Trust table
    -- =========================================================================
    FOREACH v_name IN ARRAY c_indexes LOOP
        SELECT count(*) INTO v_count
        FROM pg_indexes WHERE indexname = v_name AND tablename = ANY(c_tables);
        IF v_count <> 1 THEN
            RAISE EXCEPTION 'FULLCHAIN FAIL 6: index % on a Trust table exists % times, expected exactly 1', v_name, v_count;
        END IF;
    END LOOP;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F6  — all eight Trust indexes exist exactly once on Trust tables';

    -- =========================================================================
    -- F7–F10 — schema shape. Column counts and the exact column sets, so a
    --          silently-skipped CREATE TABLE cannot pass.
    -- =========================================================================
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trust_decision_contracts';
    IF v_count <> 19 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 7: trust_decision_contracts has % columns, expected 19', v_count; END IF;
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trust_decision_contracts'
      AND column_name IN ('id','org_id','decision_class_key','intent','context',
        'information_requirements','knowledge_requirements','privacy_policy_key',
        'validation_policy_key','economic_constraints','success_criteria','correlation_id',
        'initiating_actor_type','initiating_actor_id','channel','lifecycle_state',
        'runtime_version','registry_version','created_at');
    IF v_count <> 19 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 7: trust_decision_contracts column set does not match the specification'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F7  — trust_decision_contracts has exactly the 19 specified columns';

    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trust_decision_packages';
    IF v_count <> 27 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 8: trust_decision_packages has % columns, expected 27', v_count; END IF;
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trust_decision_packages'
      AND column_name IN ('id','org_id','contract_id','decision_class_key','outcome','recommendation',
        'explanation','evidence','remaining_uncertainty','confidence','trust_vector','trust_score',
        'trust_semantics_version','review_requirement','validation_results','privacy_report','economics',
        'knowledge_versions','learning_metadata','alternatives','supersedes_package_id','strategy_key',
        'strategy_version','validation_version','runtime_version','registry_version','created_at');
    IF v_count <> 27 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 8: trust_decision_packages column set does not match the specification'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F8  — trust_decision_packages has exactly the 27 specified columns (Decision 020: no lifecycle column)';

    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trust_decision_observations';
    IF v_count <> 10 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 9: trust_decision_observations has % columns, expected 10', v_count; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F9  — trust_decision_observations has exactly the 10 specified columns';

    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trust_reasoning_usage';
    IF v_count <> 12 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 10: trust_reasoning_usage has % columns, expected 12', v_count; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F10 — trust_reasoning_usage has exactly the 12 specified columns';

    -- =========================================================================
    -- F11 — every Trust table is tenanted by a real FK to public.orgs
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class rf ON rf.oid = con.confrelid
    WHERE con.contype = 'f' AND c.relname = ANY(c_tables) AND rf.relname = 'orgs';
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 11: % of 4 Trust tables carry an FK to public.orgs', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F11 — all four Trust tables are tenanted by a real foreign key to public.orgs';

    -- =========================================================================
    -- F12 — internal Trust topology: package→contract, observation→package,
    --       usage→contract
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class rf ON rf.oid = con.confrelid
    WHERE con.contype = 'f'
      AND ((c.relname='trust_decision_packages'     AND rf.relname='trust_decision_contracts')
        OR (c.relname='trust_decision_observations' AND rf.relname='trust_decision_packages')
        OR (c.relname='trust_reasoning_usage'       AND rf.relname='trust_decision_contracts'));
    IF v_count < 3 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 12: expected at least 3 internal Trust foreign keys, found %', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F12 — package→contract, observation→package and usage→contract foreign keys are present';

    -- =========================================================================
    -- F13 — the Trust migration is ADDITIVE: no table outside lib/trust's four
    --       depends on a Trust table. Nothing in the operational schema was
    --       made to point at Trust.
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class rf ON rf.oid = con.confrelid
    WHERE con.contype = 'f' AND rf.relname = ANY(c_tables) AND NOT (c.relname = ANY(c_tables));
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 13: % non-Trust table(s) hold a foreign key INTO a Trust table — Trust is no longer additive', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F13 — no operational table references a Trust table; the migration is purely additive';

    -- =========================================================================
    -- F14 — RLS enabled on all four, with exactly four policies, all SELECT
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname = ANY(c_tables) AND c.relrowsecurity;
    IF v_count <> 4 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 14: RLS enabled on only % of 4 Trust tables', v_count; END IF;

    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY(c_tables);
    IF v_count <> 4 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 14: % policies on Trust tables, expected exactly 4', v_count; END IF;

    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY(c_tables) AND cmd <> 'SELECT';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 14: % non-SELECT policy/policies on Trust tables — writes must never be reachable from a client role', v_count;
    END IF;

    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY(c_tables) AND policyname = ANY(c_policies);
    IF v_count <> 4 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 14: the four expected Trust policies are not the four that exist'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F14 — RLS on all four tables; exactly four policies exist and every one of them is SELECT-only';

    -- =========================================================================
    -- F15 — the inherited platform grant is recorded, not hidden.
    --       This assertion documents the condition; F16 proves it is not
    --       exploitable. It fails only if Trust is treated DIFFERENTLY from
    --       the rest of the schema, which would mean a Trust-specific grant.
    -- =========================================================================
    SELECT count(DISTINCT table_name) INTO v_count
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='authenticated' AND privilege_type='INSERT';
    SELECT count(*) INTO v_count
    FROM (SELECT table_name FROM information_schema.tables
          WHERE table_schema='public' AND table_type='BASE TABLE'
          EXCEPT
          SELECT table_name FROM information_schema.role_table_grants
          WHERE table_schema='public' AND grantee='authenticated' AND privilege_type='INSERT') q;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 15: % public table(s) lack the platform-wide authenticated INSERT grant — the grant on Trust tables is therefore Trust-specific, not inherited', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F15 — the authenticated write GRANT on Trust tables is the platform-wide Supabase default (0 of 253 public tables are exempt), not a Trust-specific grant';

    -- =========================================================================
    -- F16 — EFFECTIVE POSTURE. A real authenticated user, a member of the org,
    --       who can SELECT the package, still cannot write any Trust table.
    --       This is the assertion that actually protects the audit record.
    -- =========================================================================
    -- Use a REAL seeded operator and their REAL org, so the probe user is an
    -- ordinary member of a tenant rather than a synthetic identity.
    SELECT ur.user_id, ur.org_id INTO v_user, v_org
    FROM public.user_roles ur
    JOIN public.orgs o ON o.id = ur.org_id
    ORDER BY ur.created_at NULLS LAST
    LIMIT 1;
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 16: no seeded operator with an org membership — the posture probe would be vacuous';
    END IF;
    RAISE NOTICE '        F16 probe identity: user % in org %', v_user, v_org;

    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'attention_suggestion_enrichment', 'fullchain-posture', 'p', 'v',
            'fullchain-posture', 'system', 'system', 'rt-1', 'reg-1')
    RETURNING id INTO v_contract;

    INSERT INTO public.trust_decision_packages
        (org_id, contract_id, decision_class_key, outcome, recommendation, explanation,
         review_requirement, runtime_version, registry_version)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended', '{"a":1}'::jsonb,
            'original', 'operator_review', 'rt-1', 'reg-1')
    RETURNING id INTO v_pkg;

    INSERT INTO public.trust_decision_observations
        (org_id, package_id, observation_kind, observed_by_actor_type, channel)
    VALUES (v_org, v_pkg, 'presented', 'operator', 'operator');

    INSERT INTO public.trust_reasoning_usage (org_id, contract_id, decision_class_key, outcome)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended');

    -- Become that user.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- The user CAN read their own org's package — otherwise the write probes
    -- below would be vacuous.
    SELECT count(*) INTO v_count FROM public.trust_decision_packages WHERE id = v_pkg;
    IF v_count <> 1 THEN
        RESET ROLE;
        RAISE EXCEPTION 'FULLCHAIN FAIL 16: the probe user cannot see its own package — the write probes would be vacuous';
    END IF;

    -- INSERT: refused by RLS (no INSERT policy exists).
    BEGIN
        INSERT INTO public.trust_decision_contracts
            (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
             correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
        VALUES (v_org, 'attention_suggestion_enrichment', 'client-forged', 'p', 'v',
                'client-forged', 'system', 'system', 'rt-1', 'reg-1');
        RESET ROLE;
        RAISE EXCEPTION 'FULLCHAIN FAIL 16: an authenticated client INSERTED a Decision Contract';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL; -- refused by row-level security, as required
    END;

    -- UPDATE / DELETE: no UPDATE or DELETE policy exists, so no row is
    -- visible to mutate. Assert the stored bytes are unchanged rather than
    -- trusting the reported row count.
    UPDATE public.trust_decision_packages SET explanation = 'tampered' WHERE id = v_pkg;
    DELETE FROM public.trust_decision_packages WHERE id = v_pkg;
    UPDATE public.trust_decision_observations SET observation_kind = 'accepted' WHERE package_id = v_pkg;
    DELETE FROM public.trust_decision_observations WHERE package_id = v_pkg;
    UPDATE public.trust_reasoning_usage SET outcome = 'tampered' WHERE contract_id = v_contract;
    DELETE FROM public.trust_reasoning_usage WHERE contract_id = v_contract;
    UPDATE public.trust_decision_contracts SET intent = 'tampered' WHERE id = v_contract;
    DELETE FROM public.trust_decision_contracts WHERE id = v_contract;

    RESET ROLE;

    SELECT explanation INTO v_txt FROM public.trust_decision_packages WHERE id = v_pkg;
    IF v_txt IS DISTINCT FROM 'original' THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 16: a Decision Package was altered by an authenticated client (explanation is now %)', v_txt;
    END IF;
    SELECT count(*) INTO v_count FROM public.trust_decision_observations WHERE package_id = v_pkg AND observation_kind = 'presented';
    IF v_count <> 1 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 16: the observation record was altered or removed by an authenticated client'; END IF;
    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage WHERE contract_id = v_contract AND outcome = 'recommended';
    IF v_count <> 1 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 16: the usage record was altered or removed by an authenticated client'; END IF;
    SELECT intent INTO v_txt FROM public.trust_decision_contracts WHERE id = v_contract;
    IF v_txt IS DISTINCT FROM 'fullchain-posture' THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL 16: a Decision Contract was altered by an authenticated client';
    END IF;
    SELECT count(*) INTO v_count FROM public.trust_decision_contracts WHERE correlation_id = 'client-forged';
    IF v_count <> 0 THEN RAISE EXCEPTION 'FULLCHAIN FAIL 16: a forged contract row survived'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS F16 — despite the inherited GRANT, an authenticated org member who CAN read a package cannot insert, update or delete any Trust row: RLS refuses every write';

    RAISE NOTICE '=================================================';
    RAISE NOTICE 'TRUST RUNTIME V1 SLICE 1 — FULL CHAIN: % / 16 assertions passed', v_passed;
    RAISE NOTICE '=================================================';

    IF v_passed <> 16 THEN
        RAISE EXCEPTION 'FULLCHAIN FAIL: only % of 16 assertions passed', v_passed;
    END IF;
END
$fc$;
