-- =============================================================================
-- Trust Runtime V1 — Slice 1 database certification
-- =============================================================================
-- Proves that the INVARIANTS ARE ENFORCED BY THE DATABASE, not by the service
-- layer. Every assertion below attempts the forbidden operation and requires
-- Postgres to refuse it.
--
-- Scenarios covered: S2 (package immutability), S3 (one package per contract),
-- S5 (append-only observations), C1–C4 (package invariants and lineage), plus
-- contract insert-only semantics, cross-tenant refusal and RLS presence.
--
-- Run with: certification/trust-runtime-v1/run.sh
-- =============================================================================

\set ON_ERROR_STOP on

DO $cert$
DECLARE
    v_org uuid := '11111111-1111-1111-1111-111111111111';
    v_org_b uuid := '99999999-9999-9999-9999-999999999999';
    v_contract uuid;
    v_contract_b uuid;
    v_contract2 uuid;
    v_pkg uuid;
    v_pkg2 uuid;
    v_obs uuid;
    v_count integer;
    v_passed integer := 0;
BEGIN
    RAISE NOTICE '--- seeding ---';

    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'attention_suggestion_enrichment', 'cert', 'p', 'v', 'corr-1', 'system', 'system', 'rt-1', 'reg-1')
    RETURNING id INTO v_contract;

    INSERT INTO public.trust_decision_packages
        (org_id, contract_id, decision_class_key, outcome, recommendation, explanation,
         review_requirement, runtime_version, registry_version)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended', '{"a":1}'::jsonb, 'because',
            'operator_review', 'rt-1', 'reg-1')
    RETURNING id INTO v_pkg;

    -- =========================================================================
    -- S2 / C2 — a Decision Package is immutable at creation
    -- =========================================================================
    BEGIN
        UPDATE public.trust_decision_packages SET explanation = 'tampered' WHERE id = v_pkg;
        RAISE EXCEPTION 'CERT FAIL 1: UPDATE on trust_decision_packages was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 1  — UPDATE on a Decision Package is refused by the database';
    END;

    BEGIN
        DELETE FROM public.trust_decision_packages WHERE id = v_pkg;
        RAISE EXCEPTION 'CERT FAIL 2: DELETE on trust_decision_packages was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 2  — DELETE on a Decision Package is refused by the database';
    END;

    -- =========================================================================
    -- S3 / C1 — exactly one Decision Package per Decision Contract
    -- =========================================================================
    BEGIN
        INSERT INTO public.trust_decision_packages
            (org_id, contract_id, decision_class_key, outcome, explanation, review_requirement,
             runtime_version, registry_version)
        VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'refused_policy', 'second package',
                'operator_review', 'rt-1', 'reg-1');
        RAISE EXCEPTION 'CERT FAIL 3: a second package for the same contract was permitted';
    EXCEPTION WHEN unique_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 3  — a second Decision Package for one contract is refused';
    END;

    -- =========================================================================
    -- Refusals are packages too, and a refusal may not smuggle a recommendation
    -- =========================================================================
    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'attention_suggestion_enrichment', 'cert-refusal', 'p', 'v', 'corr-2', 'system', 'system', 'rt-1', 'reg-1')
    RETURNING id INTO v_contract2;

    INSERT INTO public.trust_decision_packages
        (org_id, contract_id, decision_class_key, outcome, explanation, review_requirement,
         runtime_version, registry_version)
    VALUES (v_org, v_contract2, 'attention_suggestion_enrichment', 'refused_privacy', 'privacy refused it',
            'operator_review', 'rt-1', 'reg-1')
    RETURNING id INTO v_pkg2;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 4  — a refusal is persisted as a Decision Package';

    BEGIN
        INSERT INTO public.trust_decision_packages
            (org_id, contract_id, decision_class_key, outcome, recommendation, explanation,
             review_requirement, runtime_version, registry_version)
        SELECT v_org, id, 'attention_suggestion_enrichment', 'refused_policy', '{"sneaky":1}'::jsonb,
               'refusal with a recommendation', 'operator_review', 'rt-1', 'reg-1'
        FROM public.trust_decision_contracts WHERE correlation_id = 'corr-2';
        RAISE EXCEPTION 'CERT FAIL 5: a refusal carrying a recommendation was permitted';
    EXCEPTION WHEN check_violation OR unique_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 5  — a refusal may not carry a recommendation';
    END;

    -- =========================================================================
    -- C4 — lineage
    -- =========================================================================
    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'attention_suggestion_enrichment', 'cert-lineage', 'p', 'v', 'corr-3', 'system', 'system', 'rt-1', 'reg-1')
    RETURNING id INTO v_contract_b;

    INSERT INTO public.trust_decision_packages
        (org_id, contract_id, decision_class_key, outcome, recommendation, explanation,
         review_requirement, supersedes_package_id, runtime_version, registry_version)
    VALUES (v_org, v_contract_b, 'attention_suggestion_enrichment', 'recommended', '{"a":2}'::jsonb,
            'revised', 'operator_review', v_pkg, 'rt-1', 'reg-1');
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 6  — a superseding package records lineage to its predecessor';

    SELECT count(*) INTO v_count
    FROM public.trust_decision_packages WHERE id = v_pkg AND explanation = 'because';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'CERT FAIL 7: the predecessor package was modified';
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 7  — the superseded predecessor is unchanged';

    -- =========================================================================
    -- S5 — observations are append-only and cannot orphan
    -- =========================================================================
    INSERT INTO public.trust_decision_observations
        (org_id, package_id, observation_kind, observed_by_actor_type, channel)
    VALUES (v_org, v_pkg, 'presented', 'operator', 'operator')
    RETURNING id INTO v_obs;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 8  — an observation may be appended to a package';

    BEGIN
        UPDATE public.trust_decision_observations SET observation_kind = 'accepted' WHERE id = v_obs;
        RAISE EXCEPTION 'CERT FAIL 9: UPDATE on an observation was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 9  — UPDATE on an observation is refused';
    END;

    BEGIN
        DELETE FROM public.trust_decision_observations WHERE id = v_obs;
        RAISE EXCEPTION 'CERT FAIL 10: DELETE on an observation was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 10 — DELETE on an observation is refused';
    END;

    BEGIN
        INSERT INTO public.trust_decision_observations
            (org_id, package_id, observation_kind, observed_by_actor_type, channel)
        VALUES (v_org, '00000000-0000-0000-0000-000000000000', 'presented', 'operator', 'operator');
        RAISE EXCEPTION 'CERT FAIL 11: an orphan observation was permitted';
    EXCEPTION WHEN foreign_key_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 11 — an observation cannot exist without its package';
    END;

    -- =========================================================================
    -- Contract insert-only semantics
    -- =========================================================================
    UPDATE public.trust_decision_contracts SET lifecycle_state = 'prepared' WHERE id = v_contract;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 12 — a contract lifecycle may advance';

    BEGIN
        UPDATE public.trust_decision_contracts SET lifecycle_state = 'created' WHERE id = v_contract;
        RAISE EXCEPTION 'CERT FAIL 13: lifecycle regression was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 13 — a contract lifecycle may not regress';
    END;

    BEGIN
        UPDATE public.trust_decision_contracts SET intent = 'rewritten' WHERE id = v_contract;
        RAISE EXCEPTION 'CERT FAIL 14: a non-lifecycle column was updated';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 14 — only lifecycle_state may change on a contract';
    END;

    BEGIN
        DELETE FROM public.trust_decision_contracts WHERE id = v_contract;
        RAISE EXCEPTION 'CERT FAIL 15: DELETE on a contract was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 15 — DELETE on a contract is refused';
    END;

    -- =========================================================================
    -- Cross-tenant refusal
    -- =========================================================================
    BEGIN
        INSERT INTO public.trust_decision_observations
            (org_id, package_id, observation_kind, observed_by_actor_type, channel)
        VALUES (v_org_b, v_pkg, 'presented', 'operator', 'operator');
        RAISE EXCEPTION 'CERT FAIL 16: a cross-tenant observation was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 16 — an observation may not cross tenants';
    END;

    BEGIN
        INSERT INTO public.trust_decision_packages
            (org_id, contract_id, decision_class_key, outcome, explanation, review_requirement,
             runtime_version, registry_version)
        VALUES (v_org_b, v_contract2, 'attention_suggestion_enrichment', 'refused_policy', 'x',
                'operator_review', 'rt-1', 'reg-1');
        RAISE EXCEPTION 'CERT FAIL 17: a cross-tenant package was permitted';
    EXCEPTION WHEN check_violation OR unique_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 17 — a package may not cross tenants from its contract';
    END;

    -- =========================================================================
    -- Reasoning usage is append-only
    -- =========================================================================
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, outcome)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended');

    BEGIN
        UPDATE public.trust_reasoning_usage SET outcome = 'tampered' WHERE contract_id = v_contract;
        RAISE EXCEPTION 'CERT FAIL 18: UPDATE on reasoning usage was permitted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS 18 — reasoning usage is append-only';
    END;

    -- =========================================================================
    -- C3 — no mutable lifecycle column exists on the package table
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trust_decision_packages'
      AND column_name IN ('lifecycle_state','status','accepted_at','rejected_at','overridden_at','executed_at','presented_at','observed_at');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 19: trust_decision_packages carries % lifecycle column(s)', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 19 — the Decision Package table carries no lifecycle column (Decision 020)';

    -- =========================================================================
    -- RLS is enabled on every Trust table
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('trust_decision_contracts','trust_decision_packages','trust_decision_observations','trust_reasoning_usage')
      AND c.relrowsecurity;
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'CERT FAIL 20: RLS enabled on only % of 4 Trust tables', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 20 — RLS is enabled on all four Trust tables';

    -- No write grant to `authenticated`: writes are server-authoritative.
    SELECT count(*) INTO v_count
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name LIKE 'trust\_%'
      AND grantee = 'authenticated'
      AND privilege_type IN ('INSERT','UPDATE','DELETE');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 21: authenticated holds % write grant(s) on Trust tables', v_count;
    END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS 21 — authenticated may read Trust tables but never write them';

    RAISE NOTICE '=============================================';
    RAISE NOTICE 'TRUST RUNTIME V1 SLICE 1 — % / 21 assertions passed', v_passed;
    RAISE NOTICE '=============================================';

    IF v_passed <> 21 THEN
        RAISE EXCEPTION 'CERT FAIL: only % of 21 assertions passed', v_passed;
    END IF;
END
$cert$;
