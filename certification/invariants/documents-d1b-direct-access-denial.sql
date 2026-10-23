-- Documents D1b.2 / D1b.3 — direct client access is refused at the database, rollback-only.
-- Run by database.run_rollback_invariant_test against an isolated ALLOY_LOCAL_CERTIFICATION environment
-- (certenv-*): the executor owns the transaction and always discards it.
--
-- CASE 0 applies the two D1b migrations. This harness refuses dynamic SQL, so the revocation migration's
-- loop of format()-built statements appears here as its static expansion: one REVOKE and one GRANT per
-- table. Its self-verification block and the whole bucket migration appear verbatim. The binding test
-- web/tests/documents/documentsD1bHardening.test.ts proves both statements.
-- Every later attempt is a REAL statement run as the `anon` or `authenticated` role, the roles PostgREST
-- runs a client's request as, under SET LOCAL ROLE inside its own sub-block. A refused attempt raises
-- insufficient_privilege, and the role reverts with the sub-block. Any invariant that does not hold RAISEs.

-- CASE 0 — the migrations.
REVOKE ALL ON TABLE public.documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.documents TO service_role;
REVOKE ALL ON TABLE public.document_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_versions TO service_role;
REVOKE ALL ON TABLE public.document_field_values FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_field_values TO service_role;
REVOKE ALL ON TABLE public.document_field_definitions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_field_definitions TO service_role;
REVOKE ALL ON TABLE public.form_submission_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.form_submission_documents TO service_role;
REVOKE ALL ON TABLE public.form_submission_signatures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.form_submission_signatures TO service_role;

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
  VALUES ('d1b00000-0000-4000-8000-0000000000d1'::uuid, 'd1b00000-0000-4000-8000-0000000000aa'::uuid, 'd1b invariant', 'x.pdf', 'org_documents', 'd1b00000-0000-4000-8000-0000000000aa/pos_intake/x.pdf', 'secret OCR text');
  RAISE NOTICE 'CASE 1 PASS seeded one document with OCR text';
END $$;

-- CASE 2 — every document-owned table refuses every client operation, for both client roles.
DO $$
DECLARE refused int := 0;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.documents;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to select public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.documents SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to update public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.documents WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to delete public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    TRUNCATE public.documents;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to truncate public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.document_versions;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to select public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.document_versions SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to update public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.document_versions WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to delete public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    TRUNCATE public.document_versions;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to truncate public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.document_field_values;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to select public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.document_field_values SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to update public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.document_field_values WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to delete public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    TRUNCATE public.document_field_values;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to truncate public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.document_field_definitions;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to select public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.document_field_definitions SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to update public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.document_field_definitions WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to delete public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    TRUNCATE public.document_field_definitions;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to truncate public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.form_submission_documents;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to select public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.form_submission_documents SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to update public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.form_submission_documents WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to delete public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    TRUNCATE public.form_submission_documents;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to truncate public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.form_submission_signatures;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to select public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.form_submission_signatures SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to update public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.form_submission_signatures WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to delete public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    TRUNCATE public.form_submission_signatures;
    RAISE EXCEPTION 'CASE 2 FAILED: authenticated was allowed to truncate public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.documents;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to select public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.documents SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to update public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    DELETE FROM public.documents WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to delete public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    TRUNCATE public.documents;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to truncate public.documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.document_versions;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to select public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.document_versions SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to update public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    DELETE FROM public.document_versions WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to delete public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    TRUNCATE public.document_versions;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to truncate public.document_versions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.document_field_values;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to select public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.document_field_values SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to update public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    DELETE FROM public.document_field_values WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to delete public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    TRUNCATE public.document_field_values;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to truncate public.document_field_values';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.document_field_definitions;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to select public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.document_field_definitions SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to update public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    DELETE FROM public.document_field_definitions WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to delete public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    TRUNCATE public.document_field_definitions;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to truncate public.document_field_definitions';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.form_submission_documents;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to select public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.form_submission_documents SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to update public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    DELETE FROM public.form_submission_documents WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to delete public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    TRUNCATE public.form_submission_documents;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to truncate public.form_submission_documents';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.form_submission_signatures;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to select public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.form_submission_signatures SET metadata = metadata WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to update public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    DELETE FROM public.form_submission_signatures WHERE false;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to delete public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    TRUNCATE public.form_submission_signatures;
    RAISE EXCEPTION 'CASE 2 FAILED: anon was allowed to truncate public.form_submission_signatures';
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
  END;
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
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.documents SET storage_path = 'elsewhere/x.pdf' WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid;
    RAISE EXCEPTION 'CASE 3 FAILED: authenticated rewrote a storage path';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.documents (org_id, title, bucket, storage_path)
    VALUES ('d1b00000-0000-4000-8000-0000000000aa'::uuid, 'forged', 'org_documents', 'd1b00000-0000-4000-8000-0000000000aa/forged.pdf');
    RAISE EXCEPTION 'CASE 3 FAILED: authenticated inserted a document';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT storage_path FROM public.documents WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid) <> 'd1b00000-0000-4000-8000-0000000000aa/pos_intake/x.pdf' THEN
    RAISE EXCEPTION 'CASE 3 FAILED: the row changed';
  END IF;
  RAISE NOTICE 'CASE 3 PASS OCR read, path rewrite and forged insert all refused; row unchanged';
END $$;

-- CASE 4 — the server path still works: service_role reads the OCR text and updates the row.
-- The sub-block ends with a sentinel exception, so the role change is undone with it.
DO $$
DECLARE n int;
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT count(*) INTO n FROM public.documents WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid AND extracted_text = 'secret OCR text';
    UPDATE public.documents SET title = 'd1b invariant (service)' WHERE id = 'd1b00000-0000-4000-8000-0000000000d1'::uuid;
    RAISE EXCEPTION 'd1b_sentinel:%', n;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'd1b_sentinel:1' THEN RAISE EXCEPTION 'CASE 4 FAILED: service_role read % row(s) (%)', n, SQLERRM; END IF;
  END;
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
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'org_documents';
    RAISE EXCEPTION 'd1b_sentinel:%', n;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'd1b_sentinel:0' THEN RAISE EXCEPTION 'CASE 5 FAILED: authenticated saw objects (%)', SQLERRM; END IF;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'org_documents';
    RAISE EXCEPTION 'd1b_sentinel:%', n;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'd1b_sentinel:0' THEN RAISE EXCEPTION 'CASE 5 FAILED: anon saw objects (%)', SQLERRM; END IF;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', 'd1b00000-0000-4000-8000-0000000000aa/planted.pdf');
    RAISE EXCEPTION 'CASE 5 FAILED: authenticated placed an object';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'CASE 5 PASS bucket private; authenticated and anon see 0 objects; authenticated cannot place one';
END $$;
