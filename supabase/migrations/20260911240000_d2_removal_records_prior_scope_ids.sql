-- D2 — A REMOVAL EVENT RECORDED THE SHAPE OF THE SCOPE BUT NOT THE SCOPE.
--
-- `remove_member_access_audited` stored `before_site_scope: "restricted"` and nothing more. That says
-- the person was limited to specific locations while discarding WHICH — so the one question the event
-- exists to answer after the membership is gone ("what did they have, so we can restore it or explain
-- it?") could not be answered from history.
--
-- The roles half was already complete: `before_roles` names every role held. The scope half was not,
-- and `replace_member_access_scope_audited` sets the standard by recording the location ids either
-- side of a change. Removal now meets the same standard.
--
-- Signature unchanged; this replaces the function rather than adding an overload.

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
BEGIN
    SELECT COALESCE(array_agg(ur.role ORDER BY ur.role), ARRAY[]::text[])
      INTO v_before
      FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.org_id = p_org_id;

    SELECT p.department_scope, p.site_scope
      INTO v_dept_scope, v_site_scope
      FROM public.user_access_profiles p
     WHERE p.user_id = p_user_id AND p.org_id = p_org_id;

    -- Read BEFORE the delete, because `user_site_access` cascades from the profile and a later read
    -- would find nothing to record.
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
                -- WHICH locations, not merely that there were some. Without these the event says a
                -- person was restricted and loses what they were restricted to.
                'before_department_ids', to_jsonb(v_dept_ids),
                'before_site_location_ids', to_jsonb(v_site_ids),
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

DO $assert$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'remove_member_access_audited';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'D2 ABORT: public.remove_member_access_audited has % overloads.', v_count;
    END IF;

    IF strpos(
        pg_get_functiondef('public.remove_member_access_audited(uuid, uuid, text, text, text)'::regprocedure),
        'before_site_location_ids'
    ) = 0 THEN
        RAISE EXCEPTION 'D2 ABORT: removal history would not record which locations the member held.';
    END IF;
END
$assert$;
