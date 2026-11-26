-- =============================================================================
-- Documents V1 / D3 — Document Studio configuration: categories and types.
--
-- Two configuration families, each with its own lifecycle (configuration-publication-model.md: "configuration does
-- not share one lifecycle"):
--
--   document_categories        org VOCABULARY, live on save. Stable id + UNIQUE(org_id, key); the key never changes;
--                              label, description, order and parent are edited in place; active ↔ archived. Parents
--                              stay inside the organization and never form a cycle. A category in use is archived,
--                              never deleted; an unused one may be deleted.
--   document_types             stable IDENTITY (id, key, active/archived, published_version_id) …
--   document_type_versions     … plus immutable VERSIONS: draft → validated → published; publishing supersedes the
--                              previous version by compare-and-swap. A published or superseded version never changes.
--                              Every edit is a new draft revision. A type is deleted only if no document ever used
--                              its key.
--
-- A published type's policy is DECLARED INTENT for D5–D7 (review, replacement, formats, validity), with one exception
-- enforced here: its default sensitivity applies to NEW documents of that type, raise-only, and never lowers or
-- reclassifies an existing document. A type revision may not lower its default sensitivity, and the four medical
-- types (whose strings the RLS policies, the D2 trigger and the D1b inference read) never publish below `medical`.
--
-- `documents.doc_type` keeps storing the type KEY: every existing value keeps its meaning and its readers.
--
-- Seeds: a childcare starter vocabulary, inserted once per existing organization and for every new one (orgs insert
-- trigger), as ordinary org-owned rows the organization may edit, archive or delete. Nothing falls back to a platform
-- default at runtime.
--
-- Also closes a D2 gap: an UPDATE that sets a medical doc_type now raises the declared sensitivity too.
--
-- Additive, re-runnable, self-verifying. Rollback: drop the triggers, functions and three tables, and re-declare the
-- two D2 document trigger functions from 20261208090000.
-- =============================================================================

-- ── 1. tables ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    parent_id uuid REFERENCES public.document_categories (id) ON DELETE RESTRICT,
    sort_order integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    seeded boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    archived_at timestamptz,
    archived_by uuid,
    CONSTRAINT chk_document_categories_key CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT chk_document_categories_label CHECK (length(btrim(label)) BETWEEN 1 AND 120),
    CONSTRAINT chk_document_categories_status CHECK (status IN ('active', 'archived')),
    CONSTRAINT chk_document_categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT uq_document_categories_key UNIQUE (org_id, key)
);
CREATE INDEX IF NOT EXISTS idx_document_categories_parent ON public.document_categories (parent_id);

CREATE TABLE IF NOT EXISTS public.document_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    published_version_id uuid,
    seeded boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    archived_at timestamptz,
    archived_by uuid,
    CONSTRAINT chk_document_types_key CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT chk_document_types_status CHECK (status IN ('active', 'archived')),
    CONSTRAINT uq_document_types_key UNIQUE (org_id, key)
);

