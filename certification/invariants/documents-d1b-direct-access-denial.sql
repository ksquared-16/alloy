-- Documents D1b.2 / D1b.3 — direct client access is refused at the database, rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment
-- (certenv-*): the executor owns the transaction and always discards it.
--
-- CASE 0 applies the two D1b migrations VERBATIM (comment lines removed). The binding test
-- web/tests/documents/documentsD1bHardening.test.ts proves the bytes are the migrations' own.
-- Each later case is a REAL attempt by the `anon` / `authenticated` roles, the roles PostgREST runs a
-- client's request as. It is made under SET LOCAL ROLE and must fail with insufficient_privilege.
-- Any invariant that does not hold RAISEs.

-- CASE 0 — the migrations, verbatim.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'documents',
        'document_versions',
        'document_field_values',
        'document_field_definitions',
        'form_submission_documents',
        'form_submission_signatures'
    ] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
        END IF;
    END LOOP;
END $$;

DO $verify$
DECLARE
    t text;
    r text;
    p text;
    leaks text := '';
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'documents',
        'document_versions',
        'document_field_values',
        'document_field_definitions',
        'form_submission_documents',
        'form_submission_signatures'
    ] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE EXCEPTION 'expected table public.% is missing', t;
        END IF;
        FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
                IF has_table_privilege(r, ('public.' || t)::regclass, p) THEN
                    leaks := leaks || format('%s.%s:%s ', t, r, p);
                END IF;
            END LOOP;
        END LOOP;
        IF NOT has_table_privilege('service_role', ('public.' || t)::regclass, 'SELECT, INSERT, UPDATE, DELETE') THEN
            RAISE EXCEPTION 'service_role lost access to public.%', t;
        END IF;
    END LOOP;
    -- Column privileges are the other way OCR text can stay reachable after a table-level revoke.
    IF has_column_privilege('authenticated', 'public.documents'::regclass, 'extracted_text', 'SELECT')
       OR has_column_privilege('anon', 'public.documents'::regclass, 'extracted_text', 'SELECT') THEN
        leaks := leaks || 'documents.extracted_text:column ';
    END IF;
    IF leaks <> '' THEN
        RAISE EXCEPTION 'document tables still reachable by client roles: %', leaks;
    END IF;
END
$verify$;

INSERT INTO storage.buckets (id, name, public)
SELECT 'org_documents', 'org_documents', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'org_documents');

UPDATE storage.buckets
SET public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/png',
        'image/jpeg',
        'text/plain',
        'text/csv',
        'text/html'
    ]
WHERE id = 'org_documents';

DO $verify$
DECLARE
    b record;
    client_policies text;
BEGIN
    SELECT id, public, file_size_limit, allowed_mime_types INTO b FROM storage.buckets WHERE id = 'org_documents';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'org_documents bucket is missing';
    END IF;
    IF b.public IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'org_documents must be private';
    END IF;
    IF b.file_size_limit IS DISTINCT FROM 20971520 THEN
        RAISE EXCEPTION 'org_documents file_size_limit is %, expected 20971520', b.file_size_limit;
    END IF;
    IF b.allowed_mime_types IS NULL OR 'application/octet-stream' = ANY (b.allowed_mime_types) OR cardinality(b.allowed_mime_types) <> 8 THEN
        RAISE EXCEPTION 'org_documents MIME allowlist is not the governed list';
    END IF;

    -- Direct client access to objects must stay denied: RLS on, and no policy for a client role.
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
        RAISE EXCEPTION 'storage.objects must have row level security enabled';
    END IF;
    SELECT string_agg(policyname, ', ') INTO client_policies
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[];
    IF client_policies IS NOT NULL THEN
        RAISE EXCEPTION 'storage.objects policies admit client roles (%); document objects are reachable only through server-issued signed links', client_policies;
    END IF;
END
$verify$;

-- CASE 1 — seed one org and one document carrying OCR text (as the migration owner).
DO $$
BEGIN
  INSERT INTO public.orgs (id, name, slug) VALUES ('d1b00000-0000-4000-8000-0000000000aa'::uuid, 'D1b invariant org', 'd1b-invariant-org');
  INSERT INTO public.documents (id, org_id, title, original_filename, bucket, storage_path, extracted_text)
  VALUES ('d1b00000-0000-4000-8000-0000000000d1'::uuid, 'd1b00000-0000-4000-8000-0000000000aa'::uuid, 'd1b invariant', 'x.pdf',
          'org_documents', 'd1b00000-0000-4000-8000-0000000000aa/pos_intake/x.pdf', 'secret OCR text');
  RAISE NOTICE 'CASE 1 PASS seeded one document with OCR text';
