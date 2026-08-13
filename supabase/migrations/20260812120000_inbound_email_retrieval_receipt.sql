-- A provider-event receipt that exists BEFORE Alloy knows who owns the message.
--
-- Inbound SMS arrives complete: one signed webhook carries the whole message, so
-- the only reason to record anything before attribution is quarantine. Inbound
-- EMAIL does not work that way. Resend's `email.received` webhook carries metadata
-- only; the body and the RFC threading headers require a second call to
-- `GET /emails/receiving/{id}`.
--
-- That second call can fail. Without a receipt written first, a retried webhook
-- would be indistinguishable from a new message — and with no body yet, there is
-- nothing to write into `communication_messages` to deduplicate against. The
-- receipt is what makes the retry converge: it is claimed on the provider identity
-- the ingress table already enforces as unique
-- (provider, channel, provider_message_id).
--
-- `retrieval_pending` is therefore a legitimate resting state, not an error. It
-- means "we have proof this arrived, and we do not yet have its content."
--
-- Additive only: the constraint is widened, never narrowed, so every existing row
-- remains valid and no data is touched.

alter table public.communication_inbound_ingress
    drop constraint if exists communication_inbound_ingress_routing_disposition_check;

alter table public.communication_inbound_ingress
    add constraint communication_inbound_ingress_routing_disposition_check
    check (routing_disposition in (
        -- No organization owns the destination. Retained at provider authority.
        'no_attributable_org',
        -- Destinations owned by several organizations. Never resolved by picking.
        'cross_org_ambiguous',
        -- Received and proven, content not yet retrieved. Safe to retry.
        'retrieval_pending'
    ));

comment on column public.communication_inbound_ingress.routing_disposition is
    'Why this message is held at provider authority: no owning organization, several owning organizations, or content not yet retrieved from the provider. The last is a normal transient state for inbound email, whose webhook carries no body.';

-- Finding the receipts that still need their content fetched, without scanning
-- the quarantine. Partial so it stays small: rows leave this state permanently
-- once they resolve.
create index if not exists idx_comm_inbound_ingress_retrieval_pending
    on public.communication_inbound_ingress (received_at)
    where routing_disposition = 'retrieval_pending' and resolved_at is null;
