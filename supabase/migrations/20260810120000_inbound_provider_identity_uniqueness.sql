-- Inbound provider identity is unique — duplicate provider delivery converges to one message.
--
-- Twilio retries a webhook until it gets a 2xx, and it may deliver the same
-- MessageSid more than once regardless. Nothing prevented that from creating a
-- second canonical inbound row: a duplicate reply, a duplicate unread, a
-- duplicate Activity entry, and a second execution of STOP.
--
-- WHY THIS INDEX IS SCOPED TO INBOUND
--
-- `communication_messages.provider_message_id` is populated in BOTH directions.
-- Outbound rows carry the id the provider returned for what we sent, and the
-- Resend/Twilio status webhooks look rows up by it to apply delivery state
-- (`providerDeliveryPersistence.ts`). A unique index over the whole table would
-- therefore change outbound behaviour, which this slice must not do — outbound
-- uniqueness already lives at a different grain, on
-- `communication_message_recipients (org_id, provider_message_id)`.
--
-- The `WHERE direction = 'inbound'` predicate leaves every outbound row
-- completely unconstrained. `org_id` keeps the identity org-safe, and
-- provider+channel keep two providers that mint the same opaque id from
-- colliding. This mirrors the existing partial-index convention on this table
-- (`idx_comm_msgs_queue` is `WHERE direction = 'outbound' AND status = 'queued'`).
--
-- CONCURRENTLY is deliberately not used: it cannot run inside a transaction and
-- no migration in this repository uses it. Plain CREATE UNIQUE INDEX is the
-- sanctioned equivalent here.

BEGIN;

-- Existing duplicates must be resolved before the invariant can be declared,
-- and no inbound message may be deleted to make a constraint fit — a received
-- communication is immutable history even when it arrived twice.
--
-- The EARLIEST row per provider identity keeps the identity. Later copies keep
-- their row, their body, and their thread, but surrender the provider id into
-- metadata so they fall outside the partial index predicate. Provenance is
-- preserved and reversible; nothing is destroyed.
WITH ranked AS (
    SELECT
        id,
        provider_message_id,
        ROW_NUMBER() OVER (
            PARTITION BY org_id, provider, channel, provider_message_id
            ORDER BY created_at ASC, id ASC
        ) AS copy_rank
    FROM public.communication_messages
    WHERE direction = 'inbound'
      AND provider_message_id IS NOT NULL
)
UPDATE public.communication_messages AS m
SET
    provider_message_id = NULL,
    metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'superseded_duplicate_provider_message_id', r.provider_message_id,
        'superseded_reason', 'duplicate_inbound_provider_delivery',
        'superseded_by_migration', '20260810120000'
    )
FROM ranked AS r
WHERE m.id = r.id
  AND r.copy_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS communication_messages_inbound_provider_identity_uk
    ON public.communication_messages (org_id, provider, channel, provider_message_id)
    WHERE direction = 'inbound' AND provider_message_id IS NOT NULL;

COMMENT ON INDEX public.communication_messages_inbound_provider_identity_uk IS
    'Inbound provider identity (org, provider, channel, provider_message_id). Duplicate provider delivery converges to one canonical inbound message. Outbound rows are excluded by the partial predicate so provider-message behaviour there is unchanged.';

COMMIT;
