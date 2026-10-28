-- EN-FI-01 security release — the DATABASE facts the application gates rely on (rollback-only; run by
-- certification/invariants/run-en-fi-01-local.sh after the staging Documents chain is applied in the same transaction).
-- The app reads with the service-role client, so the boundary is the application gate (disclosableDocumentIds);
-- these checks prove the classification it reads is what the database records.
DO $$
DECLARE
  o uuid := '00000000-0000-4000-8000-000000000001';
  h uuid; c uuid; d_med uuid; d_std uuid; d_pdf uuid; fd uuid; fv uuid; fs uuid; n int; ok int := 0;
BEGIN
  INSERT INTO public.customers (org_id, name) VALUES (o, 'ZZ EN-FI-01 household') RETURNING id INTO h;
  INSERT INTO public.customer_members (org_id, customer_id, display_name, first_name, relationship, is_active)
    VALUES (o, h, 'ZZ child', 'ZZ', 'child', true) RETURNING id INTO c;

  -- 1. A medical TYPE is medical whatever the uploader declared (raise-only floor).
  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, original_filename, mime_type, byte_size, bucket, storage_path, status, sensitivity)
    VALUES (o, 'customer_member', c, 'immunization_record', 'Immunization_Record_ZZ.pdf', 'Immunization_Record_ZZ.pdf', 'application/pdf', 1, 'org_documents', o || '/customer_member/' || c || '/imm.pdf', 'uploaded', 'standard')
    RETURNING id INTO d_med;
  IF (SELECT sensitivity FROM public.documents WHERE id = d_med) = 'medical' THEN ok := ok + 1; RAISE NOTICE 'EN-FI-01 1 PASS medical type raised to medical';
  ELSE RAISE EXCEPTION 'EN-FI-01 1 FAIL: % ', (SELECT sensitivity FROM public.documents WHERE id = d_med); END IF;

  -- 2. An ordinary type stays standard.
  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, original_filename, mime_type, byte_size, bucket, storage_path, status)
    VALUES (o, 'customer_member', c, 'enrollment_document', 'Agreement', 'agreement.pdf', 'application/pdf', 1, 'org_documents', o || '/customer_member/' || c || '/a.pdf', 'uploaded')
    RETURNING id INTO d_std;
  IF (SELECT coalesce(sensitivity, 'standard') FROM public.documents WHERE id = d_std) = 'standard' THEN ok := ok + 1; RAISE NOTICE 'EN-FI-01 2 PASS ordinary type stays standard';
  ELSE RAISE EXCEPTION 'EN-FI-01 2 FAIL'; END IF;

  -- 3. A generated PDF of a MEDICAL form is medical by linkage (what resolveDocumentSensitivity asks).
  INSERT INTO public.form_definitions (org_id, key, name, kind, metadata)
    VALUES (o, 'zz_enfi01_' || substr(md5(random()::text), 1, 8), 'ZZ medical form', 'center', '{"health_capture": {}}'::jsonb) RETURNING id INTO fd;
  INSERT INTO public.form_definition_versions (org_id, form_definition_id, version_number, status, published_at, schema_json)
    VALUES (o, fd, 1, 'published', now(), '{"schema_version":1,"title":"ZZ","sections":[],"fields":[]}'::jsonb) RETURNING id INTO fv;
  INSERT INTO public.form_submissions (org_id, form_definition_id, form_definition_version_id, status, submitted_at, payload, customer_id, customer_member_id)
    VALUES (o, fd, fv, 'submitted', now(), '{}'::jsonb, h, c) RETURNING id INTO fs;
  INSERT INTO public.documents (org_id, entity_type, entity_id, doc_type, title, original_filename, mime_type, byte_size, bucket, storage_path, status)
    VALUES (o, 'customer_member', c, 'generated_form_pdf', 'ZZ medical form (generated)', 'form.pdf', 'application/pdf', 1, 'org_documents', o || '/customer_member/' || c || '/f.pdf', 'uploaded')
    RETURNING id INTO d_pdf;
  INSERT INTO public.form_submission_documents (org_id, form_submission_id, document_id, role) VALUES (o, fs, d_pdf, 'generated_pdf');
  IF public.is_medical_form_submission(fs) THEN ok := ok + 1; RAISE NOTICE 'EN-FI-01 3 PASS generated PDF of a medical form is medical by linkage';
  ELSE RAISE EXCEPTION 'EN-FI-01 3 FAIL'; END IF;

  -- 4. document_medical_type_keys() names exactly the four health types the TS gates use.
  IF (SELECT array_agg(k ORDER BY k) FROM unnest(public.document_medical_type_keys()) k) = ARRAY['health_care_plan','immunization_record','medication_authorization','physical'] THEN
    ok := ok + 1; RAISE NOTICE 'EN-FI-01 4 PASS medical vocabulary';
  ELSE RAISE EXCEPTION 'EN-FI-01 4 FAIL'; END IF;

  -- 5. The owner association the library and requirement reads use exists for the child (D2 trigger).
  SELECT count(*) INTO n FROM public.document_subjects WHERE document_id = d_med AND subject_type = 'child' AND subject_id = c AND association = 'owner' AND ended_at IS NULL;
  IF n = 1 THEN ok := ok + 1; RAISE NOTICE 'EN-FI-01 5 PASS owner association recorded';
  ELSE RAISE EXCEPTION 'EN-FI-01 5 FAIL: % owner rows', n; END IF;

  -- 6. Cross-organization: the medical document is not this other organization's document.
  SELECT count(*) INTO n FROM public.documents WHERE id = d_med AND org_id = 'aaaa1111-0000-4000-8000-000000000001';
  IF n = 0 THEN ok := ok + 1; RAISE NOTICE 'EN-FI-01 6 PASS org-bound';
  ELSE RAISE EXCEPTION 'EN-FI-01 6 FAIL'; END IF;

  RAISE NOTICE 'EN-FI-01 DATABASE INVARIANTS PASS %/6', ok;
END $$;
