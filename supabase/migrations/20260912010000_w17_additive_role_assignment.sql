-- W-17 — ASSIGNING A ROLE STOPS MEANING "DISCARD THE OTHERS".
--
-- THE DEFECT. `user_roles` has always been a join table keyed
-- (user_id, org_id, role), and `resolveActorPermissionGrants` has always read
-- EVERY row for a membership and unioned the grants. The read model composes.
-- The write model did not: the only assignment path,
-- `replace_membership_with_access_profile`, deletes the whole set and inserts
-- one row. So a person could hold two roles, but no supported operation could
-- put them in that state, and any save through the editor silently discarded
-- whatever the operator was not looking at. D2 made that truthful rather than
-- silent -- `replacement_semantics = w17_replaces_role_set`, with
-- `discarded_roles` named -- which is what made the defect legible instead of
-- invisible. This closes it.
--
-- WHY TWO OPERATIONS RATHER THAN A BETTER SET-WRITER. "Read the set, change one
-- element, write the set back" is lost-update shaped: two administrators adding
-- different roles at the same moment each write a set that never contained the
-- other's addition, and one of them silently loses. Targeted insert and delete
-- of ONE row cannot lose a concurrent sibling, because the rows are independent
-- and the primary key arbitrates the only collision that exists.
--
-- WHAT IS DELIBERATELY NOT HERE. No new table, no array column, no "primary
-- role", and no second permission-merging algorithm. The relational model was
-- already right; only the writer was wrong. The replacement RPC is left intact
-- and still audits truthfully, because callers that genuinely mean "set the
-- whole set" must keep saying so.

