-- Communications V2 — PKG-03: delivery events + read receipts.
-- ADDITIVE ONLY. No drops, no destructive changes, no data mutation.
-- Adds outbound receipt timestamps to communication_messages and a provider-NEUTRAL
-- append-only communication_delivery_events table. No UI, no send behavior, no provider
-- implementation (provider is an opaque string only). RLS mirrors communications_v1_foundation.

-- 1) communication_messages — receipt timestamps (additive, nullable).
ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS opened_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS clicked_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS replied_at timestamptz NULL;

COMMENT ON COLUMN public.communication_messages.opened_at IS 'PKG-03: first open receipt (email open / equivalent). Provider-neutral; populated from delivery events.';
COMMENT ON COLUMN public.communication_messages.clicked_at IS 'PKG-03: first click receipt. Provider-neutral.';
COMMENT ON COLUMN public.communication_messages.replied_at IS 'PKG-03: first reply receipt (inbound match). Provider-neutral.';

-- 2) communication_delivery_events — append-only, PROVIDER-NEUTRAL lifecycle events.
--    `provider` is an opaque string (e.g. resend/twilio/…); NO provider-specific columns.
--    `event_type` vocabulary lives in web/lib/communications/v2/deliveryEvents.ts (free text here to stay additive).
CREATE TABLE IF NOT EXISTS public.communication_delivery_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES public.communication_messages (id) ON DELETE CASCADE,
    event_type text NOT NULL,
    provider text NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_comm_delivery_events_message
    ON public.communication_delivery_events (message_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_delivery_events_org_type
    ON public.communication_delivery_events (org_id, event_type, occurred_at DESC);

-- 3) RLS — org members read; mutations via service_role (Next admin API + worker / webhooks).
ALTER TABLE public.communication_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_delivery_events_select_org ON public.communication_delivery_events;
CREATE POLICY communication_delivery_events_select_org
    ON public.communication_delivery_events FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_delivery_events.org_id));
DROP POLICY IF EXISTS communication_delivery_events_service_all ON public.communication_delivery_events;
CREATE POLICY communication_delivery_events_service_all
    ON public.communication_delivery_events FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

GRANT ALL ON TABLE public.communication_delivery_events TO anon;
GRANT ALL ON TABLE public.communication_delivery_events TO authenticated;
GRANT ALL ON TABLE public.communication_delivery_events TO service_role;

COMMENT ON TABLE public.communication_delivery_events IS 'PKG-03: append-only, provider-neutral delivery/receipt lifecycle events feeding communication_messages receipt columns. Webhook/worker wiring in PKG-07/PKG-16.';
