-- Documents D2 — the canonical document foundation holds at the database. Rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated certification environment (certenv-*) that already
-- carries migration 20261208090000 (applied by database.apply_migration). The executor owns the transaction and always
-- discards it. It reads existing organizations, opportunities and children; every row it writes is discarded.
--
-- Each CASE is one DO block; any invariant that does not hold RAISEs and fails the run. A refusal that is EXPECTED is
-- caught in its own sub-block (the sub-block's work is undone with it).

-- CASE 0 — the schema is the D2 schema, and the fixture subjects exist.
CREATE TEMP TABLE d2_ctx (org uuid, opp1 uuid, opp2 uuid, child uuid, foreign_opp uuid, doc uuid, med uuid, raw uuid);

DO $$
DECLARE v_org uuid; v_opp1 uuid; v_opp2 uuid; v_child uuid; v_foreign uuid;
BEGIN
  IF to_regclass('public.document_subjects') IS NULL OR to_regclass('public.document_subject_links') IS NULL THEN
    RAISE EXCEPTION 'CASE 0 FAILED: D2 tables missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'current_version_id') THEN
    RAISE EXCEPTION 'CASE 0 FAILED: documents.current_version_id missing';
  END IF;
  SELECT o.org_id INTO v_org FROM public.opportunities o
   WHERE EXISTS (SELECT 1 FROM public.customer_members m WHERE m.org_id = o.org_id)
   GROUP BY o.org_id HAVING count(*) >= 2 ORDER BY o.org_id LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'CASE 0 FAILED: no organization with two opportunities and a child'; END IF;
  SELECT id INTO v_opp1 FROM public.opportunities WHERE org_id = v_org ORDER BY id LIMIT 1;
  SELECT id INTO v_opp2 FROM public.opportunities WHERE org_id = v_org AND id <> v_opp1 ORDER BY id LIMIT 1;
  SELECT id INTO v_child FROM public.customer_members WHERE org_id = v_org ORDER BY id LIMIT 1;
  SELECT id INTO v_foreign FROM public.opportunities WHERE org_id <> v_org ORDER BY id LIMIT 1;
  IF v_foreign IS NULL THEN RAISE EXCEPTION 'CASE 0 FAILED: no opportunity in a second organization'; END IF;
  INSERT INTO d2_ctx (org, opp1, opp2, child, foreign_opp) VALUES (v_org, v_opp1, v_opp2, v_child, v_foreign);
  RAISE NOTICE 'CASE 0 PASS schema present; fixture subjects resolved';
END $$;

-- CASE 1 — every writer gets a version and an owner from the database itself; checksum and class are recorded.
DO $$
DECLARE c record; d record; v record; n int;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
  VALUES (c.org, 'opportunity', c.opp1, 'proof', 'd2 invariant', 'application/pdf', 10, repeat('a', 64), 'org_documents',
          c.org::text || '/opportunity/' || c.opp1::text || '/d2-invariant-v1.pdf', 'uploaded')
  RETURNING * INTO d;
  SELECT * INTO v FROM public.document_versions WHERE id = d.current_version_id;
  IF NOT FOUND OR v.document_id <> d.id OR v.version_number <> 1 OR v.source <> 'document_insert'
     OR v.storage_path <> d.storage_path OR v.checksum_sha256 <> d.checksum_sha256 OR v.bucket <> d.bucket THEN
    RAISE EXCEPTION 'CASE 1 FAILED: the insert did not produce a matching version 1';
  END IF;
  SELECT count(*) INTO n FROM public.document_subjects s
   WHERE s.document_id = d.id AND s.is_primary AND s.ended_at IS NULL AND s.subject_type = 'opportunity' AND s.subject_id = c.opp1 AND s.source = 'legacy_writer';
  IF n <> 1 THEN RAISE EXCEPTION 'CASE 1 FAILED: the legacy parent did not become the primary owner'; END IF;
  IF d.sensitivity <> 'standard' THEN RAISE EXCEPTION 'CASE 1 FAILED: standard document declared %', d.sensitivity; END IF;

  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, mime_type, byte_size, bucket, storage_path, status)
  VALUES (c.org, 'customer_member', c.child, 'immunization_record', 'd2 medical', 'application/pdf', 10, 'org_documents',
          c.org::text || '/customer_member/' || c.child::text || '/d2-medical.pdf', 'uploaded')
  RETURNING * INTO d;
  IF d.sensitivity <> 'medical' THEN RAISE EXCEPTION 'CASE 1 FAILED: a medical type was declared %', d.sensitivity; END IF;
  IF (SELECT source FROM public.document_versions WHERE id = d.current_version_id) <> 'document_insert_unhashed' THEN
    RAISE EXCEPTION 'CASE 1 FAILED: an unhashed legacy insert was not marked as such';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = d.id AND subject_type = 'child' AND is_primary) THEN
    RAISE EXCEPTION 'CASE 1 FAILED: customer_member did not map to the child subject';
  END IF;

  INSERT INTO public.documents (org_id, entity_type, entity_id, title, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
  VALUES (c.org, 'customer_member', gen_random_uuid(), 'd2 orphan parent', 'application/pdf', 10, repeat('c', 64), 'org_documents',
          c.org::text || '/customer_member/x/d2-orphan.pdf', 'uploaded')
  RETURNING * INTO v;
  IF EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = v.id) THEN
    RAISE EXCEPTION 'CASE 1 FAILED: a parent that does not exist was given an owner';
  END IF;

  UPDATE d2_ctx SET doc = (SELECT id FROM public.documents WHERE title = 'd2 invariant' AND org_id = c.org), med = d.id, raw = v.id;
  RAISE NOTICE 'CASE 1 PASS version 1 and primary owner from the insert; checksum, class and unresolved parent handled';