DO $guard$
BEGIN
    IF to_regclass('public.mutation_events') IS NULL THEN
        RAISE EXCEPTION 'W-17 ABORT: public.mutation_events is absent; D2 must be applied first.';
    END IF;
    IF to_regclass('public.user_roles') IS NULL THEN
        RAISE EXCEPTION 'W-17 ABORT: public.user_roles is absent.';
    END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSIGN ONE ROLE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_member_role_audited(
    p_org_id uuid,
    p_user_id uuid,
    p_role_key text,
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS TABLE (assigned_role_key text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_key    text;
    v_before text[];
    v_after  text[];
    v_ins    integer;
BEGIN
    IF p_org_id IS NULL OR p_user_id IS NULL OR p_role_key IS NULL OR btrim(p_role_key) = '' THEN
        RAISE EXCEPTION 'assign_member_role_audited: p_org_id, p_user_id and p_role_key are required'
            USING ERRCODE = '22023';
    END IF;
    v_key := btrim(p_role_key);

    /*
     * The set BEFORE, read inside the transaction that changes it. This is
     * context for the event, never the authority for the write -- the write
     * touches exactly one row and never depends on what this read saw.
     */
    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_before
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    /*
     * Scope comes into existence with the membership and is never edited here:
     * an existing profile is left exactly as the organization configured it, so
     * assigning a role can never widen where someone may act.
     */
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (p_user_id, p_org_id, 'all', 'all')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    BEGIN
        INSERT INTO public.user_roles (user_id, org_id, role)
        VALUES (p_user_id, p_org_id, v_key)
        ON CONFLICT (user_id, org_id, role) DO NOTHING;
    EXCEPTION WHEN foreign_key_violation THEN
        -- The FK is (org_id, role) -> role_definitions(org_id, role_key), so a role
        -- belonging to another organization cannot be reached even by naming it.
        RAISE EXCEPTION 'unknown_role_key: % is not a role defined by this organization', v_key
            USING ERRCODE = '23503';
    END;
    GET DIAGNOSTICS v_ins = ROW_COUNT;

    IF v_ins = 0 THEN
        -- Already held. A truthful no-op writes no history: nothing about this
        -- person's access changed, and an event would claim otherwise.
        RETURN QUERY SELECT v_key, false;
        RETURN;
    END IF;

    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_after
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    INSERT INTO public.mutation_events (
        org_id, command_key, domain, subject_id, subject_type,
        previous_state, new_state, operator_id, origin, context_payload
    ) VALUES (
        p_org_id, 'access.user.role_assigned', 'access', p_user_id, 'membership',
        array_to_string(v_before, ','), array_to_string(v_after, ','),
        p_actor_user_id, COALESCE(p_origin, 'operator'),
        jsonb_build_object(
            'user_id', p_user_id,
            -- The OPERATION, not merely its outcome: this event describes one
            -- role being added, and the effective-access consequence is derived
            -- elsewhere rather than asserted here.
            'role_key', v_key,
            'before_roles', to_jsonb(v_before),
            'after_roles', to_jsonb(v_after),
            'assignment_semantics', 'w17_assigns_one_role',
            'correlation_id', p_correlation_id
        )
    );

    RETURN QUERY SELECT v_key, true;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- REMOVE ONE ROLE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_member_role_audited(
    p_org_id uuid,
    p_user_id uuid,
    p_role_key text,
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS TABLE (removed_role_key text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_key    text;
    v_before text[];
    v_after  text[];
    v_del    integer;
BEGIN
    IF p_org_id IS NULL OR p_user_id IS NULL OR p_role_key IS NULL OR btrim(p_role_key) = '' THEN
        RAISE EXCEPTION 'remove_member_role_audited: p_org_id, p_user_id and p_role_key are required'
            USING ERRCODE = '22023';
    END IF;
    v_key := btrim(p_role_key);

    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_before
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    DELETE FROM public.user_roles
     WHERE user_id = p_user_id AND org_id = p_org_id AND role = v_key;
    GET DIAGNOSTICS v_del = ROW_COUNT;

    IF v_del = 0 THEN
        -- Not held. Nothing changed, so nothing is recorded.
        RETURN QUERY SELECT v_key, false;
        RETURN;
    END IF;

    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_after
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    /*
     * REMOVING THE LAST ROLE IS NOT REMOVING THE PERSON. `user_access_profiles`
     * has no foreign key to `user_roles`, so the membership and its configured
     * scope survive an empty role set; the principal simply resolves to no
     * capabilities and portal admission fails for want of `portal.access`.
     * Ending a membership remains its own, separately audited action.
     */
    INSERT INTO public.mutation_events (
        org_id, command_key, domain, subject_id, subject_type,
        previous_state, new_state, operator_id, origin, context_payload
    ) VALUES (
        p_org_id, 'access.user.role_removed', 'access', p_user_id, 'membership',
        array_to_string(v_before, ','), array_to_string(v_after, ','),
        p_actor_user_id, COALESCE(p_origin, 'operator'),
        jsonb_build_object(
            'user_id', p_user_id,
            'role_key', v_key,
            'before_roles', to_jsonb(v_before),
            'after_roles', to_jsonb(v_after),
            'assignment_semantics', 'w17_removes_one_role',
            'left_without_roles', (array_length(v_after, 1) IS NULL),
            'correlation_id', p_correlation_id
        )
    );

    RETURN QUERY SELECT v_key, true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.assign_member_role_audited(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_member_role_audited(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_member_role_audited(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_member_role_audited(uuid, uuid, text, text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — the migration proves its own semantics before it is allowed to land.
--
-- In a tenant of its own, for the reason `20260911230000` recorded: a self-test
-- that borrows the real tenant writes access history about people who were never
-- changed. The `mutation_events` rows this leaves are NOT cleaned up and cannot
-- be -- the append-only trigger is the point -- so they are written about a
-- throwaway organization that no operator reads.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
    v_org     uuid := gen_random_uuid();
    v_user    uuid := gen_random_uuid();
    v_roles   text[];
    v_changed boolean;
    v_events  integer;
    v_actorless boolean := false;
BEGIN
    /*
     * THE EMPTY STRINGS ARE NOT DECORATION.
     *
     * GoTrue scans these columns into non-nullable strings, so a row inserted straight into
     * `auth.users` with NULLs in them makes `auth.admin.listUsers` fail with "Database error finding
     * users" — for every caller on the stack, not just this tenant. A certification fixture looking
     * an operator up by email is exactly such a caller, and it broke on this.
     */
    INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
        v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '_w17@selftest.invalid',
        '', '', '', '', ''
    );
    INSERT INTO public.orgs (id, name, slug) VALUES (v_org, 'W-17 self-test', '_w17_selftest_' || substr(v_org::text, 1, 8));
    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_active)
    VALUES (v_org, '_w17_a', 'A', true), (v_org, '_w17_b', 'B', true);

    -- 1. Assign two roles: the second must not discard the first.
    PERFORM public.assign_member_role_audited(v_org, v_user, '_w17_a', 'w17-selftest', 'system', null);
    PERFORM public.assign_member_role_audited(v_org, v_user, '_w17_b', 'w17-selftest', 'system', null);
    SELECT array_agg(role ORDER BY role) INTO v_roles FROM public.user_roles WHERE user_id = v_user AND org_id = v_org;
    IF v_roles IS DISTINCT FROM ARRAY['_w17_a', '_w17_b'] THEN
        RAISE EXCEPTION 'W-17 ABORT: assigning a second role did not compose; observed %', v_roles;
    END IF;

    -- 2. Assigning a role already held is a no-op that writes no history.
    SELECT changed INTO v_changed FROM public.assign_member_role_audited(v_org, v_user, '_w17_b', 'w17-selftest', 'system', null);
    IF v_changed THEN
        RAISE EXCEPTION 'W-17 ABORT: re-assigning a held role reported a change.';
    END IF;
    SELECT count(*) INTO v_events FROM public.mutation_events
     WHERE org_id = v_org AND command_key = 'access.user.role_assigned';
    IF v_events <> 2 THEN
        RAISE EXCEPTION 'W-17 ABORT: expected 2 assignment events, found %.', v_events;
    END IF;

    -- 3. Removal is targeted: the unrelated role survives.
    PERFORM public.remove_member_role_audited(v_org, v_user, '_w17_a', 'w17-selftest', 'system', null);
    SELECT array_agg(role ORDER BY role) INTO v_roles FROM public.user_roles WHERE user_id = v_user AND org_id = v_org;
    IF v_roles IS DISTINCT FROM ARRAY['_w17_b'] THEN
        RAISE EXCEPTION 'W-17 ABORT: targeted removal did not leave the other role; observed %', v_roles;
    END IF;

    -- 4. Removing a role not held changes nothing and records nothing.
    SELECT changed INTO v_changed FROM public.remove_member_role_audited(v_org, v_user, '_w17_a', 'w17-selftest', 'system', null);
    IF v_changed THEN
        RAISE EXCEPTION 'W-17 ABORT: removing an unheld role reported a change.';
    END IF;

    -- 5. Removing the last role leaves the membership's scope behind.
    PERFORM public.remove_member_role_audited(v_org, v_user, '_w17_b', 'w17-selftest', 'system', null);
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'W-17 ABORT: the last role was not removed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'W-17 ABORT: removing the last role destroyed the membership profile.';
    END IF;

    -- 6. An access change still cannot happen without naming its actor.
    BEGIN
        PERFORM public.assign_member_role_audited(v_org, v_user, '_w17_a', null, 'system', null);
    EXCEPTION WHEN check_violation THEN
        v_actorless := true;
    END;
    IF NOT v_actorless THEN
        RAISE EXCEPTION 'W-17 ABORT: an assignment was accepted without an actor.';
    END IF;

    /*
     * The principal goes; the `mutation_events` rows stay, because the append-only trigger is the
     * point and they are truthful records. Leaving a synthetic auth row behind is a liability to
     * every other caller on a shared stack, and it buys nothing.
     */
    DELETE FROM public.user_access_profiles WHERE org_id = v_org;
    DELETE FROM auth.users WHERE id = v_user;

    RAISE NOTICE 'W-17: assignment composes, removal is targeted, no-ops are silent, and scope outlives the last role.';
END
$selftest$;
