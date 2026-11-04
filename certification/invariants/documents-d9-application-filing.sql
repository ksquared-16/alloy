-- Documents D9.2 / D9.3 — filing and version replacement by an APPLICATION principal hold at the database. Rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated certification environment (certenv-*) carrying the
-- Documents migrations through 20261214090000 (D2, D3, D5, D7, D8; staging tip). Needs NO pending migration. The executor
-- owns the transaction and discards it. The invariants seed their own rows in the first organization and RAISE when one
-- fails.
--
-- What the application path sends, exactly as lib/documents/filing/documentFiling.ts and
-- lib/documents/external/externalDocumentWrites.ts send it:
--   * the API upload row is inserted with a stable id (uploadDocumentId) and no user anywhere;
--   * document_file / document_file_as_version get p_actor NULL and p_review_status NULL (an application never
--     pre-approves; attribution is the audit's application principal).
-- Covers: stable-id insert gets exactly one version through the D2 trigger; a second insert of the same id is a
-- unique violation and changes nothing; filing with no user attached commits owner, type, sensitivity and the filing
-- record with filed_by NULL and no review; replay; a review-required type is refused without an accepted review; a
-- second document of a new_version type is refused as a new document and accepted as the next version with no user;
-- the received upload becomes superseded; a quarantined upload is never filed; a foreign subject is unresolved.
DO $$
DECLARE
    v_org uuid := (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1);
    v_org2 uuid := (SELECT id FROM public.orgs WHERE id <> (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1) ORDER BY id LIMIT 1);
    h uuid := 'd9000000-0000-4000-8000-0000000000a1';
    h_org2 uuid := 'd9000000-0000-4000-8000-0000000000a2';
    c1 uuid := 'd9000000-0000-4000-8000-0000000000c1';
    c_org2 uuid := 'd9000000-0000-4000-8000-0000000000c2';
    u1 uuid := 'd9000000-0000-4000-8000-000000000101'; -- first API upload (enrollment document)
    u2 uuid := 'd9000000-0000-4000-8000-000000000102'; -- second API upload, same type and household (replacement)
    u3 uuid := 'd9000000-0000-4000-8000-000000000103'; -- quarantined API upload
    u4 uuid := 'd9000000-0000-4000-8000-000000000104'; -- an upload an application tries to file as a medical type
    u5 uuid := 'd9000000-0000-4000-8000-000000000105'; -- an upload aimed at another organization's child
    via jsonb := '{"source": "api_v1_upload", "source_format": "pdf", "received_via": {"kind": "api_v1", "installation_id": "d9000000-0000-4000-8000-0000000000e1", "application_id": "d9000000-0000-4000-8000-0000000000e2", "credential_id": "d9000000-0000-4000-8000-0000000000e3"}}';
    sha text := repeat('d', 64);
    r jsonb;
    n int;
    s text;
    passes text[] := ARRAY[]::text[];
BEGIN
    IF v_org IS NULL OR v_org2 IS NULL THEN RAISE EXCEPTION 'need two organizations'; END IF;
    PERFORM public.document_configuration_seed(v_org);

    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h, v_org, 'D9 household', 990901);
    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h_org2, v_org2, 'D9 foreign', 990902);
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES (c1, v_org, h, 'D9 Child One');
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES (c_org2, v_org2, h_org2, 'D9 Foreign Child');

    -- 1. The API upload row: a stable id, no entity, no user. The D2 trigger gives it exactly one version.
    INSERT INTO public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata) VALUES
        (u1, v_org, 'enrollment.pdf', 'enrollment.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/api_uploads/' || u1 || '/' || sha, 'uploaded', via),
        (u2, v_org, 'enrollment-v2.pdf', 'enrollment-v2.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/api_uploads/' || u2 || '/' || sha, 'uploaded', via),
        (u3, v_org, 'held.pdf', 'held.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/api_uploads/' || u3 || '/' || sha, 'quarantined', via),
        (u4, v_org, 'imm.pdf', 'imm.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/api_uploads/' || u4 || '/' || sha, 'uploaded', via),
        (u5, v_org, 'foreign.pdf', 'foreign.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/api_uploads/' || u5 || '/' || sha, 'uploaded', via);
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = u1;
    IF n <> 1 THEN RAISE EXCEPTION '1: expected one version for the API upload, got %', n; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents d JOIN public.document_versions v ON v.id = d.current_version_id WHERE d.id = u1 AND v.version_number = 1) THEN
        RAISE EXCEPTION '1: current_version_id does not name version 1'; END IF;
    passes := passes || 'stable_id_insert_one_version'::text;

    -- 2. A concurrent identical completion inserts the same id: a unique violation, nothing added.
    BEGIN
        INSERT INTO public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
        VALUES (u1, v_org, 'enrollment.pdf', 'enrollment.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/api_uploads/' || u1 || '/' || sha, 'uploaded', via);
        RAISE EXCEPTION '2: a second row with the same id was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = u1;
    IF n <> 1 THEN RAISE EXCEPTION '2: the refused insert left a version (%).', n; END IF;
    passes := passes || 'duplicate_insert_unique_violation'::text;

    -- 3. Filing with no user attached: owner, type and the filing record commit; filed_by NULL; no review recorded.
    r := public.document_file(v_org, u1, 'enrollment_document', 'household', h, '[]', NULL, NULL, 'ext:d9-inst:key-0001', NULL, NULL, NULL);
    IF (r ->> 'replay')::boolean THEN RAISE EXCEPTION '3: first filing reported a replay'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = u1 AND is_primary AND subject_type = 'household' AND subject_id = h AND ended_at IS NULL) THEN
        RAISE EXCEPTION '3: primary owner missing'; END IF;
    SELECT d.metadata -> 'filing' ->> 'filed_by' INTO s FROM public.documents d WHERE d.id = u1;
    IF s IS NOT NULL THEN RAISE EXCEPTION '3: filed_by names a user (%)', s; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = u1 AND doc_type = 'enrollment_document' AND metadata -> 'filing' ->> 'key' = 'ext:d9-inst:key-0001'
                     AND metadata -> 'received_via' ->> 'kind' = 'api_v1') THEN
        RAISE EXCEPTION '3: filing record or provenance not kept'; END IF;
    IF EXISTS (SELECT 1 FROM public.document_versions WHERE document_id = u1 AND (review_status = 'accepted' OR reviewed_by IS NOT NULL)) THEN
        RAISE EXCEPTION '3: an application filing recorded a review'; END IF;
    passes := passes || 'filing_without_user_commits'::text;

    -- 4. Replay of the same key writes nothing.
    r := public.document_file(v_org, u1, 'enrollment_document', 'household', h, '[]', NULL, NULL, 'ext:d9-inst:key-0001', NULL, NULL, NULL);
    IF NOT (r ->> 'replay')::boolean THEN RAISE EXCEPTION '4: retry did not replay'; END IF;
    SELECT count(*) INTO n FROM public.document_subjects WHERE document_id = u1;
    IF n <> 1 THEN RAISE EXCEPTION '4: replay changed associations (%)', n; END IF;
    passes := passes || 'retry_replays'::text;

    -- 5. A review-required (medical) type needs an accepted review; an application can never give one.
    BEGIN
        PERFORM public.document_file(v_org, u4, 'immunization_record', 'child', c1, '[]', NULL, NULL, 'ext:d9-inst:key-0004', NULL, NULL, NULL);
        RAISE EXCEPTION '5: a review-required type was filed without a review';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'document_filing_review_required%' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = u4) OR EXISTS (SELECT 1 FROM public.documents WHERE id = u4 AND (doc_type IS NOT NULL OR metadata ? 'filing')) THEN
        RAISE EXCEPTION '5: the refused filing left a write'; END IF;
    passes := passes || 'review_required_refused_without_review'::text;

    -- 6. Replacement: the second enrollment document for the household is not a new document…
    BEGIN
        PERFORM public.document_file(v_org, u2, 'enrollment_document', 'household', h, '[]', NULL, NULL, 'ext:d9-inst:key-0002', NULL, NULL, NULL);
        RAISE EXCEPTION '6a: a second document of a new_version type was filed as new';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'document_filing_new_version_required%' THEN RAISE; END IF;
    END;
    -- …it is the next version of the first, with no user attached; the received upload is kept as superseded provenance.
    r := public.document_file_as_version(v_org, u2, u1, 'org_documents', v_org || '/filed/' || u1 || '/' || u2 || '-enrollment-v2.pdf',
        NULL, NULL, 'ext:d9-inst:key-0003', NULL, NULL, NULL);
    IF (r ->> 'version_number')::int <> 2 THEN RAISE EXCEPTION '6b: expected version 2, got %', r ->> 'version_number'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents d JOIN public.document_versions v ON v.id = d.current_version_id
                    WHERE d.id = u1 AND v.version_number = 2 AND v.review_status IS DISTINCT FROM 'accepted') THEN
        RAISE EXCEPTION '6b: version 2 is not current, or it carries a review'; END IF;
    SELECT status INTO s FROM public.documents WHERE id = u2;
    IF s <> 'superseded' THEN RAISE EXCEPTION '6b: the received upload is % (expected superseded)', s; END IF;
    SELECT metadata -> 'filing' ->> 'filed_by' INTO s FROM public.documents WHERE id = u2;
    IF s IS NOT NULL THEN RAISE EXCEPTION '6b: the version filing names a user (%)', s; END IF;
    r := public.document_file_as_version(v_org, u2, u1, 'org_documents', v_org || '/filed/' || u1 || '/' || u2 || '-enrollment-v2.pdf',
        NULL, NULL, 'ext:d9-inst:key-0003', NULL, NULL, NULL);
    IF NOT (r ->> 'replay')::boolean THEN RAISE EXCEPTION '6c: the version retry did not replay'; END IF;
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = u1;
    IF n <> 2 THEN RAISE EXCEPTION '6c: replay added a version (%)', n; END IF;
    passes := passes || 'replacement_without_user'::text;

    -- 7. A quarantined upload is never filed.
    BEGIN
        PERFORM public.document_file(v_org, u3, 'enrollment_document', 'child', c1, '[]', NULL, NULL, 'ext:d9-inst:key-0005', NULL, NULL, NULL);
        RAISE EXCEPTION '7: a quarantined upload was filed';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'document_filing_unavailable%' THEN RAISE; END IF;
    END;
    passes := passes || 'quarantined_refused'::text;

    -- 8. Another organization's child is not a subject here.
    BEGIN
        PERFORM public.document_file(v_org, u5, 'enrollment_document', 'child', c_org2, '[]', NULL, NULL, 'ext:d9-inst:key-0006', NULL, NULL, NULL);
        RAISE EXCEPTION '8: a foreign subject was accepted';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'document_subject_unresolved%' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = u5) THEN RAISE EXCEPTION '8: the foreign filing left an owner'; END IF;
    passes := passes || 'foreign_subject_refused'::text;

    RAISE NOTICE 'tests passed=% failed=0 [%]', cardinality(passes), array_to_string(passes, ',');
END;
$$;
