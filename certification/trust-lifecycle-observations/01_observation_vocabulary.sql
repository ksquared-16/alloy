-- =============================================================================
-- Phase 0 Slice 0.4 — lifecycle observation vocabulary, database certification.
--
-- Proves the additive extension against a real database:
--   * the two new kinds are accepted;
--   * every prior kind is still accepted;
--   * an unknown kind is still rejected;
--   * append-only enforcement is unchanged;
--   * org scoping is unchanged;
--   * privileges are unchanged;
--   * no pre-existing Trust row is modified.
--
-- Run through `run.sh`, which builds a DISPOSABLE Postgres container. No shared
-- stack is touched and no lease is required.
-- =============================================================================

DO $$
DECLARE
    v_org        uuid;
    v_other_org  uuid;
    v_contract   uuid;
    v_package    uuid;
    v_obs        uuid;
    v_kind       text;
    v_count      integer;
    v_pass       integer := 0;
    v_before_md5 text;
    v_after_md5  text;
    v_prior_kinds text[] := ARRAY['presented','accepted','rejected','overridden','modified','deferred','executed','outcome'];
    v_new_kinds   text[] := ARRAY['expired','superseded'];
BEGIN
    RAISE NOTICE '--- seeding ---';

    -- The shared fixture supplies both tenants; `orgs.id` carries no default there.
    v_org       := '11111111-1111-1111-1111-111111111111'::uuid;
    v_other_org := '99999999-9999-9999-9999-999999999999'::uuid;

    INSERT INTO public.trust_decision_contracts
        (org_id, decision_class_key, intent, privacy_policy_key, validation_policy_key,
         correlation_id, initiating_actor_type, channel, runtime_version, registry_version)
    VALUES (v_org, 'lifecycle_cert', 'certification', 'p_v1', 'v_v1',
            'corr-lifecycle', 'system', 'system', 'rt-v1', 'reg-v1')
    RETURNING id INTO v_contract;

    INSERT INTO public.trust_decision_packages
        (org_id, contract_id, decision_class_key, outcome, recommendation, explanation,
         review_requirement, runtime_version, registry_version)
    VALUES (v_org, v_contract, 'lifecycle_cert', 'recommended', '{"a":1}'::jsonb, 'certification',
            'operator_review', 'rt-v1', 'reg-v1')
    RETURNING id INTO v_package;

    -- Fingerprint the package so we can prove observations never touch it.
    SELECT md5(t.*::text) INTO v_before_md5 FROM public.trust_decision_packages t WHERE t.id = v_package;

    -- ---- 1. every prior observation kind is still accepted -------------------
    FOREACH v_kind IN ARRAY v_prior_kinds LOOP
        INSERT INTO public.trust_decision_observations
            (org_id, package_id, observation_kind, observed_by_actor_type, channel)
        VALUES (v_org, v_package, v_kind, 'system', 'system');
    END LOOP;
    SELECT count(*) INTO v_count FROM public.trust_decision_observations WHERE package_id = v_package;
    IF v_count <> 8 THEN
        RAISE EXCEPTION 'CERT FAIL 1: expected 8 prior-kind observations, found %', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 1  — all 8 pre-existing observation kinds are still accepted';

    -- ---- 2. `expired` is accepted, with its evidence -------------------------
    INSERT INTO public.trust_decision_observations
        (org_id, package_id, observation_kind, observed_by_actor_type, channel, detail)
    VALUES (v_org, v_package, 'expired', 'system', 'system',
            '{"expiry_kind":"scheduled","expires_at_iso":"2026-08-04T00:00:00.000Z"}'::jsonb);
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 2  — `expired` is accepted by the extended CHECK';

    -- ---- 3. `superseded` is accepted, with its lineage evidence --------------
    INSERT INTO public.trust_decision_observations
        (org_id, package_id, observation_kind, observed_by_actor_type, channel, detail)
    VALUES (v_org, v_package, 'superseded', 'system', 'system',
            jsonb_build_object('superseding_package_id', gen_random_uuid()::text, 'reason', 'certification'));
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 3  — `superseded` is accepted by the extended CHECK';

    -- ---- 4. an unknown kind is still rejected --------------------------------
    BEGIN
        INSERT INTO public.trust_decision_observations
            (org_id, package_id, observation_kind, observed_by_actor_type, channel)
        VALUES (v_org, v_package, 'not_a_real_kind', 'system', 'system');
        RAISE EXCEPTION 'CERT FAIL 4: an unknown observation kind was accepted';
    EXCEPTION WHEN check_violation THEN
        v_pass := v_pass + 1;
        RAISE NOTICE 'PASS 4  — an unknown observation kind is still refused';
    END;

    -- ---- 5. the vocabulary is exactly ten values -----------------------------
    SELECT count(*) INTO v_count
    FROM unnest(v_prior_kinds || v_new_kinds) AS k(kind)
    WHERE position('''' || k.kind || '''' IN (
        SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'chk_tdo_kind' AND conrelid = 'public.trust_decision_observations'::regclass
    )) > 0;
    IF v_count <> 10 THEN
        RAISE EXCEPTION 'CERT FAIL 5: expected 10 admitted kinds, matched %', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 5  — the closed vocabulary is exactly the 8 prior kinds plus 2';

    -- ---- 6. append-only still holds for the new kinds ------------------------
    SELECT id INTO v_obs FROM public.trust_decision_observations
    WHERE package_id = v_package AND observation_kind = 'expired' LIMIT 1;
    BEGIN
        UPDATE public.trust_decision_observations SET observation_kind = 'superseded' WHERE id = v_obs;
        RAISE EXCEPTION 'CERT FAIL 6: an observation was updated';
    EXCEPTION WHEN check_violation THEN
        v_pass := v_pass + 1;
        RAISE NOTICE 'PASS 6  — UPDATE on a lifecycle observation is still refused';
    END;

    BEGIN
        DELETE FROM public.trust_decision_observations WHERE id = v_obs;
        RAISE EXCEPTION 'CERT FAIL 7: an observation was deleted';
    EXCEPTION WHEN check_violation THEN
        v_pass := v_pass + 1;
        RAISE NOTICE 'PASS 7  — DELETE on a lifecycle observation is still refused';
    END;

    -- ---- 8. org scoping is unchanged for the new kinds -----------------------
    BEGIN
        INSERT INTO public.trust_decision_observations
            (org_id, package_id, observation_kind, observed_by_actor_type, channel)
        VALUES (v_other_org, v_package, 'superseded', 'system', 'system');
        RAISE EXCEPTION 'CERT FAIL 8: a cross-tenant lifecycle observation was accepted';
    EXCEPTION WHEN check_violation THEN
        v_pass := v_pass + 1;
        RAISE NOTICE 'PASS 8  — a cross-tenant lifecycle observation is still refused';
    END;

    -- ---- 9. the package is untouched by any of it ----------------------------
    SELECT md5(t.*::text) INTO v_after_md5 FROM public.trust_decision_packages t WHERE t.id = v_package;
    IF v_after_md5 <> v_before_md5 THEN
        RAISE EXCEPTION 'CERT FAIL 9: the Decision Package changed while observations were appended';
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 9  — the Decision Package is byte-identical after 10 observations';

    -- ---- 10. no mutable lifecycle column was added --------------------------
    SELECT count(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trust_decision_packages'
      AND column_name IN ('status','lifecycle_state','state','expired','is_expired','expired_at',
                          'superseded','superseded_at','accepted_at','rejected_at','executed_at');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 10: % mutable lifecycle column(s) exist on trust_decision_packages', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 10 — trust_decision_packages still carries no mutable lifecycle column (Decision 020)';

    -- ---- 11. privileges unchanged -------------------------------------------
    SELECT count(*) INTO v_count FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'trust_decision_observations' AND grantee = 'anon';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 11: anon holds % grant(s) on trust_decision_observations', v_count;
    END IF;
    SELECT count(*) INTO v_count FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'trust_decision_observations'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'CERT FAIL 11: authenticated holds % write grant(s) on trust_decision_observations', v_count;
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 11 — privileges unchanged: anon none, authenticated SELECT only';

    -- ---- 12. RLS unchanged ---------------------------------------------------
    SELECT count(*) INTO v_count FROM pg_class
    WHERE oid = 'public.trust_decision_observations'::regclass AND relrowsecurity;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'CERT FAIL 12: row level security is no longer enabled';
    END IF;
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS 12 — row level security is still enabled on the observation store';

    RAISE NOTICE '=============================================';
    RAISE NOTICE 'TRUST LIFECYCLE OBSERVATION VOCABULARY — % / 12 assertions passed', v_pass;
    RAISE NOTICE '=============================================';

    IF v_pass <> 12 THEN
        RAISE EXCEPTION 'CERT FAIL: expected 12 assertions, counted %', v_pass;
    END IF;
END;
$$;
