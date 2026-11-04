-- Communications (Conversation Platform WS11) — communication_message_attachments: which stored document is which
-- attachment of which message. D10-S1, handoff H3 in certification/documents-v1/D9-D10-OWNER-HANDOFFS.md.
-- PENDING: NOT APPLIED to any database. Its apply is a separate governed approval.
--
-- Owner: Communications. Shape: docs/platform/planning/conversation-platform-v1/CONVERSATION-PLATFORM-V1-PLAN.md
-- (:195, :414-422), starting from certification/documents-v1/D10-WS11-ATTACHMENT-STORAGE-DRAFT.sql.
--
-- Decisions taken on the draft:
--   * provider_attachment_id is ACCEPTED. It is the provider's own name for the part — the identity the ingestion
--     persisted in communication_messages.metadata.attachments[].id and the key the document id is derived from
--     (lib/documents/inbound/ws11AttachmentStorage.ts). UNIQUE (message_id, provider_attachment_id) makes "this
--     attachment of this message" one row in the database itself, not only by hash convention. It is required for
--     an `attachment` or `inline` part and may be NULL only for a `link` (a document referenced, not delivered).
--   * document_id stays ON DELETE RESTRICT, as planned: a document a message carries is not deleted out from under the
--     conversation. documents.org_id is already ON DELETE RESTRICT, so this adds no new block to an org deletion.
--   * Tenant consistency is a trigger, as drafted: neither communication_messages nor documents carries a
--     UNIQUE (id, org_id) a composite foreign key could reference. Its function pins search_path.
--   * Access: service role only. RLS is enabled with NO client policy, and anon / authenticated hold no privilege
--     (the database grants authenticated SELECT on every new public table by default). A row names a document; whether
--     a user may see that document is the Documents decision (D1a), which a table policy cannot express — so reads go
--     through the server, never PostgREST.
-- What it does not do: no data, no change to documents, communication_messages or storage. The writer
-- (ws11AttachmentStorage) records a row only when INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED is on, which is OFF.
-- Rollback: DROP TABLE public.communication_message_attachments; DROP FUNCTION
-- public.validate_communication_message_attachment_org().

