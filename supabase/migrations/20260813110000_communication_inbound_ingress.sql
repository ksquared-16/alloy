-- Pre-tenancy ingress: a received provider message we cannot yet attribute to a tenant.
--
-- WHY THIS EXISTS
--
-- `communication_messages.org_id` is NOT NULL and stays that way — a tenant's
-- conversation is tenant-owned truth. But a verified Twilio webhook can arrive
-- for a destination number that matches no active binding, or matches bindings
-- in more than one organization. Alloy genuinely does not know whose message it
-- is. The previous behaviour dropped it into legacy `public.messages`, which no
-- operator Communications surface reads, so a real parent's reply — including a
-- valid STOP — was received and then effectively lost.
--
-- The three alternatives were all worse: making org_id nullable would let
-- unattributed rows leak into every tenant-scoped read; a global org would be a
-- lie with a foreign key; and choosing a candidate would hand one family's words
-- to another tenant.
--
-- WHY NOT AN EXISTING TABLE
--
-- Both plausible existing authorities were inspected and neither can truthfully
-- own a pre-tenancy message:
--   * `communication_delivery_events` — org_id NOT NULL, and message_id NOT NULL
--     referencing the very tenant message that cannot exist yet.
--   * `processing_exceptions`         — org_id NOT NULL, and case_id NOT NULL
--     referencing a processing case that has nothing to do with this.
--
-- WHAT THIS IS NOT
--
-- Not a second Inbox, not a conversation model, not a generic exception
-- framework. It holds a received message until ownership is known, then the
-- ordinary canonical Communications path materializes it and this row records
-- where it went. It has no thread, no participants, and no reply capability.

BEGIN;

CREATE TABLE IF NOT EXISTS public.communication_inbound_ingress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider identity. The same tuple the tenant-side invariant uses, minus
    -- org — which is precisely the thing not yet known.
    provider text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('sms', 'email')),
    provider_message_id text NOT NULL,

    from_address text,
    to_address text,
    body text,
    received_at timestamptz NOT NULL DEFAULT now(),

    -- Why this could not be attributed. Constrained so a future branch cannot
    -- quietly invent a disposition that no surface knows how to resolve.
    routing_disposition text NOT NULL CHECK (routing_disposition IN (
        'no_attributable_org',
        'cross_org_ambiguous'
    )),
    candidate_org_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    candidate_binding_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Compliance meaning is recognised at ingress, because it must not wait for
    -- ownership. `communication_preferences` requires BOTH org_id and person_id,
    -- so the canonical preference authority cannot express "this phone said STOP
    -- and we do not yet know whose it is". This hold is the narrow stand-in: it
    -- is scoped to the external endpoint pair on this row and nothing else, and
    -- it deliberately does not attempt global preference semantics.
    compliance_keyword text NULL CHECK (compliance_keyword IN ('stop', 'start', 'help')),
    compliance_hold_active boolean NOT NULL DEFAULT false,

    -- Set when ownership is later established and the message is materialized
    -- through the ordinary canonical path.
    resolved_org_id uuid NULL REFERENCES public.orgs (id) ON DELETE SET NULL,
    resolved_message_id uuid NULL REFERENCES public.communication_messages (id) ON DELETE SET NULL,
    resolved_at timestamptz NULL,
    resolution_note text NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    -- Idempotency, same principle as the tenant side: provider identity alone.
    -- A retried webhook for an unattributable message must not accumulate rows.
    CONSTRAINT communication_inbound_ingress_provider_identity_uq
        UNIQUE (provider, channel, provider_message_id)
);

-- The working queue: what still needs an ownership decision, newest first.
CREATE INDEX IF NOT EXISTS idx_comm_inbound_ingress_unresolved
    ON public.communication_inbound_ingress (routing_disposition, received_at DESC)
    WHERE resolved_at IS NULL;

-- Compliance first: an unresolved STOP outranks ordinary unattributed traffic.
CREATE INDEX IF NOT EXISTS idx_comm_inbound_ingress_compliance_hold
    ON public.communication_inbound_ingress (received_at DESC)
    WHERE compliance_hold_active AND resolved_at IS NULL;

-- The hold is only meaningful while a sender address exists to hold against.
CREATE INDEX IF NOT EXISTS idx_comm_inbound_ingress_from_address
    ON public.communication_inbound_ingress (channel, from_address)
    WHERE compliance_hold_active AND resolved_at IS NULL;

COMMENT ON TABLE public.communication_inbound_ingress IS
    'Pre-tenancy retention for verified inbound provider messages whose owning organization cannot yet be determined. Not an Inbox and not a conversation model: it exists so a received message is never lost and never attributed to the wrong tenant. Converges into communication_messages once ownership is resolved.';

COMMENT ON COLUMN public.communication_inbound_ingress.compliance_hold_active IS
    'A valid STOP arrived on an endpoint pair Alloy cannot yet attribute. communication_preferences requires org_id AND person_id, so the canonical authority cannot represent this; the hold is scoped to this row''s external endpoint pair only and is cleared when ownership resolves.';

-- RLS: there is no organization to scope a reader to, which is the entire point.
-- Enabled with no permissive policy, so only service_role (webhook + platform
-- tooling) reaches these rows. Tenant users must never read another tenant's
-- possibly-owned message.
ALTER TABLE public.communication_inbound_ingress ENABLE ROW LEVEL SECURITY;

COMMIT;
