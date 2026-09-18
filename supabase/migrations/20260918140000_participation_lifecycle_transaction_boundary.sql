-- P0-7.6 · STEP 2 PREREQUISITE — ONE TRANSACTION FOR THE PARTICIPATION LIFECYCLE UPDATE
--
-- ── WHY THIS EXISTS ──
--
-- `update_process_participation` is classified `dependent`: it sequences AFTER the atomic identity
-- group and is NOT part of `execute_processing_identity_group`. That classification is correct and is
-- deliberately NOT changed here. But it meant the participation lifecycle write had no transaction of
-- its own — the TypeScript port issued a bare UPDATE — so Step 2 had nowhere to attach a maintained
-- opportunity fact without producing a split commit.
--
-- This function is that transaction, and nothing more. A plpgsql function body IS one transaction, so
-- when Step 2 adds the maintained-fact UPDATE beside the participation UPDATE below, either both
-- commit or neither does.
--
-- ── WHY IT IS NOT GENERIC CRUD ──
--
-- The port accepted an arbitrary patch object. The command above it never sent one: its payload is
-- `{participation_id, expected_version?, stage_key?, state?}` and the handler builds a patch of at
-- most those two fields. So this function takes exactly those two, each with an explicit
-- "was it supplied" flag — because `null` means SET NULL and absent means LEAVE ALONE, and a single
-- nullable parameter cannot express both. There is no column list, no JSON patch language and no way
-- to reach any other column. It is the domain operation, not a table writer.
--
-- ── SECURITY INVOKER, DELIBERATELY ──
--
-- Not SECURITY DEFINER. `process_instances` carries RLS org policies, and a DEFINER function would
-- bypass them and quietly become a privilege escalation for any caller who could reach it. INVOKER
-- keeps every existing authorization exactly as strong as it is today: a caller who could not UPDATE
-- the row directly still cannot.

CREATE OR REPLACE FUNCTION public.update_participation_and_maintain_facts(
    p_org_id uuid,
    p_participation_id uuid,
    p_expected_version timestamptz DEFAULT NULL,
    p_set_stage_key boolean DEFAULT false,
    p_stage_key text DEFAULT NULL,
    p_set_state boolean DEFAULT false,
    p_state text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_now timestamptz := now();
    v_hit integer;
BEGIN
    /*
     * Mirrors the TypeScript port exactly, including one nuance worth naming: the stage-entry stamp
     * keys on the stage_key being SUPPLIED, not on the value CHANGING. Re-sending the same stage_key
     * restamps `stage_entered_at` today, and that behaviour is preserved rather than "fixed" — this
     * slice moves the transaction boundary and changes no semantics.
     */
    UPDATE public.process_instances
       SET stage_key        = CASE WHEN p_set_stage_key THEN p_stage_key ELSE stage_key END,
           state            = CASE WHEN p_set_state     THEN p_state     ELSE state     END,
           stage_entered_at = CASE WHEN p_set_stage_key THEN v_now       ELSE stage_entered_at END,
           updated_at       = v_now
     WHERE id = p_participation_id
       AND org_id = p_org_id
       -- The optimistic-concurrency predicate, unchanged: absent expected_version means no guard.
       AND (p_expected_version IS NULL OR updated_at = p_expected_version);

    GET DIAGNOSTICS v_hit = ROW_COUNT;

    IF v_hit = 0 THEN
        -- The port's exact vocabulary. Not found and stale are ONE outcome here, as they are today:
        -- the predicate cannot tell them apart and the caller never depended on the difference.
        RETURN jsonb_build_object('ok', false, 'error', 'record_not_found_or_stale', 'code', 'stale');
    END IF;

    -- ── STEP 2 SEAM ──
    -- The maintained opportunity fact UPDATE belongs HERE, inside this same transaction. It is not
    -- written yet because its column is not authorized yet. Nothing structural is missing: another
    -- UPDATE placed at this point either commits with the one above or rolls back with it.

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

COMMENT ON FUNCTION public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text) IS
    'P0-7.6 Step 2 prerequisite. The single transactional boundary for the process participation '
    'lifecycle update. Mirrors the update_process_participation port semantics exactly. SECURITY '
    'INVOKER so RLS still governs. Step 2 extends this same transaction with the maintained '
    'opportunity fact update.';

