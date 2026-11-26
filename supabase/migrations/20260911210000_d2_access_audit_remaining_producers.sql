-- D2 — THE REMAINING FOUR ACCESS PRODUCERS.
--
-- 20260911200000 covered the two paths that already had a transaction owner. These four did not, in
-- three different ways, and the difference decides where each event goes:
--
--   * `users/[userId]/role` PATCH already calls `replace_membership_with_access_profile`, so the
--     event goes inside it — same as the grants spine.
--   * `rbac/roles` POST and `users/[userId]/remove` POST write from the ROUTE with a single
--     statement each. A single statement is atomic by itself but cannot be atomic WITH an event, so
--     each gets a transaction owner here.
--   * `users/[userId]/access-scope` PATCH performs FIVE writes from the route with no transaction at
--     all: upsert the profile, delete both allow-lists, insert both allow-lists. That was already a
--     partial-failure hazard before auditing entered the picture — a failed site insert could leave a
--     profile saying `restricted` with no rows to restrict to, which reads as deny-all. Giving it a
--     transaction owner is what makes its event honest, and repairs that as a side effect. The
--     VALIDATION stays in the route; only the writes move.
--
-- Every function keeps the actor contract established by the spine: an access change that names no
-- actor is refused rather than recorded as nobody, and a mutation that changes nothing writes no
-- event.

