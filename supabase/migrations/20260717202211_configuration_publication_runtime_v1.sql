-- =============================================================================
-- Configuration Publication Runtime V1 — generic control plane + Programs
-- =============================================================================
-- Generic tables record publication, distribution, delivery attempts, and
-- consumption pointers. Domain payloads remain in domain-owned tables; there is
-- intentionally no generic configuration JSON payload store.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    program_key text NOT NULL,
    lifecycle_status text NOT NULL DEFAULT 'active'
        CHECK (lifecycle_status IN ('active', 'retired')),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    retired_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    retired_at timestamptz,
    CONSTRAINT programs_key_nonempty CHECK (char_length(btrim(program_key)) BETWEEN 2 AND 64),
    CONSTRAINT programs_org_key_unique UNIQUE (org_id, program_key),
    CONSTRAINT programs_retirement_shape CHECK (
        (lifecycle_status = 'active' AND retired_at IS NULL)
        OR (lifecycle_status = 'retired' AND retired_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.programs IS
    'Organization-owned stable Program identity. Draft and immutable revision payloads live in domain-owned companion tables.';

CREATE TABLE IF NOT EXISTS public.program_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    base_revision_id uuid,
    draft_status text NOT NULL DEFAULT 'draft'
        CHECK (draft_status IN ('draft', 'validated')),
    label text NOT NULL,
    description text,
    category text,
    eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
    audience jsonb NOT NULL DEFAULT '{}'::jsonb,
    required_resource_type text,
    qualification_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
    default_policy_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
    default_commercial_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    validated_at timestamptz,
    validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT program_drafts_one_per_program UNIQUE (org_id, program_id),
    CONSTRAINT program_drafts_label_nonempty CHECK (char_length(btrim(label)) > 0),
    CONSTRAINT program_drafts_validation_shape CHECK (
        (draft_status = 'draft')
        OR (draft_status = 'validated' AND validated_at IS NOT NULL AND jsonb_array_length(validation_errors) = 0)
    )
);

CREATE TABLE IF NOT EXISTS public.program_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    program_key text NOT NULL,
    label text NOT NULL,
    description text,
    category text,
    eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
    audience jsonb NOT NULL DEFAULT '{}'::jsonb,
    required_resource_type text,
    qualification_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
    default_policy_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
    default_commercial_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload_checksum text NOT NULL,
    published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    source_draft_id uuid NOT NULL REFERENCES public.program_drafts(id) ON DELETE RESTRICT,
    CONSTRAINT program_revisions_org_program_number_unique
        UNIQUE (org_id, program_id, revision_number),
    CONSTRAINT program_revisions_checksum_nonempty CHECK (char_length(btrim(payload_checksum)) > 0)
);

COMMENT ON TABLE public.program_revisions IS
    'Immutable Programs-domain payload snapshots. UPDATE and DELETE are blocked; later revisions supersede earlier rows in read projections.';

ALTER TABLE public.program_drafts
    DROP CONSTRAINT IF EXISTS program_drafts_base_revision_id_fkey;
ALTER TABLE public.program_drafts
    ADD CONSTRAINT program_drafts_base_revision_id_fkey
    FOREIGN KEY (base_revision_id) REFERENCES public.program_revisions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.configuration_publications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    domain_key text NOT NULL,
    subject_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    payload_checksum text NOT NULL,
    published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    audit_event_id uuid REFERENCES public.workflow_events(id) ON DELETE SET NULL,
    CONSTRAINT configuration_publications_domain_nonempty CHECK (char_length(btrim(domain_key)) > 0),
    CONSTRAINT configuration_publications_revision_unique UNIQUE (org_id, domain_key, revision_id),
    CONSTRAINT configuration_publications_subject_number_unique
        UNIQUE (org_id, domain_key, subject_id, revision_number)
);

COMMENT ON TABLE public.configuration_publications IS
    'Immutable generic publication acts. revision_id points to the authoritative domain revision; payload is never stored here.';

