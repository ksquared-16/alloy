-- =============================================================================
-- Forms Engine V1 — database foundation (Card 2)
-- =============================================================================
-- Aligns with sprint: docs/sprints/05_2026/forms-engine-v1.txt (Appendix C).
--
-- Principles (enforced in DB where practical; APIs add the rest):
-- - form_submissions.payload JSONB is canonical source of truth; no automatic sync to field_values.
-- - Published form_definition_versions are immutable except published -> archived transition.
-- - documents.entity_type is free text; Alloy uses singular customer_member for child-scoped files (upload canonicalization already aligns).
-- - Public access: anon has no privileges; authenticated uses has_org_role; service_role bypasses RLS.
--
-- Tables:
--   form_definitions, form_definition_versions, form_public_links,
--   form_submissions, form_submission_documents, form_submission_signatures
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) form_definitions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    kind text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT chk_form_definitions_kind CHECK (kind = ANY (ARRAY['state'::text, 'center'::text])),
    CONSTRAINT uq_form_definitions_org_key UNIQUE (org_id, key)
);

CREATE INDEX IF NOT EXISTS idx_form_definitions_org_id ON public.form_definitions (org_id);
CREATE INDEX IF NOT EXISTS idx_form_definitions_org_active ON public.form_definitions (org_id, is_active);

COMMENT ON TABLE public.form_definitions IS 'Logical form identity per org (versioned payloads live on form_definition_versions).';
COMMENT ON COLUMN public.form_definitions.kind IS 'state = regulatory-style; center = org-config-driven.';

DROP TRIGGER IF EXISTS trg_form_definitions_updated_at ON public.form_definitions;
CREATE TRIGGER trg_form_definitions_updated_at
    BEFORE UPDATE ON public.form_definitions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) form_definition_versions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_definition_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    form_definition_id uuid NOT NULL REFERENCES public.form_definitions (id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    status text NOT NULL,
    schema_json jsonb NOT NULL,
    pdf_mapping_json jsonb,
    published_at timestamptz,
    published_by_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT chk_form_definition_versions_status CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
    CONSTRAINT uq_form_definition_versions_definition_version UNIQUE (form_definition_id, version_number),
    CONSTRAINT chk_form_definition_versions_publish_metadata_consistency CHECK (
        (status = ANY (ARRAY['published'::text, 'archived'::text]) AND published_at IS NOT NULL)
        OR (status = 'draft')
    )
);

CREATE INDEX IF NOT EXISTS idx_form_definition_versions_org ON public.form_definition_versions (org_id);
CREATE INDEX IF NOT EXISTS idx_form_definition_versions_def_status ON public.form_definition_versions (form_definition_id, status);
CREATE INDEX IF NOT EXISTS idx_form_definition_versions_def_version_desc ON public.form_definition_versions (form_definition_id, version_number DESC);

COMMENT ON TABLE public.form_definition_versions IS 'Immutable published/archived schema + mapping; drafts editable. No automatic CRM field_values projection.';
COMMENT ON COLUMN public.form_definition_versions.schema_json IS 'Dedicated versioned form schema (not field_definitions).';
COMMENT ON COLUMN public.form_definition_versions.pdf_mapping_json IS 'Field path -> PDF slot mapping contract; not a second documents system.';

-- Denormalized org_id must match parent form_definitions.org_id
CREATE OR REPLACE FUNCTION public.sync_form_definition_versions_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    p_org uuid;
BEGIN
    SELECT fd.org_id INTO p_org
    FROM public.form_definitions fd
    WHERE fd.id = NEW.form_definition_id;
    IF p_org IS NULL THEN
        RAISE EXCEPTION 'form_definition_versions: form_definition_id % not found', NEW.form_definition_id;
    END IF;
    IF NEW.org_id IS NOT NULL AND NEW.org_id <> p_org THEN
        RAISE EXCEPTION 'form_definition_versions: org_id must match form_definitions.org_id';
    END IF;
    NEW.org_id := p_org;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_definition_versions_org_id ON public.form_definition_versions;
CREATE TRIGGER trg_sync_form_definition_versions_org_id
    BEFORE INSERT OR UPDATE OF form_definition_id, org_id ON public.form_definition_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_definition_versions_org_id();

