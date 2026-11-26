-- =============================================================================
-- Documents D2 — canonical document foundation.
--
--   * documents            stays the LOGICAL document. Its id never changes and every existing foreign key keeps pointing at it.
--   * document_versions    becomes the IMMUTABLE FILE: bucket, path, sha256, size, MIME and provenance. Only review and
--                          expiration metadata may change. A version disappears only with its document (the audited delete)
--                          or through the governed purge.
--   * documents.current_version_id names the current file. The legacy file columns on documents (bucket, storage_path,
--                          mime_type, byte_size, checksum_sha256) are now a PROJECTION of that version. An update that does
--                          not match it is refused: no silent binary overwrite.
--   * document_subjects    typed subject associations. `owner` vs `context`; exactly one active PRIMARY owner per attached
--                          document. The legacy entity_type / entity_id are a projection of the primary owner. A legacy writer
--                          that sets them is routed into the canonical association. The table is written only through the
--                          governed functions below.
--   * document_subject_links (view) adds the CONTEXT links other domains already hold (form submissions, Processing case
--                          sources) without copying them.
--   * documents.sensitivity a declared class: standard | personal_identity | medical | custody_safeguarding | restricted.
--                          It may only be raised. The read path adds the D1b inference on top, so nothing D1b protects is
--                          relaxed.
--   * retention / legal hold: documents.legal_hold (+ reason, set_at, set_by), retention_until, retention_policy_key.
--
-- Backfill, in this migration and re-runnable:
--   * one legacy version per stored document (checksum when one was recorded, the storage eTag always);
--   * one primary owner per document whose legacy subject still exists in its organization. Rows whose subject is gone keep
--     their legacy columns untouched and get no owner, so their access is unchanged;
--   * declared sensitivity from the D1b inference only. No historical document becomes personal_identity or restricted;
--   * the interim metadata hold markers.
-- Then it verifies itself and raises on any mismatch.
--
-- Rollback (if ever needed): drop the triggers, the functions, the view, document_subjects and the added columns. No
-- pre-existing column value is rewritten by this migration.
-- =============================================================================

-- ── 1. columns ──────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS current_version_id uuid,
    ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS legal_hold_reason text,
    ADD COLUMN IF NOT EXISTS legal_hold_set_at timestamptz,
    ADD COLUMN IF NOT EXISTS legal_hold_set_by uuid,
    ADD COLUMN IF NOT EXISTS retention_until date,
    ADD COLUMN IF NOT EXISTS retention_policy_key text;

DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_documents_sensitivity') THEN
        ALTER TABLE public.documents ADD CONSTRAINT chk_documents_sensitivity
            CHECK (sensitivity IN ('standard', 'personal_identity', 'medical', 'custody_safeguarding', 'restricted'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_documents_legal_hold_reason') THEN
        ALTER TABLE public.documents ADD CONSTRAINT chk_documents_legal_hold_reason
            CHECK (NOT legal_hold OR coalesce(length(btrim(legal_hold_reason)), 0) > 0);
    END IF;
END
$c$;

ALTER TABLE public.document_versions
    ADD COLUMN IF NOT EXISTS bucket text,
    ADD COLUMN IF NOT EXISTS source text,
    ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_by uuid,
    ADD COLUMN IF NOT EXISTS supersedes_version_id uuid,
    ADD COLUMN IF NOT EXISTS replacement_reason text,
    ADD COLUMN IF NOT EXISTS content_etag text,
    ADD COLUMN IF NOT EXISTS screening jsonb,
    ADD COLUMN IF NOT EXISTS review_status text,
    ADD COLUMN IF NOT EXISTS reviewed_by uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS effective_on date,
    ADD COLUMN IF NOT EXISTS expires_on date;

DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_current_version') THEN
        ALTER TABLE public.documents ADD CONSTRAINT fk_documents_current_version
            FOREIGN KEY (current_version_id) REFERENCES public.document_versions (id) DEFERRABLE INITIALLY DEFERRED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_versions_supersedes') THEN
        ALTER TABLE public.document_versions ADD CONSTRAINT fk_document_versions_supersedes
            FOREIGN KEY (supersedes_version_id) REFERENCES public.document_versions (id) DEFERRABLE INITIALLY DEFERRED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_versions_source') THEN
        ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_versions_source
            CHECK (source IS NOT NULL AND source IN ('legacy_backfill', 'document_insert', 'document_insert_unhashed', 'replacement'));
    END IF;
    -- Every version written from now on carries its sha256; only rows that predate D2 (or a pre-D2 writer still in flight) may not.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_versions_checksum') THEN
        ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_versions_checksum
            CHECK (checksum_sha256 IS NOT NULL OR source IN ('legacy_backfill', 'document_insert_unhashed'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_versions_file') THEN
        ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_versions_file
            CHECK (bucket IS NOT NULL AND storage_path IS NOT NULL AND split_part(storage_path, '/', 1) = org_id::text);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_versions_replacement') THEN
        ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_versions_replacement
            CHECK (source <> 'replacement' OR (supersedes_version_id IS NOT NULL AND coalesce(length(btrim(replacement_reason)), 0) > 0));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_versions_review_status') THEN
        ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_versions_review_status
            CHECK (review_status IS NULL OR review_status IN ('pending', 'accepted', 'rejected'));
    END IF;
END
$c$;

-- A file belongs to one version: a version written from now on may not alias another version's object.
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_object
    ON public.document_versions (bucket, storage_path) WHERE source <> 'legacy_backfill';
CREATE INDEX IF NOT EXISTS idx_document_versions_object ON public.document_versions (bucket, storage_path);
CREATE INDEX IF NOT EXISTS idx_documents_current_version ON public.documents (current_version_id);

-- ── 2. document_subjects ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    association text NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    source text NOT NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    ended_by uuid,
    CONSTRAINT chk_document_subjects_type CHECK (subject_type IN
        ('household', 'person', 'child', 'opportunity', 'vendor', 'processing_case', 'form_submission')),
    CONSTRAINT chk_document_subjects_association CHECK (association IN ('owner', 'context')),
    CONSTRAINT chk_document_subjects_owner_type CHECK (
        association = 'context' OR subject_type IN ('household', 'person', 'child', 'opportunity', 'vendor')),
    CONSTRAINT chk_document_subjects_primary CHECK (NOT is_primary OR association = 'owner'),
    CONSTRAINT chk_document_subjects_source CHECK (source IN ('legacy_backfill', 'legacy_writer', 'governed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_subjects_active
    ON public.document_subjects (document_id, subject_type, subject_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_subjects_one_primary
    ON public.document_subjects (document_id) WHERE is_primary AND ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_subjects_subject
    ON public.document_subjects (org_id, subject_type, subject_id) WHERE ended_at IS NULL;

ALTER TABLE public.document_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_subjects FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_subjects TO service_role;

-- ── 3. vocabulary helpers ──────────────────────────────────────────────────────────────────────────────────────
-- Legacy entity_type → canonical owning subject type (NULL: not a D2 subject, or not an owner).
CREATE OR REPLACE FUNCTION public.document_subject_type_for_legacy(_entity_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE lower(btrim(coalesce(_entity_type, '')))
        WHEN 'customer_member' THEN 'child'   WHEN 'customer_members' THEN 'child'
        WHEN 'person' THEN 'person'           WHEN 'persons' THEN 'person'
        WHEN 'customer' THEN 'household'      WHEN 'customers' THEN 'household'
        WHEN 'opportunity' THEN 'opportunity' WHEN 'opportunities' THEN 'opportunity'
        WHEN 'vendor' THEN 'vendor'           WHEN 'vendors' THEN 'vendor'
        ELSE NULL END;
$$;

-- Canonical owning subject type → the legacy entity_type the existing consumers read.
CREATE OR REPLACE FUNCTION public.document_legacy_entity_type(_subject_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE _subject_type
        WHEN 'child' THEN 'customer_member' WHEN 'person' THEN 'person' WHEN 'household' THEN 'customer'
        WHEN 'opportunity' THEN 'opportunity' WHEN 'vendor' THEN 'vendor' ELSE NULL END;
$$;

-- Does the subject exist in the organization? Never infers identity: the id must be a row of the type's own table.
CREATE OR REPLACE FUNCTION public.document_subject_resolves(_org_id uuid, _subject_type text, _subject_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF _org_id IS NULL OR _subject_id IS NULL THEN RETURN false; END IF;
    RETURN CASE _subject_type
        WHEN 'child' THEN EXISTS (SELECT 1 FROM public.customer_members x WHERE x.id = _subject_id AND x.org_id = _org_id)
        WHEN 'person' THEN EXISTS (SELECT 1 FROM public.persons x WHERE x.id = _subject_id AND x.org_id = _org_id)
        WHEN 'household' THEN EXISTS (SELECT 1 FROM public.customers x WHERE x.id = _subject_id AND x.org_id = _org_id)
        WHEN 'opportunity' THEN EXISTS (SELECT 1 FROM public.opportunities x WHERE x.id = _subject_id AND x.org_id = _org_id)
        WHEN 'vendor' THEN EXISTS (SELECT 1 FROM public.vendors x WHERE x.id = _subject_id AND x.org_id = _org_id)
        WHEN 'processing_case' THEN EXISTS (SELECT 1 FROM public.processing_cases x WHERE x.id = _subject_id AND x.org_id = _org_id)
        WHEN 'form_submission' THEN EXISTS (SELECT 1 FROM public.form_submissions x WHERE x.id = _subject_id AND x.org_id = _org_id)
        ELSE false END;
END;
$$;

-- ── 4. versions: immutability and deletion ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_versions_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number OR NEW.bucket IS DISTINCT FROM OLD.bucket
       OR NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256 OR NEW.content_etag IS DISTINCT FROM OLD.content_etag
       OR NEW.source IS DISTINCT FROM OLD.source OR NEW.provenance IS DISTINCT FROM OLD.provenance
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
       OR NEW.replacement_reason IS DISTINCT FROM OLD.replacement_reason OR NEW.screening IS DISTINCT FROM OLD.screening
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
        RAISE EXCEPTION 'document_version_immutable: only review and expiration fields of a document version may change'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_versions_guard_update ON public.document_versions;
CREATE TRIGGER trg_document_versions_guard_update BEFORE UPDATE ON public.document_versions
    FOR EACH ROW EXECUTE FUNCTION public.document_versions_guard_update();

-- Checked when the transaction ends: a version may be deleted only together with its document, or by the governed purge.
CREATE OR REPLACE FUNCTION public.document_versions_guard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF coalesce(current_setting('alloy.document_version_purge', true), '') = 'on' THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.documents d WHERE d.id = OLD.document_id) THEN
        RAISE EXCEPTION 'document_version_history_protected: a version is removed only with its document or by the governed purge'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_versions_guard_delete ON public.document_versions;
CREATE CONSTRAINT TRIGGER trg_document_versions_guard_delete AFTER DELETE ON public.document_versions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.document_versions_guard_delete();

-- ── 5. documents: version and subject projection on insert ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.documents_before_insert_d2()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.storage_path IS NOT NULL AND NEW.current_version_id IS NULL THEN
        NEW.current_version_id := gen_random_uuid();
    END IF;
    -- The declared class is never below what the document type already implies.
    IF NEW.sensitivity IS NULL OR NEW.sensitivity = 'standard' THEN
        IF NEW.doc_type IN ('physical', 'immunization_record', 'health_care_plan', 'medication_authorization') THEN
            NEW.sensitivity := 'medical';
        ELSE
            NEW.sensitivity := 'standard';
        END IF;
    END IF;
    IF coalesce(NEW.legal_hold, false) = false AND (NEW.metadata ->> 'legal_hold') = 'true' THEN
        NEW.legal_hold := true;
        NEW.legal_hold_reason := coalesce(NEW.legal_hold_reason, 'interim metadata marker');
        NEW.legal_hold_set_at := coalesce(NEW.legal_hold_set_at, now());
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_documents_before_insert_d2 ON public.documents;
CREATE TRIGGER trg_documents_before_insert_d2 BEFORE INSERT ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.documents_before_insert_d2();

CREATE OR REPLACE FUNCTION public.documents_after_insert_d2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_type text;
BEGIN
    IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.document_versions v WHERE v.id = NEW.current_version_id) THEN
        INSERT INTO public.document_versions (id, org_id, document_id, version_number, bucket, storage_path, original_filename,
                                              mime_type, byte_size, checksum_sha256, source, provenance, created_by, created_at, screening)
        VALUES (NEW.current_version_id, NEW.org_id, NEW.id,
                coalesce((SELECT max(v.version_number) FROM public.document_versions v WHERE v.document_id = NEW.id), 0) + 1,
                NEW.bucket, NEW.storage_path, NEW.original_filename, NEW.mime_type, NEW.byte_size, NEW.checksum_sha256,
                CASE WHEN NEW.checksum_sha256 IS NULL THEN 'document_insert_unhashed' ELSE 'document_insert' END,
                jsonb_strip_nulls(jsonb_build_object(
                    'doc_type', NEW.doc_type, 'template_key', NEW.template_key,
                    'generated_from_document_id', NEW.generated_from_document_id,
                    'writer_source', NEW.metadata -> 'source', 'version_role', NEW.metadata -> 'version_role')),
                CASE WHEN (NEW.metadata ->> 'uploaded_by') ~ '^[0-9a-f-]{36}$' THEN (NEW.metadata ->> 'uploaded_by')::uuid ELSE NULL END,
                NEW.created_at, NEW.metadata -> 'screening');
    END IF;

    v_type := public.document_subject_type_for_legacy(NEW.entity_type);
    IF v_type IS NOT NULL AND NEW.entity_id IS NOT NULL
       AND public.document_subject_resolves(NEW.org_id, v_type, NEW.entity_id) THEN
        PERFORM set_config('alloy.document_subjects_writer', 'on', true);
        INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source)
        VALUES (NEW.org_id, NEW.id, v_type, NEW.entity_id, 'owner', true, 'legacy_writer');
        PERFORM set_config('alloy.document_subjects_writer', 'off', true);
    END IF;
    -- A legacy subject that does not resolve gets no owner. The legacy columns still name it, so the scope check refuses
    -- the document exactly as before: ambiguous ownership fails closed without breaking the writer.
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_documents_after_insert_d2 ON public.documents;
CREATE TRIGGER trg_documents_after_insert_d2 AFTER INSERT ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.documents_after_insert_d2();

-- ── 6. documents: update guard (file projection, subject projection, sensitivity) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.documents_before_update_d2()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v record;
    v_type text;
BEGIN
    -- The file columns are a projection of the current version. Changing either side must leave them equal.
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

    -- The legacy parent is a projection of the primary owner. A legacy writer that re-files the document must name a subject
    -- that resolves in the organization; the AFTER trigger then makes it the primary owner.
    IF (NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.entity_id IS DISTINCT FROM OLD.entity_id)
       AND coalesce(current_setting('alloy.document_subject_projection', true), '') <> 'on' THEN
        v_type := public.document_subject_type_for_legacy(NEW.entity_type);
        IF v_type IS NULL OR NEW.entity_id IS NULL OR NOT public.document_subject_resolves(NEW.org_id, v_type, NEW.entity_id) THEN
            RAISE EXCEPTION 'document_subject_unresolved: a document is filed only under a subject of its organization'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.entity_type := public.document_legacy_entity_type(v_type);
    END IF;

    -- Sensitivity may only be raised: from standard to any class, or from any class to restricted.
    IF NEW.sensitivity IS DISTINCT FROM OLD.sensitivity
       AND NOT (OLD.sensitivity = 'standard' OR NEW.sensitivity = 'restricted') THEN
        RAISE EXCEPTION 'document_sensitivity_lowering: a document''s sensitivity may only be raised'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.legal_hold AND NOT OLD.legal_hold AND NEW.legal_hold_set_at IS NULL THEN
        NEW.legal_hold_set_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_documents_before_update_d2 ON public.documents;
CREATE TRIGGER trg_documents_before_update_d2 BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.documents_before_update_d2();

CREATE OR REPLACE FUNCTION public.documents_after_update_d2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_type text;
BEGIN
    IF (NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.entity_id IS DISTINCT FROM OLD.entity_id)
       AND coalesce(current_setting('alloy.document_subject_projection', true), '') <> 'on' THEN
        v_type := public.document_subject_type_for_legacy(NEW.entity_type);
        PERFORM set_config('alloy.document_subjects_writer', 'on', true);
        UPDATE public.document_subjects SET is_primary = false, ended_at = now()
         WHERE document_id = NEW.id AND is_primary AND ended_at IS NULL
           AND NOT (subject_type = v_type AND subject_id = NEW.entity_id);
        UPDATE public.document_subjects SET is_primary = true, association = 'owner'
         WHERE document_id = NEW.id AND subject_type = v_type AND subject_id = NEW.entity_id AND ended_at IS NULL;
        IF NOT FOUND THEN
            INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source)
            VALUES (NEW.org_id, NEW.id, v_type, NEW.entity_id, 'owner', true, 'legacy_writer');
        END IF;
        PERFORM set_config('alloy.document_subjects_writer', 'off', true);
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_documents_after_update_d2 ON public.documents;
CREATE TRIGGER trg_documents_after_update_d2 AFTER UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.documents_after_update_d2();

-- ── 7. document_subjects: one writer, organization and subject validity ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_subjects_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_doc_org uuid;
BEGIN
    -- Associations go only with their document (the cascade of the audited delete); otherwise they are ended, not deleted.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM public.documents d WHERE d.id = OLD.document_id) THEN
            RAISE EXCEPTION 'document_subjects_history: an association is ended, not deleted' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF coalesce(current_setting('alloy.document_subjects_writer', true), '') <> 'on' THEN
        RAISE EXCEPTION 'document_subjects_governed: document subjects are written only through the Documents functions'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT org_id INTO v_doc_org FROM public.documents WHERE id = NEW.document_id;
    IF v_doc_org IS NULL OR v_doc_org <> NEW.org_id THEN
        RAISE EXCEPTION 'document_subjects_org: an association must be in its document''s organization' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' AND NOT public.document_subject_resolves(NEW.org_id, NEW.subject_type, NEW.subject_id) THEN
        RAISE EXCEPTION 'document_subject_unresolved: % % is not a subject of this organization', NEW.subject_type, NEW.subject_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.document_id <> OLD.document_id OR NEW.subject_type <> OLD.subject_type
                             OR NEW.subject_id <> OLD.subject_id OR NEW.org_id <> OLD.org_id) THEN
        RAISE EXCEPTION 'document_subjects_immutable: an association''s subject never changes; end it and add another'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_subjects_guard ON public.document_subjects;
CREATE TRIGGER trg_document_subjects_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_subjects
    FOR EACH ROW EXECUTE FUNCTION public.document_subjects_guard();

-- ── 8. governed functions (service_role only) ──────────────────────────────────────────────────────────────────
-- Make (subject_type, subject_id) the document's primary owner and project the legacy parent from it.
CREATE OR REPLACE FUNCTION public.document_set_primary_subject(
    p_org_id uuid, p_document_id uuid, p_subject_type text, p_subject_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_prev record;
    v_doc record;
BEGIN
    SELECT id, org_id INTO v_doc FROM public.documents WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF p_subject_type NOT IN ('household', 'person', 'child', 'opportunity', 'vendor') THEN
        RAISE EXCEPTION 'document_subject_not_owner_type: % cannot own a document', p_subject_type USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.document_subject_resolves(p_org_id, p_subject_type, p_subject_id) THEN
        RAISE EXCEPTION 'document_subject_unresolved: % % is not a subject of this organization', p_subject_type, p_subject_id
            USING ERRCODE = 'check_violation';
    END IF;
    SELECT subject_type, subject_id INTO v_prev FROM public.document_subjects
     WHERE document_id = p_document_id AND is_primary AND ended_at IS NULL;

    PERFORM set_config('alloy.document_subjects_writer', 'on', true);
    UPDATE public.document_subjects SET is_primary = false, ended_at = now(), ended_by = p_actor
     WHERE document_id = p_document_id AND is_primary AND ended_at IS NULL
       AND NOT (subject_type = p_subject_type AND subject_id = p_subject_id);
    UPDATE public.document_subjects SET is_primary = true, association = 'owner'
     WHERE document_id = p_document_id AND subject_type = p_subject_type AND subject_id = p_subject_id AND ended_at IS NULL;
    IF NOT FOUND THEN
        INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source, created_by)
        VALUES (p_org_id, p_document_id, p_subject_type, p_subject_id, 'owner', true, 'governed', p_actor);
    END IF;
    PERFORM set_config('alloy.document_subjects_writer', 'off', true);

    PERFORM set_config('alloy.document_subject_projection', 'on', true);
    UPDATE public.documents SET entity_type = public.document_legacy_entity_type(p_subject_type), entity_id = p_subject_id
     WHERE id = p_document_id;
    PERFORM set_config('alloy.document_subject_projection', 'off', true);

    RETURN jsonb_build_object('document_id', p_document_id,
        'previous', CASE WHEN v_prev.subject_type IS NULL THEN NULL
                         ELSE jsonb_build_object('subject_type', v_prev.subject_type, 'subject_id', v_prev.subject_id) END,
        'primary', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
END;
$$;

-- Add a non-primary association: a further owner, or a context link.
CREATE OR REPLACE FUNCTION public.document_link_subject(
    p_org_id uuid, p_document_id uuid, p_subject_type text, p_subject_id uuid, p_association text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_document_id AND org_id = p_org_id) THEN
        RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT id INTO v_id FROM public.document_subjects
     WHERE document_id = p_document_id AND subject_type = p_subject_type AND subject_id = p_subject_id AND ended_at IS NULL;
    IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('association_id', v_id, 'created', false);
    END IF;
    PERFORM set_config('alloy.document_subjects_writer', 'on', true);
    INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source, created_by)
    VALUES (p_org_id, p_document_id, p_subject_type, p_subject_id, p_association, false, 'governed', p_actor)
    RETURNING id INTO v_id;
    PERFORM set_config('alloy.document_subjects_writer', 'off', true);
    RETURN jsonb_build_object('association_id', v_id, 'created', true);
END;
$$;

-- End a non-primary association. The primary owner is changed with document_set_primary_subject, never removed.
CREATE OR REPLACE FUNCTION public.document_unlink_subject(
    p_org_id uuid, p_document_id uuid, p_subject_type text, p_subject_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
BEGIN
    SELECT * INTO v FROM public.document_subjects
     WHERE org_id = p_org_id AND document_id = p_document_id AND subject_type = p_subject_type
       AND subject_id = p_subject_id AND ended_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('ended', false); END IF;
    IF v.is_primary THEN
        RAISE EXCEPTION 'document_primary_subject_required: change the primary owner instead of removing it'
            USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('alloy.document_subjects_writer', 'on', true);
    UPDATE public.document_subjects SET ended_at = now(), ended_by = p_actor WHERE id = v.id;
    PERFORM set_config('alloy.document_subjects_writer', 'off', true);
    RETURN jsonb_build_object('ended', true, 'association_id', v.id);
END;
$$;

-- Add a replacement version and make it current. The previous version stays, and stays retrievable.
CREATE OR REPLACE FUNCTION public.document_add_version(
    p_org_id uuid, p_document_id uuid, p_bucket text, p_storage_path text, p_original_filename text, p_mime_type text,
    p_byte_size bigint, p_checksum_sha256 text, p_reason text, p_actor uuid, p_screening jsonb, p_provenance jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_id uuid := gen_random_uuid();
    v_number int;
BEGIN
    SELECT id, org_id, current_version_id, status INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF v_doc.status IN ('deleted', 'quarantined', 'restricted') THEN
        RAISE EXCEPTION 'document_unavailable: a % document cannot take a new version', v_doc.status USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.current_version_id IS NULL THEN
        RAISE EXCEPTION 'document_without_version: the document has no current version to supersede' USING ERRCODE = 'check_violation';
    END IF;
    IF p_checksum_sha256 IS NULL OR p_checksum_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'document_version_checksum_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(max(version_number), 0) + 1 INTO v_number FROM public.document_versions WHERE document_id = p_document_id;
    INSERT INTO public.document_versions (id, org_id, document_id, version_number, bucket, storage_path, original_filename, mime_type,
                                          byte_size, checksum_sha256, source, provenance, created_by, supersedes_version_id,
                                          replacement_reason, screening)
    VALUES (v_id, p_org_id, p_document_id, v_number, p_bucket, p_storage_path, p_original_filename, p_mime_type, p_byte_size,
            p_checksum_sha256, 'replacement', coalesce(p_provenance, '{}'::jsonb), p_actor, v_doc.current_version_id,
            p_reason, p_screening);
    UPDATE public.documents
       SET current_version_id = v_id, bucket = p_bucket, storage_path = p_storage_path, original_filename = p_original_filename,
           mime_type = p_mime_type, byte_size = p_byte_size, checksum_sha256 = p_checksum_sha256,
           -- The OCR text and extracted data belonged to the previous bytes.
           extracted_text = NULL, extracted_data = '{}'::jsonb, extraction_status = NULL, extracted_at = NULL
     WHERE id = p_document_id;
    RETURN jsonb_build_object('version_id', v_id, 'version_number', v_number, 'supersedes_version_id', v_doc.current_version_id);
END;
$$;

-- Review and expiration metadata belongs to a version: the only mutable part of one.
CREATE OR REPLACE FUNCTION public.document_set_version_review(
    p_org_id uuid, p_version_id uuid, p_review_status text, p_actor uuid, p_effective_on date, p_expires_on date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.document_versions
       SET review_status = p_review_status, reviewed_by = p_actor, reviewed_at = now(),
           effective_on = p_effective_on, expires_on = p_expires_on
     WHERE id = p_version_id AND org_id = p_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_version_not_found' USING ERRCODE = 'no_data_found'; END IF;
    RETURN jsonb_build_object('version_id', p_version_id, 'review_status', p_review_status);
END;
$$;

REVOKE ALL ON FUNCTION public.document_set_primary_subject(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_set_primary_subject(uuid, uuid, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_link_subject(uuid, uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_link_subject(uuid, uuid, text, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_unlink_subject(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_unlink_subject(uuid, uuid, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_add_version(uuid, uuid, text, text, text, text, bigint, text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_add_version(uuid, uuid, text, text, text, text, bigint, text, text, uuid, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.document_set_version_review(uuid, uuid, text, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_set_version_review(uuid, uuid, text, uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.document_subject_resolves(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_subject_resolves(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.documents_after_insert_d2() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.documents_after_insert_d2() TO service_role;
REVOKE ALL ON FUNCTION public.documents_after_update_d2() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.documents_after_update_d2() TO service_role;

-- ── 9. derived context links (no copies) ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.document_subject_links WITH (security_invoker = true) AS
    SELECT s.org_id, s.document_id, s.subject_type, s.subject_id, s.association, s.is_primary, 'document_subjects'::text AS derived_from
      FROM public.document_subjects s WHERE s.ended_at IS NULL
    UNION ALL
    SELECT f.org_id, f.document_id, 'form_submission', f.form_submission_id, 'context', false, 'form_submission_documents:' || f.role
      FROM public.form_submission_documents f
    UNION ALL
    SELECT p.org_id, p.source_id, 'processing_case', p.processing_case_id, 'context', false, 'processing_case_sources:' || p.source_kind
      FROM public.processing_case_sources p WHERE p.source_kind IN ('document', 'recreated_document');
REVOKE ALL ON TABLE public.document_subject_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.document_subject_links TO service_role;

-- ── 10. backfill ───────────────────────────────────────────────────────────────────────────────────────────────
DO $backfill$
DECLARE
    v_before text;
    v_after text;
BEGIN
    SELECT md5(coalesce(string_agg(id::text || ':' || org_id::text || ':' || coalesce(bucket, '') || ':' || coalesce(storage_path, '')
                 || ':' || coalesce(checksum_sha256, '') || ':' || coalesce(byte_size::text, '') || ':' || coalesce(entity_type, '')
                 || ':' || coalesce(entity_id::text, ''), ',' ORDER BY id), ''))
      INTO v_before FROM public.documents;

    -- 10a. one legacy version per stored document that has none, then point the document at it.
    INSERT INTO public.document_versions (id, org_id, document_id, version_number, bucket, storage_path, original_filename, mime_type,
                                          byte_size, checksum_sha256, content_etag, source, provenance, created_at, screening)
    SELECT gen_random_uuid(), d.org_id, d.id,
           coalesce((SELECT max(v.version_number) FROM public.document_versions v WHERE v.document_id = d.id), 0) + 1,
           d.bucket, d.storage_path, d.original_filename, d.mime_type, d.byte_size, d.checksum_sha256,
           (SELECT o.metadata ->> 'eTag' FROM storage.objects o WHERE o.bucket_id = d.bucket AND o.name = d.storage_path),
           'legacy_backfill',
           jsonb_strip_nulls(jsonb_build_object('doc_type', d.doc_type, 'template_key', d.template_key,
               'generated_from_document_id', d.generated_from_document_id, 'writer_source', d.metadata -> 'source',
               'version_role', d.metadata -> 'version_role', 'backfill', 'd2')),
           d.created_at, d.metadata -> 'screening'
      FROM public.documents d
     WHERE d.storage_path IS NOT NULL AND d.current_version_id IS NULL AND d.bucket IS NOT NULL
       AND split_part(d.storage_path, '/', 1) = d.org_id::text
       AND NOT EXISTS (SELECT 1 FROM public.document_versions v WHERE v.document_id = d.id AND v.source = 'legacy_backfill');
    UPDATE public.documents d
       SET current_version_id = (SELECT v.id FROM public.document_versions v
                                  WHERE v.document_id = d.id AND v.source = 'legacy_backfill' ORDER BY v.version_number DESC LIMIT 1)
     WHERE d.current_version_id IS NULL
       AND EXISTS (SELECT 1 FROM public.document_versions v WHERE v.document_id = d.id AND v.source = 'legacy_backfill');

    -- 10b. one primary owner per document whose legacy subject resolves in its organization.
    PERFORM set_config('alloy.document_subjects_writer', 'on', true);
    INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source, created_at)
    SELECT d.org_id, d.id, public.document_subject_type_for_legacy(d.entity_type), d.entity_id, 'owner', true, 'legacy_backfill', d.created_at
      FROM public.documents d
     WHERE public.document_subject_type_for_legacy(d.entity_type) IS NOT NULL AND d.entity_id IS NOT NULL
       AND public.document_subject_resolves(d.org_id, public.document_subject_type_for_legacy(d.entity_type), d.entity_id)
       AND NOT EXISTS (SELECT 1 FROM public.document_subjects s WHERE s.document_id = d.id AND s.is_primary AND s.ended_at IS NULL);
    PERFORM set_config('alloy.document_subjects_writer', 'off', true);

    -- 10c. declared sensitivity from the D1b inference only (raise-only).
    UPDATE public.documents d SET sensitivity = 'medical'
     WHERE d.sensitivity = 'standard'
       AND (d.doc_type IN ('physical', 'immunization_record', 'health_care_plan', 'medication_authorization')
            OR EXISTS (SELECT 1 FROM public.form_submission_documents f
                        WHERE f.document_id = d.id AND public.is_medical_form_submission(f.form_submission_id)));
    UPDATE public.documents d SET sensitivity = 'custody_safeguarding'
     WHERE d.sensitivity = 'standard'
       AND EXISTS (SELECT 1 FROM public.child_safeguarding_restrictions r WHERE r.evidence_document_id = d.id);

    -- 10d. the interim hold markers.
    UPDATE public.documents d SET legal_hold = true, legal_hold_reason = 'interim metadata marker', legal_hold_set_at = now()
     WHERE NOT d.legal_hold AND (d.metadata ->> 'legal_hold') = 'true';
    UPDATE public.documents d SET retention_until = (d.metadata ->> 'retention_until')::date
     WHERE d.retention_until IS NULL AND (d.metadata ->> 'retention_until') ~ '^\d{4}-\d{2}-\d{2}';

    SELECT md5(coalesce(string_agg(id::text || ':' || org_id::text || ':' || coalesce(bucket, '') || ':' || coalesce(storage_path, '')
                 || ':' || coalesce(checksum_sha256, '') || ':' || coalesce(byte_size::text, '') || ':' || coalesce(entity_type, '')
                 || ':' || coalesce(entity_id::text, ''), ',' ORDER BY id), ''))
      INTO v_after FROM public.documents;
    IF v_before <> v_after THEN
        RAISE EXCEPTION 'd2 backfill changed a document''s identity, file or legacy parent (% → %)', v_before, v_after;
    END IF;
END
$backfill$;

-- ── 11. self-verification ──────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    n bigint;
    r text;
BEGIN
    SELECT count(*) INTO n FROM public.documents d
     WHERE d.storage_path IS NOT NULL AND d.bucket IS NOT NULL AND split_part(d.storage_path, '/', 1) = d.org_id::text AND d.current_version_id IS NULL;
    IF n > 0 THEN RAISE EXCEPTION 'd2 verify: % stored documents have no current version', n; END IF;

    SELECT count(*) INTO n FROM public.documents d JOIN public.document_versions v ON v.id = d.current_version_id
     WHERE v.document_id <> d.id OR v.bucket IS DISTINCT FROM d.bucket OR v.storage_path IS DISTINCT FROM d.storage_path
        OR v.mime_type IS DISTINCT FROM d.mime_type OR v.byte_size IS DISTINCT FROM d.byte_size
        OR v.checksum_sha256 IS DISTINCT FROM d.checksum_sha256;
    IF n > 0 THEN RAISE EXCEPTION 'd2 verify: % documents disagree with their current version', n; END IF;

    SELECT count(*) INTO n FROM public.documents d
     WHERE public.document_subject_type_for_legacy(d.entity_type) IS NOT NULL AND d.entity_id IS NOT NULL
       AND public.document_subject_resolves(d.org_id, public.document_subject_type_for_legacy(d.entity_type), d.entity_id)
       AND NOT EXISTS (SELECT 1 FROM public.document_subjects s
                        WHERE s.document_id = d.id AND s.is_primary AND s.ended_at IS NULL
                          AND public.document_legacy_entity_type(s.subject_type) = public.document_legacy_entity_type(public.document_subject_type_for_legacy(d.entity_type))
                          AND s.subject_id = d.entity_id);
    IF n > 0 THEN RAISE EXCEPTION 'd2 verify: % resolvable documents lack a matching primary owner', n; END IF;

    SELECT count(*) INTO n FROM public.document_subjects s JOIN public.documents d ON d.id = s.document_id
     WHERE s.is_primary AND s.ended_at IS NULL
       AND (d.entity_id IS DISTINCT FROM s.subject_id
            OR public.document_subject_type_for_legacy(d.entity_type) IS DISTINCT FROM s.subject_type);
    IF n > 0 THEN RAISE EXCEPTION 'd2 verify: % primary owners disagree with the legacy parent', n; END IF;

    SELECT count(*) INTO n FROM public.document_subjects s JOIN public.documents d ON d.id = s.document_id WHERE s.org_id <> d.org_id;
    IF n > 0 THEN RAISE EXCEPTION 'd2 verify: % associations cross organizations', n; END IF;

    SELECT count(*) INTO n FROM public.documents d
     WHERE d.sensitivity = 'standard' AND d.doc_type IN ('physical', 'immunization_record', 'health_care_plan', 'medication_authorization');
    IF n > 0 THEN RAISE EXCEPTION 'd2 verify: % medical-type documents are declared standard', n; END IF;

    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(r, 'public.document_subjects'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege(r, 'public.document_subject_links'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege(r, 'public.documents'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_table_privilege(r, 'public.document_versions'::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
            RAISE EXCEPTION 'd2 verify: role % holds a privilege on a documents table', r;
        END IF;
        -- A function's only privilege is the right to run it, so any ACL entry for the role (or PUBLIC) is a leak.
        IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                    WHERE p.oid IN ('public.document_add_version(uuid, uuid, text, text, text, text, bigint, text, text, uuid, jsonb, jsonb)'::regprocedure,
                                    'public.document_set_primary_subject(uuid, uuid, text, uuid, uuid)'::regprocedure,
                                    'public.document_link_subject(uuid, uuid, text, uuid, text, uuid)'::regprocedure,
                                    'public.document_unlink_subject(uuid, uuid, text, uuid, uuid)'::regprocedure,
                                    'public.document_set_version_review(uuid, uuid, text, uuid, date, date)'::regprocedure)
                      AND (a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = r))) THEN
            RAISE EXCEPTION 'd2 verify: role % may run a governed documents function', r;
        END IF;
    END LOOP;
END
$verify$;

COMMENT ON COLUMN public.documents.current_version_id IS 'D2: the current immutable file (document_versions). The file columns on documents are its projection.';
COMMENT ON COLUMN public.documents.sensitivity IS 'D2: declared class (standard | personal_identity | medical | custody_safeguarding | restricted). Raise-only; the read path adds the D1b inference.';
COMMENT ON COLUMN public.documents.entity_type IS 'D2: legacy parent, a projection of the primary owner in document_subjects. Not a mutation authority.';
COMMENT ON TABLE public.document_subjects IS 'D2: typed subject associations (owner | context). Written only through the document_* functions.';