REVOKE ALL ON FUNCTION public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text) TO authenticated, service_role;

-- ── EXECUTION PROOF ─────────────────────────────────────────────────────────────────────────────
-- SQL text is not evidence. This block EXERCISES the function against real rows and raises on any
-- mismatch, so applying the migration IS the certification. Every fixture is rolled back by the
-- enclosing exception frame, so nothing survives.
DO $selftest$
DECLARE
    v_org  uuid;
    v_pi   uuid;
    v_res  jsonb;
    v_prior   timestamptz;   -- a REAL, superseded version
    v_current timestamptz;   -- the row's current version
    v_stage text;
    v_state text;
    v_entered timestamptz;
BEGIN
    /*
     * ── EVERY ASSERTION HERE IS NULL-SAFE, DELIBERATELY ──
     *
     * The first version of this block used `<>` throughout. `stage_key` and `state` are NULLABLE, and
     * a missing jsonb key extracts as NULL, so `NULL <> 'stale'` evaluates to NULL — which is not TRUE,
     * so the IF never fires. An assertion that cannot fail on the path it exists to catch is worse than
     * no assertion: it reports success. One such check let a non-stale write past and only a later row
     * comparison caught it.
     *
     * So: IS DISTINCT FROM / IS NOT DISTINCT FROM everywhere, with no bare `<>` or `=` on any value
     * that can be NULL.
     */

    -- orgs.slug is NOT NULL with a UNIQUE constraint; the slug is randomised so the fixture cannot
    -- collide even though every row here is rolled back.
    INSERT INTO public.orgs (name, slug)
    VALUES ('__selftest_participation_txn__', '__selftest_' || gen_random_uuid())
    RETURNING id INTO v_org;

    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, stage_key, state)
    VALUES (v_org, 'enrollment_process', 'child', gen_random_uuid(), 'lead', 'active')
    RETURNING id INTO v_pi;

    -- 1 · STATE-ONLY: state changes, stage untouched, stage_entered_at NOT stamped, updated_at stamped.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, false, NULL, true, 'waitlisted');
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: state update refused: %', v_res; END IF;
    SELECT stage_key, state, stage_entered_at, updated_at INTO v_stage, v_state, v_entered, v_current
      FROM public.process_instances WHERE id = v_pi;
    IF v_state IS DISTINCT FROM 'waitlisted' THEN RAISE EXCEPTION 'SELFTEST: state not applied (%)', v_state; END IF;
    IF v_stage IS DISTINCT FROM 'lead' THEN RAISE EXCEPTION 'SELFTEST: stage changed by a state-only patch (%)', v_stage; END IF;
    IF v_entered IS NOT NULL THEN RAISE EXCEPTION 'SELFTEST: stage_entered_at stamped without a stage_key patch'; END IF;
    IF v_current IS NULL THEN RAISE EXCEPTION 'SELFTEST: updated_at not stamped by the RPC'; END IF;

    -- THE REAL PRIOR VERSION. `process_instances.updated_at` has NO DEFAULT, so the value returned by
    -- the INSERT is NULL — and a NULL expected_version means NO GUARD, which is why the first attempt
    -- at specimen 3 silently performed an unguarded write. This one is stamped by the RPC above.
    v_prior := v_current;
    IF v_prior IS NULL THEN RAISE EXCEPTION 'SELFTEST: prior version is NULL — specimen 3 would not test staleness'; END IF;

    -- 2 · STAGE: supplied stage applies and stamps; unsupplied state is preserved. This also advances
    --     updated_at, which is what makes v_prior genuinely superseded.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'enrollment', false, NULL);
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: stage update refused: %', v_res; END IF;
    SELECT stage_key, state, stage_entered_at, updated_at INTO v_stage, v_state, v_entered, v_current
      FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'enrollment' THEN RAISE EXCEPTION 'SELFTEST: stage not applied (%)', v_stage; END IF;
    IF v_entered IS NULL THEN RAISE EXCEPTION 'SELFTEST: stage_entered_at not stamped on a stage change'; END IF;
    IF v_state IS DISTINCT FROM 'waitlisted' THEN RAISE EXCEPTION 'SELFTEST: unsupplied state was overwritten (%)', v_state; END IF;

    -- The specimen is only meaningful if the version it carries is demonstrably superseded. Assert it
    -- rather than assume it.
    IF NOT (v_prior < v_current) THEN
        RAISE EXCEPTION 'SELFTEST: prior version % is not older than current % — specimen 3 is not a stale test', v_prior, v_current;
    END IF;

    -- 3 · STALE VERSION: non-null, genuinely superseded, refused, and the row unchanged.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, v_prior, true, 'tour', false, NULL);
    IF (v_res ->> 'code') IS DISTINCT FROM 'stale' THEN RAISE EXCEPTION 'SELFTEST: stale write was accepted: %', v_res; END IF;
    IF (v_res ->> 'error') IS DISTINCT FROM 'record_not_found_or_stale' THEN
        RAISE EXCEPTION 'SELFTEST: stale refusal lost its canonical vocabulary: %', v_res;
    END IF;
    SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'enrollment' THEN RAISE EXCEPTION 'SELFTEST: refused write still mutated the row (%)', v_stage; END IF;

    -- 4 · CURRENT VERSION: accepted — proving specimen 3 failed on staleness, not on a guard that
    --     always refuses.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, v_current, true, 'tour', false, NULL);
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: current-version write refused: %', v_res; END IF;

    -- 5 · MISSING ROW: canonical vocabulary, nothing invented.
    v_res := public.update_participation_and_maintain_facts(v_org, gen_random_uuid(), NULL, false, NULL, true, 'x');
    IF (v_res ->> 'code') IS DISTINCT FROM 'stale' THEN RAISE EXCEPTION 'SELFTEST: missing row not reported as stale: %', v_res; END IF;
    IF (v_res ->> 'error') IS DISTINCT FROM 'record_not_found_or_stale' THEN
        RAISE EXCEPTION 'SELFTEST: missing row lost its canonical vocabulary: %', v_res;
    END IF;

    -- 6 · CROSS-ORG: refused, row unchanged. Written as a positive assertion so a NULL cannot pass.
    v_res := public.update_participation_and_maintain_facts(gen_random_uuid(), v_pi, NULL, true, 'leaked', false, NULL);
    IF (v_res ->> 'ok') IS NOT DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: cross-org write succeeded: %', v_res; END IF;
    SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'tour' THEN RAISE EXCEPTION 'SELFTEST: cross-org attempt mutated the row (%)', v_stage; END IF;

    -- 7 · FORCED ROLLBACK — the load-bearing Step 2 prerequisite. A failure AFTER the UPDATE must leave
    --     the row untouched, which is what lets Step 2 add a second UPDATE here without a split commit.
    BEGIN
        v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'rolled_back', false, NULL);
        IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: setup for the rollback specimen failed: %', v_res; END IF;
        -- Prove the write really landed before we abort, so the rollback assertion below is meaningful.
        SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
        IF v_stage IS DISTINCT FROM 'rolled_back' THEN RAISE EXCEPTION 'SELFTEST: rollback setup did not apply (%)', v_stage; END IF;
        RAISE EXCEPTION 'SELFTEST_FORCED_ROLLBACK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'SELFTEST_FORCED_ROLLBACK' THEN RAISE; END IF;
    END;
    SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'tour' THEN
        RAISE EXCEPTION 'SELFTEST: participation UPDATE survived a rolled-back transaction (%) — a split commit is possible', v_stage;
    END IF;

    RAISE EXCEPTION 'SELFTEST_CLEANUP';
EXCEPTION WHEN OTHERS THEN
    -- Fixtures are discarded by this frame. A real assertion failure re-raises and fails the migration.
    IF SQLERRM IS DISTINCT FROM 'SELFTEST_CLEANUP' THEN RAISE; END IF;
END
$selftest$;