CREATE TABLE IF NOT EXISTS public.communication_message_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES public.communication_messages (id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE RESTRICT,
    provider_attachment_id text NULL,
    disposition text NOT NULL DEFAULT 'attachment',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cma_disposition_check CHECK (disposition IN ('attachment', 'inline', 'link')),
    CONSTRAINT cma_provider_attachment_id_shape CHECK (
        provider_attachment_id IS NULL
        OR (length(btrim(provider_attachment_id)) > 0 AND length(provider_attachment_id) <= 255)
    ),
    CONSTRAINT cma_delivered_part_has_provider_id CHECK (disposition = 'link' OR provider_attachment_id IS NOT NULL),
    CONSTRAINT uq_cma_message_document UNIQUE (message_id, document_id),
    CONSTRAINT uq_cma_message_provider_attachment UNIQUE (message_id, provider_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_cma_org_message ON public.communication_message_attachments (org_id, message_id);
CREATE INDEX IF NOT EXISTS idx_cma_document ON public.communication_message_attachments (document_id);

COMMENT ON TABLE public.communication_message_attachments IS
    'Which stored document is which attachment of which message (WS11). Service role only: reads go through the server, which applies the Documents access decision.';
COMMENT ON COLUMN public.communication_message_attachments.provider_attachment_id IS
    'The provider''s id for the part (metadata.attachments[].id). One row per (message, provider attachment). NULL only for a link.';

-- Tenant consistency: the message, the document and the row share one organization.
CREATE OR REPLACE FUNCTION public.validate_communication_message_attachment_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.communication_messages m WHERE m.id = NEW.message_id AND m.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'communication_message_attachments: message % is not in org %', NEW.message_id, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id AND d.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'communication_message_attachments: document % is not in org %', NEW.document_id, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validate_communication_message_attachment_org ON public.communication_message_attachments;
CREATE TRIGGER trg_validate_communication_message_attachment_org
    BEFORE INSERT OR UPDATE ON public.communication_message_attachments
    FOR EACH ROW EXECUTE FUNCTION public.validate_communication_message_attachment_org();

ALTER TABLE public.communication_message_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_message_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.communication_message_attachments TO service_role;

-- ── self-verification ───────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    leaked text;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.communication_message_attachments'::regclass) THEN
        RAISE EXCEPTION 'communication_message_attachments must have row level security enabled';
    END IF;
    SELECT string_agg(policyname, ', ') INTO leaked
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communication_message_attachments';
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'communication_message_attachments carries policies (%); it is service-role only', leaked;
    END IF;
    IF has_table_privilege('anon', 'public.communication_message_attachments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.communication_message_attachments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'communication_message_attachments grants a client role a privilege';
    END IF;
    -- (A comma list answers "any of"; the writer needs each.)
    IF NOT (has_table_privilege('service_role', 'public.communication_message_attachments', 'SELECT')
            AND has_table_privilege('service_role', 'public.communication_message_attachments', 'INSERT')
            AND has_table_privilege('service_role', 'public.communication_message_attachments', 'DELETE')) THEN
        RAISE EXCEPTION 'communication_message_attachments: the service role cannot write it';
    END IF;
END
$verify$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY INVARIANT (D10-S1, communication_message_attachments). Everything ABOVE this banner is the pending migration
-- supabase/migrations/20261218090000_communication_message_attachments.sql, byte for byte (locked by
-- web/tests/communications/communicationMessageAttachmentsMigration.test.ts). It runs inside the executor's transaction,
-- so the table exists only for these assertions and is discarded with them: nothing is applied. Below, rollback-only
-- assertions that RAISE when one fails. Needs an isolated certenv at the staging tip (two organizations; the D1b bucket
-- governance and the D2 document triggers).
--
-- Covers, as the SERVICE ROLE — the system writer ws11AttachmentStorage runs as (the admin client):
--   S1 the org_documents bucket is private, admits the three canonical inbound types (PDF, PNG, JPEG) and the 10 MiB
--      inbound cap, and storage.objects has no client policy; the service role places an object under <org>/pos_intake/;
--   S2 the documents row exactly as ws11 writes it (stable id, explicit current_version_id, no user): the D2 insert
--      trigger writes version 1 under THAT id with the row's hash and path, and no other version;
--   S3 the link: written; one row per (message, provider attachment) and per (message, document); a document or a
--      message of another organization is refused; a delivered part needs its provider id; a link may omit it;
--   S4 a linked document cannot be deleted (RESTRICT);
-- and as the owner: S5 deleting the message removes its links; S6 anon and authenticated can neither read nor write.
DO $seed$
DECLARE
    v_org uuid := (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1);
    v_org2 uuid := (SELECT id FROM public.orgs WHERE id <> (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1) ORDER BY id LIMIT 1);
BEGIN
    IF v_org IS NULL OR v_org2 IS NULL THEN RAISE EXCEPTION 'need two organizations'; END IF;
    INSERT INTO public.communication_threads (id, org_id, primary_entity_type, primary_entity_id, channel, recipient_key) VALUES
        ('d10c0000-0000-4000-8000-0000000000a1', v_org, 'person', 'd10c0000-0000-4000-8000-0000000000b1', 'email', 'd10-parent@example.invalid'),
        ('d10c0000-0000-4000-8000-0000000000a2', v_org2, 'person', 'd10c0000-0000-4000-8000-0000000000b2', 'email', 'd10-foreign@example.invalid');
    INSERT INTO public.communication_messages (id, org_id, thread_id, channel, direction, status, provider, provider_message_id, metadata) VALUES
        ('d10c0000-0000-4000-8000-0000000000c1', v_org, 'd10c0000-0000-4000-8000-0000000000a1', 'email', 'inbound', 'received', 'resend', 'd10-resend-email-1',
         '{"attachments": [{"id": "att-1", "filename": "shot record.pdf", "content_type": "application/pdf", "content_disposition": "attachment", "size": 10}]}'),
        ('d10c0000-0000-4000-8000-0000000000c2', v_org2, 'd10c0000-0000-4000-8000-0000000000a2', 'email', 'inbound', 'received', 'resend', 'd10-resend-email-2', '{}');
    -- A document of the OTHER organization, for the cross-tenant refusal.
    INSERT INTO public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES ('d10c0000-0000-4000-8000-0000000000f2', v_org2, 'foreign.pdf', 'foreign.pdf', 'application/pdf', 10, repeat('f', 64), 'org_documents',
            v_org2 || '/pos_intake/d10-foreign.pdf', 'uploaded');
END
$seed$;

SET LOCAL ROLE service_role;

DO $system_writer$
DECLARE
    v_org uuid := (SELECT id FROM public.orgs ORDER BY created_at NULLS LAST, id LIMIT 1);
    m1 uuid := 'd10c0000-0000-4000-8000-0000000000c1';
    m2 uuid := 'd10c0000-0000-4000-8000-0000000000c2';
    d1 uuid := 'd10c0000-0000-4000-8000-0000000000d1';
    d2 uuid := 'd10c0000-0000-4000-8000-0000000000d2';
    v1 uuid := 'd10c0000-0000-4000-8000-0000000000e1';
    d_foreign uuid := 'd10c0000-0000-4000-8000-0000000000f2';
    sha text := repeat('a', 64);
    path text;
    b record;
    n int;
    s text;
    passes text[] := ARRAY[]::text[];
BEGIN
    PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
    IF current_user <> 'service_role' THEN RAISE EXCEPTION 'S0: running as %, not service_role', current_user; END IF;
    path := v_org || '/pos_intake/d10c0000-0000-4000-8000-000000000099-shot_record.pdf';

    -- S1. The bucket, and an object placed by the system writer.
    SELECT public, file_size_limit, allowed_mime_types INTO b FROM storage.buckets WHERE id = 'org_documents';
    IF NOT FOUND OR b.public IS DISTINCT FROM false THEN RAISE EXCEPTION 'S1: org_documents missing or not private'; END IF;
    IF b.allowed_mime_types IS NULL OR NOT (b.allowed_mime_types @> ARRAY['application/pdf', 'image/png', 'image/jpeg']) THEN
        RAISE EXCEPTION 'S1: the bucket refuses a canonical inbound type (%)', b.allowed_mime_types; END IF;
    IF b.file_size_limit IS NOT NULL AND b.file_size_limit < 10485760 THEN
        RAISE EXCEPTION 'S1: bucket limit % is below the 10 MiB inbound cap', b.file_size_limit; END IF;
    SELECT string_agg(policyname, ', ') INTO s FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects' AND roles && ARRAY['anon', 'authenticated', 'public']::name[];
    IF s IS NOT NULL THEN RAISE EXCEPTION 'S1: storage.objects admits a client role (%)', s; END IF;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('org_documents', path);
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'org_documents' AND name = path;
    IF n <> 1 THEN RAISE EXCEPTION 'S1: the service role could not place the object (%)', n; END IF;
    passes := passes || 'bucket_admits_system_writer'::text;

    -- S2. The documents row, exactly as ws11AttachmentStorage.store writes it.
    INSERT INTO public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status,
                                  current_version_id, metadata)
    VALUES (d1, v_org, 'shot record.pdf', 'shot record.pdf', 'application/pdf', 10, sha, 'org_documents', path, 'uploaded', v1,
            '{"screening": {"status": "clean"}, "processing_intent": "store_document", "source": "inbound_email_attachment",
              "inbound_email": {"communication_message_id": "d10c0000-0000-4000-8000-0000000000c1", "attachment_id": "att-1"}}');
    SELECT count(*) INTO n FROM public.document_versions WHERE document_id = d1;
    IF n <> 1 THEN RAISE EXCEPTION 'S2: expected exactly one version, got %', n; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.documents d JOIN public.document_versions v ON v.id = d.current_version_id
         WHERE d.id = d1 AND d.current_version_id = v1 AND v.version_number = 1 AND v.org_id = v_org
           AND v.checksum_sha256 = sha AND v.storage_path = path AND v.bucket = 'org_documents' AND v.created_by IS NULL
           AND v.source = 'document_insert') THEN
        RAISE EXCEPTION 'S2: version 1 is not the explicit current_version_id with the row''s hash and path';
    END IF;
    passes := passes || 'd2_trigger_honours_explicit_version'::text;

    -- S3. The link.
    INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id, disposition)
    VALUES (v_org, m1, d1, 'att-1', 'attachment');
    INSERT INTO public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path, status)
    VALUES (d2, v_org, 'second.pdf', 'second.pdf', 'application/pdf', 10, sha, 'org_documents', v_org || '/pos_intake/d10-second.pdf', 'uploaded');
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id) VALUES (v_org, m1, d2, 'att-1');
        RAISE EXCEPTION 'S3a: a second row for the same provider attachment was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id) VALUES (v_org, m1, d1, 'att-2');
        RAISE EXCEPTION 'S3b: a second row for the same document was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id) VALUES (v_org, m1, d_foreign, 'att-3');
        RAISE EXCEPTION 'S3c: another organization''s document was linked';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'communication_message_attachments: document %' THEN RAISE; END IF;
    END;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id) VALUES (v_org, m2, d2, 'att-1');
        RAISE EXCEPTION 'S3d: another organization''s message was linked';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE 'communication_message_attachments: message %' THEN RAISE; END IF;
    END;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id, disposition) VALUES (v_org, m1, d2, NULL, 'attachment');
        RAISE EXCEPTION 'S3e: a delivered attachment without a provider id was accepted';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%cma_delivered_part_has_provider_id%' THEN RAISE; END IF;
    END;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id) VALUES (v_org, m1, d2, '   ');
        RAISE EXCEPTION 'S3f: a blank provider id was accepted';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%cma_provider_attachment_id_shape%' THEN RAISE; END IF;
    END;
    BEGIN
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id, disposition) VALUES (v_org, m1, d2, 'att-9', 'forwarded');
        RAISE EXCEPTION 'S3g: an unknown disposition was accepted';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%cma_disposition_check%' THEN RAISE; END IF;
    END;
    INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id, disposition) VALUES (v_org, m1, d2, NULL, 'link');
    SELECT count(*) INTO n FROM public.communication_message_attachments WHERE message_id = m1;
    IF n <> 2 THEN RAISE EXCEPTION 'S3: expected two links on the message, got %', n; END IF;
    passes := passes || 'link_unique_tenant_consistent_and_shaped'::text;

    -- S4. A linked document is not deleted out from under the message.
    BEGIN
        DELETE FROM public.documents WHERE id = d1;
        RAISE EXCEPTION 'S4: a linked document was deleted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = d1) THEN RAISE EXCEPTION 'S4: the document is gone'; END IF;
    passes := passes || 'linked_document_restricted'::text;

    RAISE NOTICE 'system writer passed=% [%]', cardinality(passes), array_to_string(passes, ',');
