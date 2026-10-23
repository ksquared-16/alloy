-- =============================================================================
-- DOCUMENTS D1b.2 — no direct client access to document tables.
--
-- Director authorization: "ALLOY DOCUMENTS V1 — D1b Database & Storage Security Hardening" (2026-10-23).
--
-- Before (measured on the deployed primary, census gar_c609be0f079b98, ledger head 20261205090000):
--   * `authenticated` holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on every
--     table below. These came from the remote_schema default ACL (RS:9269-9288) and the Forms grants
--     (20260506100000:740,743), and no migration ever narrowed them.
--   * RLS admits by ORG ROLE NAME only: owner/admin/ops/manager read, owner/admin/ops write.
--     `documents.read`, `documents.write`, department/site scope and the D1a document decision are not
--     consulted. A signed-in operator's own session could therefore read OCR text
--     (`documents.extracted_text`, `extracted_data`), storage paths and extracted field values straight
--     from PostgREST, and rewrite a row's `storage_path`, `bucket`, `status` or text.
--   * `document_versions` and `document_field_values` carry no medical restrictive policy at all.
--
-- No application code uses those grants. Every read and write of these tables runs on the service
-- role, behind the canonical Documents decision (`assertDocumentAccess`, `requireDocumentRead`,
-- `requireDocumentWrite`) and the Forms/Processing capability checks. The user-session client is used
-- only for `auth.getClaims` / `getUser`, and the browser client calls no `.from()` on any table here.
--
-- So the fix is to REMOVE the direct privilege, not to reproduce the document decision in RLS:
--   * REVOKE ALL from PUBLIC, anon and authenticated. Ordinary sessions keep no path that bypasses the
--     Documents authorization service.
--   * `service_role` keeps ALL. It bypasses RLS, and every service-role caller is server-side, gated and
--     (for link issuance, upload and delete) audited by the D1a document audit.
--   * The existing RLS policies stay as they are. They are now unreachable from clients. They are kept
--     because they are defence in depth if a grant is ever re-added, and because dropping them is a
--     separate, reviewable change.
--
-- processing_case_sources, vendors, staff_qualification_evidence, child_safeguarding_restrictions and the
-- subsidy tables only POINT at documents and are owned by other domains. They are out of scope here.
--
-- Re-runnable and self-verifying.
-- =============================================================================

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

-- ── self-verification ───────────────────────────────────────────────────────────────────────────
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
