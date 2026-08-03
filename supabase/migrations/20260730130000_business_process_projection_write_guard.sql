-- Law 4, completion slice — make publication the ONLY sanctioned durable writer of the published
-- business-process projection.
--
-- Law 4's publish RPC gave us CAS, immutable revisions, atomic projection and forward-only
-- rollback. None of that is authoritative while any `UPDATE departments SET metadata = …` can
-- still rewrite `lifecycle_builder_v1` behind publication's back. This migration closes that.
--
-- Mechanism: a BEFORE INSERT OR UPDATE trigger on `public.departments` that fires ONLY when
-- `metadata -> 'lifecycle_builder_v1'` actually changes. A transaction-local GUC
-- (`alloy.lifecycle_write`) is the capability token; the publish and rollback RPCs set it, and
-- nothing else does. Chosen over an application-layer repository guard because it holds regardless
-- of which client issues the statement — service-role scripts, ad-hoc psql, and future code alike.
--
-- Deliberately NARROW:
--   * unrelated `departments.metadata` keys are untouched — sibling config (lifecycle_activation_v1,
--     opportunity_attention_rules, …) keeps working with no changes;
--   * INITIALIZATION is allowed (absent -> present), per the bootstrap rule: a seed may create
--     configuration that does not exist, but may never overwrite an established process;
--   * an explicit, audited migration/repair mode exists for exceptional operations.
--
-- Design: docs/platform/governance/configuration-publication-model.md