END $$;

-- CASE 2 — a version is immutable except its review and expiration fields, and outlives its document's changes.
DO $$
DECLARE c record; v_id uuid;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  SELECT current_version_id INTO v_id FROM public.documents WHERE id = c.doc;
  BEGIN
    UPDATE public.document_versions SET storage_path = c.org::text || '/elsewhere.pdf' WHERE id = v_id;
    RAISE EXCEPTION 'CASE 2 FAILED: a version''s path changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.document_versions SET checksum_sha256 = repeat('b', 64) WHERE id = v_id;
    RAISE EXCEPTION 'CASE 2 FAILED: a version''s checksum changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.document_versions SET review_status = 'accepted', reviewed_at = now(), expires_on = current_date + 365 WHERE id = v_id;
  IF (SELECT review_status FROM public.document_versions WHERE id = v_id) <> 'accepted' THEN
    RAISE EXCEPTION 'CASE 2 FAILED: review metadata did not apply';
  END IF;
  BEGIN
    SET CONSTRAINTS public.trg_document_versions_guard_delete IMMEDIATE;
    DELETE FROM public.document_versions WHERE id = v_id;
    RAISE EXCEPTION 'CASE 2 FAILED: a version was removed while its document remains';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SET CONSTRAINTS public.trg_document_versions_guard_delete DEFERRED;
  UPDATE public.documents SET title = 'd2 invariant renamed' WHERE id = c.doc;
  IF NOT EXISTS (SELECT 1 FROM public.document_versions WHERE id = v_id) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: an ordinary document change lost its version';
  END IF;
  RAISE NOTICE 'CASE 2 PASS path and checksum immutable; review fields mutable; version survives; no removal while the document remains';
END $$;

-- CASE 3 — the file columns are a projection: no silent binary overwrite.
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  BEGIN
    UPDATE public.documents SET storage_path = c.org::text || '/opportunity/x/overwritten.pdf' WHERE id = c.doc;
    RAISE EXCEPTION 'CASE 3 FAILED: the stored file was repointed outside a version';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.documents SET checksum_sha256 = repeat('d', 64), byte_size = 99 WHERE id = c.doc;
    RAISE EXCEPTION 'CASE 3 FAILED: the content identity changed outside a version';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'CASE 3 PASS the file columns change only with a version';
END $$;

