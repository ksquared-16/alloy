-- Documents Q2 — TEST-ONLY malware-verdict fixture (qa_documents_q2_verdict_fixture_ensure / _reset), rollback-only.
-- Run by database.run_rollback_invariant_test against an EXISTING ready certification environment (certenv-*): the
-- executor owns the transaction and always discards it. Each fixture statement below is the fixture's statement with its
-- psql variables substituted (org = QA Shared, qa_run_id = 'qar_00000000q2f0', ids and sha = the fixture's \set values,
-- runtime \gset values = the plpgsql variables of the same name); the binding test
-- web/tests/certification/qaDocumentsQ2VerdictFixture.test.ts proves that, statement by statement.
-- psql meta-commands (\if / \gset) are refused by this harness, so each guard predicate is asserted as a plain condition:
-- false on clean state, true on the state it exists to refuse. Any failed invariant RAISEs.
-- Residue semantics (Q2-VERDICT-FIXTURE-PLAN.md): ZERO_RESIDUE = no ae000000- document, version, subject or verdict
-- after the reset; the fixture's document_malware_verdict_recorded audit rows are RETAINED history, asserted present.
DO $q2$
DECLARE
    v_infected uuid; v_suspicious uuid; v_archived uuid; v_clean uuid;
    ev_infected uuid; ev_suspicious uuid; ev_archived uuid; ev_clean uuid;
    ctrl uuid;
    msg text;
    n integer;
    passed integer := 0;
