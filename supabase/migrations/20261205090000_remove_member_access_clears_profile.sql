-- ACCESS REMOVAL INTEGRITY — ending membership clears the access profile.
--
-- Incident (qar_17c26a706ca7 / bp_v2): governed close called remove_member_access_audited,
-- which deleted every user_roles row and wrote access.user.removed, but left
-- user_access_profiles (and therefore cascaded junctions) behind. BP census v2
-- bp_qr_pool_access treats a role-less residual profile as pool residue — re-granting
-- any role would re-activate that stored scope without an explicit scope write.
--
-- Contract:
--   - remove_member_access_audited ends the (user, org) membership: roles AND profile.
--   - user_site_access / user_department_access cascade from the profile (FK ON DELETE CASCADE).
--   - Audit history still records before_roles and before_* scope ids (D2); mutation_events stay.
--   - remove_member_role_audited is unchanged: removing one role (even the last) leaves the
--     profile; ending membership remains this separately audited action (W-17).
--   - Idempotent: a retry with no roles and no profile is a silent no-op; a retry that finds
--     only a residual profile deletes it without writing a second access.user.removed event.
--
-- Order: delete roles first, then the profile. The deferred membership↔profile invariant
-- (20261126090000) refuses deleting a profile while roles remain.

CREATE OR REPLACE FUNCTION public.remove_member_access_audited(
    p_org_id uuid,
    p_user_id uuid,
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_before text[];
    v_dept_scope text;
    v_site_scope text;
    v_dept_ids uuid[];
    v_site_ids uuid[];
    v_removed integer;
    v_had_profile boolean := false;
BEGIN
    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_before
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    SELECT p.department_scope, p.site_scope
      INTO v_dept_scope, v_site_scope
      FROM public.user_access_profiles p
     WHERE p.user_id = p_user_id AND p.org_id = p_org_id;
    v_had_profile := FOUND;

    -- Read BEFORE the deletes: junctions cascade from the profile.
    SELECT COALESCE(array_agg(d.department_id ORDER BY d.department_id), ARRAY[]::uuid[])
      INTO v_dept_ids
      FROM public.user_department_access d
     WHERE d.user_id = p_user_id AND d.org_id = p_org_id;

    SELECT COALESCE(array_agg(s.location_id ORDER BY s.location_id), ARRAY[]::uuid[])
      INTO v_site_ids
      FROM public.user_site_access s
     WHERE s.user_id = p_user_id AND s.org_id = p_org_id;

    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    -- Membership end clears the profile. Junctions follow via ON DELETE CASCADE.
    DELETE FROM public.user_access_profiles
    WHERE user_id = p_user_id AND org_id = p_org_id;

    -- History only when roles were actually removed. A residual-profile cleanup (roles already
    -- gone) must not invent a second access.user.removed event.
    IF v_removed > 0 THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.mutation_events (
            org_id, command_key, domain, subject_id, subject_type,
            previous_state, new_state, operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.user.removed', 'access', p_user_id, 'membership',
            array_to_string(v_before, ','), '',
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'user_id', p_user_id,
                'before_roles', to_jsonb(v_before),
                'before_department_scope', v_dept_scope,
                'before_site_scope', v_site_scope,
                'before_department_ids', to_jsonb(v_dept_ids),
                'before_site_location_ids', to_jsonb(v_site_ids),
                'access_profile_removed', v_had_profile,
                -- The Person survives; only the organization membership ended.
                'person_deleted', false,
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    RETURN v_removed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.remove_member_access_audited(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_member_access_audited(uuid, uuid, text, text, text) TO service_role, postgres;

COMMENT ON FUNCTION public.remove_member_access_audited(uuid, uuid, text, text, text) IS
    'Ends (user, org) membership: deletes user_roles and user_access_profiles (junctions cascade). '
    'Records access.user.removed with prior roles and scope ids when roles were removed. '
    'Idempotent; residual profile-only cleanup writes no second event.';

DO $assert$
DECLARE
    v_count int;
    v_def text;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'remove_member_access_audited';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: public.remove_member_access_audited has % overloads.', v_count;
    END IF;

    v_def := pg_get_functiondef('public.remove_member_access_audited(uuid, uuid, text, text, text)'::regprocedure);
    IF strpos(v_def, 'DELETE FROM public.user_access_profiles') = 0 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: removal would leave user_access_profiles behind.';
    END IF;
    IF strpos(v_def, 'before_site_location_ids') = 0 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: removal history would not record which locations the member held.';
    END IF;
END
$assert$;

-- Self-test on a throwaway org/user. mutation_events stay (append-only); auth user is removed.
DO $selftest$
DECLARE
    v_org uuid := gen_random_uuid();
    v_user uuid := gen_random_uuid();
    v_loc uuid := gen_random_uuid();
    v_dept uuid := gen_random_uuid();
    v_removed integer;
    v_events integer;
    v_actorless boolean := false;
BEGIN
    INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
        v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '_access_removal@selftest.invalid', '', '', '', '', ''
    );
    INSERT INTO public.orgs (id, name, slug)
    VALUES (v_org, 'Access-removal self-test', '_access_rm_' || substr(v_org::text, 1, 8));

    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_active)
    VALUES (v_org, '_rm_role', 'Removal self-test role', true);

    INSERT INTO public.departments (id, org_id, key, name)
    VALUES (v_dept, v_org, '_rm_dept', 'Removal self-test dept');

    INSERT INTO public.locations (id, org_id, label, location_type)
    VALUES (v_loc, v_org, '_rm_site', 'site');

    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (v_user, v_org, 'restricted', 'restricted');
    INSERT INTO public.user_department_access (user_id, org_id, department_id)
    VALUES (v_user, v_org, v_dept);
    INSERT INTO public.user_site_access (user_id, org_id, location_id)
    VALUES (v_user, v_org, v_loc);
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (v_user, v_org, '_rm_role');

    -- 1. Full removal clears roles, profile, and junctions; writes one audit event.
    v_removed := public.remove_member_access_audited(
        v_org, v_user, 'access-removal-selftest', 'system', 'selftest-remove-1'
    );
    IF v_removed <> 1 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: expected 1 role removed, got %.', v_removed;
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: roles survived membership end.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: access profile survived membership end.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_site_access WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: site scope survived membership end.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_department_access WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: department scope survived membership end.';
    END IF;
    SELECT count(*) INTO v_events FROM public.mutation_events
     WHERE org_id = v_org AND command_key = 'access.user.removed'
       AND context_payload->>'correlation_id' = 'selftest-remove-1';
    IF v_events <> 1 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: expected 1 removal event, found %.', v_events;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.mutation_events
         WHERE org_id = v_org AND command_key = 'access.user.removed'
           AND context_payload->>'correlation_id' = 'selftest-remove-1'
           AND (context_payload->'before_site_location_ids') ? v_loc::text
           AND (context_payload->>'access_profile_removed') = 'true'
    ) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: audit did not preserve prior site scope / profile flag.';
    END IF;

    -- 2. Clean retry is a silent no-op (no second event).
    SELECT count(*) INTO v_events FROM public.mutation_events
     WHERE org_id = v_org AND command_key = 'access.user.removed';
    v_removed := public.remove_member_access_audited(
        v_org, v_user, 'access-removal-selftest', 'system', 'selftest-remove-2'
    );
    IF v_removed <> 0 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: clean retry reported removals (%).', v_removed;
    END IF;
    IF (SELECT count(*) FROM public.mutation_events
         WHERE org_id = v_org AND command_key = 'access.user.removed') <> v_events THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: clean retry wrote a second removal event.';
    END IF;

    -- 3. Residual profile (roles already gone) cannot survive a retry.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (v_user, v_org, 'all', 'all');
    IF NOT EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: failed to seed residual profile.';
    END IF;
    SELECT count(*) INTO v_events FROM public.mutation_events
     WHERE org_id = v_org AND command_key = 'access.user.removed';
    v_removed := public.remove_member_access_audited(
        v_org, v_user, 'access-removal-selftest', 'system', 'selftest-residual'
    );
    IF v_removed <> 0 THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: residual cleanup must not invent role removals (%).', v_removed;
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: residual role-less profile survived complete removal.';
    END IF;
    IF (SELECT count(*) FROM public.mutation_events
         WHERE org_id = v_org AND command_key = 'access.user.removed') <> v_events THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: residual cleanup must not write a second removal event.';
    END IF;

    -- 4. Actor still required when roles are actually removed.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (v_user, v_org, 'all', 'all');
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user, v_org, '_rm_role');
    BEGIN
        PERFORM public.remove_member_access_audited(v_org, v_user, null, 'system', 'selftest-actorless');
    EXCEPTION WHEN check_violation THEN
        v_actorless := true;
    END;
    IF NOT v_actorless THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: removal accepted without an actor.';
    END IF;
    -- Actorless attempt must not have partially cleared the membership.
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND org_id = v_org)
       OR NOT EXISTS (SELECT 1 FROM public.user_access_profiles WHERE user_id = v_user AND org_id = v_org) THEN
        RAISE EXCEPTION 'ACCESS REMOVAL ABORT: actorless attempt left a partial removal.';
    END IF;

    DELETE FROM public.user_roles WHERE org_id = v_org;
    DELETE FROM public.user_access_profiles WHERE org_id = v_org;
    DELETE FROM public.user_site_access WHERE org_id = v_org;
    DELETE FROM public.user_department_access WHERE org_id = v_org;
    DELETE FROM public.locations WHERE org_id = v_org;
    DELETE FROM public.departments WHERE org_id = v_org;
    -- orgs insert seeds default RBAC; clear grants before role_definitions.
    DELETE FROM public.role_permission_grants WHERE org_id = v_org;
    DELETE FROM public.role_definitions WHERE org_id = v_org;
    DELETE FROM public.orgs WHERE id = v_org;
    DELETE FROM auth.users WHERE id = v_user;

    RAISE NOTICE 'ACCESS REMOVAL: membership end clears profile+scope; residual profile cannot survive; audit preserved; idempotent.';
END
$selftest$;