END $$;

-- CASE 2 — every document-owned table refuses every client operation, for both client roles.
DO $$
DECLARE
  r text;
  t text;
  op text;
  stmt text;
  refused int := 0;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    FOREACH t IN ARRAY ARRAY['documents', 'document_versions', 'document_field_values', 'document_field_definitions',
                             'form_submission_documents', 'form_submission_signatures'] LOOP
      FOREACH op IN ARRAY ARRAY['select', 'update', 'delete', 'truncate'] LOOP
        stmt := CASE op
          WHEN 'select' THEN format('SELECT count(*) FROM public.%I', t)
          WHEN 'update' THEN format('UPDATE public.%I SET metadata = metadata WHERE false', t)
          WHEN 'delete' THEN format('DELETE FROM public.%I WHERE false', t)
          WHEN 'truncate' THEN format('TRUNCATE public.%I', t)
        END;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', r);
          EXECUTE stmt;
          RAISE EXCEPTION 'CASE 2 FAILED: % was allowed to % public.%', r, op, t;
        EXCEPTION WHEN insufficient_privilege THEN
          refused := refused + 1;
        END;
        RESET ROLE;
      END LOOP;
    END LOOP;
  END LOOP;
  IF refused <> 48 THEN RAISE EXCEPTION 'CASE 2 FAILED: expected 48 refusals, saw %', refused; END IF;
  RAISE NOTICE 'CASE 2 PASS 48 of 48 client operations refused (2 roles x 6 tables x select/update/delete/truncate)';
END $$;

-- CASE 3 — OCR text and storage paths are unreadable, and a document cannot be written, by a client.
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM extracted_text FROM public.documents WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid;
    RAISE EXCEPTION 'CASE 3 FAILED: authenticated read extracted_text';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.documents SET storage_path = 'elsewhere/x.pdf' WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid;
    RAISE EXCEPTION 'CASE 3 FAILED: authenticated rewrote a storage path';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.documents (org_id, title, bucket, storage_path)
    VALUES ('d1b00000-0000-4000-8000-0000000000aa'::uuid, 'forged', 'org_documents', 'd1b00000-0000-4000-8000-0000000000aa/forged.pdf');
    RAISE EXCEPTION 'CASE 3 FAILED: authenticated inserted a document';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF (SELECT storage_path FROM public.documents WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid)
     <> 'd1b00000-0000-4000-8000-0000000000aa/pos_intake/x.pdf' THEN
    RAISE EXCEPTION 'CASE 3 FAILED: the row changed';
  END IF;
  RAISE NOTICE 'CASE 3 PASS OCR read, path rewrite and forged insert all refused; row unchanged';
END $$;

-- CASE 4 — the server path still works: service_role reads and writes the same row.
DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO n FROM public.documents WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid AND extracted_text = 'secret OCR text';
  UPDATE public.documents SET title = 'd1b invariant (service)' WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid;
  RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'CASE 4 FAILED: service_role could not read the document'; END IF;
  RAISE NOTICE 'CASE 4 PASS service_role reads OCR text and updates the row';
END $$;

-- CASE 5 — storage: the bucket is private and governed, and a client cannot see or place an object.
DO $$
DECLARE n int;
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'org_documents') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CASE 5 FAILED: bucket not private';
  END IF;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', 'd1b00000-0000-4000-8000-0000000000aa/pos_intake/x.pdf');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'org_documents';
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 5 FAILED: authenticated saw % object(s)', n; END IF;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', 'd1b00000-0000-4000-8000-0000000000aa/planted.pdf');
    RAISE EXCEPTION 'CASE 5 FAILED: authenticated placed an object';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'org_documents';
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 5 FAILED: anon saw % object(s)', n; END IF;
  RAISE NOTICE 'CASE 5 PASS bucket private; authenticated and anon see 0 objects; authenticated cannot place one';
END $$;
