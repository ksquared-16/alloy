-- ===========================================================================
-- W-18, THE OTHER HALF: ROLE ASSIGNMENT IS ALSO DELEGATION.
--
-- `20260915130000` bounded the grant editor: the capabilities ADDED to a role
-- must be ones the actor already holds. That closed escalation through
-- CAPABILITY -> ROLE and left ROLE -> USER wide open.
--
-- Measured on promoted truth before this migration: an actor holding three
-- capabilities (admin.users.read, admin.users.write, portal.access) assigned the
-- seeded `admin` role to two different principals and conferred EIGHTY
-- capabilities it did not itself possess — once through
-- `assign_member_role_audited`, once through
-- `create_membership_with_access_profile`, which asks for no actor at all.
--
-- A ceiling on one of the two ways to confer authority is not a ceiling. This
-- migration applies the SAME delta rule to membership:
--
--     GAINED = effective(target after) - effective(target before)
--     GAINED must be a subset of effective(actor)
--
-- WHY THE DELTA AND NOT THE PACKAGE. Requiring the whole role to be within the
-- actor's authority would refuse an administrator moving a colleague between two
-- roles the colleague already out-ranks them in. Preservation is not delegation
-- and reduction is not escalation, so only what the target NEWLY gains is
-- measured — exactly the rule W-18 applies to grants.
--
-- WHAT IS DELIBERATELY NOT BOUNDED. Removal. `remove_member_role_audited` and
-- `remove_member_access_audited` only ever reduce a principal's authority, and an
-- administrator who may manage someone must be able to take a role away even when
-- that role carried capabilities the administrator never had. Making reduction
-- require the authority being reduced would strand every over-provisioned user.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. ONE DEFINITION OF EFFECTIVE AUTHORITY.
--
--    It must agree with the runtime resolver, or the ceiling would bound
--    something other than what the product actually enforces.
--    `resolveAdminAccessCore` reads `user_roles` joined to allowed
--    `role_permission_grants` and filters on NEITHER `role_definitions.is_active`
--    NOR `permission_definitions.is_active`; W-18's own ceiling reads the same
--    shape. This reproduces it exactly rather than improving on it — a stricter
--    definition here would refuse delegations the actor can genuinely perform.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.effective_capability_keys(p_org_id uuid, p_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT COALESCE(array_agg(DISTINCT g.permission_key), ARRAY[]::text[])
      FROM public.user_roles ur
      JOIN public.role_permission_grants g
        ON g.org_id = ur.org_id AND g.role_key = ur.role AND g.allowed
     WHERE ur.org_id = p_org_id
       AND ur.user_id = p_user_id;
$fn$;

COMMENT ON FUNCTION public.effective_capability_keys(uuid, uuid) IS
'Effective capability union for a principal in one organization. The single definition the assignment ceiling measures against; mirrors resolveAdminAccessCore.';

-- The same union for a PROPOSED role set, which has no membership rows yet.
CREATE OR REPLACE FUNCTION public.capability_keys_of_roles(p_org_id uuid, p_role_keys text[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
    SELECT COALESCE(array_agg(DISTINCT g.permission_key), ARRAY[]::text[])
      FROM public.role_permission_grants g
     WHERE g.org_id = p_org_id
       AND g.allowed
       AND g.role_key = ANY (COALESCE(p_role_keys, ARRAY[]::text[]));
$fn$;

-- ---------------------------------------------------------------------------
-- 2. THE CEILING ITSELF, in one place so three writers cannot drift apart.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_assignment_delegation_ceiling(
    p_org_id         uuid,
    p_actor_user_id  text,
    p_target_user_id uuid,
    p_next_role_keys text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_before text[];
    v_after  text[];
    v_gained text[];
    v_actor  text[];
BEGIN
    -- An unattributed call is not bounded here. Each caller decides whether an
    -- unattributed change is legitimate at all; where it is not, the caller
    -- refuses it with `audit_actor_required` before reaching this function.
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RETURN;
    END IF;

    v_before := public.effective_capability_keys(p_org_id, p_target_user_id);
    v_after  := public.capability_keys_of_roles(p_org_id, p_next_role_keys);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_gained
      FROM unnest(v_after) AS k
     WHERE NOT (k = ANY (v_before));

    -- Nothing newly conferred: a lateral move, a reduction, or a no-op. The
    -- actor's own authority is irrelevant to a change that grants nobody
    -- anything, and consulting it would produce false refusals.
    IF array_length(v_gained, 1) IS NULL THEN
        RETURN;
    END IF;

    v_actor := public.effective_capability_keys(p_org_id, p_actor_user_id::uuid);

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
      INTO v_gained
      FROM unnest(v_gained) AS k
     WHERE NOT (k = ANY (v_actor));

    IF array_length(v_gained, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'assignment_ceiling:%', array_to_string(v_gained, ',')
            USING ERRCODE = '42501';
    END IF;
END;
$fn$;

COMMENT ON FUNCTION public.assert_assignment_delegation_ceiling(uuid, text, uuid, text[]) IS
'W-18 role-assignment ceiling: capabilities a membership change NEWLY confers must be held by the actor. Raises assignment_ceiling:<keys> (42501).';

-- ---------------------------------------------------------------------------
-- 3. THE THREE WRITERS THAT CAN INCREASE AUTHORITY.
--
--    Re-created from their installed definitions with one PERFORM inserted, so
--    every behaviour these functions already certify -- the no-op that writes no
--    history, the FK refusal that names the organization, the scope profile that
--    is created but never edited -- survives unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_member_role_audited(p_org_id uuid, p_user_id uuid, p_role_key text, p_actor_user_id text DEFAULT NULL::text, p_origin text DEFAULT 'operator'::text, p_correlation_id text DEFAULT NULL::text)
 RETURNS TABLE(assigned_role_key text, changed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     * THE ASSIGNMENT CEILING. Adding this role to the set they already hold, what
     * would this principal NEWLY be able to do — and may the actor confer it?
     *
     * Computed against the set including `v_key`, so a role whose capabilities the
     * target already has through another role gains nothing and is permitted
     * regardless of the actor's own package. Refused before the membership row is
     * written, so a denial leaves no partial state and writes no event.
     */
    PERFORM public.assert_assignment_delegation_ceiling(
        p_org_id, p_actor_user_id, p_user_id, v_before || ARRAY[v_key]);

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
$function$;

CREATE OR REPLACE FUNCTION public.replace_membership_with_access_profile(p_user_id uuid, p_org_id uuid, p_role text, p_actor_user_id text DEFAULT NULL::text, p_origin text DEFAULT 'operator'::text, p_correlation_id text DEFAULT NULL::text)
 RETURNS user_roles
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_row public.user_roles;
    v_existing integer;
    v_before text[];
    v_after text[];
BEGIN
    IF p_user_id IS NULL OR p_org_id IS NULL OR p_role IS NULL OR btrim(p_role) = '' THEN
        RAISE EXCEPTION 'replace_membership_with_access_profile: p_user_id, p_org_id and p_role are required'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_existing
    FROM public.user_roles
    WHERE user_id = p_user_id AND org_id = p_org_id;

    IF v_existing = 0 THEN
        RAISE EXCEPTION 'replace_membership_with_access_profile: no membership for (%, %)', p_user_id, p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- The whole old set, read before the delete that discards it.
    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_before
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (p_user_id, p_org_id, 'all', 'all')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    /*
     * THE ASSIGNMENT CEILING, on the replacement path. The whole set becomes
     * `p_role`, so the delta is measured from the target's current effective union
     * to that single role's. A replacement that REDUCES authority gains nothing and
     * is always permitted; one that raises the target past the actor is refused
     * here, before the delete that would otherwise have already discarded the old
     * set.
     */
    PERFORM public.assert_assignment_delegation_ceiling(
        p_org_id, p_actor_user_id, p_user_id, ARRAY[btrim(p_role)]);

    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND org_id = p_org_id;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (p_user_id, p_org_id, btrim(p_role))
    RETURNING * INTO v_row;

    v_after := ARRAY[btrim(p_role)];

    IF v_before IS DISTINCT FROM v_after THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.mutation_events (
            org_id, command_key, domain, subject_id, subject_type,
            previous_state, new_state, operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.user.roles_changed', 'access', p_user_id, 'membership',
            array_to_string(v_before, ','), array_to_string(v_after, ','),
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'user_id', p_user_id,
                'before_roles', to_jsonb(v_before),
                'after_roles', to_jsonb(v_after),
                -- W-17 is visible rather than implied: the roles this submit discarded.
                'discarded_roles', to_jsonb(
                    COALESCE((SELECT array_agg(r ORDER BY r) FROM unnest(v_before) AS r
                               WHERE NOT (r = ANY (v_after))), ARRAY[]::text[])),
                'replacement_semantics', 'w17_replaces_role_set',
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    RETURN v_row;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. CREATION WITH AN INITIAL ROLE — the path that asked for no actor.
--
--    `create_membership_with_access_profile(uuid,uuid,text)` had no actor
--    parameter, so there was nothing to bound it against: "create a user, hand
--    them the admin role" conferred eighty capabilities with no ceiling and no
--    audit actor. Protecting only the assign route would have left this as the
--    bypass, which is why the ceiling lands at the transaction owner rather than
--    in a handler.
--
--    BOOTSTRAP IS RECOGNISED STRUCTURALLY, NEVER ASSERTED BY THE CALLER. An
--    unattributed creation is accepted only when the organization has no
--    membership at all — the genuine first-member case that
--    `createOrgAndAssignAdmin` performs immediately after inserting the org. Every
--    later creation must name an actor and is bounded. A caller cannot select its
--    way into the exemption by passing a flag, an origin or a NULL: once one
--    member exists, the condition is false for everyone forever.
--
--    The old three-argument form is dropped rather than left beside this one. A
--    surviving unbounded overload is not a compatibility measure, it is the hole.
--    Both deploy orders fail CLOSED: old code against the new signature, or new
--    code against the old, raises rather than silently skipping the ceiling.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_membership_with_access_profile(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.create_membership_with_access_profile(
    p_user_id       uuid,
    p_org_id        uuid,
    p_role          text,
    p_actor_user_id text DEFAULT NULL
) RETURNS public.user_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
    v_row public.user_roles;
BEGIN
    IF p_user_id IS NULL OR p_org_id IS NULL OR p_role IS NULL OR btrim(p_role) = '' THEN
        RAISE EXCEPTION 'create_membership_with_access_profile: p_user_id, p_org_id and p_role are required'
            USING ERRCODE = '22023';
    END IF;

    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.org_id = p_org_id) THEN
            RAISE EXCEPTION 'audit_actor_required: creating a member in an established organization must name the actor that did it'
                USING ERRCODE = '23514';
        END IF;
    ELSE
        PERFORM public.assert_assignment_delegation_ceiling(
            p_org_id, p_actor_user_id, p_user_id, ARRAY[btrim(p_role)]);
    END IF;

    -- Profile first: the membership row is the thing whose absence is safe.
    -- If this fails the whole call aborts and no membership is left behind.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (p_user_id, p_org_id, 'all', 'all')
    ON CONFLICT (user_id, org_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (p_user_id, p_org_id, btrim(p_role))
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. SELF-TEST. The exploit this migration exists to close, run against the
--    database being migrated, in a transaction that is rolled back.
--
--    A migration that installs a guard without demonstrating the guard bites is
--    a migration whose claim nobody has checked. This builds the measured
--    scenario -- an actor holding three capabilities, a role holding many -- and
--    asserts BOTH directions: the excessive assignment is refused, and a
--    delegation within the actor's own authority still succeeds. A ceiling that
--    refuses everything would pass a one-sided test and break the product.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_org    uuid := 'ce110000-0000-4000-8000-0000000ce110'::uuid;
    v_actor  uuid;
    v_target uuid;
    v_msg    text;
    v_refused boolean := false;
BEGIN
    SELECT id INTO v_actor  FROM auth.users ORDER BY created_at LIMIT 1;
    SELECT id INTO v_target FROM auth.users WHERE id <> v_actor ORDER BY created_at LIMIT 1;
    IF v_actor IS NULL OR v_target IS NULL THEN
        RAISE NOTICE 'assignment-ceiling self-test skipped: this database has fewer than two auth identities';
        RETURN;
    END IF;

    INSERT INTO public.orgs (id, name, slug, status)
    VALUES (v_org, 'Assignment Ceiling Self Test', 'assignment-ceiling-self-test', 'active');

    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active) VALUES
        (v_org, 'st_user_admin', 'Self Test User Admin', false, true),
        (v_org, 'st_powerful',   'Self Test Powerful',   false, true);
    INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed) VALUES
        (v_org, 'st_user_admin', 'admin.users.write', true),
        (v_org, 'st_user_admin', 'reports.read',      true),
        (v_org, 'st_powerful',   'fin.adjust',        true),
        (v_org, 'st_powerful',   'reports.read',      true);
    INSERT INTO public.user_roles (org_id, user_id, role) VALUES (v_org, v_actor, 'st_user_admin');

    -- (a) THE EXPLOIT. `st_powerful` newly confers `fin.adjust`, which the actor
    --     does not hold. It must be refused.
    BEGIN
        PERFORM public.assign_member_role_audited(
            v_org, v_target, 'st_powerful', v_actor::text, 'operator', 'selftest-excessive');
    EXCEPTION WHEN insufficient_privilege THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        v_refused := (v_msg = 'assignment_ceiling:fin.adjust');
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'ASSIGNMENT CEILING ABORT: an actor without fin.adjust was allowed to confer it by assigning a role. The ceiling is not binding.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_roles WHERE org_id = v_org AND user_id = v_target) THEN
        RAISE EXCEPTION 'ASSIGNMENT CEILING ABORT: the refusal left a membership row behind.';
    END IF;

    -- (b) NOT VACUOUS. A role conferring only what the actor holds must succeed,
    --     or the ceiling has made delegated user administration useless.
    PERFORM public.assign_member_role_audited(
        v_org, v_target, 'st_user_admin', v_actor::text, 'operator', 'selftest-permitted');
    IF NOT EXISTS (SELECT 1 FROM public.user_roles
                    WHERE org_id = v_org AND user_id = v_target AND role = 'st_user_admin') THEN
        RAISE EXCEPTION 'ASSIGNMENT CEILING ABORT: a delegation fully within the actor authority was refused.';
    END IF;

    RAISE NOTICE 'assignment-ceiling self-test passed: excessive assignment refused, permitted delegation allowed';
    RAISE EXCEPTION 'selftest_rollback';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'selftest_rollback' THEN
        RAISE NOTICE 'assignment-ceiling self-test rolled back cleanly';
    ELSE
        RAISE;
    END IF;
END;
$selftest$;
