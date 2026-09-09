-- =============================================================================
-- THREAD 8B SLICE G — what we asked the executor to give back, which is not yet a reversal.
--
-- Slice D needed a place for "what did we ask an executor to collect" that was not the payments
-- table. A refund needs the mirror of it, and for the same reason: Stripe refunding money is a
-- REQUEST, and Thread 8 reversing a receipt is the financial fact. Between them sits a `pending`
-- refund that has not moved a balance and must not be mistaken for one.
--
-- ── WHY A TABLE, WHEN THE INSTRUCTION SAYS PREFER NOT TO ──
--
-- Provider events plus the Stripe refund id genuinely cannot carry this. Three requirements need
-- durable Alloy-owned INTENT, and an event is evidence of something that already happened:
--
--   * idempotency must be anchored on the refund INTENT, not on any delivery, because a second
--     Stripe event can describe the same refund;
--   * a retry of one intent must be distinguishable from a genuinely NEW second partial refund of
--     the same payment — both are legitimate and they look identical from the outside without a
--     durable key;
--   * "the provider refunded but Alloy has not recognised it" needs somewhere to be true. That is
--     the refund analogue of Slice F's succeeded-but-unposted attempt, and it is a retry state
--     rather than a loss.
--
-- Processor-neutral, like every other table in this thread: `processor` is a column, and nothing is
-- named for Stripe or for cards. It is NOT a ledger — it never owns a restored balance, and the
-- canonical reversal lives in `payments` via `refunds_payment_id` exactly as Thread 8 defined.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_provider_refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    processor text NOT NULL CHECK (processor IN ('stripe')),
    -- The receipt being given back, and the collection that produced it. Both, because the payment
    -- is the financial anchor and the attempt carries the merchant the refund must be issued on.
    original_payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
    collection_attempt_id uuid REFERENCES public.payment_collection_attempts (id) ON DELETE RESTRICT,
    provider_account_ref text NOT NULL,
    -- The transaction being refunded (`pi_…`), kept so evidence survives the attempt row.
    original_provider_transaction_id text NOT NULL,

    currency text NOT NULL DEFAULT 'USD',
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),

    /*
     * THE INTENT KEY, Alloy-owned and durable.
     *
     * Derived from the payment, the amount and a caller-supplied intent discriminator, so a RETRY of
     * one refund collapses onto this row while a genuinely new second partial refund of the same
     * payment gets its own. Over-dedupe would silently swallow a legitimate second refund; under-
     * dedupe would give the money back twice.
     */
    intent_key text NOT NULL CHECK (char_length(btrim(intent_key)) > 0),

    -- Stripe's own id for the refund (`re_…`), once it exists.
    provider_refund_id text,

    /*
     * THE PROVIDER'S state, from Stripe's actual refund model — pending, succeeded, failed,
     * canceled. `succeeded` means the executor gave the money back. It does NOT mean Alloy has
     * reversed anything: a balance is not restored because a refund was requested.
     */
    provider_state text NOT NULL DEFAULT 'initiated'
        CHECK (provider_state IN ('initiated', 'pending', 'succeeded', 'failed', 'canceled')),
    provider_state_at timestamptz NOT NULL DEFAULT now(),

    -- The canonical Thread 8 reversal, once recognised. NULL while the provider has refunded and
    -- Alloy has not yet recognised it — a retry state, and never a reason to refund again.
    canonical_refund_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
    canonical_recognized_at timestamptz,
    recognition_error text,

    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

COMMENT ON TABLE public.payment_provider_refunds IS
    'What Alloy asked an external executor to give back, and what the executor reported. Not a ledger: the canonical reversal is a new outbound payments row linked by refunds_payment_id, and this table never owns a restored balance. A pending provider refund has moved no money.';

-- ONE INTENT, ONE REFUND. The database decides, because two concurrent submissions of one intent
-- both pass a lookup and would each ask Stripe for money back.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_refunds_org_intent
    ON public.payment_provider_refunds (org_id, intent_key);

-- One provider refund maps to one row, so an event carrying `re_…` resolves unambiguously.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_refunds_provider_refund
    ON public.payment_provider_refunds (processor, provider_refund_id)
    WHERE provider_refund_id IS NOT NULL;

-- And one canonical reversal is claimed by at most one provider refund.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_refunds_canonical
    ON public.payment_provider_refunds (canonical_refund_payment_id)
    WHERE canonical_refund_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_provider_refunds_original
    ON public.payment_provider_refunds (org_id, original_payment_id, created_at DESC);

-- Money the provider gave back that Alloy has not yet reversed: the reconciliation queue's refund
-- half, and the mirror of idx_collection_attempts_awaiting_posting.
CREATE INDEX IF NOT EXISTS idx_payment_provider_refunds_awaiting_recognition
    ON public.payment_provider_refunds (org_id, provider_state)
    WHERE provider_state = 'succeeded' AND canonical_refund_payment_id IS NULL;

ALTER TABLE public.payment_provider_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_provider_refunds_same_org ON public.payment_provider_refunds;
CREATE POLICY payment_provider_refunds_same_org ON public.payment_provider_refunds
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS payment_provider_refunds_write_rolegate ON public.payment_provider_refunds;
CREATE POLICY payment_provider_refunds_write_rolegate ON public.payment_provider_refunds
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

-- A provider refund that reached a terminal state stays there, for the same reason a collection
-- attempt does: delivery is unordered, and a late `pending` must not walk a completed refund back.
CREATE OR REPLACE FUNCTION public.enforce_provider_refund_state_progression()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    terminal text[] := ARRAY['succeeded'::text, 'failed'::text, 'canceled'::text];
BEGIN
    IF NEW.provider_state IS NOT DISTINCT FROM OLD.provider_state THEN
        RETURN NEW;
    END IF;
    IF OLD.provider_state = ANY (terminal) THEN
        RAISE EXCEPTION 'provider refund % is terminal at % and cannot move to %',
            OLD.id, OLD.provider_state, NEW.provider_state
            USING ERRCODE = '0A000';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_provider_refund_state_progression ON public.payment_provider_refunds;
CREATE TRIGGER trg_enforce_provider_refund_state_progression
    BEFORE UPDATE OF provider_state ON public.payment_provider_refunds
    FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_refund_state_progression();
