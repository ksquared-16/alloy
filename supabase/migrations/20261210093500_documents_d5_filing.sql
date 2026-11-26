-- Documents V1 — D5: filing a received document to a customer record, as ONE transaction.
--
-- Before D5 a Processing document case reached "approved" without the document being filed anywhere: approval of a
-- non-form source was a routed no-op. Filing touches several durable rows — the document's type (and through the D3
-- trigger its sensitivity), its primary owner, its context associations, its current version's review, and the filing
-- record itself — so it is one function here, and either all of it commits or none of it does.
--
--   document_file             file an unfiled (or already identically filed) document under a primary owner, with
--                             context associations, as a published Studio type. Idempotent on a caller filing key.
--   document_file_as_version  file a received document as the NEXT VERSION of an existing document, when the type's
--                             replacement policy is new_version. The received bytes become version n+1 of the existing
--                             logical document; the received document is kept (provenance) and becomes `superseded`.
--   document_filing_type      the published policy of an organization's active type, the one read both use.
--   document_version_require_review  a new version of a review-required type starts pending review.
--
-- The Studio policy D3 declared is ENFORCED here, for filing: the type must be an active, published type; the primary
-- owner's subject type must be one the type applies to; the file's format must be an allowed format; a review-required
-- type needs an accepted review; and the replacement policy decides between a new document, a new version, or a refusal.
-- Sensitivity follows the type's default through the D3 trigger and an explicit request, raise-only. Validity
-- (expiration, reconfirmation) stays declared intent for D7 and is not read here.
--
-- Unavailable documents (deleted, quarantined, restricted, superseded) are never filed: a quarantined file cannot reach a
-- customer record by being filed, only by its audited release.
--
-- Authorization (documents.write, Processing authority, scope of every subject, clearance for the resulting class) is
-- decided by the application BEFORE the call, and is recorded in workflow_events before the effect. These functions are
-- service_role only.

-- ── 1. `superseded` joins the unavailable statuses for new versions ─────────────────────────────────────────────
-- Re-declares the D2 function, unchanged except for the status list.
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
    IF v_doc.status IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
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
           extracted_text = NULL, extracted_data = '{}'::jsonb, extraction_status = NULL, extracted_at = NULL
     WHERE id = p_document_id;
    RETURN jsonb_build_object('version_id', v_id, 'version_number', v_number, 'supersedes_version_id', v_doc.current_version_id);
END;
$$;

