-- P0-7.6 · STEP 2 PREREQUISITE — ONE LIFECYCLE AUTHORITY FOR process_instances
--
-- ── WHY THIS EXISTS ──
--
-- The single-writer invariant Step 2 depends on was certified by a gate that matched only the string
-- literal `.from("process_instances")`. `lib/process/processInstances.ts` uses the constant it
-- exports itself, so an entire write module was invisible and the invariant was never true. Step 2
-- maintains an opportunity fact INSIDE `update_participation_and_maintain_facts`; any lifecycle write
-- that does not pass through it moves a participant without refreshing that fact, which — once the
-- enrichment reads are retired — is silent, durable, operator-visible wrong truth.
--
-- This migration closes the two gaps that kept TypeScript writing the table directly.
--
-- ── 1. close_reason_key JOINS THE CONTRACT ──
--
-- `setEnrollmentInstanceStateByScope` writes `state` AND `close_reason_key` together: closing a
-- journey is one transition, not two. The RPC accepted only stage_key and state, so that writer could
-- not converge without either splitting an atomic transition or keeping its direct write. It is the
-- third and LAST lifecycle field — `close_reason_key` is read by the EPP rollup — and it arrives with
-- the same explicit SUPPLY flag as the others, not as a patch language. This is still the domain
-- operation, not a table writer.
--
-- The signature changes, so the old function is DROPPED rather than left beside the new one: two
-- overloads separated only by defaulted arguments make every 7-argument call ambiguous, and the whole
-- point of this slice is that there is exactly one lifecycle authority. NEW REPLACES OLD.

DROP FUNCTION IF EXISTS public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text);

CREATE OR REPLACE FUNCTION public.update_participation_and_maintain_facts(
    p_org_id uuid,
    p_participation_id uuid,
    p_expected_version timestamptz DEFAULT NULL,
    p_set_stage_key boolean DEFAULT false,
    p_stage_key text DEFAULT NULL,
    p_set_state boolean DEFAULT false,
    p_state text DEFAULT NULL,
    p_set_close_reason_key boolean DEFAULT false,
    p_close_reason_key text DEFAULT NULL
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
     * Unchanged from the executed-certified contract except for the third field: the stage-entry stamp
     * still keys on stage_key being SUPPLIED rather than CHANGING, and the optimistic-concurrency
     * predicate is still equality on `updated_at`.
     */
    UPDATE public.process_instances
       SET stage_key        = CASE WHEN p_set_stage_key       THEN p_stage_key        ELSE stage_key        END,
           state            = CASE WHEN p_set_state           THEN p_state            ELSE state            END,
           close_reason_key = CASE WHEN p_set_close_reason_key THEN p_close_reason_key ELSE close_reason_key END,
           stage_entered_at = CASE WHEN p_set_stage_key       THEN v_now              ELSE stage_entered_at END,
           updated_at       = v_now
     WHERE id = p_participation_id
       AND org_id = p_org_id
       AND (p_expected_version IS NULL OR updated_at = p_expected_version);

    GET DIAGNOSTICS v_hit = ROW_COUNT;

    IF v_hit = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'record_not_found_or_stale', 'code', 'stale');
    END IF;

    -- ── STEP 2 SEAM ──
    -- The maintained opportunity fact UPDATE belongs HERE. Every lifecycle mutation in the system now
    -- reaches this point, including enrollment materialization, which routes through the function
    -- below rather than around it. That is the property Step 2 needs and did not have.

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

COMMENT ON FUNCTION public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text, boolean, text) IS
    'P0-7.6 Step 2 prerequisite. THE single transactional boundary for process participation lifecycle '
    'truth (stage_key, state, close_reason_key). SECURITY INVOKER so RLS still governs. Step 2 extends '
    'this same transaction with the maintained opportunity fact update.';

REVOKE ALL ON FUNCTION public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_participation_and_maintain_facts(uuid, uuid, timestamptz, boolean, text, boolean, text, boolean, text) TO authenticated, service_role;

-- ── 2. MATERIALIZATION: PROVENANCE AND LIFECYCLE, STILL ONE COMMIT ──
--
-- `materializeEnrollmentFromProcessInstance` back-stamps provenance (the agreement id, the
-- materialized-at timestamp) and marks the journey terminal in ONE UPDATE. Splitting that into an RPC
-- call plus a metadata UPDATE from TypeScript would have made the system LESS atomic to route it
-- through a command — it would allow "metadata says materialized, lifecycle still pre-enrollment" to
-- become committed truth.
--
-- So the domain operation gets its own narrow transaction, and that transaction CALLS the lifecycle
-- authority above rather than writing lifecycle columns itself. The lifecycle command is not widened
-- into generic metadata CRUD, the provenance write stays with the domain that owns it, and Step 2's
-- maintained-fact update is inherited here automatically instead of being a second thing to remember.