-- published row immutability: only published -> archived; forbid mutating schema_json / pdf / version_number / published_* on published & archived
CREATE OR REPLACE FUNCTION public.enforce_form_definition_versions_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'published'::text THEN
        IF NEW.status = 'archived'::text AND OLD.status IS DISTINCT FROM NEW.status THEN
            IF NEW.schema_json IS DISTINCT FROM OLD.schema_json
                OR NEW.pdf_mapping_json IS DISTINCT FROM OLD.pdf_mapping_json
                OR NEW.version_number IS DISTINCT FROM OLD.version_number
                OR NEW.published_at IS DISTINCT FROM OLD.published_at
                OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
                OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id
                OR NEW.org_id IS DISTINCT FROM OLD.org_id
                OR NEW.metadata IS DISTINCT FROM OLD.metadata
            THEN
                RAISE EXCEPTION 'form_definition_versions: only status may change when archiving a published version';
            END IF;
            RETURN NEW;
        END IF;

        IF NEW.schema_json IS DISTINCT FROM OLD.schema_json
            OR NEW.pdf_mapping_json IS DISTINCT FROM OLD.pdf_mapping_json
            OR NEW.version_number IS DISTINCT FROM OLD.version_number
            OR NEW.published_at IS DISTINCT FROM OLD.published_at
            OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
            OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id
            OR NEW.org_id IS DISTINCT FROM OLD.org_id
            OR NEW.metadata IS DISTINCT FROM OLD.metadata
            OR NEW.status IS DISTINCT FROM OLD.status
        THEN
            RAISE EXCEPTION 'form_definition_versions: published rows are immutable (publish -> archive only)';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'archived'::text THEN
        -- Allow updated_at-only bumps from set_updated_at; all substantive columns frozen
        IF NEW.id IS DISTINCT FROM OLD.id
            OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id
            OR NEW.org_id IS DISTINCT FROM OLD.org_id
            OR NEW.version_number IS DISTINCT FROM OLD.version_number
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.schema_json IS DISTINCT FROM OLD.schema_json
            OR NEW.pdf_mapping_json IS DISTINCT FROM OLD.pdf_mapping_json
            OR NEW.published_at IS DISTINCT FROM OLD.published_at
            OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
            OR NEW.metadata IS DISTINCT FROM OLD.metadata
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'form_definition_versions: archived rows are immutable';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_definition_versions_immutability ON public.form_definition_versions;
CREATE TRIGGER trg_form_definition_versions_immutability
    BEFORE UPDATE ON public.form_definition_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_form_definition_versions_immutability();

DROP TRIGGER IF EXISTS trg_form_definition_versions_updated_at ON public.form_definition_versions;
CREATE TRIGGER trg_form_definition_versions_updated_at
    BEFORE UPDATE ON public.form_definition_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) form_public_links
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_public_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    token_prefix text,
    form_definition_id uuid NOT NULL REFERENCES public.form_definitions (id) ON DELETE CASCADE,
    pinned_form_definition_version_id uuid REFERENCES public.form_definition_versions (id) ON DELETE SET NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamptz,
    allowed_embed_origins text[],
    rate_limit_profile text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    last_used_at timestamptz,
    CONSTRAINT uq_form_public_links_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_form_public_links_org_def ON public.form_public_links (org_id, form_definition_id);

COMMENT ON TABLE public.form_public_links IS 'Tokenized public form entry; org resolved via token_hash server-side — not ALLOY_PUBLIC_ORG_ID.';

CREATE OR REPLACE FUNCTION public.validate_form_public_links_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    def_org uuid;
    ver_form uuid;
    ver_org uuid;
BEGIN
    SELECT fd.org_id INTO def_org
    FROM public.form_definitions fd
    WHERE fd.id = NEW.form_definition_id;
    IF def_org IS NULL THEN
        RAISE EXCEPTION 'form_public_links: form_definition_id % not found', NEW.form_definition_id;
    END IF;
    IF def_org <> NEW.org_id THEN
        RAISE EXCEPTION 'form_public_links: org_id must match form_definitions.org_id';
    END IF;

    IF NEW.pinned_form_definition_version_id IS NOT NULL THEN
        SELECT v.form_definition_id, v.org_id INTO ver_form, ver_org
        FROM public.form_definition_versions v
        WHERE v.id = NEW.pinned_form_definition_version_id;

        IF ver_form IS NULL THEN
            RAISE EXCEPTION 'form_public_links: pinned_form_definition_version_id % not found', NEW.pinned_form_definition_version_id;
        END IF;
        IF ver_form <> NEW.form_definition_id THEN
            RAISE EXCEPTION 'form_public_links: pinned version must belong to same form_definition_id';
        END IF;
        IF ver_org <> NEW.org_id THEN
            RAISE EXCEPTION 'form_public_links: pinned version org_id mismatch';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_public_links_consistency ON public.form_public_links;