-- CASE 4 — replacement adds version 2, keeps version 1, and refuses what it must.
DO $$
DECLARE c record; r jsonb; v1 uuid; d record;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  SELECT current_version_id INTO v1 FROM public.documents WHERE id = c.doc;
  r := public.document_add_version(c.org, c.doc, 'org_documents', c.org::text || '/opportunity/' || c.opp1::text || '/d2-invariant-v2.pdf',
                                   'v2.pdf', 'application/pdf', 20, repeat('e', 64), 'corrected scan from the family', NULL, '{}'::jsonb, '{}'::jsonb);
  SELECT * INTO d FROM public.documents WHERE id = c.doc;
  IF (r ->> 'version_number')::int <> 2 OR d.current_version_id <> (r ->> 'version_id')::uuid OR d.checksum_sha256 <> repeat('e', 64)
     OR (r ->> 'supersedes_version_id')::uuid <> v1 THEN
    RAISE EXCEPTION 'CASE 4 FAILED: replacement did not become current version 2 superseding version 1 (%)', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_versions WHERE id = v1 AND checksum_sha256 = repeat('a', 64)) THEN
    RAISE EXCEPTION 'CASE 4 FAILED: version 1 was lost';
  END IF;
  BEGIN
    PERFORM public.document_add_version(c.org, c.doc, 'org_documents', c.org::text || '/opportunity/' || c.opp1::text || '/d2-invariant-v2.pdf',
                                        'v3.pdf', 'application/pdf', 20, repeat('f', 64), 'aliasing an existing object', NULL, '{}'::jsonb, '{}'::jsonb);
    RAISE EXCEPTION 'CASE 4 FAILED: a version aliased another version''s object';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.document_add_version(c.org, c.doc, 'org_documents', c.org::text || '/opportunity/x/v4.pdf',
                                        'v4.pdf', 'application/pdf', 20, NULL, 'no checksum given here', NULL, '{}'::jsonb, '{}'::jsonb);
    RAISE EXCEPTION 'CASE 4 FAILED: a version without a checksum was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.document_add_version(c.org, c.doc, 'org_documents', 'ffffffff-0000-4000-8000-000000000000/opportunity/x/v5.pdf',
                                        'v5.pdf', 'application/pdf', 20, repeat('9', 64), 'another tenant prefix', NULL, '{}'::jsonb, '{}'::jsonb);
    RAISE EXCEPTION 'CASE 4 FAILED: a version outside the organization prefix was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'CASE 4 PASS v2 current, v1 kept; aliasing, missing checksum and foreign prefix refused';
END $$;

