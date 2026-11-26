-- D2 — RENAMING A ROLE RAISED 22P02. THE AUDIT FIELD LIST WAS BUILT WITH AN AMBIGUOUS OPERATOR.
--
--   v_changed := v_changed || 'role_label';
--
-- reads as an array append and is not one. `'role_label'` is an UNTYPED literal, and PostgreSQL
-- resolves `anyarray || unknown` to `anyarray || anyarray` in preference to `anyarray || anyelement`
-- — so it tried to parse the field NAME as an array literal:
--
--   22P02  malformed array literal: "role_label"
--          Array value must start with "{" or dimension information.
--
-- The branch only runs when the label or the active flag ACTUALLY CHANGES, which is why nothing
-- caught it: every test and every probe either saved grants alone or passed `p_role_label => NULL`
-- ("not edited"), and both paths skip these two lines entirely. A save that renamed a role — the
-- ordinary operator act — failed outright, and the whole statement rolled back with it, so the rename
-- did not happen, the grants did not move and no event was written.
--
-- `array_append` says what was meant and cannot resolve to anything else.
--
-- Signature is UNCHANGED, so this replaces the function rather than adding an overload — the PGRST203
-- failure `20260911220000` exists to prevent. The assertion at the bottom re-checks that.

CREATE OR REPLACE FUNCTION public.save_role_definition_and_grants(
    p_org_id uuid,
    p_role_key text,
    p_role_label text,
    p_is_active boolean,
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
    v_role_id uuid;
    v_before_label text;
    v_before_active boolean;
    v_changed text[] := ARRAY[]::text[];
BEGIN
    SELECT id, role_label, is_active
      INTO v_role_id, v_before_label, v_before_active
      FROM public.role_definitions
     WHERE org_id = p_org_id AND role_key = p_role_key
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown_role_key:%', p_role_key USING ERRCODE = '23503';
    END IF;

    -- NULL means "not edited", so a submit that changes only the grid does not rewrite the label
    -- with whatever the page happened to be holding.
    UPDATE public.role_definitions
       SET role_label = COALESCE(p_role_label, role_label),
           is_active  = COALESCE(p_is_active, is_active),
           updated_at = now()
     WHERE org_id = p_org_id AND role_key = p_role_key;

    IF p_role_label IS NOT NULL AND p_role_label IS DISTINCT FROM v_before_label THEN
        v_changed := array_append(v_changed, 'role_label');
    END IF;
    IF p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM v_before_active THEN
        v_changed := array_append(v_changed, 'is_active');
    END IF;

    IF array_length(v_changed, 1) IS NOT NULL THEN
        IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
            RAISE EXCEPTION 'audit_actor_required: an access change must name the actor that made it'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.mutation_events (
            org_id, command_key, domain,
            subject_id, subject_type,
            previous_state, new_state,
            operator_id, origin, context_payload
        ) VALUES (
            p_org_id, 'access.role.updated', 'access',
            v_role_id, 'role',
            COALESCE(v_before_label, '') || ' · ' || (CASE WHEN v_before_active THEN 'active' ELSE 'inactive' END),
            COALESCE(COALESCE(p_role_label, v_before_label), '') || ' · '
                || (CASE WHEN COALESCE(p_is_active, v_before_active) THEN 'active' ELSE 'inactive' END),
            p_actor_user_id, p_origin,
            jsonb_build_object(
                'role_key', p_role_key,
                'changed_fields', to_jsonb(v_changed),
                'correlation_id', p_correlation_id
            )
        );
    END IF;

    -- The grants half is CALLED, not reimplemented, and carries the same actor and correlation id so
    -- one submit reads as one operator action.
    RETURN QUERY
    SELECT r.granted_permission_key
      FROM public.replace_role_permission_grants(
               p_org_id, p_role_key, p_permission_keys,
               p_actor_user_id, p_origin, p_correlation_id
           ) AS r;
END;
$fn$;

ALTER FUNCTION public.save_role_definition_and_grants(uuid, text, text, boolean, text[], text, text, text) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- Exercise the branch that was broken, rather than asserting the text changed.
--
-- A `strpos(pg_get_functiondef(...), 'array_append')` check would pass against any
-- function that merely mentions it. The defect was a RUNTIME type resolution, so
-- the proof has to be a runtime call down the rename path — on a throwaway role in
-- a throwaway org, rolled back before anything is visible.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_org uuid := '00000000-0000-4000-8000-0000fedcba98';
    v_key text := '_d2_rename_selftest';
    v_outcome text;
BEGIN
    /*
     * A BLOCK WITH AN EXCEPTION HANDLER IS A SUBTRANSACTION, and that is the whole technique here.
     * The self-test really renames a role and really commits an event, then raises deliberately so
     * everything it did — the role AND its `mutation_events` row — is rolled back with the
     * subtransaction. Nothing is left behind and the append-only trigger is never touched: history
     * is not weakened to tidy up after a test, which is the one thing D2 must never do.
     *
     * The observations ride out in the exception message, because that is the only thing that
     * survives a rollback.
     *
     * If the 22P02 defect is present, `save_role_definition_and_grants` raises
     * `invalid_text_representation` rather than `raise_exception`, the handler below does not match
     * it, and the migration aborts — which is the required behaviour.
     */
    BEGIN
        -- A role belongs to an organization, so the throwaway tenant has to exist for the
        -- throwaway role to. It is created and discarded with everything else in this block.
        INSERT INTO public.orgs (id, name, slug)
        VALUES (v_org, 'D2 self-test', '_d2_rename_selftest');
        INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
        VALUES (v_org, v_key, 'before', false, true);

        PERFORM public.save_role_definition_and_grants(
            v_org, v_key, 'after', true, ARRAY[]::text[],
            '_d2_rename_selftest', 'system', '_d2_rename_selftest'
        );

        RAISE EXCEPTION 'D2SELFTEST events=% label=%',
            (SELECT count(*) FROM public.mutation_events
              WHERE org_id = v_org AND command_key = 'access.role.updated'),
            (SELECT role_label FROM public.role_definitions
              WHERE org_id = v_org AND role_key = v_key);
    EXCEPTION WHEN raise_exception THEN
        v_outcome := SQLERRM;
    END;

    IF v_outcome IS DISTINCT FROM 'D2SELFTEST events=1 label=after' THEN
        RAISE EXCEPTION
            'D2 ABORT: renaming a role must commit the rename and exactly one update event; observed "%".',
            v_outcome;
    END IF;

    IF EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = v_org) THEN
        RAISE EXCEPTION 'D2 ABORT: the rename self-test left history behind.';
    END IF;

    RAISE NOTICE 'D2: renaming a role commits, records exactly one update event, and leaves nothing behind.';
END
$assert$;

-- The signature must still be unique — a second overload is how every caller starts failing.
DO $overload$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'save_role_definition_and_grants';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'D2 ABORT: public.save_role_definition_and_grants has % overloads.', v_count;
    END IF;
END
$overload$;
