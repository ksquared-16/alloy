-- D2 — RENAMING OR DEACTIVATING A ROLE PRODUCED NO EVENT AT ALL.
--
-- `PATCH /api/admin/rbac/roles/[role_key]` has two branches. When the request carries
-- `permission_keys` it goes through `save_role_definition_and_grants`, which is audited. When it
-- carries ONLY `role_label` or `is_active` it wrote `role_definitions` directly:
--
--     await supabase.from("role_definitions").update(updates)...
--
-- So the single most consequential mutation on that route — deactivating a role, which removes every
-- capability it carries from everyone holding it — changed access and left no trace. The producer
-- coverage scan found it by asking which mutating handlers write an access table without reaching an
-- audited owner, which is the question a fixed list of six routes cannot ask.
--
-- The route now calls the one owner for both branches. For that to be possible the owner has to be
-- able to say "the grid was not edited", which is exactly what it already says for the other two
-- fields: NULL means "not edited". `p_permission_keys` gains the same meaning and a DEFAULT.
--
-- Adding a DEFAULT to an EXISTING parameter does not change the function's identity arguments, so
-- this replaces the function in place rather than creating the second overload that PGRST203 made so
-- expensive last time. The assertion at the bottom re-checks that.

CREATE OR REPLACE FUNCTION public.save_role_definition_and_grants(
    p_org_id uuid,
    p_role_key text,
    p_role_label text,
    p_is_active boolean,
    p_permission_keys text[] DEFAULT NULL,
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

    -- `array_append`, not `||`: an untyped literal on the right of `||` resolves to array-concat and
    -- tries to parse the field NAME as an array literal. See `20260911230000`.
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

    /*
     * NULL PERMISSION KEYS MEAN "THE GRID WAS NOT EDITED", the same way NULL means it for the label
     * and the active flag. An empty array is a different instruction — it revokes everything — and
     * conflating the two would make a metadata-only save silently strip a role's entire package.
     */
    IF p_permission_keys IS NULL THEN
        RETURN QUERY
        SELECT g.permission_key
          FROM public.role_permission_grants g
         WHERE g.org_id = p_org_id AND g.role_key = p_role_key AND g.allowed
         ORDER BY g.permission_key;
        RETURN;
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
-- Exercise BOTH branches, and roll both back.
--
-- A metadata-only save must record the change and leave the package alone; that is
-- the pair of claims the route now depends on, and neither is provable by reading
-- the function text.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_org uuid := '00000000-0000-4000-8000-0000fedcba97';
    v_key text := '_d2_metadata_selftest';
    v_outcome text;
BEGIN
    BEGIN
        -- A role belongs to an organization, so the throwaway tenant has to exist for the
        -- throwaway role to. It is created and discarded with everything else in this block.
        INSERT INTO public.orgs (id, name, slug)
        VALUES (v_org, 'D2 self-test', '_d2_metadata_selftest');
        INSERT INTO public.role_definitions (org_id, role_key, role_label, is_system, is_active)
        VALUES (v_org, v_key, 'before', false, true);
        INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
        VALUES (v_org, v_key, 'fin.read', true);

        -- Metadata only: no grid edit, so the package must survive untouched.
        PERFORM public.save_role_definition_and_grants(
            v_org, v_key, NULL, false, NULL,
            '_d2_metadata_selftest', 'system', '_d2_metadata_selftest'
        );

        RAISE EXCEPTION 'D2SELFTEST events=% active=% grants=%',
            (SELECT count(*) FROM public.mutation_events
              WHERE org_id = v_org AND command_key = 'access.role.updated'),
            (SELECT CASE WHEN is_active THEN 'active' ELSE 'inactive' END
               FROM public.role_definitions WHERE org_id = v_org AND role_key = v_key),
            (SELECT count(*) FROM public.role_permission_grants
              WHERE org_id = v_org AND role_key = v_key AND allowed);
    EXCEPTION WHEN raise_exception THEN
        v_outcome := SQLERRM;
    END;

    IF v_outcome IS DISTINCT FROM 'D2SELFTEST events=1 active=inactive grants=1' THEN
        RAISE EXCEPTION
            'D2 ABORT: deactivating a role must record exactly one event and leave its package intact; observed "%".',
            v_outcome;
    END IF;

    IF EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = v_org) THEN
        RAISE EXCEPTION 'D2 ABORT: the metadata self-test left history behind.';
    END IF;

    RAISE NOTICE 'D2: a metadata-only role save is audited and does not disturb the package.';
END
$assert$;

DO $overload$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'save_role_definition_and_grants';
    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'D2 ABORT: public.save_role_definition_and_grants has % overloads; adding a DEFAULT to an EXISTING parameter must replace, not overload.',
            v_count;
    END IF;
END
$overload$;
