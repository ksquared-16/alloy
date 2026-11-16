-- Access V3 S5 — own-user, hide-only workspace visibility overrides: the store.
--
-- Approved disposition (erun2_710f8569c9515f09):
--   * A PRIVATE presentation preference: one row per (org, user), holding only the workspace keys that
--     person asked not to see. It carries no permission key and grants, removes or feeds nothing — the
--     app applies it after role defaults, and only to hide a workspace the roles already show.
--   * Service-role-only. anon and authenticated hold no privilege on the table or the functions; there
--     is no RLS policy, so a direct client read or write of anyone's row (including one's own) is denied.
--     service_role may SELECT; it may NOT write the table directly — every change goes through
--     set_/clear_workspace_visibility_override, so no write can skip its audit event.
--   * Atomic audit: each function changes the row and writes its public.mutation_events row in the same
--     transaction. A change that changes nothing (same keys, or clearing an absent row) writes nothing.
--   * Audit domain `workspace_visibility`, deliberately NOT `access`: Access History reads the `access`
--     domain and would render a hide as "changed access for …", which is false.
--   * Retained when a member loses access: there is no reference to user_roles / user_access_profiles,
--     so removing someone's access leaves their preference in place (it hides only, and a person without
--     portal access never reaches it). Only deleting the org or the auth user removes it.
--
-- The set of valid workspace keys stays in application code (storage is trusted less than input; an
-- unknown stored key is ignored there), so the table checks shape only and retiring a key needs no
-- migration.
--
-- Re-runnable: every object is IF NOT EXISTS / CREATE OR REPLACE, and privileges are re-asserted.

CREATE TABLE IF NOT EXISTS public.workspace_visibility_overrides (
    org_id              uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hidden_surface_keys text[]      NOT NULL,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          text        NOT NULL,
    PRIMARY KEY (org_id, user_id),
    CONSTRAINT workspace_visibility_overrides_keys_shape CHECK (
        cardinality(hidden_surface_keys) BETWEEN 1 AND 32
        AND array_position(hidden_surface_keys, NULL) IS NULL
        AND array_position(hidden_surface_keys, '') IS NULL
    ),
    CONSTRAINT workspace_visibility_overrides_updated_by_present CHECK (char_length(btrim(updated_by)) > 0)
);

COMMENT ON TABLE public.workspace_visibility_overrides IS
    'Access V3 S5: one principal''s own hide-only workspace visibility preference. Presentation only — never a grant. service_role SELECT only; writes via set_/clear_workspace_visibility_override (audited, domain workspace_visibility).';

ALTER TABLE public.workspace_visibility_overrides ENABLE ROW LEVEL SECURITY;

