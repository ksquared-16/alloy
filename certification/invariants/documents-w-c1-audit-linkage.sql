-- Documents W-C1 — rollback-only invariant for migration 20261222090000 (stored, verified audit linkage for review,
-- validity, link and unlink). For database.run_rollback_invariant_test against an EXISTING ready certification
-- environment; its pre-apply twin (documents-w-c1-audit-linkage-preapply.sql) runs the pending migration twice first
-- (T10: idempotent), inside the same discarded transaction. Any failed case RAISEs. Every refusal has a positive
-- control: the same call with only the defect removed succeeds, so a refusal cannot pass by broken setup.
-- Cases follow certification/documents-v1/finish/W-C1-STORED-AUDIT-LINKAGE-DESIGN.md (T1-T5, T7, T10; T6/T8/T9 are TS).
DO $wc1$
DECLARE
    o1 uuid := gen_random_uuid();
    o2 uuid := gen_random_uuid();
    hh uuid := gen_random_uuid();
    hh2 uuid := gen_random_uuid();
    sha text := repeat('e', 64);
    app jsonb := '{"actor_kind":"application","actor_application_id":"app-wc1","actor_installation_id":"inst-wc1"}'::jsonb;
    app_other jsonb := '{"actor_kind":"application","actor_application_id":"app-wc1","actor_installation_id":"inst-OTHER"}'::jsonb;
    d1 uuid; v1 uuid; d2 uuid; v2 uuid; d3 uuid; v3 uuid;
    ev uuid; ev2 uuid; ev3 uuid;
    r jsonb;
    msg text;
    n integer;
    passed integer := 0;
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES (o1, 'ZZ wc1 A', 'zz-wc1-a-' || left(o1::text, 8)),
                                                    (o2, 'ZZ wc1 B', 'zz-wc1-b-' || left(o2::text, 8));
    INSERT INTO public.customers (id, org_id, name, customer_number) VALUES (hh, o1, 'wc1 household', 997101), (hh2, o1, 'wc1 other', 997102);
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'wc1 one', '1.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/wc1/1.pdf', 'uploaded') RETURNING id INTO d1;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'wc1 two', '2.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/wc1/2.pdf', 'uploaded') RETURNING id INTO d2;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'wc1 three', '3.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/wc1/3.pdf', 'uploaded') RETURNING id INTO d3;
    SELECT current_version_id INTO v1 FROM public.documents WHERE id = d1;
    SELECT current_version_id INTO v2 FROM public.documents WHERE id = d2;
    SELECT current_version_id INTO v3 FROM public.documents WHERE id = d3;
    IF v1 IS NULL OR v2 IS NULL OR v3 IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: D2 trigger wrote no version'; END IF;

    -- CASE 1 (T1): review and validity store the exact audit id they were given.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev;
    r := public.document_review_version(o1, d1, v1, 'accepted', NULL, NULL, false, ev, app);
    IF (SELECT audit_event_id FROM public.document_version_review_events WHERE id = (r->>'event_id')::uuid) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 1 FAILED: review did not store its audit id';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_validity_set', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev;
    r := public.document_set_version_validity(o1, d1, v1, DATE '2026-11-01', DATE '2027-10-31', NULL, NULL, ev, app);
    IF (SELECT audit_event_id FROM public.document_version_review_events WHERE id = (r->>'event_id')::uuid) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 1 FAILED: validity did not store its audit id';
    END IF;
    passed := passed + 1;

    -- CASE 2 (T2): a refused review (already decided, no re-review) binds nothing; the next accepted review binds only its own.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev2;
    msg := NULL;
    BEGIN PERFORM public.document_review_version(o1, d1, v1, 'rejected', 'not this one', NULL, false, ev2, app);
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_review_already_decided%' THEN RAISE EXCEPTION 'CASE 2 FAILED: refusal (%)', coalesce(msg, 'accepted'); END IF;
    IF EXISTS (SELECT 1 FROM public.document_version_review_events WHERE audit_event_id = ev2) THEN RAISE EXCEPTION 'CASE 2 FAILED: a refused review bound its audit'; END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d2, app || jsonb_build_object('version_id', v2::text)) RETURNING id INTO ev3;
    PERFORM public.document_review_version(o1, d2, v2, 'accepted', NULL, NULL, false, ev3, app);
    SELECT count(*) INTO n FROM public.document_version_review_events WHERE document_id = d2 AND audit_event_id = ev3;
    IF n <> 1 OR EXISTS (SELECT 1 FROM public.document_version_review_events WHERE audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 2 FAILED: the accepted review did not bind only its own audit';
    END IF;
    passed := passed + 1;

    -- CASE 3 (T3): no-ops bind nothing: same validity dates, an existing link, nothing to unlink.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_validity_set', 'documents', d1, app || jsonb_build_object('version_id', v1::text)) RETURNING id INTO ev2;
    r := public.document_set_version_validity(o1, d1, v1, DATE '2026-11-01', DATE '2027-10-31', NULL, NULL, ev2, app);
    IF (r->>'changed')::boolean OR EXISTS (SELECT 1 FROM public.document_version_review_events WHERE audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 3 FAILED: a no-op validity bound its audit';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev;
    PERFORM public.document_link_subject(o1, d1, 'household', hh, 'context', NULL, ev, app);
    IF (SELECT link_audit_event_id FROM public.document_subjects WHERE document_id = d1 AND subject_id = hh AND ended_at IS NULL) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 3 FAILED: link did not store its audit id (T1)';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev2;
    r := public.document_link_subject(o1, d1, 'household', hh, 'context', NULL, ev2, app);
    IF (r->>'created')::boolean OR EXISTS (SELECT 1 FROM public.document_subjects WHERE link_audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 3 FAILED: an existing link bound a second audit';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'unlink', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev;
    PERFORM public.document_unlink_subject(o1, d1, 'household', hh, NULL, ev, app);
    IF (SELECT unlink_audit_event_id FROM public.document_subjects WHERE document_id = d1 AND subject_id = hh) IS DISTINCT FROM ev THEN
        RAISE EXCEPTION 'CASE 3 FAILED: unlink did not store its audit id (T1)';
    END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d1, app || jsonb_build_object('change', 'unlink', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev2;
    r := public.document_unlink_subject(o1, d1, 'household', hh, NULL, ev2, app);
    IF (r->>'ended')::boolean OR EXISTS (SELECT 1 FROM public.document_subjects WHERE unlink_audit_event_id = ev2) THEN
        RAISE EXCEPTION 'CASE 3 FAILED: nothing to unlink still bound an audit';
    END IF;
    passed := passed + 1;

    -- CASE 4 (T4): id / target / actor integrity. Each mismatch raises audit_event_mismatch and writes nothing; the
    -- positive control (a correct audit) then succeeds on the same document.
    -- wrong org: the audit row is in o2
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o2, 'document_version_reviewed', 'documents', d3, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong org (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong document
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d2, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong document (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong version
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d3, app || jsonb_build_object('version_id', v2::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong version (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong event type (a validity audit offered to a review)
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_validity_set', 'documents', d3, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong event type (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong actor: written for another installation of the same application
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d3, app_other || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong installation (%)', coalesce(msg, 'accepted'); END IF;
    -- an id without any actor payload
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_version_reviewed', 'documents', d3, app || jsonb_build_object('version_id', v3::text)) RETURNING id INTO ev2;
    msg := NULL; BEGIN PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev2, NULL); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: missing actor (%)', coalesce(msg, 'accepted'); END IF;
    -- wrong subject (link audit for hh offered for hh2)
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d3, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_link_subject(o1, d3, 'household', hh2, 'context', NULL, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: wrong subject (%)', coalesce(msg, 'accepted'); END IF;
    -- an unlink audit offered to a link
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d3, app || jsonb_build_object('change', 'unlink', 'subject_type', 'household', 'subject_id', hh2::text)) RETURNING id INTO ev;
    msg := NULL; BEGIN PERFORM public.document_link_subject(o1, d3, 'household', hh2, 'context', NULL, ev, app); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE 'audit_event_mismatch%' THEN RAISE EXCEPTION 'CASE 4 FAILED: unlink audit used for a link (%)', coalesce(msg, 'accepted'); END IF;
    -- nothing was written by any refused call
    IF (SELECT review_status FROM public.document_versions WHERE id = v3) IN ('accepted', 'rejected')
       OR EXISTS (SELECT 1 FROM public.document_version_review_events WHERE document_id = d3)
       OR EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d3 AND subject_id = hh2) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: a refused call wrote something';
    END IF;
    -- positive controls on the same document and subject
    PERFORM public.document_review_version(o1, d3, v3, 'accepted', NULL, NULL, false, ev2, app);
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_subject_changed', 'documents', d3, app || jsonb_build_object('change', 'link', 'subject_type', 'household', 'subject_id', hh2::text)) RETURNING id INTO ev;
    PERFORM public.document_link_subject(o1, d3, 'household', hh2, 'context', NULL, ev, app);
    IF (SELECT review_status FROM public.document_versions WHERE id = v3) <> 'accepted'
       OR NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d3 AND subject_id = hh2 AND link_audit_event_id = ev) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: positive control refused';
    END IF;
    passed := passed + 1;

    -- CASE 5 (T5): one audit, one effect. Re-using a bound validity audit for a real change on the same version is
    -- refused by the unique index and changes nothing.
    SELECT audit_event_id INTO ev FROM public.document_version_review_events WHERE document_id = d1 AND kind = 'validity' AND audit_event_id IS NOT NULL LIMIT 1;
    msg := NULL;
    BEGIN PERFORM public.document_set_version_validity(o1, d1, v1, DATE '2026-11-01', DATE '2028-10-31', NULL, NULL, ev, app);
    EXCEPTION WHEN unique_violation THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%uq_document_version_review_events_audit_event%' THEN RAISE EXCEPTION 'CASE 5 FAILED: re-used audit (%)', coalesce(msg, 'accepted'); END IF;
    IF (SELECT expires_on FROM public.document_versions WHERE id = v1) <> DATE '2027-10-31' THEN RAISE EXCEPTION 'CASE 5 FAILED: the change was written'; END IF;
    passed := passed + 1;

    -- CASE 6 (T7): compatibility. Calls without an audit work (staff routes); the SQL filing path's positional
    -- six-argument link still resolves; the old signatures are gone; grants are service_role only; helpers are private.
    PERFORM public.document_review_version(o1, d2, v2, 'pending', 'reopen for check', NULL, true);
    PERFORM public.document_link_subject(o1, d2, 'household', hh, 'context', NULL);
    PERFORM public.document_unlink_subject(o1, d2, 'household', hh, NULL);
    IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d2 AND subject_id = hh AND link_audit_event_id IS NULL AND unlink_audit_event_id IS NULL) THEN
        RAISE EXCEPTION 'CASE 6 FAILED: unbound staff link/unlink';
    END IF;
    IF to_regprocedure('public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean)') IS NOT NULL
       OR to_regprocedure('public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid)') IS NOT NULL
       OR to_regprocedure('public.document_link_subject(uuid,uuid,text,uuid,text,uuid)') IS NOT NULL
       OR to_regprocedure('public.document_unlink_subject(uuid,uuid,text,uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'CASE 6 FAILED: an old signature survived (overload)';
    END IF;
    IF has_function_privilege('authenticated', 'public.document_review_version(uuid,uuid,uuid,text,text,uuid,boolean,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_link_subject(uuid,uuid,text,uuid,text,uuid,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.document_set_version_validity(uuid,uuid,uuid,date,date,text,uuid,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.document_unlink_subject(uuid,uuid,text,uuid,uuid,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.document_audit_event_require(uuid,uuid,text,uuid,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.document_audit_event_matches(uuid,uuid,text,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 6 FAILED: grants';
    END IF;
    passed := passed + 1;

    RAISE NOTICE 'PASS documents w-c1 audit linkage: ids stored, refused and no-op calls bind nothing, org/document/version/event/subject/installation integrity, one audit per effect, unbound staff calls, old signatures gone, grants';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END
$wc1$;