BEGIN
    -- Environment: QA Shared and the authz OPP1 the fixture is owned by (seeded only when absent), plus a CONTROL
    -- document outside the ae000000- namespace that the reset must never reach.
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) THEN
        INSERT INTO public.orgs (id, name, slug) VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ZZ Alloy QA', 'zz-alloy-qa');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.opportunities WHERE id = 'aa000000-0000-4000-8000-000000000111'::uuid) THEN
        INSERT INTO public.customers (id, org_id, name, customer_number)
        VALUES ('a9000000-0000-4000-8000-0000000000c1'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ZZ q2 household', 997201);
        INSERT INTO public.opportunities (id, org_id, customer_id, opportunity_number)
        VALUES ('aa000000-0000-4000-8000-000000000111'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'a9000000-0000-4000-8000-0000000000c1'::uuid, 997201);
    END IF;
    INSERT INTO public.documents (org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'zz q2 control', 'c.pdf', 'application/pdf', 10, repeat('c', 64), 'org_documents',
            '4acc9386-c485-486f-aa1f-05d83499d142/zz-q2-control.pdf', 'quarantined') RETURNING id INTO ctrl;

    -- CASE 1: on clean state every ensure guard is false (the fixture would proceed).
    IF (not exists (select 1 from public.opportunities where id = 'aa000000-0000-4000-8000-000000000111'::uuid and org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid))
       OR (exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid))
       OR (exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                and coalesce(metadata->>'qa_run_id', '') <> 'qar_00000000q2f0')) THEN
        RAISE EXCEPTION 'CASE 1 FAILED: a guard fired on clean state';
    END IF;
    passed := passed + 1;

    -- CASE 2: the ensure's writes, as the fixture issues them.
    insert into public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path,
                                  status, entity_type, entity_id, metadata)
    values
      ('ae000000-0000-4000-8000-000000000001'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-q2 infected ' || 'qar_00000000q2f0', 'qa-q2-infected.pdf', 'application/pdf', 10, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2',
       'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142' || '/qa-q2/' || 'qar_00000000q2f0' || '/infected.pdf', 'quarantined', 'opportunity', 'aa000000-0000-4000-8000-000000000111'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000q2f0', 'fixture_family', 'documents_q2_verdict', 'fixture_key', 'infected')),
      ('ae000000-0000-4000-8000-000000000002'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-q2 suspicious ' || 'qar_00000000q2f0', 'qa-q2-suspicious.pdf', 'application/pdf', 10, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2',
       'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142' || '/qa-q2/' || 'qar_00000000q2f0' || '/suspicious.pdf', 'quarantined', 'opportunity', 'aa000000-0000-4000-8000-000000000111'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000q2f0', 'fixture_family', 'documents_q2_verdict', 'fixture_key', 'suspicious')),
      ('ae000000-0000-4000-8000-000000000003'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-q2 pending ' || 'qar_00000000q2f0', 'qa-q2-pending.pdf', 'application/pdf', 10, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2',
       'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142' || '/qa-q2/' || 'qar_00000000q2f0' || '/pending.pdf', 'quarantined', 'opportunity', 'aa000000-0000-4000-8000-000000000111'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000q2f0', 'fixture_family', 'documents_q2_verdict', 'fixture_key', 'pending',
                          'screening', jsonb_build_object('malware_hold', 'awaiting_verdict', 'structural_status', 'uploaded'))),
      ('ae000000-0000-4000-8000-000000000004'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-q2 archived ' || 'qar_00000000q2f0', 'qa-q2-archived.pdf', 'application/pdf', 10, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2',
       'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142' || '/qa-q2/' || 'qar_00000000q2f0' || '/archived.pdf', 'archived', 'opportunity', 'aa000000-0000-4000-8000-000000000111'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000q2f0', 'fixture_family', 'documents_q2_verdict', 'fixture_key', 'archived',
                          'archive', jsonb_build_object('previous_status', 'uploaded', 'reason', 'QA Q2 fixture'))),
      ('ae000000-0000-4000-8000-000000000005'::uuid, '4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'qa-q2 clean ' || 'qar_00000000q2f0', 'qa-q2-clean.pdf', 'application/pdf', 10, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2',
       'org_documents', '4acc9386-c485-486f-aa1f-05d83499d142' || '/qa-q2/' || 'qar_00000000q2f0' || '/clean.pdf', 'quarantined', 'opportunity', 'aa000000-0000-4000-8000-000000000111'::uuid,
       jsonb_build_object('qa_run_id', 'qar_00000000q2f0', 'fixture_family', 'documents_q2_verdict', 'fixture_key', 'clean'));

    SELECT current_version_id INTO v_infected FROM public.documents WHERE id = 'ae000000-0000-4000-8000-000000000001'::uuid;
    SELECT current_version_id INTO v_suspicious FROM public.documents WHERE id = 'ae000000-0000-4000-8000-000000000002'::uuid;
    SELECT current_version_id INTO v_archived FROM public.documents WHERE id = 'ae000000-0000-4000-8000-000000000004'::uuid;
    SELECT current_version_id INTO v_clean FROM public.documents WHERE id = 'ae000000-0000-4000-8000-000000000005'::uuid;
    IF v_infected IS NULL OR v_suspicious IS NULL OR v_archived IS NULL OR v_clean IS NULL THEN RAISE EXCEPTION 'CASE 2 FAILED: D2 trigger wrote no version'; END IF;

    insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    values ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'document_malware_verdict_recorded', 'documents', 'ae000000-0000-4000-8000-000000000001'::uuid,
            jsonb_build_object('version_id', v_infected, 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'infected',
                               'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', 'qar_00000000q2f0')) RETURNING id INTO ev_infected;
    PERFORM verdict_id from public.record_document_malware_verdict('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_infected::uuid, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2', 'infected', 'qa-fixture', 'q2-fixture-1', 'q2',
        now() - interval '2 hours', now(), 'qa-q2-' || 'qar_00000000q2f0', ev_infected::uuid, 'qa-q2-' || 'qar_00000000q2f0' || '-infected');

    insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    values ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'document_malware_verdict_recorded', 'documents', 'ae000000-0000-4000-8000-000000000002'::uuid,
            jsonb_build_object('version_id', v_suspicious, 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'suspicious',
                               'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', 'qar_00000000q2f0')) RETURNING id INTO ev_suspicious;
    PERFORM verdict_id from public.record_document_malware_verdict('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_suspicious::uuid, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2', 'suspicious', 'qa-fixture', 'q2-fixture-1', 'q2',
        now() - interval '2 hours', now(), 'qa-q2-' || 'qar_00000000q2f0', ev_suspicious::uuid, 'qa-q2-' || 'qar_00000000q2f0' || '-suspicious');

    insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    values ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'document_malware_verdict_recorded', 'documents', 'ae000000-0000-4000-8000-000000000004'::uuid,
            jsonb_build_object('version_id', v_archived, 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'infected',
                               'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', 'qar_00000000q2f0')) RETURNING id INTO ev_archived;
    PERFORM verdict_id from public.record_document_malware_verdict('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_archived::uuid, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2', 'infected', 'qa-fixture', 'q2-fixture-1', 'q2',
        now() - interval '2 hours', now(), 'qa-q2-' || 'qar_00000000q2f0', ev_archived::uuid, 'qa-q2-' || 'qar_00000000q2f0' || '-archived');

    insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
    values ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'document_malware_verdict_recorded', 'documents', 'ae000000-0000-4000-8000-000000000005'::uuid,
            jsonb_build_object('version_id', v_clean, 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'clean',
                               'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', 'qar_00000000q2f0')) RETURNING id INTO ev_clean;
    PERFORM verdict_id from public.record_document_malware_verdict('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, v_clean::uuid, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2', 'clean', 'qa-fixture', 'q2-fixture-1', 'q2',
        now() - interval '2 hours', now(), 'qa-q2-' || 'qar_00000000q2f0', ev_clean::uuid, 'qa-q2-' || 'qar_00000000q2f0' || '-clean');

    -- The ensure's read-back: every state as seeded (the writer left the archived document archived).
    IF NOT ((select status from public.documents where id = 'ae000000-0000-4000-8000-000000000001'::uuid) = 'quarantined'
            and (select status from public.documents where id = 'ae000000-0000-4000-8000-000000000002'::uuid) = 'quarantined'
            and (select status from public.documents where id = 'ae000000-0000-4000-8000-000000000003'::uuid) = 'quarantined'
            and (select status from public.documents where id = 'ae000000-0000-4000-8000-000000000004'::uuid) = 'archived'
            and (select status from public.documents where id = 'ae000000-0000-4000-8000-000000000005'::uuid) = 'quarantined'
            and (select count(*) from public.document_malware_verdicts v
                  where v.document_id::text like 'ae000000-%' and v.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and v.kind = 'verdict') = 4) THEN
        RAISE EXCEPTION 'CASE 2 FAILED: the seeded states did not read back';
    END IF;
    IF (SELECT verdict FROM public.document_malware_verdicts WHERE version_id = v_infected) <> 'infected'
       OR (SELECT verdict FROM public.document_malware_verdicts WHERE version_id = v_clean) <> 'clean'
       OR EXISTS (SELECT 1 FROM public.document_malware_verdicts WHERE document_id = 'ae000000-0000-4000-8000-000000000003'::uuid) THEN
        RAISE EXCEPTION 'CASE 2 FAILED: verdict content';
    END IF;
    passed := passed + 1;

    -- CASE 3: the seeded states engage the deployed guards (what the hosted driver relies on). Each refusal is checked
    -- in its own block, so nothing it might have written survives; the clean control releases.
    msg := NULL; BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = 'ae000000-0000-4000-8000-000000000001'::uuid; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_unsafe%' THEN RAISE EXCEPTION 'CASE 3 FAILED: infected release (%)', coalesce(msg, 'accepted'); END IF;
    msg := NULL; BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = 'ae000000-0000-4000-8000-000000000003'::uuid; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_scan_pending%' THEN RAISE EXCEPTION 'CASE 3 FAILED: pending release (%)', coalesce(msg, 'accepted'); END IF;
    msg := NULL; BEGIN UPDATE public.documents SET status = 'uploaded' WHERE id = 'ae000000-0000-4000-8000-000000000004'::uuid; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE '%document_malware_unsafe%' THEN RAISE EXCEPTION 'CASE 3 FAILED: archived restore (%)', coalesce(msg, 'accepted'); END IF;
    UPDATE public.documents SET status = 'uploaded' WHERE id = 'ae000000-0000-4000-8000-000000000005'::uuid;
    IF (SELECT status FROM public.documents WHERE id = 'ae000000-0000-4000-8000-000000000005'::uuid) <> 'uploaded' THEN RAISE EXCEPTION 'CASE 3 FAILED: clean control'; END IF;
    passed := passed + 1;

    -- CASE 4: with rows present, each refusal guard fires on the state it exists to refuse.
    IF NOT (exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                and coalesce(metadata->>'qa_run_id', '') <> 'qar_00000000q2f1')) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: another run''s rows did not trip the other-run guard';
    END IF;
    IF NOT (exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)) THEN
        RAISE EXCEPTION 'CASE 4 FAILED: re-ensure would not see its own rows';
    END IF;
    passed := passed + 1;

    -- CASE 5: the reset, as the fixture issues it; ZERO_RESIDUE for the ae000000- namespace; the audit history and the
    -- control document remain.
    delete from public.documents
     where id::text like 'ae000000-%' and org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and metadata->>'qa_run_id' = 'qar_00000000q2f0';
    IF ((select count(*) from public.documents where id::text like 'ae000000-%')
        + (select count(*) from public.document_versions where document_id::text like 'ae000000-%')
        + (select count(*) from public.document_subjects where document_id::text like 'ae000000-%')
        + (select count(*) from public.document_malware_verdicts where document_id::text like 'ae000000-%')) <> 0 THEN
        RAISE EXCEPTION 'CASE 5 FAILED: residue after the reset';
    END IF;
    SELECT count(*) INTO n FROM public.workflow_events
     WHERE payload->>'fixture' = 'qa_documents_q2_verdict_fixture' AND payload->>'qa_run_id' = 'qar_00000000q2f0';
    IF n <> 4 THEN RAISE EXCEPTION 'CASE 5 FAILED: retained audit history is % rows, expected 4', n; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = ctrl) THEN RAISE EXCEPTION 'CASE 5 FAILED: the reset reached a control document'; END IF;
    passed := passed + 1;

    RAISE NOTICE 'PASS documents q2 verdict fixture: guards clean, five states seeded through the deployed writer, guards engaged, other-run refusal, reset to zero residue with audit history retained and the control untouched';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END
$q2$;
