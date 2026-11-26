-- Documents V1 — D9.3 archive (Q5, user-ratified 2026-11-03). PENDING: NOT APPLIED to any database.
-- Objective OPWORK_AA660DC9554D_SPRINT_AFD07879C606, lane lane_aa660dc9554d. Needs its own governed apply approval.
--
-- What it does:
--   1. `archived` joins the unavailable document statuses in EVERY function that decides availability, so an archived
--      document can no longer be filed, take a version, be filed onto, be reviewed or have its dates changed — exactly
--      like quarantined / restricted / superseded. Each function below is the latest definition in supabase/migrations,
--      re-declared byte-for-byte except that list (generated; see certification/documents-v1/D9-3-ARCHIVE-MIGRATION.md).
--   2. public.document_archive: the one writer of `archived`. Row-locked, idempotent per archive key (a retry with the
--      same key answers replay), refuses an already-unavailable document, records who/why/when on the document's own
--      metadata.archive, and deletes nothing (bytes, versions, review events, subjects stay).
--   3. public.document_unarchive: staff-only reversal (service role; no external route calls it), back to the status the
--      document had before, recorded in metadata.archive.restored_at.
-- What it does not do: no table, no column, no constraint, no data change. The TypeScript side already treats `archived`
-- as unavailable (lib/documents/documentAvailability.ts); before this migration no document can hold that status.
-- Rollback: re-apply the six function definitions from their source migrations and DROP the two new functions.

-- public.document_add_version: re-declared from 20261210093500_documents_d5_filing.sql unchanged except the unavailable list (+ 'archived', 1x).
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
    IF v_doc.status IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
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

