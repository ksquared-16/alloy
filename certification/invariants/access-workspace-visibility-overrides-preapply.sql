-- Access V3 S5 — workspace visibility overrides: PRE-APPLY invariant (rollback-only).
--
-- For `database.run_rollback_invariant_test` against an ISOLATED certification environment built from the target
-- branch tip, BEFORE `database.apply_migration`. The runner wraps this file in a transaction and rolls it back, so
-- nothing persists. Not for the shared stack, staging or production.
--
-- CASE 0 proves the store is absent and unrecorded, then runs migration 20261222110000 verbatim TWICE (a re-run is a
-- no-op: a failed apply does not roll back DDL, so the file must be safely re-runnable). CASES 1-10 then prove the
-- approved disposition (erun2_710f8569c9515f09) against the schema it creates. Keep the two embedded copies
-- byte-identical to supabase/migrations/20261222110000_access_workspace_visibility_overrides.sql; the companion
-- post-apply invariant is access-workspace-visibility-overrides.sql (same cases, against the applied schema).

-- CASE 0 — absent before: neither the objects nor a ledger row exist yet.
DO $absent$
BEGIN
    IF to_regclass('public.workspace_visibility_overrides') IS NOT NULL
       OR to_regprocedure('public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text)') IS NOT NULL
       OR to_regprocedure('public.clear_workspace_visibility_override(uuid, uuid, text, text, text)') IS NOT NULL THEN
        RAISE EXCEPTION 'CASE 0 FAILED: the store already exists here — this is not a pre-apply environment';
    END IF;
    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261222110000') THEN
        RAISE EXCEPTION 'CASE 0 FAILED: ledger already records 20261222110000';
    END IF;
END
$absent$;

-- ── migration 20261222110000, first run ──────────────────────────────────────────────────────────────────────────────
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

-- ── migration 20261222110000, second run (must be a no-op that still passes its own self-test) ─────────────────────
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