CREATE TABLE IF NOT EXISTS public.configuration_distribution_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    publication_id uuid NOT NULL REFERENCES public.configuration_publications(id) ON DELETE RESTRICT,
    domain_key text NOT NULL,
    provider_key text NOT NULL,
    provider_version integer NOT NULL DEFAULT 1 CHECK (provider_version > 0),
    idempotency_key text NOT NULL,
    target_set_checksum text NOT NULL,
    status text NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'running', 'completed', 'partial_failure', 'failed')),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    CONSTRAINT configuration_distribution_runs_idempotency_unique UNIQUE (org_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.configuration_distribution_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    run_id uuid NOT NULL REFERENCES public.configuration_distribution_runs(id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'delivered', 'unchanged', 'failed')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_code text,
    error_message text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT configuration_distribution_targets_run_location_unique UNIQUE (run_id, location_id),
    CONSTRAINT configuration_distribution_targets_error_shape CHECK (
        (status = 'failed' AND error_message IS NOT NULL)
        OR (status <> 'failed')
    )
);

CREATE TABLE IF NOT EXISTS public.configuration_delivery_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    run_id uuid NOT NULL REFERENCES public.configuration_distribution_runs(id) ON DELETE RESTRICT,
    target_id uuid NOT NULL REFERENCES public.configuration_distribution_targets(id) ON DELETE RESTRICT,
    location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    status text NOT NULL CHECK (status IN ('delivered', 'unchanged', 'failed')),
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_code text,
    error_message text,
    audit_event_id uuid REFERENCES public.workflow_events(id) ON DELETE SET NULL,
    attempted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT configuration_delivery_attempts_target_number_unique UNIQUE (target_id, attempt_number),
    CONSTRAINT configuration_delivery_attempts_error_shape CHECK (
        (status = 'failed' AND error_message IS NOT NULL)
        OR (status <> 'failed')
    )
);

COMMENT ON TABLE public.configuration_delivery_attempts IS
    'Append-only per-Location delivery history. Retry appends an attempt under the same deterministic run identity.';