DO $preflight$
BEGIN
    IF to_regclass('public.mutation_events') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: public.mutation_events is absent.';
    END IF;
    IF to_regprocedure('public.replace_role_permission_grants(uuid, text, text[], text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: 20260911200000 (the audited grants producer) has not been applied; this composes on it.';
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. MEMBERSHIP ROLE SET — and the W-17 truth.
--
--    This function REPLACES the whole role set; it does not add to it. The event
--    says so: `previous_state` is the entire old set and `new_state` the entire
--    new one, so a submit that silently discarded two other roles is legible as
--    exactly that. W-17 is not solved here, and the audit is the thing that stops
--    it being invisible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_membership_with_access_profile(
    p_user_id uuid,
    p_org_id uuid,
    p_role text,
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS public.user_roles
LANGUAGE plpgsql
AS $$
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
$$;

-- ---------------------------------------------------------------------------
-- 2. ROLE CREATION, with its initial package as a CORRELATED event rather than
--    one event pretending to be two things.
--
--    A create that also configures capabilities produces `access.role.created`
--    and `access.role.grants_changed` sharing one correlation id. That is the
--    "one coherent event or correlated group" the instruction allows, and it
--    keeps the grants half from being reimplemented a second time.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_role_definition_audited(
    p_org_id uuid,
    p_role_key text,
    p_role_label text,
    p_permission_keys text[] DEFAULT ARRAY[]::text[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS public.role_definitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_row public.role_definitions;
BEGIN
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
    VALUES (p_org_id, p_role_key, p_role_label, false, true)
    RETURNING * INTO v_row;

    INSERT INTO public.mutation_events (
        org_id, command_key, domain, subject_id, subject_type,
        previous_state, new_state, operator_id, origin, context_payload
    ) VALUES (
        p_org_id, 'access.role.created', 'access', v_row.id, 'role',
        NULL, p_role_label || ' · active',
        p_actor_user_id, p_origin,
        jsonb_build_object('role_key', p_role_key, 'correlation_id', p_correlation_id)
    );

    IF COALESCE(array_length(p_permission_keys, 1), 0) > 0 THEN
        PERFORM public.replace_role_permission_grants(
            p_org_id, p_role_key, p_permission_keys,
            p_actor_user_id, p_origin, p_correlation_id
        );
    END IF;

    RETURN v_row;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. MEMBERSHIP REMOVAL — the revocation that must not read as an absence.
--
--    The Person is NOT deleted; the organization membership is. The event says
--    which roles were held and what scope applied, because "the whole purpose of
--    the audit is to preserve the historical fact that access used to exist and
--    was intentionally removed". A row recording only "removed" would lose the
--    thing worth keeping.
-- ---------------------------------------------------------------------------

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
    v_removed integer;
BEGIN
    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_before
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    SELECT p.department_scope, p.site_scope
      INTO v_dept_scope, v_site_scope
      FROM public.user_access_profiles p
     WHERE p.user_id = p_user_id AND p.org_id = p_org_id;

    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    -- Removing access nobody had is truthful as a no-op, not as history.
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
                -- The Person survives; only the organization membership ended.
                'person_deleted', false,
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    RETURN v_removed;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. ACCESS SCOPE — five writes that were never one.
--
--    The route performed profile upsert, two deletes and two inserts as separate
--    round trips. A failure between them could leave `site_scope = restricted`
--    with no allow-list rows, which the resolver reads as deny-all: an operator
--    intending to widen access could narrow it to nothing. Auditing this path
--    required a transaction owner, and the transaction owner fixes that too.
--
--    Validation stays in the route — it owns the org checks and the empty
--    allow-list refusal, and duplicating those here would be a second answer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_member_access_scope_audited(
    p_org_id uuid,
    p_user_id uuid,
    p_department_scope text,
    p_department_ids uuid[],
    p_site_scope text,
    p_site_location_ids uuid[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_before_dept text;
    v_before_site text;
    v_before_dept_ids uuid[];
    v_before_site_ids uuid[];
    v_before text;
    v_after text;
BEGIN
    SELECT p.department_scope, p.site_scope INTO v_before_dept, v_before_site
      FROM public.user_access_profiles p
     WHERE p.user_id = p_user_id AND p.org_id = p_org_id
     FOR UPDATE;

    SELECT COALESCE(array_agg(d.department_id ORDER BY d.department_id), ARRAY[]::uuid[])
      INTO v_before_dept_ids
      FROM public.user_department_access d
     WHERE d.user_id = p_user_id AND d.org_id = p_org_id;

    SELECT COALESCE(array_agg(s.location_id ORDER BY s.location_id), ARRAY[]::uuid[])
      INTO v_before_site_ids
      FROM public.user_site_access s
     WHERE s.user_id = p_user_id AND s.org_id = p_org_id;

    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (p_user_id, p_org_id, p_department_scope, p_site_scope)
    ON CONFLICT (user_id, org_id) DO UPDATE
      SET department_scope = EXCLUDED.department_scope,
          site_scope = EXCLUDED.site_scope;

    DELETE FROM public.user_department_access WHERE user_id = p_user_id AND org_id = p_org_id;
    DELETE FROM public.user_site_access WHERE user_id = p_user_id AND org_id = p_org_id;

    IF p_department_scope = 'restricted' THEN
        INSERT INTO public.user_department_access (user_id, org_id, department_id)
        SELECT p_user_id, p_org_id, d FROM unnest(COALESCE(p_department_ids, ARRAY[]::uuid[])) AS d;
    END IF;

    IF p_site_scope = 'restricted' THEN
        INSERT INTO public.user_site_access (user_id, org_id, location_id)
        SELECT p_user_id, p_org_id, l FROM unnest(COALESCE(p_site_location_ids, ARRAY[]::uuid[])) AS l;
    END IF;

    -- Canonical ids, sorted so an unchanged scope compares equal regardless of
    -- the order the client sent them in.
    v_before := 'dept=' || COALESCE(v_before_dept, 'none')
             || CASE WHEN v_before_dept = 'restricted'
                     THEN ':' || array_to_string(v_before_dept_ids, ',') ELSE '' END
             || ';site=' || COALESCE(v_before_site, 'none')
             || CASE WHEN v_before_site = 'restricted'
                     THEN ':' || array_to_string(v_before_site_ids, ',') ELSE '' END;
    v_after := 'dept=' || p_department_scope
            || CASE WHEN p_department_scope = 'restricted'
                    THEN ':' || array_to_string((SELECT array_agg(d ORDER BY d) FROM unnest(COALESCE(p_department_ids, ARRAY[]::uuid[])) AS d), ',') ELSE '' END
            || ';site=' || p_site_scope
            || CASE WHEN p_site_scope = 'restricted'
                    THEN ':' || array_to_string((SELECT array_agg(l ORDER BY l) FROM unnest(COALESCE(p_site_location_ids, ARRAY[]::uuid[])) AS l), ',') ELSE '' END;

    IF v_before IS DISTINCT FROM v_after THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.mutation_events (
            org_id, command_key, domain, subject_id, subject_type,
            previous_state, new_state, operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.user.scope_changed', 'access', p_user_id, 'access_scope',
            v_before, v_after,
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'user_id', p_user_id,
                'before_department_ids', to_jsonb(v_before_dept_ids),
                'after_department_ids', to_jsonb(COALESCE(p_department_ids, ARRAY[]::uuid[])),
                'before_site_location_ids', to_jsonb(v_before_site_ids),
                'after_site_location_ids', to_jsonb(COALESCE(p_site_location_ids, ARRAY[]::uuid[])),
                'correlation_id', p_correlation_id
            )
        );
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_role_definition_audited(uuid, text, text, text[], text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_member_access_audited(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_member_access_scope_audited(uuid, uuid, text, uuid[], text, uuid[], text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_role_definition_audited(uuid, text, text, text[], text, text, text) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.remove_member_access_audited(uuid, uuid, text, text, text) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.replace_member_access_scope_audited(uuid, uuid, text, uuid[], text, uuid[], text, text, text) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 5. Assertions.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_fn text;
    v_missing text[] := ARRAY[]::text[];
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.replace_membership_with_access_profile(uuid, uuid, text, text, text, text)',
        'public.create_role_definition_audited(uuid, text, text, text[], text, text, text)',
        'public.remove_member_access_audited(uuid, uuid, text, text, text)',
        'public.replace_member_access_scope_audited(uuid, uuid, text, uuid[], text, uuid[], text, text, text)'
    ] LOOP
        IF to_regprocedure(v_fn) IS NULL THEN
            v_missing := v_missing || v_fn;
        ELSIF strpos(pg_get_functiondef(v_fn::regprocedure), 'mutation_events') = 0 THEN
            RAISE EXCEPTION 'D2 ABORT: % does not write mutation_events; its audit would not be atomic.', v_fn;
        ELSIF strpos(pg_get_functiondef(v_fn::regprocedure), 'audit_actor_required') = 0 THEN
            RAISE EXCEPTION 'D2 ABORT: % would record an access change with no actor.', v_fn;
        END IF;
    END LOOP;

    IF array_length(v_missing, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'D2 ABORT: producers not installed: %', array_to_string(v_missing, ', ');
    END IF;

    RAISE NOTICE 'D2: all six access mutation paths now have an audited transaction owner.';
END
$assert$;
