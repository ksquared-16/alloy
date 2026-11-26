-- ===========================================================================
-- W-18 — THE DELEGATION CEILING.
--
-- Access administration could hand out authority its holder did not have. The existing
-- self-elevation ban compares the actor to the TARGET USER, which protects every user-targeted
-- route and none of this one, because the subject of a grants change is a ROLE. An actor holding
-- only `portal.access` and `settings.users_roles` could add `fin.post` to a role they held and
-- leave able to post money. Reproduced against this function before this migration existed.
--
-- The rule is a subset rule on the DELTA: what the actor introduces must be within what the actor
-- holds, unioned across every role they hold. Keeping a pre-existing capability they lack is not
-- delegation; removing one is not escalation. Both stay allowed.
--
-- Enforced HERE because this function is the single writer: the HTTP grants route calls it, and
-- `save_role_definition_and_grants` calls it rather than reimplementing the grants half, so role
-- editing and role creation inherit the ceiling without a second copy of the rule.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.replace_role_permission_grants(
    p_org_id uuid,
    p_role_key text,
    p_permission_keys text[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS TABLE (granted_permission_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_keys text[] := COALESCE(p_permission_keys, ARRAY[]::text[]);
    v_invalid text[];
    v_role_id uuid;
    v_before text[];
    v_after text[];
    v_added text[];
    v_removed text[];
    v_beyond text[];
BEGIN
    SELECT id INTO v_role_id
    FROM public.role_definitions
    WHERE org_id = p_org_id AND role_key = p_role_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown_role_key:%', p_role_key USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_invalid
    FROM unnest(v_keys) AS k
    WHERE NOT EXISTS (
        SELECT 1 FROM public.permission_definitions pd
        WHERE pd.key = k AND pd.is_active
    );

    IF v_invalid IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_permission_keys:%', array_to_string(v_invalid, ',') USING ERRCODE = '22023';
    END IF;

    -- ── THE LOCKOUT REFUSAL, BEFORE ANYTHING IS WRITTEN ──────────────────────
    --
    -- Checked here rather than after the replace so the refusal costs nothing and so the message
    -- describes an intention rather than a state that briefly existed.
    IF p_actor_user_id IS NOT NULL
       AND NOT ('settings.users_roles' = ANY (v_keys))
       AND EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.org_id = p_org_id
              AND ur.user_id::text = p_actor_user_id
              AND ur.role = p_role_key
       )
       AND EXISTS (
           -- They have it TODAY through this role: otherwise there is nothing to lose here.
           SELECT 1 FROM public.role_permission_grants g
            WHERE g.org_id = p_org_id AND g.role_key = p_role_key
              AND g.permission_key = 'settings.users_roles' AND g.allowed
       )
       AND NOT EXISTS (
           -- And no OTHER role they hold would still carry it afterwards.
           SELECT 1
             FROM public.user_roles ur
             JOIN public.role_permission_grants g
               ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
            WHERE ur.org_id = p_org_id
              AND ur.user_id::text = p_actor_user_id
              AND ur.role <> p_role_key
              AND g.permission_key = 'settings.users_roles'
       )
    THEN
        RAISE EXCEPTION
            'self_authority_lockout: removing access administration from %, the only role granting it to you, would leave nobody able to undo it',
            p_role_key
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(array_agg(g.permission_key ORDER BY g.permission_key), ARRAY[]::text[])
      INTO v_before
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed;

    -- ── W-18: THE DELEGATION CEILING ────────────────────────────────────────
    --
    -- An actor may not use access administration to hand out authority they do not themselves hold.
    --
    -- THE HOLE THIS CLOSES. `isSelfAuthorityMutation` compares the actor to the TARGET USER, so it
    -- protects the user-targeted routes and cannot see this one: the subject here is a ROLE KEY. An
    -- actor holding nothing but `portal.access` and `settings.users_roles` could therefore add
    -- `fin.post` to a role they themselves hold and walk away able to post money. That was
    -- reproduced against this function before the check existed.
    --
    -- IT OPERATES ON THE DELTA, NOT THE FINAL SET. Requiring `after ⊆ actor` would mean an
    -- administrator could not touch a role richer than themselves without first stripping it, which
    -- turns a safety rule into an accidental destruction rule. What must be bounded is what the
    -- actor INTRODUCES:
    --
    --     ADDED = proposed - existing        must satisfy    ADDED ⊆ actor effective authority
    --
    -- so a pre-existing capability the actor lacks may be kept (it is not being delegated) and may
    -- be removed (reduction is not escalation).
    --
    -- AUTHORITY IS THE UNION ACROSS EVERY ROLE THE ACTOR HOLDS, because W-17 made multi-role real.
    -- Reading one membership row, or the role that happens to carry access administration, would
    -- refuse delegations the actor is genuinely entitled to make.
    --
    -- A NULL ACTOR IS NOT A SYSTEM BYPASS. It cannot reach a write that changes anything: the
    -- audit_actor_required check below already refuses an unattributed change. Canonical bootstrap
    -- (`seed_default_rbac`) does not come through this function at all — it inserts grants directly
    -- — so trusted provisioning needs no exception here, and none is offered.
    IF p_actor_user_id IS NOT NULL AND btrim(p_actor_user_id) <> '' THEN
        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
          INTO v_beyond
          FROM unnest(v_keys) AS k
         WHERE NOT (k = ANY (v_before))
           AND NOT EXISTS (
               SELECT 1
                 FROM public.user_roles ur
                 JOIN public.role_permission_grants g
                   ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
                WHERE ur.org_id = p_org_id
                  AND ur.user_id::text = p_actor_user_id
                  AND g.permission_key = k
           );

        IF array_length(v_beyond, 1) IS NOT NULL THEN
            RAISE EXCEPTION
                'delegation_ceiling:%', array_to_string(v_beyond, ',')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.role_permission_grants g
    WHERE g.org_id = p_org_id
      AND g.role_key = p_role_key
      AND NOT (g.permission_key = ANY (v_keys));

    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    SELECT p_org_id, p_role_key, k, true
    FROM unnest(v_keys) AS k
    ON CONFLICT (org_id, role_key, permission_key) DO UPDATE SET allowed = true;

    SELECT COALESCE(array_agg(g.permission_key ORDER BY g.permission_key), ARRAY[]::text[])
      INTO v_after
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed;

    IF v_before IS DISTINCT FROM v_after THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_added
          FROM unnest(v_after) AS k WHERE NOT (k = ANY (v_before));
        SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_removed
          FROM unnest(v_before) AS k WHERE NOT (k = ANY (v_after));

        INSERT INTO public.mutation_events (
            org_id, command_key, domain,
            subject_id, subject_type,
            previous_state, new_state,
            operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.role.grants_changed', 'access',
            v_role_id, 'role',
            array_to_string(v_before, ','), array_to_string(v_after, ','),
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'role_key', p_role_key,
                'before', to_jsonb(v_before),
                'after', to_jsonb(v_after),
                'added', to_jsonb(v_added),
                'removed', to_jsonb(v_removed),
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    RETURN QUERY
    SELECT g.permission_key
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed
     ORDER BY g.permission_key;
END;
$fn$;

ALTER FUNCTION public.replace_role_permission_grants(uuid, text, text[], text, text, text) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- Prove the refusal AND the three shapes it must NOT block, then roll it all back.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_org uuid := gen_random_uuid();
    -- `user_roles.user_id` is foreign-keyed, so the self-test borrows an existing principal rather
    -- than inventing one. Which principal is irrelevant: the rule reads the actor's grants IN THIS
    -- throwaway organization, where it has exactly the roles this block gives it.
    v_actor uuid;
    v_blocked boolean := false;
BEGIN
    SELECT id INTO v_actor FROM auth.users LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE NOTICE 'W-18 self-test skipped: no principal exists to borrow in this database';
        RETURN;
    END IF;

    INSERT INTO public.orgs (id, name, slug) VALUES (v_org, 'W18 ceiling', 'w18-ceiling-' || v_org);
    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
    VALUES (v_org, 'w18_actor', 'Actor', false, true), (v_org, 'w18_other', 'Other', false, true);
    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    VALUES (v_org, 'w18_actor', 'settings.users_roles', true),
           (v_org, 'w18_actor', 'portal.access', true),
           (v_org, 'w18_other', 'fin.post', true);
    INSERT INTO public.user_roles (org_id, user_id, role) VALUES (v_org, v_actor, 'w18_actor');

    -- 1. REFUSED: introducing a capability the actor does not hold.
    BEGIN
        PERFORM public.replace_role_permission_grants(
            v_org, 'w18_actor', ARRAY['portal.access','settings.users_roles','fin.post'],
            v_actor::text, 'operator', 'w18-selftest');
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'W-18 self-test: an actor introduced a capability it does not hold';
    END IF;

    -- 2. ALLOWED: the actor gains it through a SECOND role, then delegates it.
    INSERT INTO public.user_roles (org_id, user_id, role) VALUES (v_org, v_actor, 'w18_other');
    PERFORM public.replace_role_permission_grants(
        v_org, 'w18_actor', ARRAY['portal.access','settings.users_roles','fin.post'],
        v_actor::text, 'operator', 'w18-selftest');
    IF NOT EXISTS (SELECT 1 FROM public.role_permission_grants
                    WHERE org_id = v_org AND role_key = 'w18_actor'
                      AND permission_key = 'fin.post' AND allowed) THEN
        RAISE EXCEPTION 'W-18 self-test: multi-role union did not permit a delegation the actor holds';
    END IF;

    -- 3. ALLOWED: removing a capability. Reduction is not escalation, so it stays open even after
    --    the actor loses the supplying role.
    DELETE FROM public.user_roles WHERE org_id = v_org AND user_id = v_actor AND role = 'w18_other';
    PERFORM public.replace_role_permission_grants(
        v_org, 'w18_actor', ARRAY['portal.access','settings.users_roles'],
        v_actor::text, 'operator', 'w18-selftest');
    IF EXISTS (SELECT 1 FROM public.role_permission_grants
                WHERE org_id = v_org AND role_key = 'w18_actor'
                  AND permission_key = 'fin.post' AND allowed) THEN
        RAISE EXCEPTION 'W-18 self-test: an actor could not revoke authority it does not hold';
    END IF;

    -- 4. ALLOWED: a pre-existing capability the actor lacks is PRESERVED while editing another.
    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
    VALUES (v_org, 'w18_other', 'settings.users_roles', true);
    PERFORM public.replace_role_permission_grants(
        v_org, 'w18_other', ARRAY['fin.post','settings.users_roles','portal.access'],
        v_actor::text, 'operator', 'w18-selftest');
    IF NOT EXISTS (SELECT 1 FROM public.role_permission_grants
                    WHERE org_id = v_org AND role_key = 'w18_other'
                      AND permission_key = 'fin.post' AND allowed) THEN
        RAISE EXCEPTION 'W-18 self-test: editing a role stripped a pre-existing capability the actor lacks';
    END IF;

    RAISE EXCEPTION 'w18_selftest_rollback';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM <> 'w18_selftest_rollback' THEN RAISE; END IF;
END;
$assert$;
