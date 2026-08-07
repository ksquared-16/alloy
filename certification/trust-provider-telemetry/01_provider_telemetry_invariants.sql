-- =============================================================================
-- Trust Adoption Phase 2.5 — provider telemetry database certification
-- =============================================================================
-- Proves the new columns are ENFORCED BY THE DATABASE, and — just as important —
-- that adding them weakened nothing. Every assertion either attempts a forbidden
-- operation and requires Postgres to refuse it, or reads back a value that must
-- be NULL rather than zero.
--
-- The distinction under test throughout: ABSENT is not ZERO, and NULL is not
-- "unknown". A deterministic row asserts no provider; an adapter that ran but
-- could not prove locality asserts 'unknown'. Those are different claims and the
-- schema keeps them different.
--
-- Run with: certification/trust-provider-telemetry/run.sh
-- =============================================================================

\set ON_ERROR_STOP on

DO $cert$
DECLARE
    v_org uuid := '11111111-1111-1111-1111-111111111111';
    v_contract uuid;
    v_row uuid;
    v_count integer;
    v_text text;
    v_num numeric;
    v_passed integer := 0;
BEGIN
    RAISE NOTICE '--- seeding ---';

    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'attention_suggestion_enrichment', 'cert', 'p', 'v', 'corr-1', 'system', 'system', 'rt-1', 'reg-1')
    RETURNING id INTO v_contract;

    -- A-1 ─ a DETERMINISTIC row still inserts with every new column absent.
    -- Backwards compatibility, asserted rather than assumed: this is exactly the
    -- shape every row written before this migration had.
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, strategy_key, strategy_kind, outcome)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'det_v1', 'deterministic', 'recommended')
    RETURNING id INTO v_row;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-1 PASS deterministic row inserts with no provider columns';

    -- A-2 ─ and every provider column on it is NULL, not zero and not ''.
    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage
     WHERE id = v_row
       AND provider_key IS NULL AND model_key IS NULL AND model_version IS NULL
       AND execution_location IS NULL
       AND input_units IS NULL AND output_units IS NULL
       AND provider_reported_cost_units IS NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'A-2 FAIL deterministic row has non-null provider telemetry'; END IF;
    -- The strategy-measured cost keeps its old NOT NULL DEFAULT 0 semantics.
    SELECT provider_cost_units INTO v_num FROM public.trust_reasoning_usage WHERE id = v_row;
    IF v_num <> 0 THEN RAISE EXCEPTION 'A-2 FAIL measured cost default changed'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-2 PASS absent provider telemetry is NULL, measured cost still defaults to 0';

    -- A-3 ─ a REMOTE provider execution persists all four identity dimensions
    -- independently.
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, strategy_key, strategy_kind, outcome,
         provider_key, model_key, model_version, execution_location,
         input_units, output_units, provider_reported_cost_units)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'prov_v1', 'large_reasoning', 'recommended',
            'openai_compatible', 'gpt-x', '2026-08', 'remote', 120, 34, 0.0042)
    RETURNING id INTO v_row;
    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage
     WHERE id = v_row AND provider_key = 'openai_compatible' AND model_key = 'gpt-x'
       AND model_version = '2026-08' AND execution_location = 'remote'
       AND input_units = 120 AND output_units = 34 AND provider_reported_cost_units = 0.0042;
    IF v_count <> 1 THEN RAISE EXCEPTION 'A-3 FAIL provider identity did not round-trip'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-3 PASS remote provider identity + usage round-trips';

    -- A-4 ─ a LOCAL model is representable, and reasoning kind stays in
    -- `strategy_kind`. Model reasoning executed locally is a legal, distinct row
    -- from deterministic reasoning — the thing OI could not previously express.
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, strategy_key, strategy_kind, outcome,
         provider_key, model_key, execution_location)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'local_v1', 'small_reasoning', 'recommended',
            'ollama_local', 'llama-x', 'local')
    RETURNING id INTO v_row;
    SELECT strategy_kind INTO v_text FROM public.trust_reasoning_usage WHERE id = v_row;
    IF v_text <> 'small_reasoning' THEN RAISE EXCEPTION 'A-4 FAIL reasoning kind lost'; END IF;
    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage
     WHERE id = v_row AND execution_location = 'local'
       AND model_version IS NULL AND input_units IS NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'A-4 FAIL local model row not represented truthfully'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-4 PASS local model = model reasoning + local execution, unreported fields NULL';

    -- A-5 ─ `unknown` locality is a first-class value, distinct from NULL.
    INSERT INTO public.trust_reasoning_usage
        (org_id, contract_id, decision_class_key, outcome, provider_key, execution_location)
    VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended', 'some_provider', 'unknown')
    RETURNING id INTO v_row;
    SELECT execution_location INTO v_text FROM public.trust_reasoning_usage WHERE id = v_row;
    IF v_text IS DISTINCT FROM 'unknown' THEN RAISE EXCEPTION 'A-5 FAIL unknown locality not retained'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-5 PASS "unknown" locality is stored, not collapsed to NULL';

    -- A-6 ─ an invented locality is REFUSED. The CHECK is the authority, not the
    -- service layer.
    BEGIN
        INSERT INTO public.trust_reasoning_usage
            (org_id, contract_id, decision_class_key, outcome, execution_location)
        VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended', 'the_moon');
        RAISE EXCEPTION 'A-6 FAIL an invalid execution_location was accepted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'A-6 PASS invalid execution_location refused by CHECK';
    END;

    -- A-7 ─ negative usage is REFUSED on each column.
    BEGIN
        INSERT INTO public.trust_reasoning_usage
            (org_id, contract_id, decision_class_key, outcome, input_units)
        VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended', -1);
        RAISE EXCEPTION 'A-7 FAIL negative input_units accepted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'A-7 PASS negative input_units refused';
    END;

    BEGIN
        INSERT INTO public.trust_reasoning_usage
            (org_id, contract_id, decision_class_key, outcome, provider_reported_cost_units)
        VALUES (v_org, v_contract, 'attention_suggestion_enrichment', 'recommended', -0.01);
        RAISE EXCEPTION 'A-8 FAIL negative provider_reported_cost_units accepted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'A-8 PASS negative provider_reported_cost_units refused';
    END;

    -- A-9 ─ APPEND-ONLY still holds. The most important assertion here: adding
    -- columns must not have created a way to edit history.
    BEGIN
        UPDATE public.trust_reasoning_usage SET provider_key = 'rewritten' WHERE id = v_row;
        RAISE EXCEPTION 'A-9 FAIL a usage row was updated';
    EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%A-9 FAIL%' THEN RAISE; END IF;
        v_passed := v_passed + 1;
        RAISE NOTICE 'A-9 PASS provider_key cannot be updated — append-only intact';
    END;

    BEGIN
        DELETE FROM public.trust_reasoning_usage WHERE id = v_row;
        RAISE EXCEPTION 'A-10 FAIL a usage row was deleted';
    EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%A-10 FAIL%' THEN RAISE; END IF;
        v_passed := v_passed + 1;
        RAISE NOTICE 'A-10 PASS usage rows cannot be deleted — append-only intact';
    END;

    -- A-11 ─ contract linkage and org scoping survive.
    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage u
      JOIN public.trust_decision_contracts c ON c.id = u.contract_id
     WHERE u.org_id = v_org AND c.org_id = v_org;
    -- Exactly four rows were successfully inserted: A-1, A-3, A-4, A-5. The
    -- refused inserts (A-6..A-8) left nothing behind, and A-9/A-10 proved the
    -- rows cannot be edited or removed. An exact count therefore also proves no
    -- forbidden write silently succeeded.
    IF v_count <> 4 THEN RAISE EXCEPTION 'A-11 FAIL expected 4 linked rows, found %', v_count; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-11 PASS every row still joins its contract within one org';

    -- A-12 ─ RLS is still enabled on the table.
    SELECT count(*) INTO v_count FROM pg_class
     WHERE relname = 'trust_reasoning_usage' AND relrowsecurity;
    IF v_count <> 1 THEN RAISE EXCEPTION 'A-12 FAIL RLS is not enabled'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-12 PASS row level security still enabled';

    -- A-13 ─ the pre-existing index survives and the new partial index exists.
    SELECT count(*) INTO v_count FROM pg_indexes
     WHERE tablename = 'trust_reasoning_usage' AND indexname = 'idx_tru_org_class_recorded';
    IF v_count <> 1 THEN RAISE EXCEPTION 'A-13 FAIL the original index was dropped'; END IF;
    SELECT count(*) INTO v_count FROM pg_indexes
     WHERE tablename = 'trust_reasoning_usage' AND indexname = 'idx_tru_org_provider_recorded';
    IF v_count <> 1 THEN RAISE EXCEPTION 'A-13 FAIL the provider index is missing'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-13 PASS original index intact, provider index added';

    -- A-14 ─ no historical row was backfilled with a guessed value (D-22). The
    -- deterministic row seeded in A-1 must still assert nothing.
    SELECT count(*) INTO v_count FROM public.trust_reasoning_usage
     WHERE strategy_kind = 'deterministic' AND provider_key IS NOT NULL;
    IF v_count <> 0 THEN RAISE EXCEPTION 'A-14 FAIL a deterministic row carries a provider'; END IF;
    v_passed := v_passed + 1;
    RAISE NOTICE 'A-14 PASS no deterministic row was given a provider identity';

    RAISE NOTICE '--- % assertions passed ---', v_passed;
    IF v_passed <> 14 THEN RAISE EXCEPTION 'expected 14 assertions, got %', v_passed; END IF;
END
$cert$;
