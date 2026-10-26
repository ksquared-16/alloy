-- Documents V1 — D5 filing invariants. Run inside a transaction that is ROLLED BACK (it seeds its own fixture rows in
-- the first organization and leaves nothing behind). Every check raises on failure; the final NOTICE lists the passes.
--
-- Covers: one-transaction filing (type + owner + contexts + review + record); replay on the same key; refusal of a
-- second filing; quarantined / superseded refusal; unpublished type, subject-type, format, review-required,
-- unrelated context, cross-organization subject; sensitivity raised by type and never lowered; not_allowed and
-- new_version replacement; file-as-version reusing nothing but provenance; an atomic rollback when a late step fails.
DO $$
DECLARE
    v_org uuid := (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1);
    v_org2 uuid := (SELECT id FROM public.orgs WHERE id <> (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1) ORDER BY id LIMIT 1);
    h uuid := 'd5000000-0000-4000-8000-0000000000a1';
    h2 uuid := 'd5000000-0000-4000-8000-0000000000a2';
    p1 uuid := 'd5000000-0000-4000-8000-0000000000b1';
    c1 uuid := 'd5000000-0000-4000-8000-0000000000c1';
    c2 uuid := 'd5000000-0000-4000-8000-0000000000c2';
    c_other uuid := 'd5000000-0000-4000-8000-0000000000c3';
    c_org2 uuid := 'd5000000-0000-4000-8000-0000000000c4';
    h_org2 uuid := 'd5000000-0000-4000-8000-0000000000a3';
    opp uuid := 'd5000000-0000-4000-8000-0000000000e1';
    actor uuid := 'd5000000-0000-4000-8000-0000000000f1';
    d_imm uuid := 'd5000000-0000-4000-8000-000000000101';
    d_enr uuid := 'd5000000-0000-4000-8000-000000000102';
    d_quar uuid := 'd5000000-0000-4000-8000-000000000103';
    d_txt uuid := 'd5000000-0000-4000-8000-000000000104';
    d_imm2 uuid := 'd5000000-0000-4000-8000-000000000105';
    d_cust uuid := 'd5000000-0000-4000-8000-000000000106';
    d_cust2 uuid := 'd5000000-0000-4000-8000-000000000107';
    d_enr2 uuid := 'd5000000-0000-4000-8000-000000000108';
    r jsonb;
    n int;
    s text;
    passes text[] := ARRAY[]::text[];
    sha text := repeat('a', 64);