-- Default privileges grant authenticated (and anon) table access on new public tables; take it back.
REVOKE ALL ON TABLE public.workspace_visibility_overrides FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.workspace_visibility_overrides TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- SET: replace one principal's hidden keys.
CREATE OR REPLACE FUNCTION public.set_workspace_visibility_override(
    p_org_id               uuid,
    p_user_id              uuid,
    p_hidden_surface_keys  text[],
    p_actor_user_id        text,
    p_origin               text DEFAULT 'operator',
    p_correlation_id       text DEFAULT NULL
)
RETURNS TABLE (changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_before text[];
BEGIN
    IF p_org_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'set_workspace_visibility_override: p_org_id and p_user_id are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_hidden_surface_keys IS NULL OR cardinality(p_hidden_surface_keys) = 0 THEN
        -- An empty override is no override: the caller clears instead.
        RAISE EXCEPTION 'set_workspace_visibility_override: hidden keys are required; clear an empty override'
            USING ERRCODE = '22023';
    END IF;
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RAISE EXCEPTION 'audit_actor_required: a workspace visibility change must name the actor that made it'
            USING ERRCODE = '23514';
    END IF;

    -- Serialise per principal so concurrent first saves cannot both record "before: none".
    PERFORM pg_advisory_xact_lock(hashtextextended('workspace_visibility_override:' || p_org_id::text || ':' || p_user_id::text, 0));

    SELECT o.hidden_surface_keys INTO v_before
      FROM public.workspace_visibility_overrides o
     WHERE o.org_id = p_org_id AND o.user_id = p_user_id;

    IF v_before IS NOT NULL AND v_before = p_hidden_surface_keys THEN
        -- Truthful no-op: nothing changed, so no history claims otherwise.
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    INSERT INTO public.workspace_visibility_overrides (org_id, user_id, hidden_surface_keys, updated_at, updated_by)
    VALUES (p_org_id, p_user_id, p_hidden_surface_keys, now(), p_actor_user_id)
    ON CONFLICT (org_id, user_id) DO UPDATE
        SET hidden_surface_keys = EXCLUDED.hidden_surface_keys,
            updated_at          = EXCLUDED.updated_at,
            updated_by          = EXCLUDED.updated_by;

    INSERT INTO public.mutation_events (
        org_id, command_key, domain, subject_id, subject_type,
        previous_state, new_state, operator_id, origin, context_payload
    ) VALUES (
        p_org_id, 'workspace_visibility.override_set', 'workspace_visibility', p_user_id, 'workspace_visibility_override',
        CASE WHEN v_before IS NULL THEN NULL ELSE array_to_string(v_before, ',') END,
        array_to_string(p_hidden_surface_keys, ','),
        p_actor_user_id, COALESCE(p_origin, 'operator'),
        jsonb_build_object(
            'user_id', p_user_id,
            'before_hidden_surface_keys', CASE WHEN v_before IS NULL THEN '[]'::jsonb ELSE to_jsonb(v_before) END,
            'after_hidden_surface_keys', to_jsonb(p_hidden_surface_keys),
            'presentation_only', true,
            'correlation_id', p_correlation_id
        )
    );

    RETURN QUERY SELECT true;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEAR: back to role defaults.
CREATE OR REPLACE FUNCTION public.clear_workspace_visibility_override(
    p_org_id          uuid,
    p_user_id         uuid,
    p_actor_user_id   text,
    p_origin          text DEFAULT 'operator',
    p_correlation_id  text DEFAULT NULL
)
RETURNS TABLE (changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_before text[];
BEGIN
    IF p_org_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'clear_workspace_visibility_override: p_org_id and p_user_id are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
        RAISE EXCEPTION 'audit_actor_required: a workspace visibility change must name the actor that made it'
            USING ERRCODE = '23514';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('workspace_visibility_override:' || p_org_id::text || ':' || p_user_id::text, 0));

    DELETE FROM public.workspace_visibility_overrides o
     WHERE o.org_id = p_org_id AND o.user_id = p_user_id
    RETURNING o.hidden_surface_keys INTO v_before;

    IF v_before IS NULL THEN
        -- Nothing was stored: a truthful no-op writes no history.
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    INSERT INTO public.mutation_events (
        org_id, command_key, domain, subject_id, subject_type,
        previous_state, new_state, operator_id, origin, context_payload
    ) VALUES (
        p_org_id, 'workspace_visibility.override_cleared', 'workspace_visibility', p_user_id, 'workspace_visibility_override',
        array_to_string(v_before, ','), '',
        p_actor_user_id, COALESCE(p_origin, 'operator'),
        jsonb_build_object(
            'user_id', p_user_id,
            'before_hidden_surface_keys', to_jsonb(v_before),
            'after_hidden_surface_keys', '[]'::jsonb,
            'presentation_only', true,
            'correlation_id', p_correlation_id
        )
    );

    RETURN QUERY SELECT true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_workspace_visibility_override(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_workspace_visibility_override(uuid, uuid, text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Self-test (catalog only — reads no rows, writes nothing).
DO $selftest$
BEGIN
    IF NOT (SELECT c.relrowsecurity FROM pg_class c
             WHERE c.oid = 'public.workspace_visibility_overrides'::regclass) THEN
        RAISE EXCEPTION 'S5 selftest: RLS is not enabled on workspace_visibility_overrides';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = 'workspace_visibility_overrides') THEN
        RAISE EXCEPTION 'S5 selftest: workspace_visibility_overrides must have no RLS policy';
    END IF;
    IF has_table_privilege('authenticated', 'public.workspace_visibility_overrides', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.workspace_visibility_overrides', 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'S5 selftest: anon/authenticated hold a privilege on workspace_visibility_overrides';
    END IF;
    IF has_table_privilege('service_role', 'public.workspace_visibility_overrides', 'INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'S5 selftest: service_role can write workspace_visibility_overrides directly (bypassing audit)';
    END IF;
    IF has_function_privilege('authenticated', 'public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.clear_workspace_visibility_override(uuid, uuid, text, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.clear_workspace_visibility_override(uuid, uuid, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'S5 selftest: anon/authenticated can execute a workspace visibility override function';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.clear_workspace_visibility_override(uuid, uuid, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'S5 selftest: service_role cannot execute the workspace visibility override functions';
    END IF;
END;
$selftest$;