-- ---------------------------------------------------------------------------
-- Capability token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_lifecycle_projection_write(p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF p_mode NOT IN ('publish', 'migration') THEN
        RAISE EXCEPTION 'lifecycle_projection_write_mode_invalid: %', p_mode USING ERRCODE = '22023';
    END IF;
    -- Transaction-local (is_local = true): the grant dies with the transaction, so it can never
    -- leak into a later statement on a pooled connection.
    PERFORM set_config('alloy.lifecycle_write', p_mode, true);
END;
$function$;

COMMENT ON FUNCTION public.begin_lifecycle_projection_write(text) IS
    'Grants the current transaction permission to write departments.metadata.lifecycle_builder_v1. Only the publication RPCs and explicit audited migration utilities may call this.';

/**
 * Release the token.
 *
 * The publication RPCs MUST call this immediately after their projection UPDATE. The GUC is
 * transaction-local, not statement-local, so a token left set would silently authorize every
 * later write in the same transaction — a caller that published and then did anything else inside
 * one transaction would have a standing bypass. Narrowing the window to the single UPDATE is what
 * makes the guard mean what it says.
 *
 * 'migration' mode deliberately does NOT auto-release: a repair utility may need several
 * statements. It ends with its transaction.
 */
CREATE OR REPLACE FUNCTION public.end_lifecycle_projection_write()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    PERFORM set_config('alloy.lifecycle_write', '', true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_lifecycle_builder_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_mode text;
BEGIN
    v_new := NEW.metadata -> 'lifecycle_builder_v1';

    IF TG_OP = 'INSERT' THEN
        -- A brand-new department may be created with configuration; there is nothing to overwrite.
        RETURN NEW;
    END IF;

    v_old := OLD.metadata -> 'lifecycle_builder_v1';

    -- Unrelated metadata change: not our business. This is what keeps every category-F writer
    -- (lifecycle_activation_v1, opportunity_attention_rules, readiness_projection_v1, …) working.
    IF v_old IS NOT DISTINCT FROM v_new THEN
        RETURN NEW;
    END IF;

    -- Initialization: configuration did not exist. A bootstrap/seed may create it.
    IF v_old IS NULL THEN
        RETURN NEW;
    END IF;

    v_mode := nullif(current_setting('alloy.lifecycle_write', true), '');

    IF v_mode IS NULL THEN
        -- Rollout control. `enforce` (the default) is the end state. `warn` exists ONLY for the
        -- window between installing this guard and finishing the editor convergence onto draft
        -- persistence: it surfaces every bypass in the logs without breaking the product. Set per
        -- database with:  ALTER DATABASE <db> SET alloy.lifecycle_guard = 'warn';
        IF nullif(current_setting('alloy.lifecycle_guard', true), '') = 'warn' THEN
            RAISE WARNING
                'lifecycle_builder_v1 written outside publication (department=%) — this will be rejected once the guard is enforcing',
                NEW.id;
            RETURN NEW;
        END IF;

        RAISE EXCEPTION
            'lifecycle_builder_v1 is publication-owned; direct writes are not permitted (department=%)',
            NEW.id
            USING ERRCODE = '42501',
                  HINT = 'Publish through publish_business_process_revision_v1, or for an exceptional repair call begin_lifecycle_projection_write(''migration'') in the same transaction.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_departments_lifecycle_projection_guard ON public.departments;
CREATE TRIGGER trg_departments_lifecycle_projection_guard
    BEFORE INSERT OR UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.guard_lifecycle_builder_projection();

-- ---------------------------------------------------------------------------
-- Teach the publication RPCs to hold the token.
-- Only the projection UPDATE changes; the rest of each function is unchanged from
-- 20260730120000. CREATE OR REPLACE keeps a single definition of each.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_business_process_revision_v1(
    p_org_id uuid,
    p_department_id uuid,
    p_actor_user_id uuid,
    p_payload_checksum text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_department public.departments%ROWTYPE;
    v_draft public.business_process_drafts%ROWTYPE;
    v_revision public.business_process_revisions%ROWTYPE;
    v_publication public.configuration_publications%ROWTYPE;
    v_current_revision_id uuid;
    v_current_revision_number integer;
    v_revision_number integer;
    v_event_id uuid;
    v_metadata jsonb;
BEGIN
    IF nullif(btrim(p_payload_checksum), '') IS NULL THEN
        RAISE EXCEPTION 'business_process_publish_checksum_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_department
    FROM public.departments
    WHERE id = p_department_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_department_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_draft
    FROM public.business_process_drafts
    WHERE department_id = p_department_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_draft_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_draft.draft_status <> 'validated'
       OR jsonb_array_length(v_draft.validation_errors) > 0 THEN
        RAISE EXCEPTION 'business_process_draft_not_validated' USING ERRCODE = '23514';
    END IF;

    SELECT cp.revision_id, cp.revision_number
    INTO v_current_revision_id, v_current_revision_number
    FROM public.configuration_publications cp
    WHERE cp.org_id = p_org_id
      AND cp.domain_key = 'business_process'
      AND cp.subject_id = p_department_id
    ORDER BY cp.revision_number DESC
    LIMIT 1;

    IF v_draft.base_revision_id IS DISTINCT FROM v_current_revision_id THEN
        RAISE EXCEPTION
            'business_process_draft_stale (current_revision=% attempted_base=%)',
            coalesce(v_current_revision_id::text, 'none'),
            coalesce(v_draft.base_revision_id::text, 'none')
            USING ERRCODE = '40001',
                  HINT = 'Reload the configuration and reapply your changes; a newer revision was published.';
    END IF;

    SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
    FROM public.business_process_revisions
    WHERE org_id = p_org_id AND department_id = p_department_id;

    INSERT INTO public.business_process_revisions (
        org_id, department_id, revision_number, payload, payload_checksum,
        source_draft_id, published_by
    )
    VALUES (
        p_org_id, p_department_id, v_revision_number, v_draft.payload, btrim(p_payload_checksum),
        v_draft.id, p_actor_user_id
    )
    RETURNING * INTO v_revision;

    INSERT INTO public.workflow_events (
        org_id, event_type, entity_type, entity_id, action_type, payload, occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.business_process.published',
        'department',
        p_department_id,
        'publish',
        jsonb_build_object(
            'domain_key', 'business_process',
            'department_id', p_department_id,
            'revision_id', v_revision.id,
            'revision_number', v_revision.revision_number,
            'payload_checksum', v_revision.payload_checksum,
            'previous_revision_number', v_current_revision_number,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_publications (
        org_id, domain_key, subject_id, revision_id, revision_number,
        payload_checksum, published_by, published_at, audit_event_id
    )
    VALUES (
        p_org_id, 'business_process', p_department_id, v_revision.id, v_revision.revision_number,
        v_revision.payload_checksum, p_actor_user_id, v_revision.published_at, v_event_id
    )
    RETURNING * INTO v_publication;

    -- Hold the capability token for this transaction only.
    PERFORM public.begin_lifecycle_projection_write('publish');

    v_metadata := coalesce(v_department.metadata, '{}'::jsonb);
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;

    -- Release immediately: the token must authorize this UPDATE and nothing else.
    PERFORM public.end_lifecycle_projection_write();

    UPDATE public.business_process_drafts
    SET base_revision_id = v_revision.id,
        updated_by = p_actor_user_id,
        updated_at = now()
    WHERE id = v_draft.id;

    RETURN jsonb_build_object(
        'department_id', p_department_id,
        'revision_id', v_revision.id,
        'revision_number', v_revision.revision_number,
        'publication_id', v_publication.id,
        'audit_event_id', v_event_id,
        'published_at', v_publication.published_at
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rollback_business_process_to_revision_v1(
    p_org_id uuid,
    p_department_id uuid,
    p_target_revision_id uuid,
    p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_department public.departments%ROWTYPE;
    v_target public.business_process_revisions%ROWTYPE;
    v_revision public.business_process_revisions%ROWTYPE;
    v_publication public.configuration_publications%ROWTYPE;
    v_revision_number integer;
    v_event_id uuid;
    v_metadata jsonb;
BEGIN
    SELECT * INTO v_department
    FROM public.departments
    WHERE id = p_department_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_department_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_target
    FROM public.business_process_revisions
    WHERE id = p_target_revision_id
      AND org_id = p_org_id
      AND department_id = p_department_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business_process_revision_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
    FROM public.business_process_revisions
    WHERE org_id = p_org_id AND department_id = p_department_id;

    INSERT INTO public.business_process_revisions (
        org_id, department_id, revision_number, payload, payload_checksum,
        rolled_back_from_revision_id, published_by
    )
    VALUES (
        p_org_id, p_department_id, v_revision_number, v_target.payload, v_target.payload_checksum,
        v_target.id, p_actor_user_id
    )
    RETURNING * INTO v_revision;

    INSERT INTO public.workflow_events (
        org_id, event_type, entity_type, entity_id, action_type, payload, occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.business_process.rolled_back',
        'department',
        p_department_id,
        'publish',
        jsonb_build_object(
            'domain_key', 'business_process',
            'department_id', p_department_id,
            'revision_id', v_revision.id,
            'revision_number', v_revision.revision_number,
            'rolled_back_from_revision_id', v_target.id,
            'rolled_back_from_revision_number', v_target.revision_number,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_publications (
        org_id, domain_key, subject_id, revision_id, revision_number,
        payload_checksum, published_by, published_at, audit_event_id
    )
    VALUES (
        p_org_id, 'business_process', p_department_id, v_revision.id, v_revision.revision_number,
        v_revision.payload_checksum, p_actor_user_id, v_revision.published_at, v_event_id
    )
    RETURNING * INTO v_publication;

    PERFORM public.begin_lifecycle_projection_write('publish');

    v_metadata := coalesce(v_department.metadata, '{}'::jsonb);
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;

    -- Release immediately: the token must authorize this UPDATE and nothing else.
    PERFORM public.end_lifecycle_projection_write();

    UPDATE public.business_process_drafts
    SET base_revision_id = v_revision.id,
        updated_by = p_actor_user_id,
        updated_at = now()
    WHERE org_id = p_org_id AND department_id = p_department_id;

    RETURN jsonb_build_object(
        'department_id', p_department_id,
        'revision_id', v_revision.id,
        'revision_number', v_revision.revision_number,
        'rolled_back_from_revision_id', v_target.id,
        'publication_id', v_publication.id,
        'audit_event_id', v_event_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_lifecycle_projection_write(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_lifecycle_projection_write(text) TO service_role;
