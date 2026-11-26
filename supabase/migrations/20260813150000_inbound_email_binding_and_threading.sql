-- Inbound email: which organization owns a receiving address, and the RFC
-- threading a reply carries.
--
-- Two additions, both on existing canonical tables. Email deliberately does NOT
-- get a parallel provider-configuration model or a parallel message model — the
-- SMS runtime proved these authorities and they generalize.
--
-- Additive only. No destructive DDL, no data mutation, no backfill.

-- ---------------------------------------------------------------------------
-- 1. Tenant ownership of a receiving address
-- ---------------------------------------------------------------------------
--
-- SMS answers "who owns this destination?" with `inbound_to_e164`. Email needs
-- the same question answered for an address, so the column is channel-neutral by
-- name rather than a second email-shaped one. SMS keeps using `inbound_to_e164`
-- for now; converging it is a follow-up that would churn a certified runtime for
-- no behaviour change.
alter table public.communication_provider_bindings
    add column if not exists inbound_address text;

comment on column public.communication_provider_bindings.inbound_address is
    'Receiving identity this binding owns (an email address for channel=email). Tenant ownership of inbound is resolved from it; when nothing matches, the message is quarantined rather than attributed.';

-- One receiving identity resolves to exactly one tenant, enforced GLOBALLY
-- rather than per-organization.
--
-- This is the invariant the SMS slice recorded as a Configuration Integrity
-- follow-up and could not enforce: `communication_bindings_org_inbound_to_uq` is
-- scoped `(org_id, inbound_to_e164)`, so two organizations could each claim the
-- same destination and inbound routing would find two owners. Email starts with
-- the constraint in place, so cross-org collision is impossible to configure
-- rather than merely handled at read time.
--
-- Case-insensitive: mail addresses are not case-sensitive in the domain part and
-- in practice not in the local part either, so `Info@` and `info@` are one identity.
create unique index if not exists communication_bindings_inbound_address_uq
    on public.communication_provider_bindings (provider, channel, lower(inbound_address))
    where inbound_address is not null;

-- ---------------------------------------------------------------------------
-- 2. RFC threading on canonical messages
-- ---------------------------------------------------------------------------
--
-- Correlation evidence, kept as columns rather than in `metadata` because it is
-- product-relevant truth that is queried and reasoned about, not supplemental
-- context. Raw MIME and provider payloads stay OUT of the primary message model.
alter table public.communication_messages
    add column if not exists email_message_id text,
    add column if not exists email_in_reply_to text,
    add column if not exists email_references text;

comment on column public.communication_messages.email_message_id is
    'RFC 5322 Message-ID. Outbound: minted by Alloy as <alloy.{id}@{domain}> so a reply correlates by primary key. Inbound: the sender''s own, retained for audit and onward References chains.';
comment on column public.communication_messages.email_in_reply_to is
    'RFC 5322 In-Reply-To from an inbound reply — the strongest available evidence of which message it answers.';
comment on column public.communication_messages.email_references is
    'RFC 5322 References chain, oldest first. Fallback correlation when In-Reply-To is absent or names nothing of ours.';

-- Inbound correlation looks up an Alloy-minted id by primary key, so no index is
-- needed for that. This one serves the other direction: finding a message by the
-- Message-ID a SENDER supplied, which is how a redelivery or an onward reply in
-- the same chain is recognised.
create index if not exists idx_comm_messages_email_message_id
    on public.communication_messages (org_id, email_message_id)
    where email_message_id is not null;
