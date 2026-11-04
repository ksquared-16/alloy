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
