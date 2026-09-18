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
    v_v1   timestamptz;
    v_v2   timestamptz;
    v_stage text;
    v_state text;
    v_entered timestamptz;
BEGIN
    -- `orgs.slug` is NOT NULL with a UNIQUE constraint (orgs_slug_key). The first attempt supplied
    -- only `name` and the apply aborted here, before any specimen ran. A random slug keeps the
    -- fixture collision-free even though the row is rolled back.
    INSERT INTO public.orgs (name, slug)
    VALUES ('__selftest_participation_txn__', '__selftest_' || gen_random_uuid())
    RETURNING id INTO v_org;
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, stage_key, state)
    VALUES (v_org, 'enrollment_process', 'child', gen_random_uuid(), 'lead', 'active')
    RETURNING id, updated_at INTO v_pi, v_v1;

    -- 1 · SUCCESS: a state-only change must not touch stage_entered_at.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, false, NULL, true, 'waitlisted');
    IF (v_res ->> 'ok') <> 'true' THEN RAISE EXCEPTION 'SELFTEST: state update refused: %', v_res; END IF;
    SELECT stage_key, state, stage_entered_at, updated_at INTO v_stage, v_state, v_entered, v_v2
      FROM public.process_instances WHERE id = v_pi;
    IF v_state <> 'waitlisted' THEN RAISE EXCEPTION 'SELFTEST: state not applied (%)', v_state; END IF;
    IF v_stage <> 'lead' THEN RAISE EXCEPTION 'SELFTEST: stage changed by a state-only patch (%)', v_stage; END IF;
    IF v_entered IS NOT NULL THEN RAISE EXCEPTION 'SELFTEST: stage_entered_at stamped without a stage_key patch'; END IF;
    IF v_v2 IS NULL THEN RAISE EXCEPTION 'SELFTEST: updated_at not stamped'; END IF;

    -- 2 · STAGE CHANGE: supplying stage_key stamps stage_entered_at.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'enrollment', false, NULL);
    IF (v_res ->> 'ok') <> 'true' THEN RAISE EXCEPTION 'SELFTEST: stage update refused: %', v_res; END IF;
    SELECT stage_key, state, stage_entered_at, updated_at INTO v_stage, v_state, v_entered, v_v2
      FROM public.process_instances WHERE id = v_pi;
    IF v_stage <> 'enrollment' THEN RAISE EXCEPTION 'SELFTEST: stage not applied (%)', v_stage; END IF;
    IF v_entered IS NULL THEN RAISE EXCEPTION 'SELFTEST: stage_entered_at not stamped on a stage change'; END IF;
    IF v_state <> 'waitlisted' THEN RAISE EXCEPTION 'SELFTEST: unsupplied state was overwritten (%)', v_state; END IF;

    -- 3 · STALE VERSION: a superseded expected_version is refused, and nothing changes.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, v_v1, true, 'tour', false, NULL);
    IF (v_res ->> 'code') <> 'stale' THEN RAISE EXCEPTION 'SELFTEST: stale write was accepted: %', v_res; END IF;
    SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
    IF v_stage <> 'enrollment' THEN RAISE EXCEPTION 'SELFTEST: refused write still mutated the row (%)', v_stage; END IF;

    -- 4 · CURRENT VERSION accepted — proves test 3 failed on staleness, not on the guard always refusing.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, v_v2, true, 'tour', false, NULL);
    IF (v_res ->> 'ok') <> 'true' THEN RAISE EXCEPTION 'SELFTEST: current-version write refused: %', v_res; END IF;

    -- 5 · MISSING ROW: same vocabulary, no invention.
    v_res := public.update_participation_and_maintain_facts(v_org, gen_random_uuid(), NULL, false, NULL, true, 'x');
    IF (v_res ->> 'code') <> 'stale' THEN RAISE EXCEPTION 'SELFTEST: missing row not reported as stale: %', v_res; END IF;

    -- 6 · CROSS-ORG: another org's id cannot reach this row.
    v_res := public.update_participation_and_maintain_facts(gen_random_uuid(), v_pi, NULL, true, 'leaked', false, NULL);
    IF (v_res ->> 'ok') = 'true' THEN RAISE EXCEPTION 'SELFTEST: cross-org write succeeded'; END IF;
    SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
    IF v_stage <> 'tour' THEN RAISE EXCEPTION 'SELFTEST: cross-org attempt mutated the row (%)', v_stage; END IF;

    -- 7 · ROLLBACK: a failure AFTER the UPDATE must leave the row untouched. This is the proof that
    --     Step 2 can add a second UPDATE here without a split commit.
    BEGIN
        v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'rolled_back', false, NULL);
        IF (v_res ->> 'ok') <> 'true' THEN RAISE EXCEPTION 'SELFTEST: setup for rollback failed'; END IF;
        RAISE EXCEPTION 'SELFTEST_FORCED_ROLLBACK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'SELFTEST_FORCED_ROLLBACK' THEN RAISE; END IF;
    END;
    SELECT stage_key INTO v_stage FROM public.process_instances WHERE id = v_pi;
    IF v_stage <> 'tour' THEN
        RAISE EXCEPTION 'SELFTEST: participation UPDATE survived a rolled-back transaction (%) — a split commit is possible', v_stage;
    END IF;

    RAISE EXCEPTION 'SELFTEST_CLEANUP';
EXCEPTION WHEN OTHERS THEN
    -- Fixtures are discarded by this frame. A real assertion failure re-raises and fails the migration.
    IF SQLERRM <> 'SELFTEST_CLEANUP' THEN RAISE; END IF;
END
$selftest$;