CREATE TABLE IF NOT EXISTS public.configuration_consumptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    domain_key text NOT NULL,
    subject_id uuid NOT NULL,
    location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    publication_id uuid NOT NULL REFERENCES public.configuration_publications(id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL,
    consumed_at timestamptz NOT NULL DEFAULT now(),
    delivered_by_run_id uuid NOT NULL REFERENCES public.configuration_distribution_runs(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT configuration_consumptions_subject_location_unique
        UNIQUE (org_id, domain_key, subject_id, location_id)
);

COMMENT ON TABLE public.configuration_consumptions IS
    'Authoritative Location pointer to a published domain revision. Domain-owned availability and overrides are stored separately.';

ALTER TABLE public.location_program_categories
    ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS program_revision_id uuid REFERENCES public.program_revisions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS configuration_consumption_id uuid
        REFERENCES public.configuration_consumptions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS local_description_override text,
    ADD COLUMN IF NOT EXISTS local_authorization_evidence text;

COMMENT ON COLUMN public.location_program_categories.program_revision_id IS
    'Published Program revision currently consumed by this Location offering. Null denotes legacy local-only compatibility data.';
COMMENT ON COLUMN public.location_program_categories.is_active IS
    'Location-owned offered/not-offered posture. Publication delivery must preserve this value on existing rows.';
COMMENT ON COLUMN public.location_program_categories.metadata IS
    'Location-owned operational compatibility metadata. Publication delivery must not replace this object.';

CREATE INDEX IF NOT EXISTS idx_programs_org_status
    ON public.programs (org_id, lifecycle_status, program_key);
CREATE INDEX IF NOT EXISTS idx_program_revisions_org_program_published
    ON public.program_revisions (org_id, program_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_configuration_publications_subject
    ON public.configuration_publications (org_id, domain_key, subject_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_configuration_distribution_runs_publication
    ON public.configuration_distribution_runs (org_id, publication_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_configuration_distribution_targets_status
    ON public.configuration_distribution_targets (run_id, status, location_id);
CREATE INDEX IF NOT EXISTS idx_configuration_delivery_attempts_run
    ON public.configuration_delivery_attempts (run_id, location_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_configuration_consumptions_location
    ON public.configuration_consumptions (org_id, location_id, domain_key);
CREATE INDEX IF NOT EXISTS idx_location_program_categories_program
    ON public.location_program_categories (org_id, program_id, location_id);

-- Published payload and audit rows are immutable at the database boundary.
CREATE OR REPLACE FUNCTION public.configuration_publication_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    RAISE EXCEPTION '% rows are immutable; publish or append a new record instead', TG_TABLE_NAME
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_program_revisions_immutable ON public.program_revisions;
CREATE TRIGGER trg_program_revisions_immutable
    BEFORE UPDATE OR DELETE ON public.program_revisions
    FOR EACH ROW EXECUTE FUNCTION public.configuration_publication_immutable_guard();

DROP TRIGGER IF EXISTS trg_configuration_publications_immutable ON public.configuration_publications;
CREATE TRIGGER trg_configuration_publications_immutable
    BEFORE UPDATE OR DELETE ON public.configuration_publications
    FOR EACH ROW EXECUTE FUNCTION public.configuration_publication_immutable_guard();

DROP TRIGGER IF EXISTS trg_configuration_delivery_attempts_immutable ON public.configuration_delivery_attempts;
CREATE TRIGGER trg_configuration_delivery_attempts_immutable
    BEFORE UPDATE OR DELETE ON public.configuration_delivery_attempts
    FOR EACH ROW EXECUTE FUNCTION public.configuration_publication_immutable_guard();

-- Existing Program keys become editable Organization drafts. Nothing is
-- auto-published and no Location availability is changed.
INSERT INTO public.programs (org_id, program_key, created_at)
SELECT DISTINCT lpc.org_id, btrim(lpc.key), min(lpc.created_at)
FROM public.location_program_categories lpc
WHERE char_length(btrim(lpc.key)) BETWEEN 2 AND 64
GROUP BY lpc.org_id, btrim(lpc.key)
ON CONFLICT (org_id, program_key) DO NOTHING;

INSERT INTO public.program_drafts (
    org_id,
    program_id,
    label,
    description,
    category,
    audience,
    required_resource_type,
    qualification_requirements,
    created_at,
    updated_at
)
SELECT
    p.org_id,
    p.id,
    coalesce(
        (
            SELECT nullif(btrim(lpc.label), '')
            FROM public.location_program_categories lpc
            WHERE lpc.org_id = p.org_id AND btrim(lpc.key) = p.program_key
            ORDER BY lpc.created_at, lpc.id
            LIMIT 1
        ),
        p.program_key
    ),
    null,
    null,
    '{}'::jsonb,
    null,
    '[]'::jsonb,
    p.created_at,
    now()
FROM public.programs p
ON CONFLICT (org_id, program_id) DO NOTHING;

UPDATE public.location_program_categories lpc
SET program_id = p.id
FROM public.programs p
WHERE lpc.program_id IS NULL
  AND p.org_id = lpc.org_id
  AND p.program_key = btrim(lpc.key);

-- Atomic Programs publication adapter. The domain snapshot and generic
-- publication act either both commit or neither does.
CREATE OR REPLACE FUNCTION public.publish_program_revision_v1(
    p_org_id uuid,
    p_program_id uuid,
    p_actor_user_id uuid,
    p_payload_checksum text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_program public.programs%ROWTYPE;
    v_draft public.program_drafts%ROWTYPE;
    v_revision public.program_revisions%ROWTYPE;
    v_publication public.configuration_publications%ROWTYPE;
    v_revision_number integer;
    v_event_id uuid;
BEGIN
    IF nullif(btrim(p_payload_checksum), '') IS NULL THEN
        RAISE EXCEPTION 'program_publish_checksum_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_program
    FROM public.programs
    WHERE id = p_program_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'program_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_program.lifecycle_status = 'retired' THEN
        RAISE EXCEPTION 'program_retired' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_draft
    FROM public.program_drafts
    WHERE program_id = p_program_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'program_draft_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_draft.draft_status <> 'validated'
       OR jsonb_array_length(v_draft.validation_errors) > 0 THEN
        RAISE EXCEPTION 'program_draft_not_validated' USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
    FROM public.program_revisions
    WHERE org_id = p_org_id AND program_id = p_program_id;

    INSERT INTO public.program_revisions (
        org_id,
        program_id,
        revision_number,
        program_key,
        label,
        description,
        category,
        eligibility,
        audience,
        required_resource_type,
        qualification_requirements,
        default_policy_refs,
        default_commercial_posture,
        payload_checksum,
        published_by,
        source_draft_id
    )
    VALUES (
        p_org_id,
        p_program_id,
        v_revision_number,
        v_program.program_key,
        v_draft.label,
        v_draft.description,
        v_draft.category,
        v_draft.eligibility,
        v_draft.audience,
        v_draft.required_resource_type,
        v_draft.qualification_requirements,
        v_draft.default_policy_refs,
        v_draft.default_commercial_posture,
        btrim(p_payload_checksum),
        p_actor_user_id,
        v_draft.id
    )
    RETURNING * INTO v_revision;

    INSERT INTO public.workflow_events (
        org_id,
        event_type,
        entity_type,
        entity_id,
        action_type,
        payload,
        occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.program.published',
        'program',
        p_program_id,
        'publish',
        jsonb_build_object(
            'domain_key', 'programs',
            'program_id', p_program_id,
            'revision_id', v_revision.id,
            'revision_number', v_revision.revision_number,
            'payload_checksum', v_revision.payload_checksum,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_publications (
        org_id,
        domain_key,
        subject_id,
        revision_id,
        revision_number,
        payload_checksum,
        published_by,
        published_at,
        audit_event_id
    )
    VALUES (
        p_org_id,
        'programs',
        p_program_id,
        v_revision.id,
        v_revision.revision_number,
        v_revision.payload_checksum,
        p_actor_user_id,
        v_revision.published_at,
        v_event_id
    )
    RETURNING * INTO v_publication;

    UPDATE public.program_drafts
    SET base_revision_id = v_revision.id,
        updated_by = p_actor_user_id,
        updated_at = now()
    WHERE id = v_draft.id;

    RETURN jsonb_build_object(
        'program_id', p_program_id,
        'revision_id', v_revision.id,
        'revision_number', v_revision.revision_number,
        'publication_id', v_publication.id,
        'audit_event_id', v_event_id,
        'published_at', v_publication.published_at
    );
END;
$function$;

-- Programs delivery adapter. It advances the consumed revision while preserving
-- Location-owned availability, operational metadata, overrides, and stable row
-- ids used by downstream resources and records.
CREATE OR REPLACE FUNCTION public.assign_program_publication_target_v1(
    p_org_id uuid,
    p_run_id uuid,
    p_location_id uuid,
    p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_run public.configuration_distribution_runs%ROWTYPE;
    v_target public.configuration_distribution_targets%ROWTYPE;
    v_publication public.configuration_publications%ROWTYPE;
    v_revision public.program_revisions%ROWTYPE;
    v_location public.locations%ROWTYPE;
    v_consumption public.configuration_consumptions%ROWTYPE;
    v_category public.location_program_categories%ROWTYPE;
    v_existing_revision_id uuid;
    v_attempt_number integer;
    v_disposition text;
    v_event_id uuid;
BEGIN
    SELECT * INTO v_run
    FROM public.configuration_distribution_runs
    WHERE id = p_run_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'distribution_run_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_run.domain_key <> 'programs' OR v_run.provider_key <> 'programs.v1' THEN
        RAISE EXCEPTION 'distribution_provider_mismatch' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_target
    FROM public.configuration_distribution_targets
    WHERE run_id = p_run_id AND org_id = p_org_id AND location_id = p_location_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'distribution_target_not_found' USING ERRCODE = 'P0002'; END IF;

    IF v_target.status IN ('delivered', 'unchanged') THEN
        RETURN jsonb_build_object(
            'target_id', v_target.id,
            'location_id', p_location_id,
            'status', v_target.status,
            'idempotent', true,
            'result', v_target.result
        );
    END IF;

    SELECT * INTO v_publication
    FROM public.configuration_publications
    WHERE id = v_run.publication_id AND org_id = p_org_id AND domain_key = 'programs';
    IF NOT FOUND THEN RAISE EXCEPTION 'published_program_revision_required' USING ERRCODE = '23514'; END IF;

    SELECT * INTO v_revision
    FROM public.program_revisions
    WHERE id = v_publication.revision_id
      AND org_id = p_org_id
      AND program_id = v_publication.subject_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'program_revision_not_found' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_location
    FROM public.locations
    WHERE id = p_location_id
      AND org_id = p_org_id
      AND location_type = 'site'
      AND coalesce(is_active, true) = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'location_not_eligible' USING ERRCODE = '23514'; END IF;

    SELECT program_revision_id INTO v_existing_revision_id
    FROM public.location_program_categories
    WHERE org_id = p_org_id
      AND location_id = p_location_id
      AND key = v_revision.program_key
    FOR UPDATE;

    INSERT INTO public.configuration_consumptions (
        org_id,
        domain_key,
        subject_id,
        location_id,
        publication_id,
        revision_id,
        delivered_by_run_id
    )
    VALUES (
        p_org_id,
        'programs',
        v_revision.program_id,
        p_location_id,
        v_publication.id,
        v_revision.id,
        p_run_id
    )
    ON CONFLICT (org_id, domain_key, subject_id, location_id)
    DO UPDATE SET
        publication_id = EXCLUDED.publication_id,
        revision_id = EXCLUDED.revision_id,
        delivered_by_run_id = EXCLUDED.delivered_by_run_id,
        consumed_at = now(),
        updated_at = now()
    RETURNING * INTO v_consumption;

    INSERT INTO public.location_program_categories (
        org_id,
        location_id,
        key,
        label,
        sort_order,
        is_active,
        metadata,
        updated_at,
        program_id,
        program_revision_id,
        configuration_consumption_id
    )
    VALUES (
        p_org_id,
        p_location_id,
        v_revision.program_key,
        v_revision.label,
        100,
        false,
        '{}'::jsonb,
        now(),
        v_revision.program_id,
        v_revision.id,
        v_consumption.id
    )
    ON CONFLICT (org_id, location_id, key)
    DO UPDATE SET
        label = EXCLUDED.label,
        program_id = EXCLUDED.program_id,
        program_revision_id = EXCLUDED.program_revision_id,
        configuration_consumption_id = EXCLUDED.configuration_consumption_id,
        updated_at = now()
    RETURNING * INTO v_category;

    v_disposition := CASE
        WHEN v_existing_revision_id = v_revision.id THEN 'unchanged'
        ELSE 'delivered'
    END;
    v_attempt_number := v_target.attempt_count + 1;

    INSERT INTO public.workflow_events (
        org_id,
        event_type,
        entity_type,
        entity_id,
        action_type,
        payload,
        occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.program.delivered',
        'program',
        v_revision.program_id,
        'assign_to_location',
        jsonb_build_object(
            'domain_key', 'programs',
            'run_id', p_run_id,
            'publication_id', v_publication.id,
            'revision_id', v_revision.id,
            'location_id', p_location_id,
            'disposition', v_disposition,
            'consumption_id', v_consumption.id,
            'location_program_category_id', v_category.id,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_delivery_attempts (
        org_id,
        run_id,
        target_id,
        location_id,
        attempt_number,
        status,
        result,
        audit_event_id,
        attempted_by
    )
    VALUES (
        p_org_id,
        p_run_id,
        v_target.id,
        p_location_id,
        v_attempt_number,
        v_disposition,
        jsonb_build_object(
            'publication_id', v_publication.id,
            'revision_id', v_revision.id,
            'consumption_id', v_consumption.id,
            'location_program_category_id', v_category.id
        ),
        v_event_id,
        p_actor_user_id
    );

    UPDATE public.configuration_distribution_targets
    SET status = v_disposition,
        attempt_count = v_attempt_number,
        result = jsonb_build_object(
            'publication_id', v_publication.id,
            'revision_id', v_revision.id,
            'consumption_id', v_consumption.id,
            'location_program_category_id', v_category.id
        ),
        error_code = null,
        error_message = null,
        updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_target;

    RETURN jsonb_build_object(
        'target_id', v_target.id,
        'location_id', p_location_id,
        'status', v_target.status,
        'idempotent', false,
        'audit_event_id', v_event_id,
        'result', v_target.result
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_configuration_delivery_failure_v1(
    p_org_id uuid,
    p_run_id uuid,
    p_location_id uuid,
    p_actor_user_id uuid,
    p_error_code text,
    p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_run public.configuration_distribution_runs%ROWTYPE;
    v_target public.configuration_distribution_targets%ROWTYPE;
    v_attempt_number integer;
    v_event_id uuid;
    v_message text := coalesce(nullif(btrim(p_error_message), ''), 'Delivery failed');
BEGIN
    SELECT * INTO v_run
    FROM public.configuration_distribution_runs
    WHERE id = p_run_id AND org_id = p_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'distribution_run_not_found' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_target
    FROM public.configuration_distribution_targets
    WHERE run_id = p_run_id AND org_id = p_org_id AND location_id = p_location_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'distribution_target_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_target.status IN ('delivered', 'unchanged') THEN
        RETURN jsonb_build_object('target_id', v_target.id, 'status', v_target.status, 'idempotent', true);
    END IF;

    v_attempt_number := v_target.attempt_count + 1;
    INSERT INTO public.workflow_events (
        org_id,
        event_type,
        entity_type,
        entity_id,
        action_type,
        payload,
        occurred_at
    )
    VALUES (
        p_org_id,
        'configuration.delivery.failed',
        'configuration_publication',
        v_run.publication_id,
        'assign_to_location',
        jsonb_build_object(
            'domain_key', v_run.domain_key,
            'run_id', p_run_id,
            'location_id', p_location_id,
            'error_code', coalesce(nullif(btrim(p_error_code), ''), 'delivery_failed'),
            'error_message', v_message,
            'actor_user_id', p_actor_user_id
        ),
        now()
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.configuration_delivery_attempts (
        org_id,
        run_id,
        target_id,
        location_id,
        attempt_number,
        status,
        error_code,
        error_message,
        audit_event_id,
        attempted_by
    )
    VALUES (
        p_org_id,
        p_run_id,
        v_target.id,
        p_location_id,
        v_attempt_number,
        'failed',
        coalesce(nullif(btrim(p_error_code), ''), 'delivery_failed'),
        v_message,
        v_event_id,
        p_actor_user_id
    );

    UPDATE public.configuration_distribution_targets
    SET status = 'failed',
        attempt_count = v_attempt_number,
        error_code = coalesce(nullif(btrim(p_error_code), ''), 'delivery_failed'),
        error_message = v_message,
        updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_target;

    RETURN jsonb_build_object(
        'target_id', v_target.id,
        'location_id', p_location_id,
        'status', 'failed',
        'audit_event_id', v_event_id,
        'error_code', v_target.error_code,
        'error_message', v_target.error_message
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_configuration_distribution_run_v1(
    p_org_id uuid,
    p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_pending integer;
    v_failed integer;
    v_succeeded integer;
    v_status text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.configuration_distribution_runs
        WHERE id = p_run_id AND org_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'distribution_run_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT
        count(*) FILTER (WHERE status = 'pending'),
        count(*) FILTER (WHERE status = 'failed'),
        count(*) FILTER (WHERE status IN ('delivered', 'unchanged'))
    INTO v_pending, v_failed, v_succeeded
    FROM public.configuration_distribution_targets
    WHERE run_id = p_run_id AND org_id = p_org_id;

    v_status := CASE
        WHEN v_pending > 0 THEN 'running'
        WHEN v_failed = 0 THEN 'completed'
        WHEN v_succeeded > 0 THEN 'partial_failure'
        ELSE 'failed'
    END;

    UPDATE public.configuration_distribution_runs
    SET status = v_status,
        started_at = coalesce(started_at, now()),
        completed_at = CASE WHEN v_pending = 0 THEN now() ELSE null END
    WHERE id = p_run_id AND org_id = p_org_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'status', v_status,
        'pending', v_pending,
        'failed', v_failed,
        'succeeded', v_succeeded
    );
END;
$function$;

-- RLS: authenticated operators can read within their org. All mutations go
-- through validated server paths using the server-only service role.
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_distribution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_distribution_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration_consumptions ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'programs',
        'program_drafts',
        'program_revisions',
        'configuration_publications',
        'configuration_distribution_runs',
        'configuration_distribution_targets',
        'configuration_delivery_attempts',
        'configuration_consumptions'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_select_org', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text, ''manager''::text]))',
            table_name || '_select_org',
            table_name
        );
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_service_role_all', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            table_name || '_service_role_all',
            table_name
        );
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    END LOOP;
END;
$policies$;

REVOKE ALL ON FUNCTION public.configuration_publication_immutable_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configuration_publication_immutable_guard() TO service_role;
REVOKE ALL ON FUNCTION public.publish_program_revision_v1(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_program_revision_v1(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.assign_program_publication_target_v1(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_program_publication_target_v1(uuid, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_configuration_delivery_failure_v1(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_configuration_delivery_failure_v1(uuid, uuid, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_configuration_distribution_run_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_configuration_distribution_run_v1(uuid, uuid) TO service_role;
