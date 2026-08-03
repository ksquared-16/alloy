-- Law 4 — Revision Integrity, as a Configuration Publication model.
--
-- Registers the business process domain on the EXISTING generic publication runtime
-- (20260722020000_configuration_publication_runtime_v1.sql): `configuration_publications` is
-- reused unchanged with domain_key = 'business_process' and subject_id = department_id, and the
-- generic `configuration_publication_immutable_guard()` trigger is attached verbatim.
--
-- One thing is NOT inherited. `publish_program_revision_v1` writes `base_revision_id` but never
-- compares it, so a stale draft can publish over a newer revision. That is exactly what Law 4
-- forbids, so the publish RPC below adds the comparison under FOR UPDATE.
--
-- Design: docs/platform/governance/configuration-publication-model.md

-- ---------------------------------------------------------------------------
-- Revisions — immutable payload snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_process_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    -- Full lifecycle_builder_v1 snapshot. Publication is all-or-nothing (Law 5), so a revision is
    -- self-contained rather than a diff.
    payload jsonb NOT NULL,
    payload_checksum text NOT NULL,
    source_draft_id uuid,
    -- Set when this revision is a forward-republish of an earlier one (rollback).
    rolled_back_from_revision_id uuid REFERENCES public.business_process_revisions(id) ON DELETE SET NULL,
    published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT business_process_revisions_number_unique
        UNIQUE (org_id, department_id, revision_number),
    CONSTRAINT business_process_revisions_checksum_nonempty
        CHECK (char_length(btrim(payload_checksum)) > 0),
    CONSTRAINT business_process_revisions_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE public.business_process_revisions IS
    'Immutable business-process configuration snapshots. UPDATE and DELETE are blocked; rollback republishes a prior payload forward as a new revision.';

CREATE INDEX IF NOT EXISTS business_process_revisions_subject_idx
    ON public.business_process_revisions (org_id, department_id, revision_number DESC);

-- ---------------------------------------------------------------------------
-- Drafts — editable, may be invalid
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_process_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    -- The editable lifecycle_builder_v1. A draft is allowed to be structurally invalid.
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The conflict token: the revision this draft was opened against.
    base_revision_id uuid REFERENCES public.business_process_revisions(id) ON DELETE SET NULL,
    draft_status text NOT NULL DEFAULT 'draft'
        CHECK (draft_status IN ('draft', 'validated')),
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    validated_at timestamptz,
    validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT business_process_drafts_one_per_department UNIQUE (org_id, department_id),
    CONSTRAINT business_process_drafts_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    -- Drafts may be invalid; a *validated* draft may not be.
    CONSTRAINT business_process_drafts_validation_shape CHECK (
        (draft_status = 'draft')
        OR (draft_status = 'validated'
            AND validated_at IS NOT NULL
            AND jsonb_array_length(validation_errors) = 0)
    )
);

COMMENT ON TABLE public.business_process_drafts IS
    'Editable business-process configuration. May be invalid. base_revision_id is the optimistic-concurrency token compared at publish.';

-- ---------------------------------------------------------------------------
-- Immutability — reuse the generic guard verbatim
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_business_process_revisions_immutable ON public.business_process_revisions;
CREATE TRIGGER trg_business_process_revisions_immutable
    BEFORE UPDATE OR DELETE ON public.business_process_revisions
    FOR EACH ROW EXECUTE FUNCTION public.configuration_publication_immutable_guard();

-- ---------------------------------------------------------------------------
-- Publish — validate, CAS, revision, publication, audit, projection. One transaction.
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

    -- Serializes concurrent publishes for this subject and pins the projection target.
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

    -- Law 3 boundary: published configuration may not be invalid.
    IF v_draft.draft_status <> 'validated'
       OR jsonb_array_length(v_draft.validation_errors) > 0 THEN
        RAISE EXCEPTION 'business_process_draft_not_validated' USING ERRCODE = '23514';
    END IF;

    -- Law 4 boundary: the draft must have been opened against the current publication.
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

    -- Runtime projection, same transaction: publication and runtime can never disagree.
    v_metadata := coalesce(v_department.metadata, '{}'::jsonb);
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;

    -- Rebase the draft onto what was just published.
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

-- ---------------------------------------------------------------------------
-- Rollback — forward-only republish of a prior payload
-- ---------------------------------------------------------------------------

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

    -- Forward-only: the restored payload becomes a NEW revision. Nothing is rewritten.
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

    v_metadata := coalesce(v_department.metadata, '{}'::jsonb);
    UPDATE public.departments
    SET metadata = jsonb_set(v_metadata, '{lifecycle_builder_v1}', v_revision.payload, true),
        updated_at = now()
    WHERE id = p_department_id AND org_id = p_org_id;

    -- Any open draft is now based on an superseded revision; rebase it so the operator's next
    -- publish is a conflict only if someone else publishes after this rollback.
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

-- ---------------------------------------------------------------------------
-- RLS — same shape as the generic runtime: org read, service_role mutate.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['business_process_drafts', 'business_process_revisions']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_select_org', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text, ''manager''::text]))',
            table_name || '_select_org', table_name
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_service_role_all', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            table_name || '_service_role_all', table_name
        );
    END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.publish_business_process_revision_v1(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_business_process_revision_v1(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.rollback_business_process_to_revision_v1(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_business_process_to_revision_v1(uuid, uuid, uuid, uuid) TO service_role;
