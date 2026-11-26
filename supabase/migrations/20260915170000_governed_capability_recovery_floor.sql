-- ===========================================================================
-- THE RECOVERY FLOOR: restoring a capability nobody is left to delegate.
--
-- Both ordinary delegation paths are now bounded, and that is exactly what
-- creates this problem. W-18 refuses a grant of authority the actor does not
-- hold; the assignment ceiling refuses a membership change that would newly
-- confer it. So when the last principal holding capability C loses it, NOBODY
-- in the organization can restore it through the product -- not an
-- administrator, not the person who removed it.
--
-- WHY THE OBVIOUS CONDITION IS THE WRONG ONE. The narrower formulation "no
-- allowed role grant exists" was tested and disproved. Measured Case 1: an
-- allowed grant survived on an unassigned role, no principal effectively held
-- `fin.post`, and BOTH ordinary paths still refused --
-- `assignment_ceiling:fin.post` and `delegation_ceiling:fin.post`. A surviving
-- grant does not make a capability recoverable, because assigning the role that
-- carries it is itself a delegation of it. The condition must reason about
-- EFFECTIVE HOLDERS, not about rows.
--
-- WHY THE TARGET ROLE MUST HAVE MEMBERS. Restoring C onto an unassigned role
-- reproduces Case 1 precisely: the grant exists, nobody holds it, and the
-- assignment ceiling still prevents anyone from assigning it. Recovery must
-- restore an EFFECTIVE HOLDER or it has not recovered anything, so this refuses
-- a memberless target and asserts a real holder exists before it commits.
--
-- WHAT THIS IS NOT. It is not a bypass in the normal API. `replace_role_-
-- permission_grants` is untouched and still subset-bound; there is no recovery
-- flag, no origin that confers authority, no force parameter. This is a
-- separate owner, reachable only by `service_role`, invoked only through a
-- Tier D governed action that can never be approved automatically.
--
-- The authority here is GOVERNANCE, not a capability. Nothing in this migration
-- creates a tenant-grantable key.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.restore_capability_to_role(
    p_org_id            uuid,
    p_permission_key    text,
    p_target_role_key   text,
    p_reason            text,
    p_governed_action_id text
) RETURNS TABLE(restored boolean, member_count integer, effective_holders integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_members    uuid[];
    v_count      integer;
    v_holders    integer;
    v_after      integer;
    v_before_state text;
    v_role_id    uuid;
BEGIN
    IF p_org_id IS NULL OR p_permission_key IS NULL OR btrim(p_permission_key) = ''
       OR p_target_role_key IS NULL OR btrim(p_target_role_key) = '' THEN
        RAISE EXCEPTION 'recovery_arguments_required: organization, capability and target role are all required'
            USING ERRCODE = '22023';
    END IF;

    -- A recovery with no stated reason is an unexplained authority restoration.
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'recovery_reason_required: an exceptional authority restoration must say why'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.orgs o WHERE o.id = p_org_id) THEN
        RAISE EXCEPTION 'unknown_organization:%', p_org_id USING ERRCODE = '23503';
    END IF;

    /*
     * ACTIVE CAPABILITIES ONLY. A retired key is a deliberate end of vocabulary,
     * and resurrecting one through a repair path would undo a decision rather
     * than restore an accident. `settings.users_roles` must stay dead.
     */
    IF NOT EXISTS (
        SELECT 1 FROM public.permission_definitions pd
         WHERE pd.key = btrim(p_permission_key) AND pd.is_active
    ) THEN
        RAISE EXCEPTION 'capability_not_active:%', btrim(p_permission_key) USING ERRCODE = '22023';
    END IF;

    -- The target role is the organization's, and is one the product still treats
    -- as usable. Role LABELS confer nothing here: system and custom are equal.
    IF NOT EXISTS (
        SELECT 1 FROM public.role_definitions rd
         WHERE rd.org_id = p_org_id AND rd.role_key = btrim(p_target_role_key) AND rd.is_active
    ) THEN
        RAISE EXCEPTION 'unknown_role_key:%', btrim(p_target_role_key) USING ERRCODE = '23503';
    END IF;

    SELECT rd.id INTO v_role_id
      FROM public.role_definitions rd
     WHERE rd.org_id = p_org_id AND rd.role_key = btrim(p_target_role_key);

    -- BLAST RADIUS, measured before anything is written. Recovery grants the
    -- capability to EVERY current member of the chosen role, so the number is
    -- part of the decision, not a side effect of it.
    SELECT COALESCE(array_agg(ur.user_id ORDER BY ur.user_id), ARRAY[]::uuid[])
      INTO v_members
      FROM public.user_roles ur
     WHERE ur.org_id = p_org_id AND ur.role = btrim(p_target_role_key);
    v_count := COALESCE(array_length(v_members, 1), 0);

    IF v_count = 0 THEN
        RAISE EXCEPTION 'target_role_has_no_members:% — restoring a capability onto an unassigned role recreates the lockout it was meant to repair', btrim(p_target_role_key)
            USING ERRCODE = '23514';
    END IF;

    /*
     * THE EXCEPTION CONDITION, RE-MEASURED AT EXECUTION.
     *
     * A Tier D approval may wait, and the organization keeps running while it
     * does. If any legitimate path restored an effective holder in the meantime,
     * the exceptional route is no longer warranted and refuses -- the approval
     * authorises an exception to a state, not a mutation regardless of state.
     */
    SELECT count(DISTINCT ur.user_id) INTO v_holders
      FROM public.user_roles ur
      JOIN public.role_permission_grants g
        ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
     WHERE ur.org_id = p_org_id AND g.permission_key = btrim(p_permission_key);

    IF v_holders > 0 THEN
        RAISE EXCEPTION 'recovery_no_longer_required:% — % principal(s) already hold it', btrim(p_permission_key), v_holders
            USING ERRCODE = '23514';
    END IF;

    SELECT CASE WHEN EXISTS (
             SELECT 1 FROM public.role_permission_grants g
              WHERE g.org_id = p_org_id AND g.role_key = btrim(p_target_role_key)
                AND g.permission_key = btrim(p_permission_key)
           ) THEN 'grant_row_present_not_allowed' ELSE 'no_grant_row' END
      INTO v_before_state;

    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    VALUES (p_org_id, btrim(p_target_role_key), btrim(p_permission_key), true)
    ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

    -- DID IT ACTUALLY RECOVER? A grant that leaves the tenant with no effective
    -- holder is not a recovery, and reporting one would be worse than refusing.
    SELECT count(DISTINCT ur.user_id) INTO v_after
      FROM public.user_roles ur
      JOIN public.role_permission_grants g
        ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
     WHERE ur.org_id = p_org_id AND g.permission_key = btrim(p_permission_key);

    IF v_after < 1 THEN
        RAISE EXCEPTION 'recovery_produced_no_holder: the grant was written but nobody effectively holds %', btrim(p_permission_key)
            USING ERRCODE = '23514';
    END IF;

    /*
     * D2, in the same transaction. The operator is NULL and the origin is
     * `system` because no human performed this SQL; who AUTHORISED it is carried
     * by the governed action id, which is the correlation a forensic reader
     * follows back to the decision.
     */
    INSERT INTO public.mutation_events (
        org_id, mutation_id, command_key, domain, subject_id, subject_type,
        previous_state, new_state, operator_id, origin, override_reason, context_payload
    ) VALUES (
        p_org_id,
        -- `mutation_id` is this platform's uuid correlation for one mutation. The
        -- governed action id is not a uuid and is not a substitute for it: it
        -- identifies the DECISION, and travels in the payload below where a
        -- forensic reader follows it back to the approval.
        gen_random_uuid(),
        'access.capability.recovered',
        'access',
        v_role_id,
        'role',
        'effective_holders=0; grant=' || v_before_state,
        'effective_holders=' || v_after::text || '; grant=allowed',
        NULL,
        'system',
        btrim(p_reason),
        jsonb_build_object(
            'capability', btrim(p_permission_key),
            'target_role_key', btrim(p_target_role_key),
            'governed_action_id', btrim(p_governed_action_id),
            'member_count', v_count,
            'members', to_jsonb(v_members),
            'recovery_condition', 'active_capability_and_zero_effective_holders'
        )
    );

    RETURN QUERY SELECT true, v_count, v_after;
