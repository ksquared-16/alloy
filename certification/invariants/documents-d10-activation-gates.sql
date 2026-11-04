-- Documents D10 activation gates — rollback-only invariant for migration 20261220090000 (G1 Q2 release guard incl. archive
-- restore, G2 W2 scan hold, G3 N8 scan attempts, G4 Q1 lower-case predicate, G5 W3 WS11 trigger function). For
-- database.run_rollback_invariant_test against an isolated certification environment (certenv-*). Its pre-apply twin
-- (documents-d10-activation-gates-preapply.sql) runs the pending migration first, inside the same discarded transaction.
-- The executor owns the transaction and always discards it. Any failed invariant RAISEs. Every refusal has a positive
-- control: the same change with only the defect removed succeeds, so a refusal cannot pass by broken setup.
DO $$
DECLARE
    o1 uuid := gen_random_uuid();
    o2 uuid := gen_random_uuid();
    actor uuid := gen_random_uuid();
    sha text := repeat('d', 64);
    t0 timestamptz := now() - interval '1 minute';
    sig timestamptz := now() - interval '2 hours';
    d_bad uuid; v_bad uuid;
    d_ok uuid;
    d_arch uuid; v_arch uuid;
    d_arch_ok uuid;
    d_hold uuid; v_hold uuid;
    d_up uuid; v_up uuid;
    d_cap uuid; v_cap uuid;
    d_res uuid; v_res uuid;
    ev uuid;
    r record;
    n1 integer; n2 integer; n3 integer;
    at1 timestamptz; at2 timestamptz; at3 timestamptz;
    refused boolean;
    msg text;
    passed integer := 0;