CREATE TABLE IF NOT EXISTS public.document_type_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    document_type_id uuid NOT NULL REFERENCES public.document_types (id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    label text NOT NULL,
    description text,
    category_id uuid REFERENCES public.document_categories (id) ON DELETE RESTRICT,
    subject_types text[] NOT NULL DEFAULT '{}',
    allowed_formats text[] NOT NULL DEFAULT '{}',
    default_sensitivity text NOT NULL DEFAULT 'standard',
    review_required boolean NOT NULL DEFAULT false,
    replacement_policy text NOT NULL DEFAULT 'new_version',
    validity_policy jsonb NOT NULL DEFAULT '{"kind": "none"}'::jsonb,
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    validated_at timestamptz,
    published_at timestamptz,
    published_by uuid,
    superseded_at timestamptz,
    CONSTRAINT chk_document_type_versions_status CHECK (status IN ('draft', 'validated', 'published', 'superseded')),
    CONSTRAINT chk_document_type_versions_sensitivity CHECK (default_sensitivity IN
        ('standard', 'personal_identity', 'medical', 'custody_safeguarding', 'restricted')),
    CONSTRAINT chk_document_type_versions_replacement CHECK (replacement_policy IN ('new_version', 'new_document', 'not_allowed')),
    CONSTRAINT uq_document_type_versions_number UNIQUE (document_type_id, version_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_type_versions_one_open
    ON public.document_type_versions (document_type_id) WHERE status IN ('draft', 'validated');
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_type_versions_one_published
    ON public.document_type_versions (document_type_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_document_type_versions_category ON public.document_type_versions (category_id);

DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_types_published_version') THEN
        ALTER TABLE public.document_types ADD CONSTRAINT fk_document_types_published_version
            FOREIGN KEY (published_version_id) REFERENCES public.document_type_versions (id) DEFERRABLE INITIALLY DEFERRED;
    END IF;
END
$c$;

ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_type_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.document_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.document_type_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_categories TO service_role;
GRANT ALL ON TABLE public.document_types TO service_role;
GRANT ALL ON TABLE public.document_type_versions TO service_role;

-- ── 2. vocabulary helpers ─────────────────────────────────────────────────────────────────────────────────────
-- The doc_type strings the RLS policies (20261204090000), the D2 trigger and the D1b inference treat as medical.
CREATE OR REPLACE FUNCTION public.document_medical_type_keys()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT ARRAY['physical', 'immunization_record', 'health_care_plan', 'medication_authorization']::text[];
$$;

-- The class a document ends with when `proposed` is applied to `current`, raise-only: from standard to anything, and
-- from anything to restricted. Any other combination keeps the current class.
CREATE OR REPLACE FUNCTION public.document_sensitivity_raise(_current text, _proposed text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE
        WHEN _proposed IS NULL OR _proposed = 'standard' THEN coalesce(_current, 'standard')
        WHEN _current IS NULL OR _current = 'standard' THEN _proposed
        WHEN _proposed = 'restricted' THEN 'restricted'
        ELSE _current
    END;
$$;

-- The published default sensitivity of an organization's ACTIVE type with this key, or NULL.
CREATE OR REPLACE FUNCTION public.document_type_default_sensitivity(_org_id uuid, _doc_type text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT v.default_sensitivity
      FROM public.document_types t
      JOIN public.document_type_versions v ON v.id = t.published_version_id
     WHERE t.org_id = _org_id AND t.key = _doc_type AND t.status = 'active';
$$;

-- ── 3. documents: the declared class follows the doc type, raise-only, on insert AND update ────────────────────
-- Re-declares the D2 insert function with the type default added after the medical floor.
CREATE OR REPLACE FUNCTION public.documents_before_insert_d2()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.storage_path IS NOT NULL AND NEW.current_version_id IS NULL THEN
        NEW.current_version_id := gen_random_uuid();
    END IF;
    IF NEW.sensitivity IS NULL THEN
        NEW.sensitivity := 'standard';
    END IF;
    IF NEW.doc_type = ANY (public.document_medical_type_keys()) THEN
        NEW.sensitivity := public.document_sensitivity_raise(NEW.sensitivity, 'medical');
    END IF;
    -- D3: the published default of the organization's type for this doc_type.
    IF NEW.doc_type IS NOT NULL THEN
        NEW.sensitivity := public.document_sensitivity_raise(NEW.sensitivity, public.document_type_default_sensitivity(NEW.org_id, NEW.doc_type));
    END IF;
    IF coalesce(NEW.legal_hold, false) = false AND (NEW.metadata ->> 'legal_hold') = 'true' THEN
        NEW.legal_hold := true;
        NEW.legal_hold_reason := coalesce(NEW.legal_hold_reason, 'interim metadata marker');
        NEW.legal_hold_set_at := coalesce(NEW.legal_hold_set_at, now());
    END IF;
    RETURN NEW;
END;
$$;

-- Re-declares the D2 update guard, unchanged except for the final doc_type block.
CREATE OR REPLACE FUNCTION public.documents_before_update_d2()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v record;
    v_type text;
BEGIN
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
       OR NEW.bucket IS DISTINCT FROM OLD.bucket OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256 THEN
        SELECT * INTO v FROM public.document_versions WHERE id = NEW.current_version_id;
        IF NOT FOUND OR v.document_id <> NEW.id
           OR NEW.bucket IS DISTINCT FROM v.bucket OR NEW.storage_path IS DISTINCT FROM v.storage_path
           OR NEW.mime_type IS DISTINCT FROM v.mime_type OR NEW.byte_size IS DISTINCT FROM v.byte_size
           OR NEW.checksum_sha256 IS DISTINCT FROM v.checksum_sha256 THEN
            RAISE EXCEPTION 'document_file_projection: a document''s file changes only by adding a version'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF (NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.entity_id IS DISTINCT FROM OLD.entity_id)
       AND coalesce(current_setting('alloy.document_subject_projection', true), '') <> 'on' THEN
        v_type := public.document_subject_type_for_legacy(NEW.entity_type);
        IF v_type IS NULL OR NEW.entity_id IS NULL OR NOT public.document_subject_resolves(NEW.org_id, v_type, NEW.entity_id) THEN
            RAISE EXCEPTION 'document_subject_unresolved: a document is filed only under a subject of its organization'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.entity_type := public.document_legacy_entity_type(v_type);
    END IF;

    IF NEW.sensitivity IS DISTINCT FROM OLD.sensitivity
       AND NOT (OLD.sensitivity = 'standard' OR NEW.sensitivity = 'restricted') THEN
        RAISE EXCEPTION 'document_sensitivity_lowering: a document''s sensitivity may only be raised'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.legal_hold AND NOT OLD.legal_hold AND NEW.legal_hold_set_at IS NULL THEN
        NEW.legal_hold_set_at := now();
    END IF;

    -- D3: a document re-typed (Processing filing, the classifier) takes the medical floor and its new type's default,
    -- raise-only. Closes the D2 gap in which an update to a medical doc_type left the declared class at standard.
    IF NEW.doc_type IS DISTINCT FROM OLD.doc_type AND NEW.doc_type IS NOT NULL THEN
        IF NEW.doc_type = ANY (public.document_medical_type_keys()) THEN
            NEW.sensitivity := public.document_sensitivity_raise(NEW.sensitivity, 'medical');
        END IF;
        NEW.sensitivity := public.document_sensitivity_raise(NEW.sensitivity, public.document_type_default_sensitivity(NEW.org_id, NEW.doc_type));
    END IF;
    RETURN NEW;
END;
$$;

-- ── 4. category guards ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_categories_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_parent record;
    v_cursor uuid;
    v_depth int := 0;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM public.document_type_versions v WHERE v.category_id = OLD.id) THEN
            RAISE EXCEPTION 'document_category_in_use: a category a document type has used is archived, not deleted'
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (SELECT 1 FROM public.document_categories c WHERE c.parent_id = OLD.id) THEN
            RAISE EXCEPTION 'document_category_has_children: move or delete its child categories first' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.key IS DISTINCT FROM OLD.key OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
            RAISE EXCEPTION 'document_category_identity: a category''s key and organization never change' USING ERRCODE = 'check_violation';
        END IF;
        NEW.updated_at := now();
        IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
            IF EXISTS (SELECT 1 FROM public.document_categories c WHERE c.parent_id = NEW.id AND c.status = 'active') THEN
                RAISE EXCEPTION 'document_category_has_active_children: archive or move its active child categories first'
                    USING ERRCODE = 'check_violation';
            END IF;
            IF EXISTS (SELECT 1 FROM public.document_types t
                         JOIN public.document_type_versions v ON v.document_type_id = t.id
                        WHERE t.status = 'active' AND v.category_id = NEW.id AND v.status IN ('published', 'draft', 'validated')) THEN
                RAISE EXCEPTION 'document_category_in_use: active document types are filed under this category; move them first'
                    USING ERRCODE = 'check_violation';
            END IF;
            NEW.archived_at := coalesce(NEW.archived_at, now());
        ELSIF NEW.status = 'active' AND OLD.status = 'archived' THEN
            NEW.archived_at := NULL;
            NEW.archived_by := NULL;
        END IF;
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM public.document_categories WHERE id = NEW.parent_id;
        IF NOT FOUND OR v_parent.org_id <> NEW.org_id THEN
            RAISE EXCEPTION 'document_category_parent_org: a parent category must belong to the same organization'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status = 'active' AND v_parent.status <> 'active' THEN
            RAISE EXCEPTION 'document_category_parent_archived: an active category cannot sit under an archived one'
                USING ERRCODE = 'check_violation';
        END IF;
        -- Walk up from the new parent; reaching this row is a cycle.
        v_cursor := NEW.parent_id;
        WHILE v_cursor IS NOT NULL LOOP
            IF v_cursor = NEW.id THEN
                RAISE EXCEPTION 'document_category_cycle: a category cannot be its own ancestor' USING ERRCODE = 'check_violation';
            END IF;
            v_depth := v_depth + 1;
            IF v_depth > 8 THEN
                RAISE EXCEPTION 'document_category_depth: categories nest at most 8 levels deep' USING ERRCODE = 'check_violation';
            END IF;
            SELECT parent_id INTO v_cursor FROM public.document_categories WHERE id = v_cursor;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_categories_guard ON public.document_categories;
CREATE TRIGGER trg_document_categories_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_categories
    FOR EACH ROW EXECUTE FUNCTION public.document_categories_guard();

-- ── 5. type guards ────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_types_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM public.documents d WHERE d.org_id = OLD.org_id AND d.doc_type = OLD.key) THEN
            RAISE EXCEPTION 'document_type_in_use: a type a document has used is archived, not deleted' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.key IS DISTINCT FROM OLD.key OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
            RAISE EXCEPTION 'document_type_identity: a type''s key and organization never change' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id
           AND coalesce(current_setting('alloy.document_type_publish', true), '') <> 'on' THEN
            RAISE EXCEPTION 'document_type_publish_governed: a type''s published version changes only through document_type_publish'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
            NEW.archived_at := coalesce(NEW.archived_at, now());
        ELSIF NEW.status = 'active' AND OLD.status = 'archived' THEN
            NEW.archived_at := NULL;
            NEW.archived_by := NULL;
        END IF;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_types_guard ON public.document_types;
CREATE TRIGGER trg_document_types_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_types
    FOR EACH ROW EXECUTE FUNCTION public.document_types_guard();

-- A published or superseded version never changes; only the publish function moves published → superseded. A draft
-- or validated version is edited in place; any edit returns a validated version to draft.
CREATE OR REPLACE FUNCTION public.document_type_versions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_type record;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('published', 'superseded') AND EXISTS (SELECT 1 FROM public.document_types t WHERE t.id = OLD.document_type_id) THEN
            RAISE EXCEPTION 'document_type_version_immutable: a published version goes only with its type' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_type FROM public.document_types WHERE id = NEW.document_type_id;
    IF NOT FOUND OR v_type.org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'document_type_version_org: a version belongs to its type''s organization' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.document_categories c WHERE c.id = NEW.category_id AND c.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'document_type_category_org: a type''s category must belong to the same organization' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('draft', 'validated') AND coalesce(current_setting('alloy.document_type_publish', true), '') <> 'on' THEN
            RAISE EXCEPTION 'document_type_publish_governed: a version is created as a draft' USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.document_type_id <> OLD.document_type_id OR NEW.version_number <> OLD.version_number OR NEW.org_id <> OLD.org_id THEN
        RAISE EXCEPTION 'document_type_version_identity: a version''s type and number never change' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('published', 'superseded') THEN
        IF OLD.status = 'published' AND NEW.status = 'superseded'
           AND coalesce(current_setting('alloy.document_type_publish', true), '') = 'on'
           AND NEW.label IS NOT DISTINCT FROM OLD.label AND NEW.description IS NOT DISTINCT FROM OLD.description
           AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND NEW.subject_types IS NOT DISTINCT FROM OLD.subject_types
           AND NEW.allowed_formats IS NOT DISTINCT FROM OLD.allowed_formats AND NEW.default_sensitivity IS NOT DISTINCT FROM OLD.default_sensitivity
           AND NEW.review_required IS NOT DISTINCT FROM OLD.review_required AND NEW.replacement_policy IS NOT DISTINCT FROM OLD.replacement_policy
           AND NEW.validity_policy IS NOT DISTINCT FROM OLD.validity_policy THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'document_type_version_immutable: a published version never changes; edit a new draft' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('published', 'superseded') AND coalesce(current_setting('alloy.document_type_publish', true), '') <> 'on' THEN
        RAISE EXCEPTION 'document_type_publish_governed: a version is published only through document_type_publish' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- An edited validated version must be validated again.
    IF OLD.status = 'validated' AND NEW.status = 'validated' AND coalesce(current_setting('alloy.document_type_validate', true), '') <> 'on'
       AND (NEW.label IS DISTINCT FROM OLD.label OR NEW.description IS DISTINCT FROM OLD.description OR NEW.category_id IS DISTINCT FROM OLD.category_id
            OR NEW.subject_types IS DISTINCT FROM OLD.subject_types OR NEW.allowed_formats IS DISTINCT FROM OLD.allowed_formats
            OR NEW.default_sensitivity IS DISTINCT FROM OLD.default_sensitivity OR NEW.review_required IS DISTINCT FROM OLD.review_required
            OR NEW.replacement_policy IS DISTINCT FROM OLD.replacement_policy OR NEW.validity_policy IS DISTINCT FROM OLD.validity_policy) THEN
        NEW.status := 'draft';
        NEW.validated_at := NULL;
    END IF;
    IF NEW.status = 'validated' AND OLD.status = 'draft' AND coalesce(current_setting('alloy.document_type_validate', true), '') <> 'on' THEN
        RAISE EXCEPTION 'document_type_validate_governed: a version is validated only through document_type_validate' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_type_versions_guard ON public.document_type_versions;
CREATE TRIGGER trg_document_type_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_type_versions
    FOR EACH ROW EXECUTE FUNCTION public.document_type_versions_guard();

-- ── 6. validation, the one authority (the application mirrors it for the editor) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.document_type_version_problems(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
    t record;
    cur record;
    p jsonb := '[]'::jsonb;
    vp jsonb;
    kind text;
    w jsonb;
    prev int;
BEGIN
    SELECT * INTO v FROM public.document_type_versions WHERE id = _version_id;
    IF NOT FOUND THEN RETURN jsonb_build_array(jsonb_build_object('field', 'version', 'code', 'not_found')); END IF;
    SELECT * INTO t FROM public.document_types WHERE id = v.document_type_id;

    IF length(btrim(coalesce(v.label, ''))) = 0 OR length(v.label) > 120 THEN
        p := p || jsonb_build_object('field', 'label', 'code', 'label_required');
    END IF;
    IF v.category_id IS NULL THEN
        p := p || jsonb_build_object('field', 'category_id', 'code', 'category_required');
    ELSIF NOT EXISTS (SELECT 1 FROM public.document_categories c WHERE c.id = v.category_id AND c.org_id = v.org_id AND c.status = 'active') THEN
        p := p || jsonb_build_object('field', 'category_id', 'code', 'category_not_active');
    END IF;
    IF coalesce(array_length(v.subject_types, 1), 0) = 0 THEN
        p := p || jsonb_build_object('field', 'subject_types', 'code', 'subject_types_required');
    ELSIF EXISTS (SELECT 1 FROM unnest(v.subject_types) s WHERE s NOT IN
                  ('household', 'person', 'child', 'opportunity', 'vendor', 'processing_case', 'form_submission')) THEN
        p := p || jsonb_build_object('field', 'subject_types', 'code', 'subject_type_unknown');
    END IF;
    IF coalesce(array_length(v.allowed_formats, 1), 0) = 0 THEN
        p := p || jsonb_build_object('field', 'allowed_formats', 'code', 'allowed_formats_required');
    ELSIF EXISTS (SELECT 1 FROM unnest(v.allowed_formats) f WHERE f NOT IN ('pdf', 'png', 'jpeg', 'docx', 'doc', 'txt', 'csv', 'html')) THEN
        p := p || jsonb_build_object('field', 'allowed_formats', 'code', 'allowed_format_unknown');
    END IF;
    -- The medical floor: these strings are read by RLS, the D2 trigger and the D1b inference.
    IF t.key = ANY (public.document_medical_type_keys()) AND v.default_sensitivity NOT IN ('medical', 'restricted') THEN
        p := p || jsonb_build_object('field', 'default_sensitivity', 'code', 'medical_type_floor');
    END IF;
    -- Anti-downgrade: a revision never lowers the published default.
    SELECT * INTO cur FROM public.document_type_versions WHERE id = t.published_version_id;
    IF FOUND AND cur.id <> v.id AND public.document_sensitivity_raise(cur.default_sensitivity, v.default_sensitivity) <> v.default_sensitivity THEN
        p := p || jsonb_build_object('field', 'default_sensitivity', 'code', 'sensitivity_lowering', 'published', cur.default_sensitivity);
    END IF;

    vp := v.validity_policy;
    kind := vp ->> 'kind';
    IF kind IS NULL OR kind NOT IN ('none', 'explicit_date', 'duration', 'periodic_reconfirmation', 'event_renewal') THEN
        p := p || jsonb_build_object('field', 'validity_policy.kind', 'code', 'validity_kind_unknown');
    ELSE
        IF kind = 'duration' OR kind = 'periodic_reconfirmation' THEN
            IF jsonb_typeof(vp -> 'value') <> 'number' OR (vp ->> 'value')::numeric <> floor((vp ->> 'value')::numeric)
               OR (vp ->> 'value')::int NOT BETWEEN 1 AND 120 THEN
                p := p || jsonb_build_object('field', 'validity_policy.value', 'code', 'validity_value_range');
            END IF;
            IF coalesce(vp ->> 'unit', '') NOT IN ('days', 'months', 'years') THEN
                p := p || jsonb_build_object('field', 'validity_policy.unit', 'code', 'validity_unit_unknown');
            END IF;
        ELSIF vp ? 'value' OR vp ? 'unit' THEN
            p := p || jsonb_build_object('field', 'validity_policy', 'code', 'validity_fields_not_applicable');
        END IF;
        IF kind = 'event_renewal' THEN
            IF coalesce(vp ->> 'event', '') NOT IN ('enrollment_start', 'program_year_start', 'birthday') THEN
                p := p || jsonb_build_object('field', 'validity_policy.event', 'code', 'validity_event_unsupported');
            END IF;
        ELSIF vp ? 'event' THEN
            p := p || jsonb_build_object('field', 'validity_policy.event', 'code', 'validity_fields_not_applicable');
        END IF;
        IF vp ? 'warning_days' THEN
            IF kind = 'none' THEN
                p := p || jsonb_build_object('field', 'validity_policy.warning_days', 'code', 'warning_without_expiry');
            ELSIF jsonb_typeof(vp -> 'warning_days') <> 'array' OR jsonb_array_length(vp -> 'warning_days') > 5 THEN
                p := p || jsonb_build_object('field', 'validity_policy.warning_days', 'code', 'warning_days_shape');
            ELSE
                prev := 400;
                FOR w IN SELECT value FROM jsonb_array_elements(vp -> 'warning_days') LOOP
                    IF jsonb_typeof(w) <> 'number' OR (w #>> '{}')::numeric <> floor((w #>> '{}')::numeric)
                       OR (w #>> '{}')::int NOT BETWEEN 1 AND 365 OR (w #>> '{}')::int >= prev THEN
                        p := p || jsonb_build_object('field', 'validity_policy.warning_days', 'code', 'warning_days_order');
                        EXIT;
                    END IF;
                    prev := (w #>> '{}')::int;
                END LOOP;
            END IF;
        END IF;
        IF vp ? 'review_on_renewal' AND jsonb_typeof(vp -> 'review_on_renewal') <> 'boolean' THEN
            p := p || jsonb_build_object('field', 'validity_policy.review_on_renewal', 'code', 'review_on_renewal_boolean');
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(vp) k WHERE k NOT IN ('kind', 'value', 'unit', 'event', 'warning_days', 'review_on_renewal')) THEN
            p := p || jsonb_build_object('field', 'validity_policy', 'code', 'validity_field_unknown');
        END IF;
    END IF;
    RETURN p;
END;
$$;

-- Record the validation result on an open version: validated when clean, draft with its problems otherwise.
CREATE OR REPLACE FUNCTION public.document_type_validate(p_org_id uuid, p_version_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
    probs jsonb;
BEGIN
    SELECT * INTO v FROM public.document_type_versions WHERE id = p_version_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_type_version_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF v.status NOT IN ('draft', 'validated') THEN
        RAISE EXCEPTION 'document_type_version_not_open: only a draft is validated' USING ERRCODE = 'check_violation';
    END IF;
    probs := public.document_type_version_problems(p_version_id);
    PERFORM set_config('alloy.document_type_validate', 'on', true);
    UPDATE public.document_type_versions
       SET status = CASE WHEN jsonb_array_length(probs) = 0 THEN 'validated' ELSE 'draft' END,
           validation_errors = probs,
           validated_at = CASE WHEN jsonb_array_length(probs) = 0 THEN now() ELSE NULL END,
           updated_by = p_actor
     WHERE id = p_version_id;
    PERFORM set_config('alloy.document_type_validate', 'off', true);
    RETURN jsonb_build_object('version_id', p_version_id, 'valid', jsonb_array_length(probs) = 0, 'problems', probs);
END;
$$;

-- Publish a validated version: compare-and-swap on the type's current published version, supersede it, make this one
-- current. Validation is re-run here; publication never trusts an earlier answer.
CREATE OR REPLACE FUNCTION public.document_type_publish(
    p_org_id uuid, p_type_id uuid, p_version_id uuid, p_expected_published_version_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    t record;
    v record;
    probs jsonb;
BEGIN
    SELECT * INTO t FROM public.document_types WHERE id = p_type_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_type_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF t.status <> 'active' THEN RAISE EXCEPTION 'document_type_archived: re-activate the type before publishing' USING ERRCODE = 'check_violation'; END IF;
    IF t.published_version_id IS DISTINCT FROM p_expected_published_version_id THEN
        RAISE EXCEPTION 'document_type_publish_conflict: the published version changed since this draft was opened' USING ERRCODE = 'serialization_failure';
    END IF;
    SELECT * INTO v FROM public.document_type_versions WHERE id = p_version_id AND document_type_id = p_type_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_type_version_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF v.status <> 'validated' THEN
        RAISE EXCEPTION 'document_type_version_not_validated: validate the draft before publishing' USING ERRCODE = 'check_violation';
    END IF;
    probs := public.document_type_version_problems(p_version_id);
    IF jsonb_array_length(probs) > 0 THEN
        RAISE EXCEPTION 'document_type_version_invalid: %', probs USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('alloy.document_type_publish', 'on', true);
    UPDATE public.document_type_versions SET status = 'superseded', superseded_at = now()
     WHERE document_type_id = p_type_id AND status = 'published';
    UPDATE public.document_type_versions SET status = 'published', published_at = now(), published_by = p_actor WHERE id = p_version_id;
    UPDATE public.document_types SET published_version_id = p_version_id, updated_by = p_actor WHERE id = p_type_id;
    PERFORM set_config('alloy.document_type_publish', 'off', true);
    RETURN jsonb_build_object('type_id', p_type_id, 'version_id', p_version_id, 'version_number', v.version_number,
                              'superseded_version_id', p_expected_published_version_id);
END;
$$;

-- ── 7. seed: a childcare starter vocabulary, editable org-owned rows ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_configuration_seed(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r record;
    v_type_id uuid;
    v_version_id uuid;
BEGIN
    INSERT INTO public.document_categories (org_id, key, label, description, sort_order, seeded)
    SELECT p_org_id, c.key, c.label, c.description, c.ord, true
      FROM (VALUES
          ('health', 'Health & medical', 'Immunizations, physicals, care plans and medication authorizations.', 10),
          ('enrollment', 'Enrollment', 'Documents families provide during enrollment.', 20),
          ('forms', 'Forms & signatures', 'Completed form PDFs and signatures captured by the platform.', 30),
          ('identity', 'Identity', 'Identity papers.', 40),
          ('custody', 'Custody & safeguarding', 'Court orders and safeguarding evidence.', 50),
          ('financial', 'Financial & subsidy', 'Subsidy authorizations and remittances.', 60),
          ('staff', 'Staff & qualifications', 'Certifications and training records.', 70),
          ('vendor', 'Vendor compliance', 'Insurance and licensing from vendors.', 80),
          ('photos', 'Photos', 'Profile and intake photos.', 90),
          ('general', 'General', 'Everything else.', 100)
      ) AS c(key, label, description, ord)
    ON CONFLICT (org_id, key) DO NOTHING;

    FOR r IN SELECT * FROM (VALUES
        ('immunization_record', 'Immunization record', 'health', ARRAY['child'], ARRAY['pdf','png','jpeg'], 'medical', true, '{"kind": "periodic_reconfirmation", "value": 12, "unit": "months", "warning_days": [30, 7]}'),
        ('physical', 'Physical examination', 'health', ARRAY['child'], ARRAY['pdf','png','jpeg'], 'medical', true, '{"kind": "duration", "value": 12, "unit": "months", "warning_days": [30, 7]}'),
        ('health_care_plan', 'Health care plan', 'health', ARRAY['child'], ARRAY['pdf','docx','png','jpeg'], 'medical', true, '{"kind": "periodic_reconfirmation", "value": 12, "unit": "months", "warning_days": [30]}'),
        ('medication_authorization', 'Medication authorization', 'health', ARRAY['child'], ARRAY['pdf','png','jpeg'], 'medical', true, '{"kind": "duration", "value": 12, "unit": "months", "warning_days": [30, 7]}'),
        ('enrollment_document', 'Enrollment document', 'enrollment', ARRAY['child','household','opportunity'], ARRAY['pdf','png','jpeg','docx'], 'standard', false, '{"kind": "none"}'),
        ('generated_form_pdf', 'Completed form', 'forms', ARRAY['child','household','person','opportunity','form_submission'], ARRAY['pdf'], 'standard', false, '{"kind": "none"}'),
        ('signature_asset', 'Signature', 'forms', ARRAY['child','person','form_submission'], ARRAY['png'], 'standard', false, '{"kind": "none"}'),
        ('profile_photo', 'Profile photo', 'photos', ARRAY['person','child'], ARRAY['png','jpeg'], 'standard', false, '{"kind": "none"}'),
        ('insurance', 'Proof of insurance', 'vendor', ARRAY['vendor'], ARRAY['pdf','png','jpeg'], 'standard', true, '{"kind": "explicit_date", "warning_days": [30, 7]}'),
        ('drivers_license', 'Driver''s license', 'identity', ARRAY['vendor','person'], ARRAY['pdf','png','jpeg'], 'standard', true, '{"kind": "explicit_date", "warning_days": [30]}'),
        ('custody_order', 'Custody order', 'custody', ARRAY['child'], ARRAY['pdf','png','jpeg'], 'custody_safeguarding', true, '{"kind": "none"}'),
        ('subsidy_authorization', 'Subsidy authorization', 'financial', ARRAY['household','child'], ARRAY['pdf','png','jpeg'], 'standard', true, '{"kind": "explicit_date", "warning_days": [30]}'),
        ('staff_certification', 'Staff certification', 'staff', ARRAY['person'], ARRAY['pdf','png','jpeg'], 'standard', true, '{"kind": "explicit_date", "warning_days": [60, 30]}')
    ) AS s(key, label, category_key, subjects, formats, sensitivity, review, validity) LOOP
        IF EXISTS (SELECT 1 FROM public.document_types WHERE org_id = p_org_id AND key = r.key) THEN CONTINUE; END IF;
        INSERT INTO public.document_types (org_id, key, seeded) VALUES (p_org_id, r.key, true) RETURNING id INTO v_type_id;
        PERFORM set_config('alloy.document_type_publish', 'on', true);
        INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, status, label, category_id, subject_types,
                                                   allowed_formats, default_sensitivity, review_required, validity_policy, published_at)
        VALUES (p_org_id, v_type_id, 1, 'published', r.label,
                (SELECT id FROM public.document_categories WHERE org_id = p_org_id AND key = r.category_key),
                r.subjects, r.formats, r.sensitivity, r.review, r.validity::jsonb, now())
        RETURNING id INTO v_version_id;
        UPDATE public.document_types SET published_version_id = v_version_id WHERE id = v_type_id;
        PERFORM set_config('alloy.document_type_publish', 'off', true);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.orgs_seed_document_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
BEGIN
    PERFORM public.document_configuration_seed(NEW.id);
    RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS orgs_seed_document_configuration ON public.orgs;
CREATE TRIGGER orgs_seed_document_configuration AFTER INSERT ON public.orgs
    FOR EACH ROW EXECUTE FUNCTION public.orgs_seed_document_configuration();

REVOKE ALL ON FUNCTION public.document_type_validate(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_type_validate(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_type_publish(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_type_publish(uuid, uuid, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_type_version_problems(uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_type_version_problems(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_configuration_seed(uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_configuration_seed(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_type_default_sensitivity(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_type_default_sensitivity(uuid, text) TO service_role;

-- ── 8. seed every existing organization ───────────────────────────────────────────────────────────────────────
DO $seed$
DECLARE o record;
BEGIN
    FOR o IN SELECT id FROM public.orgs LOOP
        PERFORM public.document_configuration_seed(o.id);
    END LOOP;
END
$seed$;

-- ── 9. self-verification ──────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    n bigint;
    r text;
BEGIN
    SELECT count(*) INTO n FROM public.orgs o
     WHERE (SELECT count(*) FROM public.document_types t WHERE t.org_id = o.id AND t.seeded) < 13
        OR (SELECT count(*) FROM public.document_categories c WHERE c.org_id = o.id AND c.seeded) < 10;
    IF n > 0 THEN RAISE EXCEPTION 'd3 verify: % organizations lack the starter vocabulary', n; END IF;

    SELECT count(*) INTO n FROM public.document_types t
     WHERE t.published_version_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.document_type_versions v WHERE v.id = t.published_version_id AND v.status = 'published' AND v.document_type_id = t.id);
    IF n > 0 THEN RAISE EXCEPTION 'd3 verify: % types without a matching published version', n; END IF;

    SELECT count(*) INTO n FROM public.document_types t JOIN public.document_type_versions v ON v.id = t.published_version_id
     WHERE jsonb_array_length(public.document_type_version_problems(v.id)) > 0;
    IF n > 0 THEN RAISE EXCEPTION 'd3 verify: % seeded published versions fail validation', n; END IF;

    SELECT count(*) INTO n FROM public.document_types t JOIN public.document_type_versions v ON v.id = t.published_version_id
     WHERE t.key = ANY (public.document_medical_type_keys()) AND v.default_sensitivity <> 'medical';
    IF n > 0 THEN RAISE EXCEPTION 'd3 verify: % medical types not published as medical', n; END IF;

    -- No existing document was reclassified: the seed only applies to documents written from now on.
    IF EXISTS (SELECT 1 FROM public.documents WHERE sensitivity = 'standard'
                 AND doc_type = ANY (public.document_medical_type_keys())) THEN
        RAISE EXCEPTION 'd3 verify: a medical-type document is declared standard';
    END IF;

    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(r, 'public.document_categories'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege(r, 'public.document_types'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege(r, 'public.document_type_versions'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
            RAISE EXCEPTION 'd3 verify: role % holds a privilege on a document configuration table', r;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                    WHERE p.oid IN ('public.document_type_publish(uuid, uuid, uuid, uuid, uuid)'::regprocedure,
                                    'public.document_type_validate(uuid, uuid, uuid)'::regprocedure,
                                    'public.document_configuration_seed(uuid)'::regprocedure)
                      AND (a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = r))) THEN
            RAISE EXCEPTION 'd3 verify: role % may run a governed document configuration function', r;
        END IF;
    END LOOP;
END
$verify$;

COMMENT ON TABLE public.document_categories IS 'D3: org document categories (vocabulary, live on save). Stable id + key.';
COMMENT ON TABLE public.document_types IS 'D3: org document type identity. documents.doc_type stores the key. Policy lives in document_type_versions.';
COMMENT ON TABLE public.document_type_versions IS 'D3: immutable published versions of a document type (draft → validated → published → superseded).';