BEGIN
    IF v_org IS NULL OR v_org2 IS NULL THEN RAISE EXCEPTION 'need two organizations'; END IF;
    PERFORM public.document_configuration_seed(v_org);

    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h, v_org, 'D5 household', 990001), (h2, v_org, 'D5 neighbours', 990002);
    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (h_org2, v_org2, 'D5 foreign', 990003);
    INSERT INTO public.persons (id, org_id, person_number) VALUES (p1, v_org, 990001);
    INSERT INTO public.customer_persons (org_id, customer_id, person_id, role_type) VALUES (v_org, h, p1, 'parent');
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES
        (c1, v_org, h, 'D5 Child One'), (c2, v_org, h, 'D5 Child Two'), (c_other, v_org, h2, 'D5 Other Child');
    INSERT INTO public.customer_members (id, org_id, customer_id, display_name) VALUES (c_org2, v_org2, h_org2, 'D5 Foreign Child');
    INSERT INTO public.opportunities (id, org_id, customer_id, opportunity_number) VALUES (opp, v_org, h, 990001);

    -- Received (intake) documents: no entity, as the Processing upload stores them.
    INSERT INTO public.documents (id, org_id, title, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata) VALUES
        (d_imm, v_org, 'imm', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d5-imm.pdf', 'uploaded', '{"uploaded_by": null}'),
        (d_enr, v_org, 'enr', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d5-enr.pdf', 'uploaded', '{}'),
        (d_quar, v_org, 'quar', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d5-quar.pdf', 'quarantined', '{}'),
        (d_txt, v_org, 'txt', 'text/plain', 10, sha, 'org_documents', v_org || '/pos_intake/d5-txt.txt', 'uploaded', '{}'),
        (d_imm2, v_org, 'imm2', 'image/png', 10, sha, 'org_documents', v_org || '/pos_intake/d5-imm2.png', 'uploaded', '{}'),
        (d_cust, v_org, 'cust', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d5-cust.pdf', 'uploaded', '{}'),
        (d_cust2, v_org, 'cust2', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d5-cust2.pdf', 'uploaded', '{}'),
        (d_enr2, v_org, 'enr2', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d5-enr2.pdf', 'uploaded', '{}');

    -- 1. Filing commits type, sensitivity, owner, contexts, review and the filing record together.
    r := public.document_file(v_org, d_imm, 'immunization_record', 'child', c1,
        jsonb_build_array(jsonb_build_object('subject_type', 'household', 'subject_id', h), jsonb_build_object('subject_type', 'opportunity', 'subject_id', opp)),
        'accepted', NULL, 'invariant-key-imm-1', actor, NULL, NULL);
    IF (r ->> 'replay')::boolean THEN RAISE EXCEPTION '1: first filing reported a replay'; END IF;
    SELECT sensitivity INTO s FROM public.documents WHERE id = d_imm;
    IF s <> 'medical' THEN RAISE EXCEPTION '1: medical type did not raise sensitivity (%).', s; END IF;
    SELECT count(*) INTO n FROM public.document_subjects WHERE document_id = d_imm AND ended_at IS NULL;
    IF n <> 3 THEN RAISE EXCEPTION '1: expected 3 associations, got %', n; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d_imm AND is_primary AND subject_type = 'child' AND subject_id = c1 AND ended_at IS NULL) THEN
        RAISE EXCEPTION '1: primary owner missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = d_imm AND entity_type = 'customer_member' AND entity_id = c1 AND doc_type = 'immunization_record') THEN
        RAISE EXCEPTION '1: legacy projection / doc_type not written'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_versions v JOIN public.documents d ON d.current_version_id = v.id WHERE d.id = d_imm AND v.review_status = 'accepted') THEN
        RAISE EXCEPTION '1: review not recorded on the current version'; END IF;
    passes := passes || 'filing_commits_all_effects'::text;

    -- 2. Replay on the same key writes nothing.
    r := public.document_file(v_org, d_imm, 'immunization_record', 'child', c1, '[]', 'accepted', NULL, 'invariant-key-imm-1', actor, NULL, NULL);
    IF NOT (r ->> 'replay')::boolean THEN RAISE EXCEPTION '2: retry did not replay'; END IF;
    SELECT count(*) INTO n FROM public.document_subjects WHERE document_id = d_imm;
    IF n <> 3 THEN RAISE EXCEPTION '2: replay changed associations (%)', n; END IF;
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = d_imm;
    IF n <> 1 THEN RAISE EXCEPTION '2: replay created versions (%)', n; END IF;
    passes := passes || 'retry_replays_without_writes'::text;

    -- 3. A second, different filing of the same document is refused.
    BEGIN
        PERFORM public.document_file(v_org, d_imm, 'immunization_record', 'child', c2, '[]', 'accepted', NULL, 'invariant-key-imm-2', actor, NULL, NULL);
        RAISE EXCEPTION '3: refiling was accepted';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'document_filing_already_filed%' THEN RAISE; END IF;
    END;
    passes := passes || 'second_filing_refused'::text;

    -- 4. Quarantined documents are never filed.
    BEGIN
        PERFORM public.document_file(v_org, d_quar, 'enrollment_document', 'household', h, '[]', NULL, NULL, 'invariant-key-quar', actor, NULL, NULL);
        RAISE EXCEPTION '4: quarantined filed';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'document_filing_unavailable%' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d_quar) THEN RAISE EXCEPTION '4: quarantined document gained an owner'; END IF;
    passes := passes || 'quarantine_refused'::text;

    -- 5. Policy refusals: unpublished type, subject type, format, review required, unrelated context, foreign subject.
    BEGIN PERFORM public.document_file(v_org, d_enr, 'no_such_type', 'household', h, '[]', NULL, NULL, 'invariant-key-p1', actor, NULL, NULL); RAISE EXCEPTION '5a';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_type_unpublished%' THEN RAISE; END IF; END;
    BEGIN PERFORM public.document_file(v_org, d_enr, 'enrollment_document', 'person', p1, '[]', NULL, NULL, 'invariant-key-p2', actor, NULL, NULL); RAISE EXCEPTION '5b';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_subject_type_not_applicable%' THEN RAISE; END IF; END;
    BEGIN PERFORM public.document_file(v_org, d_txt, 'enrollment_document', 'household', h, '[]', NULL, NULL, 'invariant-key-p3', actor, NULL, NULL); RAISE EXCEPTION '5c';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_format_not_allowed%' THEN RAISE; END IF; END;
    BEGIN PERFORM public.document_file(v_org, d_imm2, 'immunization_record', 'child', c2, '[]', NULL, NULL, 'invariant-key-p4', actor, NULL, NULL); RAISE EXCEPTION '5d';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_review_required%' THEN RAISE; END IF; END;
    BEGIN PERFORM public.document_file(v_org, d_enr, 'enrollment_document', 'child', c1, jsonb_build_array(jsonb_build_object('subject_type', 'child', 'subject_id', c_other)), NULL, NULL, 'invariant-key-p5', actor, NULL, NULL); RAISE EXCEPTION '5e';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_context_unrelated%' THEN RAISE; END IF; END;
    BEGIN PERFORM public.document_file(v_org, d_enr, 'enrollment_document', 'child', c_org2, '[]', NULL, NULL, 'invariant-key-p6', actor, NULL, NULL); RAISE EXCEPTION '5f';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_subject_unresolved%' THEN RAISE; END IF; END;
    IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id IN (d_enr, d_txt, d_imm2)) OR
       EXISTS (SELECT 1 FROM public.documents WHERE id IN (d_enr, d_txt, d_imm2) AND (doc_type IS NOT NULL OR metadata ? 'filing')) THEN
        RAISE EXCEPTION '5: a refused filing left a write behind';
    END IF;
    passes := passes || 'policy_refusals_leave_nothing'::text;

    -- 6. Sensitivity: an explicit raise applies; a lower request never lowers.
    r := public.document_file(v_org, d_enr, 'enrollment_document', 'household', h, '[]', NULL, 'personal_identity', 'invariant-key-enr', actor, NULL, NULL);
    SELECT sensitivity INTO s FROM public.documents WHERE id = d_enr;
    IF s <> 'personal_identity' THEN RAISE EXCEPTION '6: raise not applied (%)', s; END IF;
    r := public.document_file(v_org, d_imm2, 'immunization_record', 'child', c2, '[]', 'accepted', 'standard', 'invariant-key-imm2', actor, NULL, NULL);
    SELECT sensitivity INTO s FROM public.documents WHERE id = d_imm2;
    IF s <> 'medical' THEN RAISE EXCEPTION '6: standard request lowered a medical type (%)', s; END IF;
    passes := passes || 'sensitivity_raise_only'::text;

    -- 7. new_version (the seeded default): a second immunization record for the same child is not a new document…
    BEGIN PERFORM public.document_file(v_org, d_enr2, 'immunization_record', 'child', c1, '[]', 'accepted', NULL, 'invariant-key-nv0', actor, NULL, NULL); RAISE EXCEPTION '7a';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_new_version_required%' THEN RAISE; END IF; END;
    -- …it is the next version of the existing one. The received document stays (provenance) as `superseded`.
    r := public.document_file_as_version(v_org, d_enr2, d_imm, 'org_documents', v_org || '/filed/' || d_imm || '/' || d_enr2 || '-enr2.pdf',
        'Updated record', 'accepted', 'invariant-key-nv1', actor, NULL, NULL);
    IF (r ->> 'version_number')::int <> 2 THEN RAISE EXCEPTION '7b: expected version 2, got %', r ->> 'version_number'; END IF;
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = d_imm;
    IF n <> 2 THEN RAISE EXCEPTION '7b: target has % versions', n; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_versions WHERE document_id = d_imm AND version_number = 2
                    AND provenance ->> 'filed_from_document_id' = d_enr2::text AND review_status = 'accepted') THEN
        RAISE EXCEPTION '7b: version provenance/review missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = d_enr2 AND status = 'superseded' AND metadata -> 'filing' ->> 'target_document_id' = d_imm::text) THEN
        RAISE EXCEPTION '7b: received document not superseded'; END IF;
    IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d_enr2) THEN RAISE EXCEPTION '7b: received document gained an owner'; END IF;
    r := public.document_file_as_version(v_org, d_enr2, d_imm, 'org_documents', v_org || '/filed/' || d_imm || '/' || d_enr2 || '-enr2.pdf',
        'Updated record', 'accepted', 'invariant-key-nv1', actor, NULL, NULL);
    IF NOT (r ->> 'replay')::boolean THEN RAISE EXCEPTION '7c: version filing retry did not replay'; END IF;
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = d_imm;
    IF n <> 2 THEN RAISE EXCEPTION '7c: retry added a version (%)', n; END IF;
    BEGIN PERFORM public.document_file(v_org, d_enr2, 'immunization_record', 'child', c2, '[]', 'accepted', NULL, 'invariant-key-nv2', actor, NULL, NULL); RAISE EXCEPTION '7d';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_unavailable%' THEN RAISE; END IF; END;
    passes := passes || 'new_version_policy'::text;

    -- 8. not_allowed: publish custody_order as not_allowed through the Studio's own validate/publish path.
    DECLARE
        v_type uuid;
        v_pub uuid;
        v_new uuid;
    BEGIN
        SELECT id, published_version_id INTO v_type, v_pub FROM public.document_types WHERE org_id = v_org AND key = 'custody_order';
        INSERT INTO public.document_type_versions (org_id, document_type_id, version_number, status, label, category_id, subject_types,
                                                   allowed_formats, default_sensitivity, review_required, replacement_policy, validity_policy)
        SELECT org_id, document_type_id, version_number + 1, 'draft', label, category_id, subject_types, allowed_formats,
               default_sensitivity, false, 'not_allowed', validity_policy
          FROM public.document_type_versions WHERE id = v_pub
        RETURNING id INTO v_new;
        PERFORM public.document_type_validate(v_org, v_new, actor);
        PERFORM public.document_type_publish(v_org, v_type, v_new, v_pub, actor);
    END;
    r := public.document_file(v_org, d_cust, 'custody_order', 'child', c1, '[]', NULL, NULL, 'invariant-key-cust', actor, NULL, NULL);
    SELECT sensitivity INTO s FROM public.documents WHERE id = d_cust;
    IF s <> 'custody_safeguarding' THEN RAISE EXCEPTION '8: custody type did not raise sensitivity (%)', s; END IF;
    BEGIN PERFORM public.document_file(v_org, d_cust2, 'custody_order', 'child', c1, '[]', NULL, NULL, 'invariant-key-cust2', actor, NULL, NULL); RAISE EXCEPTION '8a';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_replacement_not_allowed%' THEN RAISE; END IF; END;
    BEGIN PERFORM public.document_file_as_version(v_org, d_cust2, d_cust, 'org_documents', v_org || '/filed/x', NULL, NULL, 'invariant-key-cust3', actor, NULL, NULL); RAISE EXCEPTION '8b';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_filing_new_version_not_allowed%' THEN RAISE; END IF; END;
    passes := passes || 'not_allowed_policy'::text;

    -- 9. The version store still holds ONE object per version, and no filed document's object was rewritten.
    IF EXISTS (SELECT bucket, storage_path FROM public.document_versions WHERE org_id = v_org AND source <> 'legacy_backfill'
               GROUP BY 1, 2 HAVING count(*) > 1) THEN RAISE EXCEPTION '9: an object is shared by two versions'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = d_imm AND storage_path LIKE v_org || '/filed/%') THEN
        RAISE EXCEPTION '9: target current version not the filed version'; END IF;
    passes := passes || 'one_object_per_version'::text;

    -- 11. A superseded (filed-as-version) document takes no new version; pending review never overwrites a review.
    BEGIN
        PERFORM public.document_add_version(v_org, d_enr2, 'org_documents', v_org || '/x/new.pdf', 'n.pdf', 'application/pdf', 1, sha, 'reason here', actor, '{}', '{}');
        RAISE EXCEPTION '11a: superseded document took a version';
    EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE 'document_unavailable%' THEN RAISE; END IF; END;
    r := public.document_version_require_review(v_org, d_imm);  -- current version 2 was accepted at filing
    IF (r ->> 'pending')::boolean THEN RAISE EXCEPTION '11b: an accepted review was reset to pending'; END IF;
    r := public.document_version_require_review(v_org, d_cust);  -- custody v1 has no review recorded
    IF NOT (r ->> 'pending')::boolean THEN RAISE EXCEPTION '11c: pending review not recorded'; END IF;
    passes := passes || 'superseded_and_pending_review'::text;

    -- 10. Service-role only.
    IF has_function_privilege('authenticated', 'public.document_file(uuid, uuid, text, text, uuid, jsonb, text, text, text, uuid, uuid, uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.document_version_require_review(uuid, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_file_as_version(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '10: filing functions are executable by a client role';
    END IF;
    passes := passes || 'service_role_only'::text;

    RAISE NOTICE 'D5 invariants PASS %/%: %', array_length(passes, 1), 11, array_to_string(passes, ', ');
END;
$$;
