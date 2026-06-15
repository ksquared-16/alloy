-- Communications V2 — Messaging Infrastructure P1: receipt-column extensions. ADDITIVE ONLY.
-- Extends the EXISTING communication_delivery_events (PKG-03) and communication_message_recipients
-- (PKG-04) tables with the columns + indexes needed for production receipt truth.
-- No new tables, no drops, no destructive DDL, no data mutation (backfill is INSERT … ON-absence only).
-- RLS already exists on both tables (org-member SELECT + service_role ALL) — unchanged.

-- 1) communication_delivery_events — provider/recipient identity + idempotency + raw payload.
ALTER TABLE public.communication_delivery_events
    ADD COLUMN IF NOT EXISTS recipient_id uuid NULL REFERENCES public.communication_message_recipients (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS channel text NULL,
    ADD COLUMN IF NOT EXISTS provider_message_id text NULL,
    ADD COLUMN IF NOT EXISTS provider_event_id text NULL,
    ADD COLUMN IF NOT EXISTS event_status text NULL,
    ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Idempotency by provider event identity (when the provider supplies one).
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_delivery_events_provider_event
    ON public.communication_delivery_events (provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_delivery_events_provider_msg
    ON public.communication_delivery_events (provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 2) communication_message_recipients — per-recipient delivery state + provider linkage.
ALTER TABLE public.communication_message_recipients
    ADD COLUMN IF NOT EXISTS recipient_key text NULL,
    ADD COLUMN IF NOT EXISTS channel text NULL,
    ADD COLUMN IF NOT EXISTS provider text NULL,
    ADD COLUMN IF NOT EXISTS provider_message_id text NULL,
    ADD COLUMN IF NOT EXISTS queued_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS bounced_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS complained_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS failed_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_event_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_comm_msg_recipients_provider_msg
    ON public.communication_message_recipients (org_id, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 3) Backfill — one recipient row per existing OUTBOUND message (idempotent: only where none exists).
--    Provider receipt truth flows onto these rows going forward (P2 webhooks).
INSERT INTO public.communication_message_recipients
    (org_id, message_id, person_id, recipient_key, channel, address, provider, provider_message_id, status, queued_at, sent_at, delivered_at, last_event_at, recipient_role)
SELECT m.org_id, m.id, NULL, COALESCE(m.to_address, ''), m.channel, m.to_address, m.provider, m.provider_message_id,
       m.status, m.created_at, m.sent_at, m.delivered_at, COALESCE(m.delivered_at, m.sent_at, m.created_at), 'to'
FROM public.communication_messages m
WHERE m.direction = 'outbound'
  AND NOT EXISTS (SELECT 1 FROM public.communication_message_recipients r WHERE r.message_id = m.id);

COMMENT ON COLUMN public.communication_delivery_events.provider_event_id IS 'P1: provider event id for idempotent webhook ingestion (unique with provider).';
COMMENT ON COLUMN public.communication_message_recipients.last_event_at IS 'P1: timestamp of the most recent delivery event applied to this recipient row.';