-- CASE 5 — subjects: one writer, one primary, the legacy parent follows, organization-bound.
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  BEGIN
    INSERT INTO public.document_subjects (org_id, document_id, subject_type, subject_id, association, is_primary, source)
    VALUES (c.org, c.doc, 'opportunity', c.opp2, 'owner', false, 'governed');
    RAISE EXCEPTION 'CASE 5 FAILED: a direct association write was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.document_set_primary_subject(c.org, c.doc, 'opportunity', c.opp2, NULL);
  IF (SELECT entity_id FROM public.documents WHERE id = c.doc) <> c.opp2 THEN RAISE EXCEPTION 'CASE 5 FAILED: the legacy parent did not follow'; END IF;
  SELECT count(*) INTO n FROM public.document_subjects WHERE document_id = c.doc AND is_primary AND ended_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'CASE 5 FAILED: % active primaries', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = c.doc AND subject_id = c.opp1 AND ended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CASE 5 FAILED: the previous owner was not kept as history';
  END IF;
  PERFORM public.document_link_subject(c.org, c.doc, 'child', c.child, 'owner', NULL);
  PERFORM public.document_link_subject(c.org, c.doc, 'opportunity', c.opp1, 'context', NULL);
  IF (SELECT count(*) FROM public.document_subject_links WHERE document_id = c.doc) <> 3 THEN
    RAISE EXCEPTION 'CASE 5 FAILED: links view shows % associations', (SELECT count(*) FROM public.document_subject_links WHERE document_id = c.doc);
  END IF;
  IF (SELECT entity_id FROM public.documents WHERE id = c.doc) <> c.opp2 THEN
    RAISE EXCEPTION 'CASE 5 FAILED: a secondary link moved the legacy parent';
  END IF;
  BEGIN
    PERFORM public.document_unlink_subject(c.org, c.doc, 'opportunity', c.opp2, NULL);
    RAISE EXCEPTION 'CASE 5 FAILED: the primary owner was removed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.document_set_primary_subject(c.org, c.doc, 'opportunity', c.foreign_opp, NULL);
    RAISE EXCEPTION 'CASE 5 FAILED: another organization''s opportunity became the owner';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.document_link_subject(c.org, c.doc, 'opportunity', c.foreign_opp, 'context', NULL);
    RAISE EXCEPTION 'CASE 5 FAILED: another organization''s opportunity was linked';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.document_set_primary_subject(c.org, c.doc, 'processing_case', c.opp1, NULL);
    RAISE EXCEPTION 'CASE 5 FAILED: a context-only type became the owner';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- A legacy writer that re-files is routed into the canonical association.
  UPDATE public.documents SET entity_type = 'opportunities', entity_id = c.opp1 WHERE id = c.doc;
  IF NOT EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = c.doc AND subject_id = c.opp1 AND is_primary AND ended_at IS NULL)
     OR (SELECT entity_type FROM public.documents WHERE id = c.doc) <> 'opportunity' THEN
    RAISE EXCEPTION 'CASE 5 FAILED: the legacy re-file did not become the primary owner';
  END IF;
  BEGIN
    UPDATE public.documents SET entity_type = 'opportunity', entity_id = gen_random_uuid() WHERE id = c.doc;
    RAISE EXCEPTION 'CASE 5 FAILED: a legacy re-file to a subject that does not exist was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.documents SET entity_type = 'job', entity_id = c.opp1 WHERE id = c.doc;
    RAISE EXCEPTION 'CASE 5 FAILED: a legacy re-file to a non-owner type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'CASE 5 PASS single writer; one primary with history; legacy parent is the projection; foreign and context-only owners refused';
END $$;

-- CASE 6 — sensitivity may only be raised.
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  BEGIN
    UPDATE public.documents SET sensitivity = 'personal_identity' WHERE id = c.med;
    RAISE EXCEPTION 'CASE 6 FAILED: medical became personal_identity';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.documents SET sensitivity = 'standard' WHERE id = c.med;
    RAISE EXCEPTION 'CASE 6 FAILED: medical was lowered to standard';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.documents SET sensitivity = 'restricted' WHERE id = c.med;
  BEGIN
    UPDATE public.documents SET sensitivity = 'medical' WHERE id = c.med;
    RAISE EXCEPTION 'CASE 6 FAILED: restricted was lowered';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.documents SET sensitivity = 'secret' WHERE id = c.doc;
    RAISE EXCEPTION 'CASE 6 FAILED: an unknown class was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.documents SET sensitivity = 'personal_identity' WHERE id = c.doc;
  RAISE NOTICE 'CASE 6 PASS raise-only: lowering and unknown classes refused';
END $$;

-- CASE 7 — a quarantined or deleted document takes no new version; a held document records its hold.
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  UPDATE public.documents SET status = 'quarantined' WHERE id = c.raw;
  BEGIN
    PERFORM public.document_add_version(c.org, c.raw, 'org_documents', c.org::text || '/customer_member/x/d2-orphan-v2.pdf',
                                        'v2.pdf', 'application/pdf', 20, repeat('7', 64), 'replacing a quarantined file', NULL, '{}'::jsonb, '{}'::jsonb);
    RAISE EXCEPTION 'CASE 7 FAILED: a quarantined document took a version';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.documents SET legal_hold = true WHERE id = c.doc;
    RAISE EXCEPTION 'CASE 7 FAILED: a legal hold without a reason was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.documents SET legal_hold = true, legal_hold_reason = 'litigation hold' WHERE id = c.doc;
  IF (SELECT legal_hold_set_at FROM public.documents WHERE id = c.doc) IS NULL THEN RAISE EXCEPTION 'CASE 7 FAILED: hold time not recorded'; END IF;
  RAISE NOTICE 'CASE 7 PASS unavailable documents take no version; a hold needs a reason and records when';
