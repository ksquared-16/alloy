-- D2 — AN ADMINISTRATOR COULD LOCK THE WHOLE ORGANIZATION OUT OF ACCESS ADMINISTRATION.
--
-- Found the hard way, on the certification tenant. A D2 certification spec addressed the seeded
-- `admin` role with `permission_keys: ["fin.read"]`, and because the organization comes from the
-- session rather than from the request — correctly — the write landed on the CALLER's own org. The
-- `admin` role went from 68 capabilities to 1, `settings.users_roles` among the 67 removed, and every
-- administrator in that organization instantly lost the authority to undo it. There is no product
-- path back: the screen that repairs role grants is the screen the removed capability gates.
--
-- `W-2` already states the invariant — *a principal cannot modify its own authority* — and the routes
-- enforce it for MEMBERSHIP: nobody may change which roles they themselves hold. It was never
-- enforced one layer up, on the capabilities a role carries, which is the same authority reached by a
-- different door.
--
-- ── WHY HERE AND NOT IN THE ROUTES ──
--
-- Two routes replace grants today and a third could arrive tomorrow. `replace_role_permission_grants`
-- is the one transaction owner every one of them goes through — the same reason the audit is written
-- here rather than beside each caller — and it already knows who the actor is, because D2 made naming
-- the actor a precondition of changing access.
--
-- ── WHY IT REFUSES ONLY THE LOCKOUT ──
--
-- An organization may legitimately take access administration away from a role. What it may not do is
-- take it from the role the person doing it is standing on, when that is their last source of it. So
-- the check is: the actor holds THIS role, the new set drops the capability, and no OTHER role they
-- hold still carries it. An administrator with a second qualifying role is unaffected, and so is
-- every edit to a role the actor does not hold.
--
-- A non-uuid actor — a fixture, a provisioning script, a migration — matches no `user_roles` row and
-- is therefore never refused. That is correct: those actors are not principals who can be locked out.

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
-- Exercise the refusal AND the two cases it must not touch, then roll it all back.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_org uuid := '00000000-0000-4000-8000-0000fedcba96';
    v_user uuid := '00000000-0000-4000-8000-0000fedcba95';
    v_outcome text;
    v_locked text := 'not-refused';
    v_other_ok text := 'not-run';
    v_second_ok text := 'not-run';
BEGIN
    BEGIN
        -- A membership needs a principal: `user_roles.user_id` references `auth.users`. Created and
        -- discarded with everything else in this block, because the guard's whole question is about
        -- somebody who actually holds the role.
        INSERT INTO auth.users (id, instance_id, aud, role, email)
        VALUES (v_user, '00000000-0000-0000-0000-000000000000'::uuid,
                'authenticated', 'authenticated', '_d2_lockout@selftest.invalid');
        INSERT INTO public.orgs (id, name, slug) VALUES (v_org, 'D2 lockout self-test', '_d2_lockout_selftest');
        INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
        VALUES (v_org, '_d2_admin', 'Admin', false, true),
               (v_org, '_d2_second', 'Second', false, true),
               (v_org, '_d2_unheld', 'Unheld', false, true);
        INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
        VALUES (v_org, '_d2_admin', 'settings.users_roles', true),
               (v_org, '_d2_unheld', 'settings.users_roles', true);
        INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user, v_org, '_d2_admin');

        -- 1. The lockout: their only source, removed by themselves.
        BEGIN
            PERFORM public.replace_role_permission_grants(
                v_org, '_d2_admin', ARRAY[]::text[], v_user::text, 'operator', '_d2_lockout');
        EXCEPTION WHEN check_violation THEN
            v_locked := 'refused';
        END;

        -- 2. A role they do NOT hold is none of the guard's business.
        PERFORM public.replace_role_permission_grants(
            v_org, '_d2_unheld', ARRAY[]::text[], v_user::text, 'operator', '_d2_unheld');
        v_other_ok := 'allowed';

        -- 3. With a SECOND role that still carries it, they are not locked out and must not be refused.
        INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
        VALUES (v_org, '_d2_second', 'settings.users_roles', true);
        INSERT INTO public.user_roles (user_id, org_id, role) VALUES (v_user, v_org, '_d2_second');
        PERFORM public.replace_role_permission_grants(
            v_org, '_d2_admin', ARRAY[]::text[], v_user::text, 'operator', '_d2_second_source');
        v_second_ok := 'allowed';

        RAISE EXCEPTION 'D2SELFTEST lockout=% unheld=% second=%', v_locked, v_other_ok, v_second_ok;
    EXCEPTION WHEN raise_exception THEN
        v_outcome := SQLERRM;
    END;

    IF v_outcome IS DISTINCT FROM 'D2SELFTEST lockout=refused unheld=allowed second=allowed' THEN
        RAISE EXCEPTION
            'D2 ABORT: the lockout guard must refuse exactly the lockout and nothing else; observed "%".',
            v_outcome;
    END IF;

    RAISE NOTICE 'D2: an administrator cannot remove access administration from their own last role.';
END
$assert$;

DO $overload$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'replace_role_permission_grants';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'D2 ABORT: public.replace_role_permission_grants has % overloads.', v_count;
    END IF;
END
$overload$;