BEGIN
    INSERT INTO public.orgs (id, name, slug) VALUES (o1, 'ZZ d10 gates A', 'zz-d10g-a-' || left(o1::text, 8)),
                                                    (o2, 'ZZ d10 gates B', 'zz-d10g-b-' || left(o2::text, 8));
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g bad', 'b.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-bad.pdf', 'uploaded') RETURNING id INTO d_bad;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g ok', 'o.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-ok.pdf', 'quarantined') RETURNING id INTO d_ok;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
    VALUES (o1, 'g arch', 'a.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-arch.pdf', 'Archived',
            jsonb_build_object('archive', jsonb_build_object('previous_status', 'uploaded'))) RETURNING id INTO d_arch;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
    VALUES (o1, 'g arch ok', 'a2.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-arch-ok.pdf', 'archived',
            jsonb_build_object('archive', jsonb_build_object('previous_status', 'uploaded'))) RETURNING id INTO d_arch_ok;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status, metadata)
    VALUES (o1, 'g hold', 'h.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-hold.pdf', 'quarantined',
            jsonb_build_object('screening', jsonb_build_object('malware_hold', 'awaiting_verdict', 'structural_status', 'uploaded'))) RETURNING id INTO d_hold;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g up', 'u.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-up.pdf', 'uploaded') RETURNING id INTO d_up;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g cap', 'c.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-cap.pdf', 'uploaded') RETURNING id INTO d_cap;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (o1, 'g res', 'r.pdf', 'application/pdf', 10, sha, 'org_documents', o1::text || '/pos_intake/g-res.pdf', 'restricted') RETURNING id INTO d_res;
    SELECT current_version_id INTO v_bad FROM public.documents WHERE id = d_bad;
    SELECT current_version_id INTO v_arch FROM public.documents WHERE id = d_arch;
    SELECT current_version_id INTO v_hold FROM public.documents WHERE id = d_hold;
    SELECT current_version_id INTO v_up FROM public.documents WHERE id = d_up;
    SELECT current_version_id INTO v_cap FROM public.documents WHERE id = d_cap;
    SELECT current_version_id INTO v_res FROM public.documents WHERE id = d_res;
    IF v_bad IS NULL OR v_arch IS NULL OR v_hold IS NULL OR v_up IS NULL OR v_cap IS NULL OR v_res IS NULL THEN
        RAISE EXCEPTION 'SETUP FAILED: D2 trigger wrote no version';
    END IF;

    -- CASE 1 (G4, Q1): an unsafe verdict leaves a capitalised `Archived` and a `restricted` document as they are; it still
    -- quarantines an uploaded one (positive control).
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_arch,
            jsonb_build_object('version_id', v_arch::text, 'verdict', 'infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_arch, sha, 'infected', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-arch-infected');
    IF (SELECT status FROM public.documents WHERE id = d_arch) <> 'Archived' THEN RAISE EXCEPTION 'CASE 1 FAILED: a capitalised Archived document was quarantined'; END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_res,
            jsonb_build_object('version_id', v_res::text, 'verdict', 'infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_res, sha, 'infected', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-res-infected');
    IF (SELECT status FROM public.documents WHERE id = d_res) <> 'restricted' THEN RAISE EXCEPTION 'CASE 1 FAILED: a restricted document was quarantined'; END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_bad,
            jsonb_build_object('version_id', v_bad::text, 'verdict', 'infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_bad, sha, 'infected', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-bad-infected');
    IF (SELECT status FROM public.documents WHERE id = d_bad) <> 'quarantined' THEN RAISE EXCEPTION 'CASE 1 FAILED: an uploaded document was not quarantined'; END IF;
    passed := passed + 1;

    -- CASE 2 (G1, Q2): a quarantined document with an infected verdict cannot be released to an available status.
    msg := NULL;
    BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = d_bad;
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_unsafe%' THEN RAISE EXCEPTION 'CASE 2 FAILED: unsafe release (%)', coalesce(msg, 'accepted'); END IF;
    IF (SELECT status FROM public.documents WHERE id = d_bad) <> 'quarantined' THEN RAISE EXCEPTION 'CASE 2 FAILED: status changed'; END IF;
    -- Moves that are not releases stay allowed: quarantined → deleted.
    UPDATE public.documents SET status = 'deleted' WHERE id = d_bad;
    UPDATE public.documents SET status = 'quarantined' WHERE id = d_bad;
    passed := passed + 1;

    -- CASE 3 (G1 positive control): a quarantined document with no verdict is released.
    UPDATE public.documents SET status = 'uploaded' WHERE id = d_ok;
    IF (SELECT status FROM public.documents WHERE id = d_ok) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 3 FAILED: a verdict-free release was refused'; END IF;
    passed := passed + 1;

    -- CASE 4 (G1, Q2 + D9.3): document_unarchive cannot restore an archived document whose version is infected.
    msg := NULL;
    BEGIN PERFORM public.document_unarchive(o1, d_arch, 'restore after review', actor, NULL);
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_unsafe%' THEN RAISE EXCEPTION 'CASE 4 FAILED: unsafe unarchive (%)', coalesce(msg, 'accepted'); END IF;
    IF (SELECT status FROM public.documents WHERE id = d_arch) <> 'Archived' THEN RAISE EXCEPTION 'CASE 4 FAILED: status changed'; END IF;
    passed := passed + 1;

    -- CASE 5 (G1 positive control): an archived document with no verdict is restored to its previous status.
    PERFORM public.document_unarchive(o1, d_arch_ok, 'restore after review', actor, NULL);
    IF (SELECT status FROM public.documents WHERE id = d_arch_ok) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 5 FAILED: a verdict-free unarchive was refused'; END IF;
    passed := passed + 1;

    -- CASE 6 (G2, W2): a scan-held document is not released without a verdict, nor on a `failed` verdict.
    msg := NULL;
    BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = d_hold;
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_scan_pending%' THEN RAISE EXCEPTION 'CASE 6 FAILED: pending release (%)', coalesce(msg, 'accepted'); END IF;
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_hold,
            jsonb_build_object('version_id', v_hold::text, 'verdict', 'failed', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_hold, sha, 'failed', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-hold-failed');
    msg := NULL;
    BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = d_hold;
    EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_scan_pending%' THEN RAISE EXCEPTION 'CASE 6 FAILED: release on failed (%)', coalesce(msg, 'accepted'); END IF;
    passed := passed + 1;

    -- CASE 7 (G2 positive control): a clean verdict on the current version releases the scan-held document.
    INSERT INTO public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    VALUES (o1, 'document_malware_verdict_recorded', 'documents', d_hold,
            jsonb_build_object('version_id', v_hold::text, 'verdict', 'clean', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker'))
    RETURNING id INTO ev;
    PERFORM public.record_document_malware_verdict(o1, v_hold, sha, 'clean', 'clamav', '1.4.1', '27450', sig, t0, NULL, ev, 'k-g-hold-clean');
    UPDATE public.documents SET status = 'uploaded' WHERE id = d_hold;
    IF (SELECT status FROM public.documents WHERE id = d_hold) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 7 FAILED: clean release refused'; END IF;
    passed := passed + 1;

    -- CASE 8 (G3, N8): attempts count up with growing backoff; arguments and organization are checked.
    SELECT * INTO r FROM public.note_document_malware_scan_attempt(o1, v_cap, 'object_missing', 60, 3600); n1 := r.attempts; at1 := r.next_attempt_at;
    SELECT * INTO r FROM public.note_document_malware_scan_attempt(o1, v_cap, 'object_missing', 60, 3600); n2 := r.attempts; at2 := r.next_attempt_at;
    SELECT * INTO r FROM public.note_document_malware_scan_attempt(o1, v_cap, 'clamd_timeout', 60, 3600); n3 := r.attempts; at3 := r.next_attempt_at;
    IF n1 <> 1 OR n2 <> 2 OR n3 <> 3 THEN RAISE EXCEPTION 'CASE 8 FAILED: attempts % % %', n1, n2, n3; END IF;
    IF NOT (at1 < at2 AND at2 < at3) THEN RAISE EXCEPTION 'CASE 8 FAILED: backoff does not grow (% % %)', at1, at2, at3; END IF;
    IF (SELECT last_detail FROM public.document_malware_scan_attempts WHERE version_id = v_cap) <> 'clamd_timeout' THEN RAISE EXCEPTION 'CASE 8 FAILED: detail'; END IF;
    refused := false;
    BEGIN PERFORM public.note_document_malware_scan_attempt(o2, v_cap, 'x', 60, 3600); EXCEPTION WHEN OTHERS THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'CASE 8 FAILED: another organization counted an attempt'; END IF;
    refused := false;
    BEGIN PERFORM public.note_document_malware_scan_attempt(o1, v_cap, 'x', 0, 3600); EXCEPTION WHEN OTHERS THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'CASE 8 FAILED: a zero backoff accepted'; END IF;
    -- The counter decides nothing: the version is still pending.
    IF EXISTS (SELECT 1 FROM public.document_malware_effective_verdict(o1, v_cap)) THEN RAISE EXCEPTION 'CASE 8 FAILED: an attempt produced a verdict'; END IF;
    passed := passed + 1;

    -- CASE 9 (G3, G5, grants): clients cannot reach the new functions or the counter; service_role writes the counter
    -- only through its function; the WS11 trigger function has pg_temp and no client EXECUTE.
    IF has_function_privilege('anon', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.note_document_malware_scan_attempt(uuid, uuid, text, integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: note_document_malware_scan_attempt grants';
    END IF;
    IF has_table_privilege('authenticated', 'public.document_malware_scan_attempts', 'SELECT')
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'INSERT')
       OR has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.document_malware_scan_attempts', 'SELECT') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: document_malware_scan_attempts grants';
    END IF;
    IF has_function_privilege('anon', 'public.validate_communication_message_attachment_org()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_communication_message_attachment_org()', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: W3 client EXECUTE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.validate_communication_message_attachment_org()'::regprocedure
                     AND 'search_path=public, pg_temp' = ANY (coalesce(proconfig, '{}'))) THEN
        RAISE EXCEPTION 'CASE 9 FAILED: W3 search_path';
    END IF;
    IF has_function_privilege('authenticated', 'public.documents_refuse_unsafe_release()', 'EXECUTE') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: release guard executable by a client';
    END IF;
    passed := passed + 1;

    -- CASE 10 (G1 scope): an ordinary edit of an available document is untouched by the guard (no verdict reads).
    UPDATE public.documents SET title = 'g up renamed' WHERE id = d_up;
    UPDATE public.documents SET status = 'uploaded' WHERE id = d_up;
    IF (SELECT title FROM public.documents WHERE id = d_up) <> 'g up renamed' THEN RAISE EXCEPTION 'CASE 10 FAILED'; END IF;
    passed := passed + 1;

    RAISE NOTICE 'PASS documents d10 activation gates: lower-case quarantine predicate incl. restricted, unsafe release and unarchive refused, scan hold needs clean, bounded attempts, grants, W3';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END $$;