CREATE OR REPLACE FUNCTION public.materialize_participation_and_stamp_provenance(
    p_org_id uuid,
    p_participation_id uuid,
    p_metadata jsonb,
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
    v_res jsonb;
    v_hit integer;
BEGIN
    IF p_set_stage_key OR p_set_state THEN
        v_res := public.update_participation_and_maintain_facts(
            p_org_id, p_participation_id, NULL,
            p_set_stage_key, p_stage_key,
            p_set_state, p_state,
            false, NULL);
        IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN
            -- Nothing has been written yet, so returning the refusal verbatim is safe and keeps the
            -- caller's vocabulary identical to the lifecycle authority's.
            RETURN v_res;
        END IF;
    END IF;

    UPDATE public.process_instances
       SET metadata   = p_metadata,
           updated_at = now()
     WHERE id = p_participation_id
       AND org_id = p_org_id;

    GET DIAGNOSTICS v_hit = ROW_COUNT;

    IF v_hit = 0 THEN
        /*
         * RAISE, never RETURN. A return here would COMMIT a lifecycle move whose provenance stamp did
         * not land — precisely the split commit this function exists to prevent. The lifecycle write
         * above proves the row exists and is in scope, so reaching this line at all is an integrity
         * violation, and aborting is the only answer that keeps both halves true together.
         */
        RAISE EXCEPTION 'materialize_participation: provenance stamp matched no row after a successful lifecycle write (participation %)', p_participation_id;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$fn$;

COMMENT ON FUNCTION public.materialize_participation_and_stamp_provenance(uuid, uuid, jsonb, boolean, text, boolean, text) IS
    'P0-7.6 Step 2 prerequisite. Enrollment materialization as ONE transaction: the lifecycle half '
    'delegates to update_participation_and_maintain_facts (the single lifecycle authority), the '
    'provenance metadata stamp stays with this domain operation. Either both commit or neither does.';

REVOKE ALL ON FUNCTION public.materialize_participation_and_stamp_provenance(uuid, uuid, jsonb, boolean, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_participation_and_stamp_provenance(uuid, uuid, jsonb, boolean, text, boolean, text) TO authenticated, service_role;

-- ── EXECUTION PROOF ─────────────────────────────────────────────────────────────────────────────
-- SQL text is not evidence. This block EXERCISES both functions against real rows and raises on any
-- mismatch, so applying the migration IS the certification. Every fixture is discarded by the
-- enclosing exception frame.
--
-- Every assertion is NULL-safe (IS DISTINCT FROM, never a bare <> on a nullable column or a missing
-- jsonb key), and the stale specimen CONSTRUCTS a guaranteed-different version rather than capturing
-- one: now() is transaction_timestamp(), so inside this single transaction a captured "prior" version
-- would be EQUAL to current and the equality guard would ACCEPT it.
DO $selftest$
DECLARE
    v_org  uuid;
    v_pi   uuid;
    v_res  jsonb;
    v_stale   timestamptz;
    v_current timestamptz;
    v_stage text;
    v_state text;
    v_close text;
    v_entered timestamptz;
    v_meta jsonb;
BEGIN
    INSERT INTO public.orgs (name, slug)
    VALUES ('__selftest_writer_convergence__', '__selftest_' || gen_random_uuid())
    RETURNING id INTO v_org;

    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, stage_key, state, metadata)
    VALUES (v_org, 'enrollment_process', 'child', gen_random_uuid(), 'lead', 'active', '{"source":"selftest"}'::jsonb)
    RETURNING id INTO v_pi;

    -- 1 · close_reason_key SUPPLY: supplied together with state, as a close really happens.
    v_res := public.update_participation_and_maintain_facts(
        v_org, v_pi, NULL, false, NULL, true, 'closed', true, 'withdrawn');
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: close transition refused: %', v_res; END IF;
    SELECT stage_key, state, close_reason_key, stage_entered_at, updated_at
      INTO v_stage, v_state, v_close, v_entered, v_current
      FROM public.process_instances WHERE id = v_pi;
    IF v_state IS DISTINCT FROM 'closed' THEN RAISE EXCEPTION 'SELFTEST: state not applied (%)', v_state; END IF;
    IF v_close IS DISTINCT FROM 'withdrawn' THEN RAISE EXCEPTION 'SELFTEST: close_reason_key not applied (%)', v_close; END IF;
    IF v_stage IS DISTINCT FROM 'lead' THEN RAISE EXCEPTION 'SELFTEST: stage moved without being supplied (%)', v_stage; END IF;
    IF v_entered IS NOT NULL THEN RAISE EXCEPTION 'SELFTEST: stage_entered_at stamped without a stage_key patch'; END IF;

    -- 2 · UNSUPPLIED close_reason_key IS LEFT ALONE — the flag, not the value, decides.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, false, NULL, true, 'active');
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: state-only update refused: %', v_res; END IF;
    SELECT close_reason_key INTO v_close FROM public.process_instances WHERE id = v_pi;
    IF v_close IS DISTINCT FROM 'withdrawn' THEN
        RAISE EXCEPTION 'SELFTEST: unsupplied close_reason_key was overwritten (%) — SUPPLY semantics lost', v_close;
    END IF;

    -- 3 · EXPLICIT NULL CLEARS IT. `null` means SET NULL; absent means LEAVE ALONE. Both must work.
    v_res := public.update_participation_and_maintain_facts(
        v_org, v_pi, NULL, false, NULL, false, NULL, true, NULL);
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: clearing close_reason_key refused: %', v_res; END IF;
    SELECT close_reason_key, stage_entered_at, updated_at INTO v_close, v_entered, v_current
      FROM public.process_instances WHERE id = v_pi;
    IF v_close IS NOT NULL THEN RAISE EXCEPTION 'SELFTEST: explicit NULL did not clear close_reason_key (%)', v_close; END IF;

    -- 4 · STAGE SUPPLY still stamps stage_entered_at.
    v_res := public.update_participation_and_maintain_facts(v_org, v_pi, NULL, true, 'enrollment', false, NULL);
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: stage update refused: %', v_res; END IF;
    SELECT stage_key, stage_entered_at, updated_at INTO v_stage, v_entered, v_current
      FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'enrollment' THEN RAISE EXCEPTION 'SELFTEST: stage not applied (%)', v_stage; END IF;
    IF v_entered IS NULL THEN RAISE EXCEPTION 'SELFTEST: stage_entered_at not stamped on a supplied stage'; END IF;

    -- 5 · STALE VERSION leaves ALL THREE lifecycle fields unchanged.
    IF v_current IS NULL THEN RAISE EXCEPTION 'SELFTEST: current version is NULL — specimen 5 cannot test staleness'; END IF;
    v_stale := v_current - interval '1 second';
    IF v_stale IS NULL THEN RAISE EXCEPTION 'SELFTEST: constructed stale version is NULL'; END IF;
    IF v_stale IS NOT DISTINCT FROM v_current THEN
        RAISE EXCEPTION 'SELFTEST: constructed version % is not distinct from current %', v_stale, v_current;
    END IF;
    v_res := public.update_participation_and_maintain_facts(
        v_org, v_pi, v_stale, true, 'tour', true, 'closed', true, 'not_enrolling');
    IF (v_res ->> 'code') IS DISTINCT FROM 'stale' THEN RAISE EXCEPTION 'SELFTEST: stale write accepted: %', v_res; END IF;
    IF (v_res ->> 'error') IS DISTINCT FROM 'record_not_found_or_stale' THEN
        RAISE EXCEPTION 'SELFTEST: stale refusal lost its canonical vocabulary: %', v_res;
    END IF;
    SELECT stage_key, state, close_reason_key INTO v_stage, v_state, v_close
      FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'enrollment' THEN RAISE EXCEPTION 'SELFTEST: stale write mutated stage (%)', v_stage; END IF;
    IF v_state IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'SELFTEST: stale write mutated state (%)', v_state; END IF;
    IF v_close IS NOT NULL THEN RAISE EXCEPTION 'SELFTEST: stale write mutated close_reason_key (%)', v_close; END IF;

    -- 6 · CROSS-ORG refusal leaves the row unchanged.
    v_res := public.update_participation_and_maintain_facts(
        gen_random_uuid(), v_pi, NULL, true, 'leaked', true, 'leaked', true, 'leaked');
    IF (v_res ->> 'ok') IS NOT DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: cross-org write succeeded: %', v_res; END IF;
    SELECT stage_key, state, close_reason_key INTO v_stage, v_state, v_close
      FROM public.process_instances WHERE id = v_pi;
    IF v_stage IS DISTINCT FROM 'enrollment' OR v_state IS DISTINCT FROM 'active' OR v_close IS NOT NULL THEN
        RAISE EXCEPTION 'SELFTEST: cross-org attempt mutated the row (%, %, %)', v_stage, v_state, v_close;
    END IF;

    -- 7 · MATERIALIZATION commits lifecycle AND provenance together.
    v_res := public.materialize_participation_and_stamp_provenance(
        v_org, v_pi, '{"source":"selftest","enrollment_agreement_id":"agr-1","materialized_at":"2026-09-18"}'::jsonb,
        true, 'enrolled_stage', true, 'enrolled');
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: materialization refused: %', v_res; END IF;
    SELECT stage_key, state, metadata INTO v_stage, v_state, v_meta
      FROM public.process_instances WHERE id = v_pi;
    IF v_state IS DISTINCT FROM 'enrolled' THEN RAISE EXCEPTION 'SELFTEST: materialization did not move state (%)', v_state; END IF;
    IF v_stage IS DISTINCT FROM 'enrolled_stage' THEN RAISE EXCEPTION 'SELFTEST: materialization did not move stage (%)', v_stage; END IF;
    IF (v_meta ->> 'enrollment_agreement_id') IS DISTINCT FROM 'agr-1' THEN
        RAISE EXCEPTION 'SELFTEST: provenance stamp did not land (%)', v_meta;
    END IF;

    -- 8 · MATERIALIZATION ON A MISSING ROW writes nothing and keeps the canonical vocabulary.
    v_res := public.materialize_participation_and_stamp_provenance(
        v_org, gen_random_uuid(), '{"x":1}'::jsonb, false, NULL, true, 'enrolled');
    IF (v_res ->> 'code') IS DISTINCT FROM 'stale' THEN RAISE EXCEPTION 'SELFTEST: missing-row materialization not refused: %', v_res; END IF;

    -- 9 · THE LOAD-BEARING SPECIMEN — a failure after BOTH halves have mutated rolls BOTH back.
    --     This is what lets Step 2 add a maintained-fact UPDATE inside the lifecycle authority and
    --     inherit it here without ever producing a split commit.
    BEGIN
        v_res := public.materialize_participation_and_stamp_provenance(
            v_org, v_pi, '{"source":"selftest","enrollment_agreement_id":"agr-ROLLED-BACK"}'::jsonb,
            true, 'rolled_back_stage', true, 'rolled_back');
        IF (v_res ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SELFTEST: rollback setup refused: %', v_res; END IF;
        -- Prove BOTH halves really landed before aborting, or "unchanged after rollback" would also
        -- pass if neither had ever been written.
        SELECT stage_key, state, metadata INTO v_stage, v_state, v_meta
          FROM public.process_instances WHERE id = v_pi;
        IF v_state IS DISTINCT FROM 'rolled_back' THEN RAISE EXCEPTION 'SELFTEST: rollback setup lifecycle did not apply (%)', v_state; END IF;
        IF (v_meta ->> 'enrollment_agreement_id') IS DISTINCT FROM 'agr-ROLLED-BACK' THEN
            RAISE EXCEPTION 'SELFTEST: rollback setup provenance did not apply (%)', v_meta;
        END IF;
        RAISE EXCEPTION 'SELFTEST_FORCED_ROLLBACK';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'SELFTEST_FORCED_ROLLBACK' THEN RAISE; END IF;
    END;
    SELECT stage_key, state, metadata INTO v_stage, v_state, v_meta
      FROM public.process_instances WHERE id = v_pi;
    IF v_state IS DISTINCT FROM 'enrolled' THEN
        RAISE EXCEPTION 'SELFTEST: lifecycle survived a rolled-back materialization (%) — split commit is possible', v_state;
    END IF;
    IF (v_meta ->> 'enrollment_agreement_id') IS DISTINCT FROM 'agr-1' THEN
        RAISE EXCEPTION 'SELFTEST: provenance survived a rolled-back materialization (%) — split commit is possible', v_meta;
    END IF;

    RAISE EXCEPTION 'SELFTEST_CLEANUP';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'SELFTEST_CLEANUP' THEN RAISE; END IF;
END
$selftest$;
