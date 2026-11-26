-- D10 / Conversation Platform WS11 — DRAFT for the canonical owner's review. NOT a migration. NOT applied anywhere.
--
-- Owner: Communications (Conversation Platform WS11). Source of the shape:
--   docs/platform/planning/conversation-platform-v1/CONVERSATION-PLATFORM-V1-PLAN.md :195, :414-422
--   ("communication_message_attachments (org_id, message_id, document_id → documents ON DELETE RESTRICT,
--    disposition attachment | inline | link, UNIQUE (message_id, document_id))").
-- Prepared by the Documents lane (D10 pilot, OPWORK_AA660DC9554D_SPRINT_5D62877D85D6) only so the consumer contract
-- (`AttachmentStorageBoundary` in web/lib/documents/inbound/inboundAttachmentFiling.ts) can be reviewed against a
-- concrete schema. It lives outside supabase/migrations on purpose: moving it there, naming its version and applying it
-- are the owner's decisions, after review. No query or migration was executed to prepare it.
--
-- One addition to the planned shape, for the owner to accept or reject: `provider_attachment_id`, so storing the same
-- provider attachment twice converges on one row (the consumer's `findStored(message, attachment)` idempotency), in
-- addition to the planned UNIQUE (message_id, document_id).

CREATE TABLE IF NOT EXISTS public.communication_message_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES public.communication_messages (id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE RESTRICT,
    provider_attachment_id text NOT NULL,
    disposition text NOT NULL DEFAULT 'attachment' CHECK (disposition IN ('attachment', 'inline', 'link')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_cma_message_document UNIQUE (message_id, document_id),
    CONSTRAINT uq_cma_message_provider_attachment UNIQUE (message_id, provider_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_cma_org_message ON public.communication_message_attachments (org_id, message_id);

-- Tenant consistency: the message, the document and the row share one organization.
CREATE OR REPLACE FUNCTION public.validate_communication_message_attachment_org()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.communication_messages m WHERE m.id = NEW.message_id AND m.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'communication_message_attachments: message % is not in org %', NEW.message_id, NEW.org_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id AND d.org_id = NEW.org_id) THEN
        RAISE EXCEPTION 'communication_message_attachments: document % is not in org %', NEW.document_id, NEW.org_id;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validate_communication_message_attachment_org ON public.communication_message_attachments;
CREATE TRIGGER trg_validate_communication_message_attachment_org
    BEFORE INSERT OR UPDATE ON public.communication_message_attachments
    FOR EACH ROW EXECUTE FUNCTION public.validate_communication_message_attachment_org();

-- Service-role only (the ingestion path); no client policy is granted here — the owner decides any read policy.
ALTER TABLE public.communication_message_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_message_attachments FROM anon, authenticated;