END;
$fn$;

COMMENT ON FUNCTION public.restore_capability_to_role(uuid, text, text, text, text) IS
'Tier D governed capability recovery. Restores ONE active capability to ONE existing member-bearing role when no principal in the organization effectively holds it. Not reachable by ordinary clients; not a bypass of the W-18 or assignment ceilings.';

-- The same boundary PR #990 established. This function confers authority, so it
-- is exactly the shape that must never be client-executable.
REVOKE EXECUTE ON FUNCTION public.restore_capability_to_role(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_capability_to_role(uuid, text, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_capability_to_role(uuid, text, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.restore_capability_to_role(uuid, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- THE BOUNDARY REPORT BECOMES STRUCTURAL.
--
-- PR #990 keyed the guarded set on `p_actor_user_id`, which was the right shape
-- for the defect it closed. The recovery owner takes NO actor — its authority is
-- governance, not a named principal — so that scan would not have seen it, and
-- the most dangerous function in the Access model would have been the one the
-- lock did not cover.
--
-- The honest predicate is what a function DOES, not what it is passed: anything
-- that writes `role_permission_grants` or `user_roles` confers authority and has
-- no business being callable from a browser. Actor-taking functions stay in the
-- set, so nothing the old scan caught is lost.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.access_rpc_boundary_report()
RETURNS TABLE(proname text, open_to_clients boolean, has_service_role boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
    SELECT p.proname::text,
           (
                p.proacl IS NULL
             OR array_to_string(p.proacl::text[], ',') ILIKE '%authenticated=X%'
             OR array_to_string(p.proacl::text[], ',') ILIKE '%anon=X%'
             OR array_to_string(p.proacl::text[], ',') ILIKE '%{=X%'
             OR array_to_string(p.proacl::text[], ',') ILIKE '%,=X%'
           ) AS open_to_clients,
           COALESCE(array_to_string(p.proacl::text[], ',') ILIKE '%service_role=X%', false) AS has_service_role
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       -- Plain functions only: pg_get_functiondef() raises on aggregates.
       AND p.prokind = 'f'
       AND (
            pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_user_id%'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_permission_grants'
         OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?user_roles'
       );
$fn$;

REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.access_rpc_boundary_report() FROM anon;
GRANT  EXECUTE ON FUNCTION public.access_rpc_boundary_report() TO service_role;

-- The widened scan will now name bootstrap seeds that were never actor-taking.
-- Close them on the same terms: they write grants, so they are authority writers.
DO $close$
DECLARE
    v_fn record;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure::text AS sig
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prokind = 'f'
           AND (
                pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?role_permission_grants'
             OR pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?user_roles'
           )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_fn.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.sig);
    END LOOP;
END;
$close$;

-- ---------------------------------------------------------------------------
-- SELF-TEST: the floor works, and every refusal it promises actually refuses.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_org uuid := 'fee00000-0000-4000-8000-0000000fee00'::uuid;
    v_u1 uuid; v_u2 uuid;
    v_res record;
    v_msg text;
    v_refusals int := 0;
BEGIN
    SELECT id INTO v_u1 FROM auth.users ORDER BY created_at LIMIT 1;
    SELECT id INTO v_u2 FROM auth.users WHERE id <> v_u1 ORDER BY created_at LIMIT 1;
    IF v_u1 IS NULL OR v_u2 IS NULL THEN
        RAISE NOTICE 'recovery floor self-test skipped: fewer than two auth identities';
        RETURN;
    END IF;

    INSERT INTO public.orgs (id, name, slug, status)
    VALUES (v_org, 'Recovery Floor Self Test', 'recovery-floor-self-test', 'active');
    DELETE FROM public.role_permission_grants WHERE org_id = v_org;
    DELETE FROM public.role_definitions WHERE org_id = v_org;
    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active) VALUES
        (v_org, 'rf_held',   'Has members', false, true),
        (v_org, 'rf_empty',  'No members',  false, true);
    INSERT INTO public.user_roles (org_id, user_id, role) VALUES (v_org, v_u1, 'rf_held');

    -- (a) A MEMBERLESS TARGET IS REFUSED: it would recreate the lockout.
    BEGIN
        PERFORM public.restore_capability_to_role(v_org, 'fin.post', 'rf_empty', 'self-test', 'selftest');
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg LIKE 'target_role_has_no_members%' THEN v_refusals := v_refusals + 1; END IF;
    END;

    -- (b) A RETIRED CAPABILITY IS REFUSED: recovery must not resurrect vocabulary.
    BEGIN
        PERFORM public.restore_capability_to_role(v_org, 'settings.users_roles', 'rf_held', 'self-test', 'selftest');
    EXCEPTION WHEN invalid_parameter_value OR sqlstate '22023' THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg LIKE 'capability_not_active%' THEN v_refusals := v_refusals + 1; END IF;
    END;

    IF v_refusals <> 2 THEN
        RAISE EXCEPTION 'RECOVERY FLOOR ABORT: expected the memberless-target and retired-capability refusals to both fire; got % of 2.', v_refusals;
    END IF;

    -- (c) THE REAL RECOVERY. Zero holders, active capability, member-bearing role.
    SELECT * INTO v_res FROM public.restore_capability_to_role(v_org, 'fin.post', 'rf_held', 'self-test recovery', 'selftest-ok');
    IF NOT v_res.restored OR v_res.effective_holders < 1 OR v_res.member_count <> 1 THEN
        RAISE EXCEPTION 'RECOVERY FLOOR ABORT: recovery reported %, holders %, members % — it must produce a real holder.',
            v_res.restored, v_res.effective_holders, v_res.member_count;
    END IF;

    -- (d) AND IT IS NOT REPEATABLE: a holder now exists, so the exception lapses.
    BEGIN
        PERFORM public.restore_capability_to_role(v_org, 'fin.post', 'rf_held', 'self-test retry', 'selftest-retry');
        RAISE EXCEPTION 'RECOVERY FLOOR ABORT: a second recovery succeeded while a holder existed.';
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg NOT LIKE 'recovery_no_longer_required%' THEN RAISE; END IF;
    END;

    RAISE NOTICE 'recovery floor self-test passed: refusals fire, recovery produces a holder, retry lapses';
    RAISE EXCEPTION 'selftest_rollback';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'selftest_rollback' THEN
        RAISE NOTICE 'recovery floor self-test rolled back cleanly';
    ELSE
        RAISE;
    END IF;
END;
$selftest$;
