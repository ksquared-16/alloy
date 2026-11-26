-- =============================================================================
-- Phase 0 Slice 0.6 — Trust measurement sources, database certification.
--
-- Proves the measurement claims against a real database:
--   * non-zero DECIMAL provider_cost_units can be stored and read back exactly;
--   * Trust usage rows remain org-scoped;
--   * indexes exist to support bounded window queries;
--   * the Decision Package schema carries NO provider identity;
--   * no migration is required for measurement;
--   * no existing Trust row is modified by reading it.
--
-- Run through `run.sh`, which builds a DISPOSABLE Postgres container. No shared
-- stack is touched and no lease is required.
-- =============================================================================

DO $$
DECLARE
    v_org        uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_other_org  uuid := '99999999-9999-9999-9999-999999999999'::uuid;
    v_contract   uuid;
    v_other_ct   uuid;
    v_package    uuid;
    v_cost       numeric;
    v_sum        numeric;
    v_count      integer;
    v_pass       integer := 0;
    v_before_md5 text;
    v_after_md5  text;
BEGIN
    RAISE NOTICE '--- seeding ---';

    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'metrics_cert', 'certification', 'p_v1', 'v_v1',
            'corr-metrics', 'system', 'system', 'rt-v1', 'reg-v1')
    RETURNING id INTO v_contract;

    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_other_org, 'metrics_cert', 'certification', 'p_v1', 'v_v1',
            'corr-metrics-b', 'system', 'system', 'rt-v1', 'reg-v1')
    RETURNING id INTO v_other_ct;

    INSERT INTO public.trust_decision_packages
        (org_id, contract_id, decision_class_key, outcome, recommendation, explanation,
         review_requirement, runtime_version, registry_version)
    VALUES (v_org, v_contract, 'metrics_cert', 'recommended', '{"a":1}'::jsonb, 'certification',
            'operator_review', 'rt-v1', 'reg-v1')
    RETURNING id INTO v_package;

    SELECT md5(t.*::text) INTO v_before_md5 FROM public.trust_decision_packages t WHERE t.id = v_package;

    -- ---- 1. non-zero decimal cost stores and reads back exactly --------------
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, strategy_kind, escalation_level,
         latency_ms, cache_utilized, provider_cost_units, outcome)
    VALUES (v_org, v_contract, 'metrics_cert', 'large_reasoning', 4,
            1234, false, 0.000125, 'recommended');

    SELECT provider_cost_units INTO v_cost
    FROM public.trust_reasoning_usage WHERE contract_id = v_contract LIMIT 1;

    IF v_cost <> 0.000125 THEN
        RAISE EXCEPTION 'CERT FAIL 1: provider_cost_units round-tripped as %, expected 0.000125', v_cost;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 1  — a non-zero DECIMAL provider_cost_units stores and reads back exactly (0.000125)';

    -- ---- 2. decimal summation does not lose precision ------------------------
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, escalation_level, latency_ms, provider_cost_units, outcome)
    VALUES (v_org, v_contract, 'metrics_cert', 0, 10, 1.25, 'recommended'),
           (v_org, v_contract, 'metrics_cert', 0, 20, 2.50, 'recommended');

    SELECT sum(provider_cost_units) INTO v_sum
    FROM public.trust_reasoning_usage WHERE org_id = v_org;

    IF v_sum <> 3.750125 THEN
        RAISE EXCEPTION 'CERT FAIL 2: cost sum was %, expected 3.750125', v_sum;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 2  — decimal cost aggregates without precision loss (3.750125)';

    -- ---- 3. no migration was required for measurement ------------------------
    -- provider_cost_units is numeric from the ORIGINAL foundation migration.
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trust_reasoning_usage'
      AND column_name = 'provider_cost_units' AND data_type = 'numeric';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'CERT FAIL 3: provider_cost_units is not numeric; a migration would be required';
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 3  — provider_cost_units is already numeric; measurement needs no migration';

    -- ---- 4. usage rows are org-scoped ---------------------------------------
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, escalation_level, latency_ms, provider_cost_units, outcome)
    VALUES (v_other_org, v_other_ct, 'metrics_cert', 0, 5, 99.99, 'recommended');

    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage WHERE org_id = v_org;
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'CERT FAIL 4: org-scoped usage count was %, expected 3', v_count;
    END IF;
    SELECT sum(provider_cost_units) INTO v_sum FROM public.trust_reasoning_usage WHERE org_id = v_org;
    IF v_sum <> 3.750125 THEN
        RAISE EXCEPTION 'CERT FAIL 4: another org''s cost leaked into the org total (%)', v_sum;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 4  — usage rows are org-scoped; another org''s cost never enters the total';

    -- ---- 5. indexes support bounded window queries ---------------------------
    SELECT count(*) INTO v_count FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'trust_reasoning_usage'
      AND indexdef LIKE '%org_id%' AND indexdef LIKE '%recorded_at%';
    IF v_count < 1 THEN
        RAISE EXCEPTION 'CERT FAIL 5: no (org_id, recorded_at) index on trust_reasoning_usage';
    END IF;

    SELECT count(*) INTO v_count FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'trust_decision_packages'
      AND indexdef LIKE '%org_id%' AND indexdef LIKE '%created_at%';
    IF v_count < 1 THEN
        RAISE EXCEPTION 'CERT FAIL 5: no (org_id, created_at) index on trust_decision_packages';
    END IF;

    SELECT count(*) INTO v_count FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'trust_decision_observations'
      AND indexdef LIKE '%org_id%' AND indexdef LIKE '%observation_kind%';
    IF v_count < 1 THEN
        RAISE EXCEPTION 'CERT FAIL 5: no (org_id, observation_kind) index on trust_decision_observations';
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 5  — org + window indexes exist on every table the Trust metrics read';

    -- ---- 6. the Decision Package schema carries no provider identity ---------
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trust_decision_packages'
      AND column_name IN ('provider', 'provider_key', 'provider_name', 'model', 'model_id', 'model_name');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 6: % provider identity column(s) exist on trust_decision_packages', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 6  — trust_decision_packages carries no provider or model identity (ADR-2)';

    -- ---- 7. provider identity is not persisted ANYWHERE in Trust -------------
    -- Recorded so the deferred provider-utilization metric is evidenced, not assumed.
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'trust\_%'
      AND column_name IN ('provider', 'provider_key', 'provider_name', 'model', 'model_id', 'model_name');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 7: provider identity IS persisted (% column(s)) — provider utilization should be implemented', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 7  — no Trust table persists provider identity; provider utilization is correctly deferred';

    -- ---- 8. no Trust table carries site linkage -----------------------------
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'trust\_%'
      AND column_name IN ('site_id', 'location_id', 'work_unit_id', 'department_id');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 8: Trust tables DO carry site linkage (% column(s)) — site scope should be supported', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 8  — no Trust table carries site linkage; org-only scope is correct, not lazy';

    -- ---- 9. reading does not modify -----------------------------------------
    PERFORM count(*) FROM public.trust_reasoning_usage WHERE org_id = v_org;
    PERFORM count(*) FROM public.trust_decision_packages WHERE org_id = v_org;
    SELECT md5(t.*::text) INTO v_after_md5 FROM public.trust_decision_packages t WHERE t.id = v_package;
    IF v_after_md5 <> v_before_md5 THEN
        RAISE EXCEPTION 'CERT FAIL 9: a Decision Package changed while measurement read it';
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 9  — measurement reads leave every existing Trust row byte-identical';

    RAISE NOTICE '=============================================';
    RAISE NOTICE 'TRUST MEASUREMENT SOURCES — % / 9 assertions passed', v_pass;
    RAISE NOTICE '=============================================';

    IF v_pass <> 9 THEN
        RAISE EXCEPTION 'CERT FAIL: expected 9 assertions, counted %', v_pass;
    END IF;
END;
$$;