-- ── The cases ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Disposable subjects only: two orgs and two auth users created here and discarded with the transaction. Every
-- refusal has a control — the same operation with only the defect removed succeeds — so a refusal cannot pass by
-- broken setup. Refused statements run in their own sub-block; the role and any partial effect revert with it.
DO $wvo$
DECLARE
    o1 uuid := gen_random_uuid();
    o2 uuid := gen_random_uuid();
    u1 uuid := gen_random_uuid();
    u2 uuid := gen_random_uuid();
    v_changed boolean;
    v_keys text[];
    v_n integer;
    v_ev record;
    v_fks text[];
    passed integer := 0;
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES
        (o1, 'ZZ wvo A', 'zz-wvo-a-' || left(o1::text, 8)),
        (o2, 'ZZ wvo B', 'zz-wvo-b-' || left(o2::text, 8));
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                            confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at)
    VALUES
        (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'wvo-u1-' || left(u1::text, 8) || '@example.invalid', '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now()),
        (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'wvo-u2-' || left(u2::text, 8) || '@example.invalid', '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now());

    -- CASE 1 — first save: the row, and exactly one audit event in the workspace_visibility domain.
    SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox', 'operations'], u1::text, 'operator', 'wvo-c1');
    IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 1 FAILED: first save reported changed=%', v_changed; END IF;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1;
    IF v_keys IS DISTINCT FROM ARRAY['inbox', 'operations']::text[] THEN RAISE EXCEPTION 'CASE 1 FAILED: stored keys %', v_keys; END IF;
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CASE 1 FAILED: % events for the first save (want 1)', v_n; END IF;
    SELECT * INTO v_ev FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_ev.command_key IS DISTINCT FROM 'workspace_visibility.override_set' OR v_ev.domain IS DISTINCT FROM 'workspace_visibility'
       OR v_ev.subject_id IS DISTINCT FROM u1 OR v_ev.subject_type IS DISTINCT FROM 'workspace_visibility_override'
       OR v_ev.previous_state IS NOT NULL OR v_ev.new_state IS DISTINCT FROM 'inbox,operations'
       OR v_ev.operator_id IS DISTINCT FROM u1::text OR v_ev.origin IS DISTINCT FROM 'operator'
       OR v_ev.context_payload->>'presentation_only' IS DISTINCT FROM 'true'
       OR v_ev.context_payload->'before_hidden_surface_keys' IS DISTINCT FROM '[]'::jsonb
       OR v_ev.context_payload->'after_hidden_surface_keys' IS DISTINCT FROM '["inbox","operations"]'::jsonb
       OR v_ev.context_payload->>'correlation_id' IS DISTINCT FROM 'wvo-c1' THEN
        RAISE EXCEPTION 'CASE 1 FAILED: audit event shape %', row_to_json(v_ev);
    END IF;
    passed := passed + 1;

    -- CASE 2 — saving the same keys again is a truthful no-op: changed=false, no event.
    SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox', 'operations'], u1::text);
    IF v_changed IS DISTINCT FROM false THEN RAISE EXCEPTION 'CASE 2 FAILED: no-op save reported changed=%', v_changed; END IF;
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CASE 2 FAILED: no-op save wrote an event (% events)', v_n; END IF;
    passed := passed + 1;

    -- CASE 3 — a real change writes one more event, carrying the previous keys.
    SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox'], u1::text);
    IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 3 FAILED: change reported changed=%', v_changed; END IF;
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'CASE 3 FAILED: % events after a change (want 2)', v_n; END IF;
    IF EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility' AND previous_state = 'inbox,operations' AND new_state = 'inbox'
                  AND command_key = 'workspace_visibility.override_set') IS NOT TRUE THEN
        RAISE EXCEPTION 'CASE 3 FAILED: no event recording inbox,operations -> inbox';
    END IF;
    passed := passed + 1;

    -- CASE 4 — one row per (org, user): other principals are separate rows, and a write touches only its own.
    PERFORM public.set_workspace_visibility_override(o1, u2, ARRAY['tasks'], u2::text);
    PERFORM public.set_workspace_visibility_override(o2, u1, ARRAY['analytics'], u1::text);
    SELECT count(*) INTO v_n FROM public.workspace_visibility_overrides WHERE org_id IN (o1, o2);
    IF v_n IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'CASE 4 FAILED: % rows for three principals', v_n; END IF;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1;
    IF v_keys IS DISTINCT FROM ARRAY['inbox']::text[] THEN RAISE EXCEPTION 'CASE 4 FAILED: another principal''s save changed u1/o1 to %', v_keys; END IF;
    passed := passed + 1;

    -- CASE 5 — clear: row gone, one override_cleared event; clearing again is a no-op; other principals untouched.
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    SELECT changed INTO v_changed FROM public.clear_workspace_visibility_override(o1, u1, u1::text);
    IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 5 FAILED: clear reported changed=%', v_changed; END IF;
    IF EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1) THEN
        RAISE EXCEPTION 'CASE 5 FAILED: row survived clear';
    END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n + 1
       OR NOT EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility' AND subject_id = u1
                         AND command_key = 'workspace_visibility.override_cleared' AND domain = 'workspace_visibility'
                         AND previous_state = 'inbox' AND new_state = '' AND operator_id = u1::text) THEN
        RAISE EXCEPTION 'CASE 5 FAILED: clear did not write exactly one override_cleared event';
    END IF;
    SELECT changed INTO v_changed FROM public.clear_workspace_visibility_override(o1, u1, u1::text);
    IF v_changed IS DISTINCT FROM false THEN RAISE EXCEPTION 'CASE 5 FAILED: second clear reported changed=%', v_changed; END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n + 1 THEN
        RAISE EXCEPTION 'CASE 5 FAILED: clearing an absent override wrote an event';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u2)
       OR NOT EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o2 AND user_id = u1) THEN
        RAISE EXCEPTION 'CASE 5 FAILED: clear removed another principal''s row';
    END IF;
    passed := passed + 1;

    -- CASE 6 — refused inputs change nothing (no row, no event). Control: CASE 1's valid call succeeded.
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY[]::text[], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: empty keys accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, NULL, u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: null keys accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox'], NULL);
          RAISE EXCEPTION 'CASE 6 FAILED: null actor accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox'], '  ');
          RAISE EXCEPTION 'CASE 6 FAILED: blank actor accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.clear_workspace_visibility_override(o1, u2, NULL);
          RAISE EXCEPTION 'CASE 6 FAILED: clear without actor accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(NULL, u1, ARRAY['inbox'], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: null org accepted';
    EXCEPTION WHEN null_value_not_allowed THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY[''], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: empty key string accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox', NULL], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: null key element accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    IF EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1) THEN
        RAISE EXCEPTION 'CASE 6 FAILED: a refused call left a row';
    END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n THEN
        RAISE EXCEPTION 'CASE 6 FAILED: a refused call wrote an event';
    END IF;
    passed := passed + 1;

    -- CASE 7 — API roles hold nothing: anon and authenticated (even as the row's own user) can neither read nor
    -- write the table nor call either function.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    BEGIN SET LOCAL ROLE authenticated; PERFORM count(*) FROM public.workspace_visibility_overrides WHERE user_id = u2;
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated read its own row';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; INSERT INTO public.workspace_visibility_overrides (org_id, user_id, hidden_surface_keys, updated_by) VALUES (o2, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated inserted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; UPDATE public.workspace_visibility_overrides SET hidden_surface_keys = ARRAY['inbox'] WHERE user_id = u2;
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated updated';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; DELETE FROM public.workspace_visibility_overrides WHERE user_id = u2;
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated deleted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; PERFORM public.set_workspace_visibility_override(o1, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated called set';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; PERFORM public.clear_workspace_visibility_override(o1, u2, u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated called clear';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE anon; PERFORM count(*) FROM public.workspace_visibility_overrides;
          RAISE EXCEPTION 'CASE 7 FAILED: anon read';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE anon; PERFORM public.set_workspace_visibility_override(o1, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: anon called set';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE anon; PERFORM public.clear_workspace_visibility_override(o1, u2, u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: anon called clear';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u2;
    IF v_keys IS DISTINCT FROM ARRAY['tasks']::text[] THEN RAISE EXCEPTION 'CASE 7 FAILED: API-role attempts changed u2/o1 to %', v_keys; END IF;
    passed := passed + 1;

    -- CASE 8 — service_role reads (control), but cannot write the table directly (no audit bypass).
    BEGIN SET LOCAL ROLE service_role; SELECT count(*) INTO v_n FROM public.workspace_visibility_overrides WHERE org_id = o1;
          IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CASE 8 FAILED: service_role read % rows for o1 (want 1)', v_n; END IF;
          RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'control ok';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; INSERT INTO public.workspace_visibility_overrides (org_id, user_id, hidden_surface_keys, updated_by) VALUES (o2, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 8 FAILED: service_role inserted directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; UPDATE public.workspace_visibility_overrides SET hidden_surface_keys = ARRAY['inbox'] WHERE org_id = o1;
          RAISE EXCEPTION 'CASE 8 FAILED: service_role updated directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; DELETE FROM public.workspace_visibility_overrides WHERE org_id = o1;
          RAISE EXCEPTION 'CASE 8 FAILED: service_role deleted directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o2, u2, ARRAY['inbox'], u2::text);
          IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 8 FAILED: service_role set reported changed=%', v_changed; END IF;
          RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'control ok';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; END;
    passed := passed + 1;

    -- CASE 9 — SCHEMA: the only references are the org and the auth user (nothing ties a row to a membership), RLS
    -- is on with no policy, and nothing in CASES 1-8 wrote an `access` event. CASE 10 proves retention by behaviour.
    SELECT array_agg(c.confrelid::regclass::text ORDER BY c.confrelid::regclass::text) INTO v_fks
      FROM pg_constraint c WHERE c.conrelid = 'public.workspace_visibility_overrides'::regclass AND c.contype = 'f';
    IF v_fks IS DISTINCT FROM ARRAY['auth.users', 'orgs']::text[] THEN RAISE EXCEPTION 'CASE 9 FAILED: foreign keys %', v_fks; END IF;
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workspace_visibility_overrides'::regclass) IS NOT TRUE
       OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspace_visibility_overrides') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: RLS off or a policy exists';
    END IF;
    IF EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id IN (o1, o2) AND (domain = 'access' OR command_key LIKE 'access.%')) THEN
        RAISE EXCEPTION 'CASE 9 FAILED: an access-domain event was written (Access History would read it)';
    END IF;
    passed := passed + 1;

    -- CASE 10 — BEHAVIOUR: a member who loses access through the real removal path keeps their preference.
    -- u2 is made a member of o1 (profile + a role with no grants — the money-capable trigger passes a grantless role;
    -- the profile-required constraint is deferred to a COMMIT this rollback-only run never reaches), then removed by
    -- public.remove_member_access_audited. Controls: the membership and profile are really gone and the removal wrote
    -- its own access.user.removed event — so a surviving override cannot pass because nothing was removed.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope) VALUES (u2, o1, 'all', 'all');
    INSERT INTO public.user_roles (user_id, role, org_id) VALUES (u2, 'zz_wvo_member', o1);
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF public.remove_member_access_audited(o1, u2, u1::text, 'operator', 'wvo-c10') IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'CASE 10 FAILED: removal did not remove exactly one role';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE org_id = o1 AND user_id = u2)
       OR EXISTS (SELECT 1 FROM public.user_access_profiles WHERE org_id = o1 AND user_id = u2) THEN
        RAISE EXCEPTION 'CASE 10 FAILED (control): membership or profile survived removal';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = o1 AND subject_id = u2
                      AND command_key = 'access.user.removed' AND domain = 'access') THEN
        RAISE EXCEPTION 'CASE 10 FAILED (control): removal wrote no access.user.removed event';
    END IF;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u2;
    IF v_keys IS DISTINCT FROM ARRAY['tasks']::text[] THEN
        RAISE EXCEPTION 'CASE 10 FAILED: the preference did not survive loss of access (now %)', v_keys;
    END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n THEN
        RAISE EXCEPTION 'CASE 10 FAILED: removal wrote a workspace_visibility event';
    END IF;
    passed := passed + 1;

    RAISE NOTICE 'PASS access workspace visibility overrides: first save + one audit, no-op writes nothing, change carries previous keys, one row per principal, clear + idempotent clear, refused inputs inert, API roles hold nothing, service_role read-only on the table, schema references only org/auth user, retained through real access removal, own audit domain';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END
$wvo$;
