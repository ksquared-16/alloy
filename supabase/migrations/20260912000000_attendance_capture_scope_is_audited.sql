-- =============================================================================
-- Attendance capture scope joins the audited access owner
-- =============================================================================
-- Thread 8 made `user_access_profiles.attendance_capture_scope` configurable. The
-- first implementation wrote it directly from the route, which D2 correctly
-- refuses: an access table written outside an audited transaction owner is an
-- access change with no event, and that is the whole defect class D2 closed.
--
-- Capture scope IS access. It decides whose attendance a person may record, and
-- widening it from `assigned` to `site` is exactly the kind of authority change
-- the mutation log exists to carry.
--
-- So this widens the existing owner rather than adding a second one. A parallel
-- `..._capture_audited` function would be a second door to the same row, which is
-- what `20260911220000` dropped the narrow overloads to prevent.
--
-- NULL means UNCHANGED, not `site`. A caller written before this parameter
-- existed must not silently narrow a teacher who was set to `assigned` out of
-- band, and `site` is the permissive value — defaulting to it would be a silent
-- widening on every unrelated scope edit.
--
-- Additive and idempotent. The narrow form is dropped in the same statement
-- block so PostgREST never sees two candidates it cannot disambiguate.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_member_access_scope_audited(
    p_org_id uuid,
    p_user_id uuid,
    p_department_scope text,
    p_department_ids uuid[],
    p_site_scope text,
    p_site_location_ids uuid[],
    p_actor_user_id text DEFAULT NULL,
    p_origin text DEFAULT 'operator',
    p_correlation_id text DEFAULT NULL,
    p_attendance_capture_scope text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_before_dept text;
    v_before_site text;
    v_before_capture text;
    v_after_capture text;
    v_before_dept_ids uuid[];
    v_before_site_ids uuid[];
    v_before text;
    v_after text;
BEGIN
    IF p_attendance_capture_scope IS NOT NULL
       AND p_attendance_capture_scope NOT IN ('site', 'assigned') THEN
        RAISE EXCEPTION 'attendance_capture_scope must be site or assigned'
            USING ERRCODE = '23514';
    END IF;

    SELECT p.department_scope, p.site_scope, p.attendance_capture_scope
      INTO v_before_dept, v_before_site, v_before_capture
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

    -- Unchanged means the stored value survives. For a row that does not exist
    -- yet the column default ('site') applies, which is the same answer the
    -- schema would have given anyway.
    v_after_capture := COALESCE(p_attendance_capture_scope, v_before_capture, 'site');

    INSERT INTO public.user_access_profiles (
        user_id, org_id, department_scope, site_scope, attendance_capture_scope
    )
    VALUES (p_user_id, p_org_id, p_department_scope, p_site_scope, v_after_capture)
    ON CONFLICT (user_id, org_id) DO UPDATE
      SET department_scope = EXCLUDED.department_scope,
          site_scope = EXCLUDED.site_scope,
          attendance_capture_scope = EXCLUDED.attendance_capture_scope;

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

    -- Capture scope is part of the compared state, so changing ONLY it still
    -- raises an event. A change that produces no event is the thing D2 forbids.
    v_before := 'dept=' || COALESCE(v_before_dept, 'none')
             || CASE WHEN v_before_dept = 'restricted'
                     THEN ':' || array_to_string(v_before_dept_ids, ',') ELSE '' END
             || ';site=' || COALESCE(v_before_site, 'none')
             || CASE WHEN v_before_site = 'restricted'
                     THEN ':' || array_to_string(v_before_site_ids, ',') ELSE '' END
             || ';capture=' || COALESCE(v_before_capture, 'none');
    v_after := 'dept=' || p_department_scope
            || CASE WHEN p_department_scope = 'restricted'
                    THEN ':' || array_to_string((SELECT array_agg(d ORDER BY d) FROM unnest(COALESCE(p_department_ids, ARRAY[]::uuid[])) AS d), ',') ELSE '' END
            || ';site=' || p_site_scope
            || CASE WHEN p_site_scope = 'restricted'
                    THEN ':' || array_to_string((SELECT array_agg(l ORDER BY l) FROM unnest(COALESCE(p_site_location_ids, ARRAY[]::uuid[])) AS l), ',') ELSE '' END
            || ';capture=' || v_after_capture;

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
                'before_attendance_capture_scope', v_before_capture,
                'after_attendance_capture_scope', v_after_capture,
                'correlation_id', p_correlation_id
            )
        );
    END IF;
END;
$fn$;

-- The narrow form must go, or PostgREST sees two candidates and refuses the call
-- it cannot disambiguate — the failure `20260911220000` already had to repair.
DROP FUNCTION IF EXISTS public.replace_member_access_scope_audited(
    uuid, uuid, text, uuid[], text, uuid[], text, text, text
);

REVOKE ALL ON FUNCTION public.replace_member_access_scope_audited(
    uuid, uuid, text, uuid[], text, uuid[], text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_member_access_scope_audited(
    uuid, uuid, text, uuid[], text, uuid[], text, text, text, text
) TO service_role, postgres;

DO $assert$
BEGIN
    IF to_regprocedure(
        'public.replace_member_access_scope_audited(uuid, uuid, text, uuid[], text, uuid[], text, text, text, text)'
    ) IS NULL THEN
        RAISE EXCEPTION 'the widened access scope owner was not created';
    END IF;
    IF to_regprocedure(
        'public.replace_member_access_scope_audited(uuid, uuid, text, uuid[], text, uuid[], text, text, text)'
    ) IS NOT NULL THEN
        RAISE EXCEPTION 'the narrow access scope owner survived and is an ambiguous overload';
    END IF;
END
$assert$;