END $$;

-- CASE 8 — the audited delete takes versions and associations with it; an association is never removed alone.
DO $$
DECLARE c record; v_ids uuid[];
BEGIN
  SELECT * INTO c FROM d2_ctx;
  BEGIN
    DELETE FROM public.document_subjects WHERE document_id = c.doc AND NOT is_primary;
    RAISE EXCEPTION 'CASE 8 FAILED: an association was removed while its document remains';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT array_agg(id) INTO v_ids FROM public.document_versions WHERE document_id = c.doc;
  SET CONSTRAINTS public.trg_document_versions_guard_delete IMMEDIATE;
  DELETE FROM public.documents WHERE id = c.doc;
  SET CONSTRAINTS public.trg_document_versions_guard_delete DEFERRED;
  IF EXISTS (SELECT 1 FROM public.document_versions WHERE id = ANY (v_ids))
     OR EXISTS (SELECT 1 FROM public.document_subjects WHERE document_id = c.doc) THEN
    RAISE EXCEPTION 'CASE 8 FAILED: versions or associations outlived their document';
  END IF;
  RAISE NOTICE 'CASE 8 PASS document removal cascades its versions and associations';
END $$;

-- CASE 9 — clients reach none of it: tables, view and governed functions.
DO $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM d2_ctx;
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.document_subjects;
    RAISE EXCEPTION 'CASE 9 FAILED: authenticated read document_subjects';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.document_subject_links;
    RAISE EXCEPTION 'CASE 9 FAILED: authenticated read document_subject_links';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.document_set_primary_subject(c.org, c.med, 'opportunity', c.opp1, NULL);
    RAISE EXCEPTION 'CASE 9 FAILED: authenticated ran document_set_primary_subject';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.document_add_version(c.org, c.med, 'org_documents', c.org::text || '/x/y.pdf', 'y.pdf', 'application/pdf', 1, repeat('1', 64), 'anonymous attempt', NULL, '{}'::jsonb, '{}'::jsonb);
    RAISE EXCEPTION 'CASE 9 FAILED: anon ran document_add_version';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO n FROM public.document_versions;
    RAISE EXCEPTION 'CASE 9 FAILED: anon read document_versions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'CASE 9 PASS authenticated and anon reach no D2 table, view or function';
END $$;

-- CASE 10 — the backfill reconciles: every stored document has a matching current version, every resolvable legacy
-- parent is the primary owner, and no medical type is declared standard.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.documents d
   WHERE d.storage_path IS NOT NULL AND d.bucket IS NOT NULL AND split_part(d.storage_path, '/', 1) = d.org_id::text
     AND (d.current_version_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.document_versions v
           WHERE v.id = d.current_version_id AND v.document_id = d.id AND v.storage_path = d.storage_path AND v.bucket = d.bucket));
  IF n > 0 THEN RAISE EXCEPTION 'CASE 10 FAILED: % stored documents without a matching current version', n; END IF;
  SELECT count(*) INTO n FROM public.documents d
   WHERE public.document_subject_type_for_legacy(d.entity_type) IS NOT NULL AND d.entity_id IS NOT NULL
     AND public.document_subject_resolves(d.org_id, public.document_subject_type_for_legacy(d.entity_type), d.entity_id)
     AND NOT EXISTS (SELECT 1 FROM public.document_subjects s WHERE s.document_id = d.id AND s.is_primary AND s.ended_at IS NULL AND s.subject_id = d.entity_id);
  IF n > 0 THEN RAISE EXCEPTION 'CASE 10 FAILED: % resolvable documents without their primary owner', n; END IF;
  SELECT count(*) INTO n FROM public.documents WHERE sensitivity = 'standard'
     AND doc_type IN ('physical', 'immunization_record', 'health_care_plan', 'medication_authorization');
  IF n > 0 THEN RAISE EXCEPTION 'CASE 10 FAILED: % medical types declared standard', n; END IF;
  RAISE NOTICE 'CASE 10 PASS backfill reconciled on this database';
END $$;

SELECT 'vac_rollback_test_reached_end';