-- ── 2. shared reads ──────────────────────────────────────────────────────────────────────────────────────────────
-- The stored content type → the Studio format key. NULL for anything the governed bucket does not hold.
CREATE OR REPLACE FUNCTION public.document_format_for_mime(_mime text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE lower(coalesce(_mime, ''))
        WHEN 'application/pdf' THEN 'pdf'
        WHEN 'image/png' THEN 'png'
        WHEN 'image/jpeg' THEN 'jpeg'
        WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'
        WHEN 'application/msword' THEN 'doc'
        WHEN 'text/plain' THEN 'txt'
        WHEN 'text/csv' THEN 'csv'
        WHEN 'text/html' THEN 'html'
        ELSE NULL END;
$$;

-- The published policy of an organization's ACTIVE type with this key; no row when there is none.
CREATE OR REPLACE FUNCTION public.document_filing_type(_org_id uuid, _doc_type text)
RETURNS TABLE (type_id uuid, version_id uuid, subject_types text[], allowed_formats text[], default_sensitivity text,
               review_required boolean, replacement_policy text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT t.id, v.id, v.subject_types, v.allowed_formats, v.default_sensitivity, v.review_required, v.replacement_policy
      FROM public.document_types t
      JOIN public.document_type_versions v ON v.id = t.published_version_id AND v.status = 'published'
     WHERE t.org_id = _org_id AND t.key = _doc_type AND t.status = 'active';
$$;

-- The household a filing subject belongs to (child → its household; person → any household it is an adult of;
-- opportunity → its household). Used to refuse a context association that is not related to the primary owner.
CREATE OR REPLACE FUNCTION public.document_filing_subject_in_household(_org_id uuid, _subject_type text, _subject_id uuid, _household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE _subject_type
        WHEN 'household' THEN _subject_id = _household_id AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _subject_id AND c.org_id = _org_id)
        WHEN 'child' THEN EXISTS (SELECT 1 FROM public.customer_members m WHERE m.id = _subject_id AND m.org_id = _org_id AND m.customer_id = _household_id)
        WHEN 'person' THEN EXISTS (SELECT 1 FROM public.customer_persons p WHERE p.person_id = _subject_id AND p.org_id = _org_id AND p.customer_id = _household_id)
        WHEN 'opportunity' THEN EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = _subject_id AND o.org_id = _org_id AND o.customer_id = _household_id)
        ELSE false END;
$$;

-- A context association must sit in a household the primary owner belongs to. Vendors own documents alone.
CREATE OR REPLACE FUNCTION public.document_filing_related(_org_id uuid, _primary_type text, _primary_id uuid, _subject_type text, _subject_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    h uuid;
BEGIN
    FOR h IN
        SELECT _primary_id WHERE _primary_type = 'household'
        UNION SELECT m.customer_id FROM public.customer_members m WHERE _primary_type = 'child' AND m.id = _primary_id AND m.org_id = _org_id
        UNION SELECT p.customer_id FROM public.customer_persons p WHERE _primary_type = 'person' AND p.person_id = _primary_id AND p.org_id = _org_id
        UNION SELECT o.customer_id FROM public.opportunities o WHERE _primary_type = 'opportunity' AND o.id = _primary_id AND o.org_id = _org_id
    LOOP
        IF h IS NOT NULL AND public.document_filing_subject_in_household(_org_id, _subject_type, _subject_id, h) THEN
            RETURN true;
        END IF;
    END LOOP;
    RETURN false;
END;
$$;

-- Active, available documents of this type whose PRIMARY owner is this subject (the replacement policy's question).
CREATE OR REPLACE FUNCTION public.document_filing_existing_of_type(_org_id uuid, _doc_type text, _subject_type text, _subject_id uuid, _except uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.id
      FROM public.documents d
      JOIN public.document_subjects s ON s.document_id = d.id AND s.is_primary AND s.ended_at IS NULL
     WHERE d.org_id = _org_id AND d.doc_type = _doc_type AND d.id <> coalesce(_except, '00000000-0000-0000-0000-000000000000'::uuid)
       AND coalesce(d.status, 'uploaded') NOT IN ('deleted', 'quarantined', 'restricted', 'superseded')
       AND s.subject_type = _subject_type AND s.subject_id = _subject_id
     ORDER BY d.created_at DESC;
$$;

-- ── 3. document_file ─────────────────────────────────────────────────────────────────────────────────────────────
-- p_contexts: jsonb array of {"subject_type", "subject_id"}. p_review_status: NULL or 'accepted' (the operator reviewed
-- the document when filing it). p_sensitivity: NULL, or a class to raise to. p_filing_key: the caller's idempotency key.
-- p_audit_event_id: the `document_filing_authorized` event recorded before this call; the filing record names it, so the
-- document's history shows exactly which audited attempt committed.
-- Returns {replay, document_id, version_id, doc_type, sensitivity, primary, contexts, type_version_id, filing}.
CREATE OR REPLACE FUNCTION public.document_file(
    p_org_id uuid, p_document_id uuid, p_doc_type text, p_primary_type text, p_primary_id uuid, p_contexts jsonb,
    p_review_status text, p_sensitivity text, p_filing_key text, p_actor uuid, p_case_id uuid, p_audit_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_type record;
    v_prev record;
    v_ctx jsonb;
    v_ctx_type text;
    v_ctx_id uuid;
    v_contexts jsonb := '[]'::jsonb;
    v_format text;
    v_filing jsonb;
    v_existing uuid;
    v_sensitivity text;
BEGIN
    IF p_filing_key IS NULL OR length(p_filing_key) < 8 OR length(p_filing_key) > 200 THEN
        RAISE EXCEPTION 'document_filing_key_required' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, org_id, status, doc_type, mime_type, sensitivity, current_version_id, metadata INTO v_doc
      FROM public.documents WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'no_data_found'; END IF;

    -- Replay: the same key already filed this document. Nothing is written again.
    IF v_doc.metadata -> 'filing' ->> 'key' = p_filing_key THEN
        RETURN jsonb_build_object('replay', true, 'document_id', v_doc.id, 'version_id', v_doc.current_version_id,
            'doc_type', v_doc.doc_type, 'sensitivity', v_doc.sensitivity, 'filing', v_doc.metadata -> 'filing');
    END IF;

    IF coalesce(v_doc.status, 'uploaded') IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
        RAISE EXCEPTION 'document_filing_unavailable: a % document cannot be filed', v_doc.status USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.metadata ? 'filing' THEN
        RAISE EXCEPTION 'document_filing_already_filed: the document was filed by another filing' USING ERRCODE = 'check_violation';
    END IF;
    IF p_primary_type NOT IN ('household', 'person', 'child', 'opportunity', 'vendor') THEN
        RAISE EXCEPTION 'document_subject_not_owner_type: % cannot own a document', p_primary_type USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.document_subject_resolves(p_org_id, p_primary_type, p_primary_id) THEN
        RAISE EXCEPTION 'document_subject_unresolved: % % is not a subject of this organization', p_primary_type, p_primary_id
            USING ERRCODE = 'check_violation';
    END IF;
    SELECT subject_type, subject_id INTO v_prev FROM public.document_subjects
     WHERE document_id = p_document_id AND is_primary AND ended_at IS NULL;
    IF v_prev.subject_type IS NOT NULL AND NOT (v_prev.subject_type = p_primary_type AND v_prev.subject_id = p_primary_id) THEN
        RAISE EXCEPTION 'document_filing_owner_conflict: the document already belongs to another record' USING ERRCODE = 'check_violation';
    END IF;

    -- Studio policy.
    SELECT * INTO v_type FROM public.document_filing_type(p_org_id, p_doc_type);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'document_filing_type_unpublished: % is not a published document type', p_doc_type USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (p_primary_type = ANY (v_type.subject_types)) THEN
        RAISE EXCEPTION 'document_filing_subject_type_not_applicable: % does not apply to %', p_doc_type, p_primary_type
            USING ERRCODE = 'check_violation';
    END IF;
    v_format := public.document_format_for_mime(v_doc.mime_type);
    IF v_format IS NULL OR NOT (v_format = ANY (v_type.allowed_formats)) THEN
        RAISE EXCEPTION 'document_filing_format_not_allowed: % is not an allowed format of %', coalesce(v_format, 'unknown'), p_doc_type
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_review_status IS NOT NULL AND p_review_status <> 'accepted' THEN
        RAISE EXCEPTION 'document_filing_review_status_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF v_type.review_required AND p_review_status IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'document_filing_review_required: % requires an accepted review before filing', p_doc_type USING ERRCODE = 'check_violation';
    END IF;
    IF v_type.replacement_policy IN ('new_version', 'not_allowed') THEN
        SELECT e INTO v_existing FROM public.document_filing_existing_of_type(p_org_id, p_doc_type, p_primary_type, p_primary_id, p_document_id) AS e LIMIT 1;
        IF v_existing IS NOT NULL THEN
            IF v_type.replacement_policy = 'not_allowed' THEN
                RAISE EXCEPTION 'document_filing_replacement_not_allowed: the record already holds a % document', p_doc_type USING ERRCODE = 'check_violation';
            END IF;
            RAISE EXCEPTION 'document_filing_new_version_required: file it as a new version of %', v_existing USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF p_sensitivity IS NOT NULL AND p_sensitivity NOT IN ('standard', 'personal_identity', 'medical', 'custody_safeguarding', 'restricted') THEN
        RAISE EXCEPTION 'document_filing_sensitivity_unknown' USING ERRCODE = 'check_violation';
    END IF;

    -- Context associations: owning subject types, in the organization, related to the primary owner, never the primary.
    FOR v_ctx IN SELECT * FROM jsonb_array_elements(coalesce(p_contexts, '[]'::jsonb)) LOOP
        v_ctx_type := v_ctx ->> 'subject_type';
        BEGIN
            v_ctx_id := (v_ctx ->> 'subject_id')::uuid;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'document_filing_context_invalid' USING ERRCODE = 'check_violation';
        END;
        IF v_ctx_type NOT IN ('household', 'person', 'child', 'opportunity') OR v_ctx_id IS NULL THEN
            RAISE EXCEPTION 'document_filing_context_invalid' USING ERRCODE = 'check_violation';
        END IF;
        IF v_ctx_type = p_primary_type AND v_ctx_id = p_primary_id THEN CONTINUE; END IF;
        IF NOT public.document_subject_resolves(p_org_id, v_ctx_type, v_ctx_id) THEN
            RAISE EXCEPTION 'document_subject_unresolved: % % is not a subject of this organization', v_ctx_type, v_ctx_id USING ERRCODE = 'check_violation';
        END IF;
        IF NOT public.document_filing_related(p_org_id, p_primary_type, p_primary_id, v_ctx_type, v_ctx_id) THEN
            RAISE EXCEPTION 'document_filing_context_unrelated: % % is not related to the primary record', v_ctx_type, v_ctx_id USING ERRCODE = 'check_violation';
        END IF;
        v_contexts := v_contexts || jsonb_build_array(jsonb_build_object('subject_type', v_ctx_type, 'subject_id', v_ctx_id));
    END LOOP;

    -- Effects, in one transaction. The type first: the D3 trigger raises the class to the type's default.
    UPDATE public.documents SET doc_type = p_doc_type, updated_at = now() WHERE id = p_document_id;
    IF p_sensitivity IS NOT NULL THEN
        UPDATE public.documents SET sensitivity = public.document_sensitivity_raise(sensitivity, p_sensitivity) WHERE id = p_document_id;
    END IF;
    PERFORM public.document_set_primary_subject(p_org_id, p_document_id, p_primary_type, p_primary_id, p_actor);
    FOR v_ctx IN SELECT * FROM jsonb_array_elements(v_contexts) LOOP
        PERFORM public.document_link_subject(p_org_id, p_document_id, v_ctx ->> 'subject_type', (v_ctx ->> 'subject_id')::uuid, 'context', p_actor);
    END LOOP;
    IF p_review_status = 'accepted' AND v_doc.current_version_id IS NOT NULL THEN
        UPDATE public.document_versions SET review_status = 'accepted', reviewed_by = p_actor, reviewed_at = now()
         WHERE id = v_doc.current_version_id AND org_id = p_org_id;
    END IF;

    v_filing := jsonb_build_object(
        'key', p_filing_key, 'mode', 'new_document', 'doc_type', p_doc_type, 'type_version_id', v_type.version_id,
        'primary', jsonb_build_object('subject_type', p_primary_type, 'subject_id', p_primary_id),
        'contexts', v_contexts, 'review_status', p_review_status, 'processing_case_id', p_case_id,
        'audit_event_id', p_audit_event_id, 'filed_by', p_actor, 'filed_at', now());
    UPDATE public.documents SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('filing', v_filing) WHERE id = p_document_id;

    SELECT sensitivity INTO v_sensitivity FROM public.documents WHERE id = p_document_id;
    RETURN jsonb_build_object('replay', false, 'document_id', p_document_id, 'version_id', v_doc.current_version_id,
        'doc_type', p_doc_type, 'sensitivity', v_sensitivity, 'filing', v_filing);
END;
$$;

-- ── 4. document_file_as_version ─────────────────────────────────────────────────────────────────────────────────
-- The received document's bytes were copied by the caller to p_storage_path (the version store holds one object per
-- version, so the target cannot share the received document's object). Everything else is one transaction: the new
-- version on the target, its review, and the received document becoming `superseded`, pointing at the version it
-- became. The received document's own row, version and object are kept as provenance.
CREATE OR REPLACE FUNCTION public.document_file_as_version(
    p_org_id uuid, p_document_id uuid, p_target_document_id uuid, p_bucket text, p_storage_path text, p_reason text,
    p_review_status text, p_filing_key text, p_actor uuid, p_case_id uuid, p_audit_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_target record;
    v_type record;
    v_owner record;
    v_screening jsonb;
    v_format text;
    v_version jsonb;
    v_filing jsonb;
BEGIN
    IF p_filing_key IS NULL OR length(p_filing_key) < 8 OR length(p_filing_key) > 200 THEN
        RAISE EXCEPTION 'document_filing_key_required' USING ERRCODE = 'check_violation';
    END IF;
    IF p_document_id = p_target_document_id THEN
        RAISE EXCEPTION 'document_filing_target_invalid' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, doc_type, mime_type, original_filename, byte_size, checksum_sha256, current_version_id, metadata INTO v_doc
      FROM public.documents WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'no_data_found'; END IF;

    IF v_doc.metadata -> 'filing' ->> 'key' = p_filing_key THEN
        RETURN jsonb_build_object('replay', true, 'document_id', p_document_id,
            'target_document_id', v_doc.metadata -> 'filing' ->> 'target_document_id',
            'version_id', v_doc.metadata -> 'filing' ->> 'version_id', 'filing', v_doc.metadata -> 'filing');
    END IF;
    IF coalesce(v_doc.status, 'uploaded') IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
        RAISE EXCEPTION 'document_filing_unavailable: a % document cannot be filed', v_doc.status USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.metadata ? 'filing' THEN
        RAISE EXCEPTION 'document_filing_already_filed: the document was filed by another filing' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = p_document_id AND is_primary AND ended_at IS NULL) THEN
        RAISE EXCEPTION 'document_filing_owner_conflict: a document that already belongs to a record is not merged into another'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, status, doc_type INTO v_target FROM public.documents WHERE id = p_target_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_filing_target_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF coalesce(v_target.status, 'uploaded') IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
        RAISE EXCEPTION 'document_filing_target_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    SELECT subject_type, subject_id INTO v_owner FROM public.document_subjects
     WHERE document_id = p_target_document_id AND is_primary AND ended_at IS NULL;
    IF v_owner.subject_type IS NULL THEN
        RAISE EXCEPTION 'document_filing_target_unfiled' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_type FROM public.document_filing_type(p_org_id, v_target.doc_type);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'document_filing_type_unpublished: % is not a published document type', v_target.doc_type USING ERRCODE = 'check_violation';
    END IF;
    IF v_type.replacement_policy <> 'new_version' THEN
        RAISE EXCEPTION 'document_filing_new_version_not_allowed: % is filed as %', v_target.doc_type, v_type.replacement_policy
            USING ERRCODE = 'check_violation';
    END IF;
    v_format := public.document_format_for_mime(v_doc.mime_type);
    IF v_format IS NULL OR NOT (v_format = ANY (v_type.allowed_formats)) THEN
        RAISE EXCEPTION 'document_filing_format_not_allowed: % is not an allowed format of %', coalesce(v_format, 'unknown'), v_target.doc_type
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_review_status IS NOT NULL AND p_review_status <> 'accepted' THEN
        RAISE EXCEPTION 'document_filing_review_status_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF v_type.review_required AND p_review_status IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'document_filing_review_required: % requires an accepted review before filing', v_target.doc_type USING ERRCODE = 'check_violation';
    END IF;
    IF p_storage_path IS NULL OR p_storage_path NOT LIKE p_org_id::text || '/%' THEN
        RAISE EXCEPTION 'document_filing_storage_path_invalid' USING ERRCODE = 'check_violation';
    END IF;

    SELECT screening INTO v_screening FROM public.document_versions WHERE id = v_doc.current_version_id;
    v_version := public.document_add_version(p_org_id, p_target_document_id, p_bucket, p_storage_path, v_doc.original_filename,
        v_doc.mime_type, v_doc.byte_size, v_doc.checksum_sha256, coalesce(nullif(trim(p_reason), ''), 'Filed from a received document'),
        p_actor, v_screening,
        jsonb_build_object('filed_from_document_id', p_document_id, 'processing_case_id', p_case_id, 'filing_key', p_filing_key,
                           'audit_event_id', p_audit_event_id));
    IF p_review_status = 'accepted' THEN
        UPDATE public.document_versions SET review_status = 'accepted', reviewed_by = p_actor, reviewed_at = now()
         WHERE id = (v_version ->> 'version_id')::uuid;
    END IF;

    v_filing := jsonb_build_object(
        'key', p_filing_key, 'mode', 'new_version', 'doc_type', v_target.doc_type, 'type_version_id', v_type.version_id,
        'target_document_id', p_target_document_id, 'version_id', v_version ->> 'version_id',
        'version_number', (v_version ->> 'version_number')::int,
        'primary', jsonb_build_object('subject_type', v_owner.subject_type, 'subject_id', v_owner.subject_id),
        'review_status', p_review_status, 'processing_case_id', p_case_id, 'audit_event_id', p_audit_event_id,
        'filed_by', p_actor, 'filed_at', now());
    UPDATE public.documents
       SET status = 'superseded', updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('filing', v_filing)
     WHERE id = p_document_id;

    RETURN jsonb_build_object('replay', false, 'document_id', p_document_id, 'target_document_id', p_target_document_id,
        'version_id', v_version ->> 'version_id', 'version_number', (v_version ->> 'version_number')::int, 'filing', v_filing);
END;
$$;

-- ── 5. a new version of a review-required type starts PENDING review ───────────────────────────────────────────
-- Called by the upload and replacement routes for a review-required type. Never overwrites a review already recorded.
CREATE OR REPLACE FUNCTION public.document_version_require_review(p_org_id uuid, p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_version uuid;
BEGIN
    SELECT current_version_id INTO v_version FROM public.documents WHERE id = p_document_id AND org_id = p_org_id;
    IF v_version IS NULL THEN RETURN jsonb_build_object('pending', false); END IF;
    UPDATE public.document_versions SET review_status = 'pending'
     WHERE id = v_version AND org_id = p_org_id AND review_status IS NULL;
    RETURN jsonb_build_object('pending', FOUND, 'version_id', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.document_add_version(uuid, uuid, text, text, text, text, bigint, text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_add_version(uuid, uuid, text, text, text, text, bigint, text, text, uuid, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.document_format_for_mime(text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_format_for_mime(text) TO service_role;
REVOKE ALL ON FUNCTION public.document_filing_type(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_filing_type(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.document_filing_subject_in_household(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_filing_subject_in_household(uuid, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_filing_related(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_filing_related(uuid, text, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_filing_existing_of_type(uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_filing_existing_of_type(uuid, text, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_file(uuid, uuid, text, text, uuid, jsonb, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_file(uuid, uuid, text, text, uuid, jsonb, text, text, text, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_file_as_version(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_file_as_version(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_version_require_review(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_version_require_review(uuid, uuid) TO service_role;