-- public.document_filing_existing_of_type: re-declared from 20261210093500_documents_d5_filing.sql unchanged except the unavailable list (+ 'archived', 1x).
CREATE OR REPLACE FUNCTION public.document_filing_existing_of_type(_org_id uuid, _doc_type text, _subject_type text, _subject_id uuid, _except uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.id
      FROM public.documents d
      JOIN public.document_subjects s ON s.document_id = d.id AND s.is_primary AND s.ended_at IS NULL
     WHERE d.org_id = _org_id AND d.doc_type = _doc_type AND d.id <> coalesce(_except, '00000000-0000-0000-0000-000000000000'::uuid)
       AND coalesce(d.status, 'uploaded') NOT IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived')
       AND s.subject_type = _subject_type AND s.subject_id = _subject_id
     ORDER BY d.created_at DESC;
$$;

-- public.document_file: re-declared from 20261210093500_documents_d5_filing.sql unchanged except the unavailable list (+ 'archived', 1x).
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

    IF coalesce(v_doc.status, 'uploaded') IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
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

-- public.document_file_as_version: re-declared from 20261210093500_documents_d5_filing.sql unchanged except the unavailable list (+ 'archived', 2x).
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
    IF coalesce(v_doc.status, 'uploaded') IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
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
    IF coalesce(v_target.status, 'uploaded') IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
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

-- public.document_review_version: re-declared from 20261213090000_documents_d7_review_validity.sql unchanged except the unavailable list (+ 'archived', 1x).
CREATE OR REPLACE FUNCTION public.document_review_version(
    p_org_id uuid, p_document_id uuid, p_version_id uuid, p_decision text, p_reason text, p_actor uuid, p_rereview boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_ver record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
    v_status text;
    v_event text;
    v_id uuid;
BEGIN
    IF p_decision NOT IN ('accepted', 'rejected', 'pending') THEN
        RAISE EXCEPTION 'document_review_decision_invalid' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, current_version_id INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
        RAISE EXCEPTION 'document_review_document_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.current_version_id IS NULL OR v_doc.current_version_id <> p_version_id THEN
        RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, review_status, effective_on, expires_on INTO v_ver FROM public.document_versions
     WHERE id = p_version_id AND org_id = p_org_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation'; END IF;

    v_status := CASE WHEN p_decision = 'pending' THEN 'pending' ELSE p_decision END;
    IF v_ver.review_status IN ('accepted', 'rejected') THEN
        IF NOT coalesce(p_rereview, false) THEN
            RAISE EXCEPTION 'document_review_already_decided' USING ERRCODE = 'check_violation';
        END IF;
        IF v_reason IS NULL OR length(v_reason) < 3 THEN
            RAISE EXCEPTION 'document_review_reason_required' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF p_decision IN ('rejected', 'pending') AND (v_reason IS NULL OR length(v_reason) < 3) THEN
        RAISE EXCEPTION 'document_review_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    IF p_decision = 'pending' AND coalesce(v_ver.review_status, 'pending') = 'pending' THEN
        RAISE EXCEPTION 'document_review_already_pending' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.document_versions
       SET review_status = v_status,
           reviewed_by = CASE WHEN v_status = 'pending' THEN NULL ELSE p_actor END,
           reviewed_at = CASE WHEN v_status = 'pending' THEN NULL ELSE now() END
     WHERE id = p_version_id AND org_id = p_org_id;

    v_event := CASE WHEN p_decision = 'pending' THEN 'reopened' ELSE p_decision END;
    INSERT INTO public.document_version_review_events
        (org_id, document_id, version_id, kind, decision, previous_review_status, reason, effective_on, expires_on, actor)
    VALUES (p_org_id, p_document_id, p_version_id, 'review', v_event, v_ver.review_status, v_reason, v_ver.effective_on, v_ver.expires_on, p_actor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('event_id', v_id, 'version_id', p_version_id, 'review_status', v_status,
                              'previous_review_status', v_ver.review_status, 'rereview', v_ver.review_status IN ('accepted', 'rejected'));
END;
$$;

-- public.document_set_version_validity: re-declared from 20261213090000_documents_d7_review_validity.sql unchanged except the unavailable list (+ 'archived', 1x).
CREATE OR REPLACE FUNCTION public.document_set_version_validity(
    p_org_id uuid, p_document_id uuid, p_version_id uuid, p_effective_on date, p_expires_on date, p_reason text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_ver record;
    v_id uuid;
BEGIN
    IF p_effective_on IS NOT NULL AND p_expires_on IS NOT NULL AND p_expires_on < p_effective_on THEN
        RAISE EXCEPTION 'document_validity_range_inverted' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, status, current_version_id INTO v_doc FROM public.documents
     WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_document_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded', 'archived') THEN
        RAISE EXCEPTION 'document_review_document_unavailable' USING ERRCODE = 'check_violation';
    END IF;
    IF v_doc.current_version_id IS NULL OR v_doc.current_version_id <> p_version_id THEN
        RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, effective_on, expires_on INTO v_ver FROM public.document_versions
     WHERE id = p_version_id AND org_id = p_org_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_review_not_current_version' USING ERRCODE = 'check_violation'; END IF;
    IF v_ver.effective_on IS NOT DISTINCT FROM p_effective_on AND v_ver.expires_on IS NOT DISTINCT FROM p_expires_on THEN
        RETURN jsonb_build_object('version_id', p_version_id, 'changed', false, 'effective_on', p_effective_on, 'expires_on', p_expires_on);
    END IF;

    UPDATE public.document_versions SET effective_on = p_effective_on, expires_on = p_expires_on
     WHERE id = p_version_id AND org_id = p_org_id;
    INSERT INTO public.document_version_review_events
        (org_id, document_id, version_id, kind, decision, reason, effective_on, expires_on, previous_effective_on, previous_expires_on, actor)
    VALUES (p_org_id, p_document_id, p_version_id, 'validity', NULL, nullif(btrim(coalesce(p_reason, '')), ''),
            p_effective_on, p_expires_on, v_ver.effective_on, v_ver.expires_on, p_actor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('event_id', v_id, 'version_id', p_version_id, 'changed', true, 'effective_on', p_effective_on, 'expires_on', p_expires_on);
END;
$$;

-- ── document_archive / document_unarchive ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_archive(
    p_org_id uuid, p_document_id uuid, p_reason text, p_archive_key text, p_actor uuid, p_audit_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
    IF p_archive_key IS NULL OR length(p_archive_key) < 8 OR length(p_archive_key) > 200 THEN
        RAISE EXCEPTION 'document_archive_key_invalid' USING ERRCODE = 'check_violation';
    END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'document_archive_reason_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT id, status, metadata INTO v_doc FROM public.documents WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_archive_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) = 'archived' THEN
        IF v_doc.metadata -> 'archive' ->> 'key' = p_archive_key THEN
            RETURN jsonb_build_object('replay', true, 'document_id', p_document_id);
        END IF;
        RAISE EXCEPTION 'document_archive_unavailable: already archived' USING ERRCODE = 'check_violation';
    END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) IN ('deleted', 'quarantined', 'restricted', 'superseded') THEN
        RAISE EXCEPTION 'document_archive_unavailable: a % document cannot be archived', v_doc.status USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.documents
       SET status = 'archived',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('archive', jsonb_build_object(
               'key', p_archive_key, 'reason', v_reason, 'previous_status', v_doc.status, 'archived_by', p_actor,
               'audit_event_id', p_audit_event_id, 'archived_at', now()))
     WHERE id = p_document_id AND org_id = p_org_id;
    RETURN jsonb_build_object('replay', false, 'document_id', p_document_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.document_unarchive(p_org_id uuid, p_document_id uuid, p_reason text, p_actor uuid, p_audit_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_doc record;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
    IF v_reason IS NULL THEN RAISE EXCEPTION 'document_archive_reason_required' USING ERRCODE = 'check_violation'; END IF;
    IF p_actor IS NULL THEN RAISE EXCEPTION 'document_unarchive_actor_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT id, status, metadata INTO v_doc FROM public.documents WHERE id = p_document_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_archive_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF lower(coalesce(v_doc.status, 'uploaded')) <> 'archived' THEN
        RAISE EXCEPTION 'document_unarchive_not_archived' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.documents
       SET status = coalesce(v_doc.metadata -> 'archive' ->> 'previous_status', 'uploaded'),
           updated_at = now(),
           metadata = jsonb_set(metadata, '{archive}', (metadata -> 'archive') || jsonb_build_object(
               'restored_at', now(), 'restored_by', p_actor, 'restore_reason', v_reason, 'restore_audit_event_id', p_audit_event_id))
     WHERE id = p_document_id AND org_id = p_org_id;
    RETURN jsonb_build_object('document_id', p_document_id, 'status', coalesce(v_doc.metadata -> 'archive' ->> 'previous_status', 'uploaded'));
END;
$$;

REVOKE ALL ON FUNCTION public.document_archive(uuid, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_archive(uuid, uuid, text, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_unarchive(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_unarchive(uuid, uuid, text, uuid, uuid) TO service_role;

-- ── self-verification ────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    v_name text;
BEGIN
    IF to_regprocedure('public.document_archive(uuid,uuid,text,text,uuid,uuid)') IS NULL
       OR to_regprocedure('public.document_unarchive(uuid,uuid,text,uuid,uuid)') IS NULL THEN
        RAISE EXCEPTION 'd9.3 archive self-verify: functions missing';
    END IF;
    FOREACH v_name IN ARRAY ARRAY['document_add_version', 'document_filing_existing_of_type', 'document_file', 'document_file_as_version',
                                  'document_review_version', 'document_set_version_validity'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.proname = v_name AND p.prosrc LIKE '%''superseded'', ''archived''%') THEN
            RAISE EXCEPTION 'd9.3 archive self-verify: % does not treat archived as unavailable', v_name;
        END IF;
    END LOOP;
END;
$verify$;