END
$system_writer$;

SET LOCAL ROLE NONE;

DO $assert$
DECLARE
    m1 uuid := 'd10c0000-0000-4000-8000-0000000000c1';
    n int;
    refused int := 0;
    passes text[] := ARRAY['bucket_admits_system_writer', 'd2_trigger_honours_explicit_version', 'link_unique_tenant_consistent_and_shaped', 'linked_document_restricted']::text[];
BEGIN
    IF current_user = 'service_role' THEN RAISE EXCEPTION 'S5: still running as service_role'; END IF;

    -- S6. No client reads or writes the table, whatever the row.
    BEGIN
        SET LOCAL ROLE authenticated;
        PERFORM count(*) FROM public.communication_message_attachments;
        RAISE EXCEPTION 'S6: authenticated read the table';
    EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
    END;
    BEGIN
        SET LOCAL ROLE anon;
        PERFORM count(*) FROM public.communication_message_attachments;
        RAISE EXCEPTION 'S6: anon read the table';
    EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
    END;
    BEGIN
        SET LOCAL ROLE authenticated;
        INSERT INTO public.communication_message_attachments (org_id, message_id, document_id, provider_attachment_id)
        SELECT org_id, message_id, document_id, 'att-planted' FROM public.communication_message_attachments LIMIT 1;
        RAISE EXCEPTION 'S6: authenticated wrote the table';
    EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
    END;
    BEGIN
        SET LOCAL ROLE authenticated;
        DELETE FROM public.communication_message_attachments WHERE message_id = m1;
        RAISE EXCEPTION 'S6: authenticated deleted from the table';
    EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1;
    END;
    IF refused <> 4 THEN RAISE EXCEPTION 'S6: % of 4 client operations refused', refused; END IF;
    passes := passes || 'clients_refused'::text;

    -- S5. The links belong to the message: deleting it removes them.
    SELECT count(*) INTO n FROM public.communication_message_attachments WHERE message_id = m1;
    IF n <> 2 THEN RAISE EXCEPTION 'S5: expected the two links before deletion, got %', n; END IF;
    DELETE FROM public.communication_messages WHERE id = m1;
    SELECT count(*) INTO n FROM public.communication_message_attachments WHERE message_id = m1;
    IF n <> 0 THEN RAISE EXCEPTION 'S5: % links outlived their message', n; END IF;
    passes := passes || 'message_delete_cascades_links'::text;

    RAISE NOTICE 'tests passed=% failed=0 [%]', cardinality(passes), array_to_string(passes, ',');
END
$assert$;