CREATE TRIGGER trg_validate_form_public_links_consistency
    BEFORE INSERT OR UPDATE ON public.form_public_links
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_public_links_consistency();

DROP TRIGGER IF EXISTS trg_form_public_links_updated_at ON public.form_public_links;
CREATE TRIGGER trg_form_public_links_updated_at
    BEFORE UPDATE ON public.form_public_links
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Keep org_id in sync when only form_definition_id changes
CREATE OR REPLACE FUNCTION public.sync_form_public_links_org_from_definition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    p_org uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.form_definition_id IS NOT DISTINCT FROM OLD.form_definition_id THEN
        RETURN NEW;
    END IF;
    SELECT fd.org_id INTO p_org FROM public.form_definitions fd WHERE fd.id = NEW.form_definition_id;
    IF p_org IS NULL THEN
        RAISE EXCEPTION 'form_public_links: form_definition_id invalid';
    END IF;
    NEW.org_id := p_org;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_public_links_org_from_definition ON public.form_public_links;
CREATE TRIGGER trg_sync_form_public_links_org_from_definition
    BEFORE INSERT OR UPDATE OF form_definition_id ON public.form_public_links
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_public_links_org_from_definition();

-- -----------------------------------------------------------------------------
-- 4) form_submissions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    form_definition_id uuid NOT NULL REFERENCES public.form_definitions (id) ON DELETE RESTRICT,
    form_definition_version_id uuid NOT NULL REFERENCES public.form_definition_versions (id) ON DELETE RESTRICT,
    status text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
    customer_member_id uuid REFERENCES public.customer_members (id) ON DELETE SET NULL,
    opportunity_id uuid REFERENCES public.opportunities (id) ON DELETE SET NULL,
    created_via_public_link_id uuid REFERENCES public.form_public_links (id) ON DELETE SET NULL,
    created_by_user_id uuid,
    submitted_by_user_id uuid,
    submitted_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT chk_form_submissions_status CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'void'::text]))
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_org_created ON public.form_submissions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_org_opp ON public.form_submissions (org_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_org_version ON public.form_submissions (org_id, form_definition_version_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_org_status ON public.form_submissions (org_id, status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_customer ON public.form_submissions (customer_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_member ON public.form_submissions (customer_member_id);

COMMENT ON TABLE public.form_submissions IS 'Structured submission; payload JSONB is SoT — not mirrored to field_values automatically.';
COMMENT ON COLUMN public.form_submissions.payload IS 'Canonical answers JSON; freezes when status is submitted or void (see trigger).';

CREATE OR REPLACE FUNCTION public.sync_form_submissions_org_and_definition_from_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    vid uuid := NEW.form_definition_version_id;
    v_def uuid;
    v_org uuid;
    link_org uuid;
BEGIN
    SELECT v.form_definition_id, v.org_id INTO v_def, v_org
    FROM public.form_definition_versions v
    WHERE v.id = vid;
    IF v_def IS NULL THEN
        RAISE EXCEPTION 'form_submissions: form_definition_version_id % not found', vid;
    END IF;
    IF NEW.form_definition_id IS NOT NULL AND NEW.form_definition_id <> v_def THEN
        RAISE EXCEPTION 'form_submissions: form_definition_id must match version.form_definition_id';
    END IF;
    NEW.form_definition_id := v_def;
    NEW.org_id := v_org;

    -- Run after org_id is authoritative (ordering-safe vs separate triggers)
    IF NEW.created_via_public_link_id IS NOT NULL THEN
        SELECT fpl.org_id INTO link_org FROM public.form_public_links fpl WHERE fpl.id = NEW.created_via_public_link_id;
        IF link_org IS NULL THEN
            RAISE EXCEPTION 'form_submissions: created_via_public_link_id not found';
        END IF;
        IF link_org <> NEW.org_id THEN
            RAISE EXCEPTION 'form_submissions: public link org_id must match submission org_id';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_submissions_from_version ON public.form_submissions;
CREATE TRIGGER trg_sync_form_submissions_from_version
    BEFORE INSERT OR UPDATE OF form_definition_version_id, created_via_public_link_id ON public.form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_submissions_org_and_definition_from_version();

-- Freeze payload / version / linking keys once submitted (void still allows marking void only — API should control)
CREATE OR REPLACE FUNCTION public.enforce_form_submissions_submitted_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Freeze canonical capture after finalization: submitted and void (void is terminal)
    IF OLD.status IS DISTINCT FROM 'submitted'::text AND OLD.status IS DISTINCT FROM 'void'::text THEN
        RETURN NEW;
    END IF;

    IF NEW.payload IS DISTINCT FROM OLD.payload
        OR NEW.form_definition_version_id IS DISTINCT FROM OLD.form_definition_version_id
        OR NEW.form_definition_id IS DISTINCT FROM OLD.form_definition_id
    THEN
        RAISE EXCEPTION 'form_submissions: finalized rows cannot change payload or form version linkage';
    END IF;

    IF NEW.person_id IS DISTINCT FROM OLD.person_id
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.customer_member_id IS DISTINCT FROM OLD.customer_member_id
        OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
    THEN
        RAISE EXCEPTION 'form_submissions: finalized rows cannot change entity FKs (correct via new submission if needed)';
    END IF;

    IF OLD.status = 'submitted'::text AND NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'void'::text THEN
            RAISE EXCEPTION 'form_submissions: submitted rows may only transition to void';
        END IF;
    ELSIF OLD.status = 'void'::text AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'form_submissions: void rows cannot change status';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_submissions_submitted_immutability ON public.form_submissions;
CREATE TRIGGER trg_form_submissions_submitted_immutability
    BEFORE UPDATE ON public.form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_form_submissions_submitted_immutability();

DROP TRIGGER IF EXISTS trg_form_submissions_updated_at ON public.form_submissions;
CREATE TRIGGER trg_form_submissions_updated_at
    BEFORE UPDATE ON public.form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) form_submission_documents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_submission_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    form_submission_id uuid NOT NULL REFERENCES public.form_submissions (id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
    role text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT chk_form_submission_documents_role CHECK (
        role = ANY (
            ARRAY['generated_pdf'::text, 'signature_asset'::text, 'upload'::text, 'other'::text]
        )
    ),
    CONSTRAINT uq_form_submission_documents_sub_doc UNIQUE (form_submission_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_form_submission_documents_sub ON public.form_submission_documents (form_submission_id);
CREATE INDEX IF NOT EXISTS idx_form_submission_documents_doc ON public.form_submission_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_form_submission_documents_org_sub ON public.form_submission_documents (org_id, form_submission_id);

COMMENT ON TABLE public.form_submission_documents IS 'Joins canonical form submissions to existing documents rows (PDFs live in documents).';

CREATE OR REPLACE FUNCTION public.sync_form_submission_documents_org_from_submission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    o uuid;
BEGIN
    SELECT fs.org_id INTO o FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;
    IF o IS NULL THEN
        RAISE EXCEPTION 'form_submission_documents: submission % not found', NEW.form_submission_id;
    END IF;
    NEW.org_id := o;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_submission_documents_org ON public.form_submission_documents;
CREATE TRIGGER trg_sync_form_submission_documents_org
    BEFORE INSERT OR UPDATE OF form_submission_id ON public.form_submission_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_submission_documents_org_from_submission();

CREATE OR REPLACE FUNCTION public.validate_form_submission_documents_org_matches_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    row_org uuid;
    doc_org uuid;
BEGIN
    SELECT fs.org_id INTO row_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;
    SELECT d.org_id INTO doc_org FROM public.documents d WHERE d.id = NEW.document_id;
    IF doc_org IS NULL THEN
        RAISE EXCEPTION 'form_submission_documents: document_id % not found', NEW.document_id;
    END IF;
    IF doc_org <> row_org THEN
        RAISE EXCEPTION 'form_submission_documents: document.org_id must match submission.org_id';
    END IF;
    IF NEW.org_id <> row_org THEN
        RAISE EXCEPTION 'form_submission_documents: org_id must match submission';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_submission_documents_doc_org ON public.form_submission_documents;
CREATE TRIGGER trg_validate_form_submission_documents_doc_org
    BEFORE INSERT OR UPDATE ON public.form_submission_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_submission_documents_org_matches_document();

-- -----------------------------------------------------------------------------
-- 6) form_submission_signatures
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_submission_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    form_submission_id uuid NOT NULL REFERENCES public.form_submissions (id) ON DELETE CASCADE,
    field_id text NOT NULL,
    instance_key text DEFAULT ''::text NOT NULL,
    signature_kind text NOT NULL,
    typed_full_name text,
    drawn_asset_document_id uuid REFERENCES public.documents (id) ON DELETE SET NULL,
    signer_acknowledged_at timestamptz NOT NULL,
    signer_ip_hash text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    external_provider text,
    external_envelope_id text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT chk_form_submission_signatures_kind CHECK (
        signature_kind = ANY (ARRAY['typed'::text, 'drawn'::text])
    ),
    CONSTRAINT uq_form_submission_signatures_field_instance UNIQUE (form_submission_id, field_id, instance_key)
);

CREATE INDEX IF NOT EXISTS idx_form_submission_signatures_sub ON public.form_submission_signatures (form_submission_id);
CREATE INDEX IF NOT EXISTS idx_form_submission_signatures_org ON public.form_submission_signatures (org_id);

COMMENT ON TABLE public.form_submission_signatures IS 'Authoritative typed/drawn signature audit; typed text + optional drawn_asset document. External provider cols reserved — not wired in V1.';
COMMENT ON COLUMN public.form_submission_signatures.field_id IS 'Matches schema_json.fields[].id for the immutable form version referenced by submission.';

CREATE OR REPLACE FUNCTION public.sync_form_submission_signatures_org_from_submission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    o uuid;
BEGIN
    SELECT fs.org_id INTO o FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;
    IF o IS NULL THEN
        RAISE EXCEPTION 'form_submission_signatures: submission % not found', NEW.form_submission_id;
    END IF;
    NEW.org_id := o;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_submission_signatures_org ON public.form_submission_signatures;
CREATE TRIGGER trg_sync_form_submission_signatures_org
    BEFORE INSERT OR UPDATE OF form_submission_id ON public.form_submission_signatures
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_submission_signatures_org_from_submission();

CREATE OR REPLACE FUNCTION public.validate_form_submission_signatures_drawn_asset_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    row_org uuid;
    doc_org uuid;
BEGIN
    IF NEW.drawn_asset_document_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT fs.org_id INTO row_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;
    SELECT d.org_id INTO doc_org FROM public.documents d WHERE d.id = NEW.drawn_asset_document_id;
    IF doc_org IS NULL THEN
        RAISE EXCEPTION 'form_submission_signatures: drawn_asset_document_id not found';
    END IF;
    IF doc_org <> row_org THEN
        RAISE EXCEPTION 'form_submission_signatures: drawn asset document.org_id must match submission.org_id';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_submission_signatures_drawn_doc ON public.form_submission_signatures;
CREATE TRIGGER trg_validate_form_submission_signatures_drawn_doc
    BEFORE INSERT OR UPDATE OF drawn_asset_document_id ON public.form_submission_signatures
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_submission_signatures_drawn_asset_org();

-- -----------------------------------------------------------------------------
-- documents.entity_type — document customer_member (singular) for child-scoped attachments
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.documents.entity_type IS
    'Semantic parent type for linkage (singular keys). Upload canonicalization includes customer_member for child-scoped files; Forms Engine generated PDFs use the same discriminator.';

-- -----------------------------------------------------------------------------
-- RLS + privileges (mirror org-scoped Alloy pattern: option_sets / document helpers)
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submission_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submission_signatures ENABLE ROW LEVEL SECURITY;

-- form_definitions
DROP POLICY IF EXISTS form_definitions_select_by_org_role ON public.form_definitions;
CREATE POLICY form_definitions_select_by_org_role ON public.form_definitions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_definitions_insert_by_org_role ON public.form_definitions;
CREATE POLICY form_definitions_insert_by_org_role ON public.form_definitions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_definitions_update_by_org_role ON public.form_definitions;
CREATE POLICY form_definitions_update_by_org_role ON public.form_definitions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_definitions_delete_by_org_role ON public.form_definitions;
CREATE POLICY form_definitions_delete_by_org_role ON public.form_definitions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_definition_versions
DROP POLICY IF EXISTS form_definition_versions_select_by_org_role ON public.form_definition_versions;
CREATE POLICY form_definition_versions_select_by_org_role ON public.form_definition_versions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_definition_versions_mutate_by_org_role ON public.form_definition_versions;
CREATE POLICY form_definition_versions_mutate_by_org_role ON public.form_definition_versions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_definition_versions_update_by_org_role ON public.form_definition_versions;
CREATE POLICY form_definition_versions_update_by_org_role ON public.form_definition_versions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_definition_versions_delete_by_org_role ON public.form_definition_versions;
CREATE POLICY form_definition_versions_delete_by_org_role ON public.form_definition_versions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_public_links
DROP POLICY IF EXISTS form_public_links_select_by_org_role ON public.form_public_links;
CREATE POLICY form_public_links_select_by_org_role ON public.form_public_links FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_public_links_mutate_by_org_role ON public.form_public_links;
CREATE POLICY form_public_links_mutate_by_org_role ON public.form_public_links FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_public_links_update_by_org_role ON public.form_public_links;
CREATE POLICY form_public_links_update_by_org_role ON public.form_public_links FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_public_links_delete_by_org_role ON public.form_public_links;
CREATE POLICY form_public_links_delete_by_org_role ON public.form_public_links FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_submissions
DROP POLICY IF EXISTS form_submissions_select_by_org_role ON public.form_submissions;
CREATE POLICY form_submissions_select_by_org_role ON public.form_submissions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_submissions_mutate_by_org_role ON public.form_submissions;
CREATE POLICY form_submissions_mutate_by_org_role ON public.form_submissions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_submissions_update_by_org_role ON public.form_submissions;
CREATE POLICY form_submissions_update_by_org_role ON public.form_submissions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_submissions_delete_by_org_role ON public.form_submissions;
CREATE POLICY form_submissions_delete_by_org_role ON public.form_submissions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_submission_documents
DROP POLICY IF EXISTS form_submission_documents_select_by_org_role ON public.form_submission_documents;
CREATE POLICY form_submission_documents_select_by_org_role ON public.form_submission_documents FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_submission_documents_mutate_by_org_role ON public.form_submission_documents;
CREATE POLICY form_submission_documents_mutate_by_org_role ON public.form_submission_documents FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_submission_documents_update_by_org_role ON public.form_submission_documents;
CREATE POLICY form_submission_documents_update_by_org_role ON public.form_submission_documents FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_submission_documents_delete_by_org_role ON public.form_submission_documents;
CREATE POLICY form_submission_documents_delete_by_org_role ON public.form_submission_documents FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_submission_signatures
DROP POLICY IF EXISTS form_submission_signatures_select_by_org_role ON public.form_submission_signatures;
CREATE POLICY form_submission_signatures_select_by_org_role ON public.form_submission_signatures FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_submission_signatures_mutate_by_org_role ON public.form_submission_signatures;
CREATE POLICY form_submission_signatures_mutate_by_org_role ON public.form_submission_signatures FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_submission_signatures_update_by_org_role ON public.form_submission_signatures;
CREATE POLICY form_submission_signatures_update_by_org_role ON public.form_submission_signatures FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_submission_signatures_delete_by_org_role ON public.form_submission_signatures;
CREATE POLICY form_submission_signatures_delete_by_org_role ON public.form_submission_signatures FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- service_role explicit policies (defensive; bypasses RLS in Supabase, but satisfies strict PostgreSQL setups)
DROP POLICY IF EXISTS form_definitions_all_service_role ON public.form_definitions;
CREATE POLICY form_definitions_all_service_role ON public.form_definitions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_definition_versions_all_service_role ON public.form_definition_versions;
CREATE POLICY form_definition_versions_all_service_role ON public.form_definition_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_public_links_all_service_role ON public.form_public_links;
CREATE POLICY form_public_links_all_service_role ON public.form_public_links FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_submissions_all_service_role ON public.form_submissions;
CREATE POLICY form_submissions_all_service_role ON public.form_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_submission_documents_all_service_role ON public.form_submission_documents;
CREATE POLICY form_submission_documents_all_service_role ON public.form_submission_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_submission_signatures_all_service_role ON public.form_submission_signatures;
CREATE POLICY form_submission_signatures_all_service_role ON public.form_submission_signatures FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants: no anon access; authenticated + service_role for server paths
REVOKE ALL ON TABLE public.form_definitions FROM anon;
REVOKE ALL ON TABLE public.form_definition_versions FROM anon;
REVOKE ALL ON TABLE public.form_public_links FROM anon;
REVOKE ALL ON TABLE public.form_submissions FROM anon;
REVOKE ALL ON TABLE public.form_submission_documents FROM anon;
REVOKE ALL ON TABLE public.form_submission_signatures FROM anon;

GRANT ALL ON TABLE public.form_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_definitions TO authenticated;

GRANT ALL ON TABLE public.form_definition_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_definition_versions TO authenticated;

GRANT ALL ON TABLE public.form_public_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_public_links TO authenticated;

GRANT ALL ON TABLE public.form_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_submissions TO authenticated;

GRANT ALL ON TABLE public.form_submission_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_submission_documents TO authenticated;

GRANT ALL ON TABLE public.form_submission_signatures TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_submission_signatures TO authenticated;
