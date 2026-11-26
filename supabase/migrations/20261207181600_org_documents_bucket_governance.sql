-- =============================================================================
-- DOCUMENTS D1b.3 — the document bucket's private posture, in a migration.
--
-- Director authorization: "ALLOY DOCUMENTS V1 — D1b ... D1b.3 Storage governance" (2026-10-23).
--
-- Before (census gar_c609be0f079b98): one bucket, `org_documents`, holding 412 objects.
--   * public = false, file_size_limit NULL, allowed_mime_types NULL;
--   * storage.objects has RLS on and ZERO policies, so anon and authenticated clients can neither read
--     nor write objects, and only the service role reaches them;
--   * NONE of this was defined anywhere in the repository. No migration creates the bucket or declares
--     its limits, so a re-provisioned environment, or a dashboard edit, could silently make it public or
--     unlimited.
--
-- This migration makes the deployed posture the declared one:
--   * the bucket exists and is PRIVATE;
--   * a 20 MiB per-object ceiling. Application uploads are capped at 10 MiB
--     (`lib/documents/documentUploadLimits.ts`). The largest stored object is 4.4 MiB, so generated and
--     signed PDFs have headroom;
--   * a MIME allowlist of exactly the formats the platform stores: PDF, Word (DOCX, DOC), PNG, JPEG,
--     plain text, CSV, and hosted-form HTML captures. HEIC is never stored (`store: false`), and nothing
--     else is accepted by any upload path. Every upload path stores one of these canonical types, never
--     a client-supplied or `application/octet-stream` label;
--   * a guard: no storage.objects policy may admit anon, authenticated or PUBLIC. Direct client access
--     stays denied. Signed links are issued only by the server, behind the D1a document decision.
--
-- Existing objects are not touched, moved or re-validated. A bucket's limits apply to new uploads only.
-- Re-runnable and self-verifying.
-- =============================================================================

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

-- ── self-verification ───────────────────────────────────────────────────────────────────────────
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
