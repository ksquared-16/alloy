-- =============================================================================
-- THREAD 8B SLICE E — what the executor told us, kept so we can prove it and replay it.
--
-- Stripe delivers at least once, out of order, and sometimes concurrently to two workers. None of
-- that is exceptional; it is the contract. So the webhook boundary needs somewhere durable to record
-- what arrived, and a way to make the second arrival of the same event harmless without asking a
-- service to remember anything.
--
-- ── WHY A NEW TABLE ──
--
-- `provider_event`, `webhook_event`, `inbound_event` and `processor_event` match nothing across the
-- migrations except a Communications receipt-columns migration, which is that platform's own and not
-- a generic store. So this is the first, and like the attempt table it is processor-neutral: nothing
-- here is named for Stripe or for cards.
--
-- ── WHAT IT IS NOT ──
--
-- Not financial authority. An event saying `succeeded` is evidence that an executor believes it
-- collected; it is not a receipt, it does not reduce a balance, and Slice E deliberately stops at
-- converging the ATTEMPT. Thread 8 posting is Slice F and reads from the attempt, not from here.
--
-- Tenancy is never taken from the payload. `connected_account_ref` is recorded as it arrived and
-- then resolved through `payment_provider_merchants`; `org_id` is nullable precisely so an event for
-- an unknown account can be stored as evidence WITHOUT being given a tenant it has not earned.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    processor text NOT NULL CHECK (processor IN ('stripe')),
    -- The executor's own id for the delivery (`evt_…`). The dedupe identity.
    provider_event_id text NOT NULL CHECK (char_length(btrim(provider_event_id)) > 0),
    provider_event_type text NOT NULL,

    -- As delivered. NOT authority — the value is resolved through the merchant binding before use,
    -- and an event naming an account Alloy does not know stays here with org_id NULL.
    connected_account_ref text,
    -- Resolved, never asserted. Null means "we could not attribute this", which is a real answer.
    org_id uuid REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- The object the event concerns (`pi_…`), and the attempt it resolved to, when it resolved.
    provider_transaction_id text,
    collection_attempt_id uuid REFERENCES public.payment_collection_attempts (id) ON DELETE RESTRICT,

    /*
     * WHAT WE DID WITH IT, which is the difference between a log and evidence.
     *
     *   received      stored, not yet processed
     *   applied       it moved the attempt forward
     *   duplicate     a delivery of an event already applied — the common case, and harmless
     *   stale         older provider truth than the attempt already holds; deliberately not applied
     *   unattributed  the connected account is unknown to Alloy; failed closed
     *   unsupported   an event type this slice does not model; kept so it can be investigated
     *   rejected      failed verification or was otherwise refused
     */
    disposition text NOT NULL DEFAULT 'received'
        CHECK (disposition IN ('received', 'applied', 'duplicate', 'stale', 'unattributed', 'unsupported', 'rejected')),
    disposition_detail text,

    -- Bounded provider payload for investigation and replay. Card and bank details are never part of
    -- a PaymentIntent event body, and nothing here copies them in deliberately.
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,

    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    -- The provider's own creation time, used for ordering decisions rather than arrival order.
    provider_created_at timestamptz
);

COMMENT ON TABLE public.payment_provider_events IS
    'Durable evidence of what an external executor told Alloy, and what Alloy did with it. Never financial authority: an event is evidence that a provider believes it collected, not a receipt. Tenancy is resolved through payment_provider_merchants and is null when the connected account is unknown.';

-- THE DEDUPE IDENTITY. Stripe delivers at least once and may deliver twice concurrently; the index
-- is what makes the second arrival lose deterministically instead of both proceeding. A service
-- "have I seen this event?" check cannot: both readers see nothing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_events_processor_event
    ON public.payment_provider_events (processor, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_attempt
    ON public.payment_provider_events (collection_attempt_id, received_at DESC)
    WHERE collection_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_unattributed
    ON public.payment_provider_events (received_at DESC)
    WHERE org_id IS NULL;

-- -----------------------------------------------------------------------------
-- RLS. Read within the org; an unattributed event belongs to no tenant and is visible to none of
-- them — it is operator/service material until it can be attributed.
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_provider_events_same_org ON public.payment_provider_events;
CREATE POLICY payment_provider_events_same_org ON public.payment_provider_events
    FOR SELECT TO authenticated
    USING (org_id IS NOT NULL AND org_id = public.current_org_id());
