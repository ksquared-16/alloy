-- =============================================================================
-- THREAD 8C SLICE 3 — money the provider took back, which is not a refund.
--
-- Thread 8B gave the operator a way to give money back: `payment.refund` asks the executor, the
-- executor confirms, and Thread 8 writes an outbound payment naming the receipt it reverses. Every
-- part of that chain begins with an operator deciding.
--
-- An ACH return begins with nobody deciding. The bank takes the money back, and Alloy finds out.
-- The financial consequence looks similar — a receipt stands, its applications reverse, outstanding
-- comes back — but the CAUSE is the opposite, and a system that cannot tell them apart will one day
-- show a family a refund they never asked for and nobody authorised.
--
-- ── WHY THIS IS DISPUTE-SHAPED, AND NOT "RETURN"-SHAPED ──
--
-- Measured against the real provider on the governed test merchant: an ACH debit returned after it
-- settles does not arrive as a return object. It arrives as a DISPUTE —
--
--     charge.dispute.created → charge.dispute.funds_withdrawn → charge.dispute.closed
--     du_…  amount=1500  reason=debit_not_authorized  status=lost
--
-- which is the same provider family a card chargeback uses. So the provider evidence is modelled on
-- the dispute from the first day rather than on an ACH-specific `return` that would have to be
-- retired the moment a card is charged back. This thread does NOT implement the dispute PRODUCT —
-- no evidence submission, no representment, no win/loss workflow. It models the money only.
--
-- ── THE ECONOMIC IDENTITY IS THE DISPUTE, NOT THE EVENT ──
--
-- Three provider events describe ONE economic reversal. Anchoring convergence on the event id would
-- reverse the family's balance three times. The dispute id is the economic key, uniquely per
-- processor and org, and the events remain durable evidence in `payment_provider_events`.
--
-- ── AND THE AMOUNT COMES FROM THE DISPUTE, NEVER FROM THE BALANCE ──
--
-- The observed balance transaction netted -3000 on a 1500 return: the principal plus a 1500 dispute
-- fee. The fee is what it costs the merchant to be disputed. It is not family debt, and a family
-- whose outstanding was restored from the balance impact would be billed twice for one return.
-- `amount_cents` here is the dispute's own amount and nothing else.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_provider_disputes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    processor text NOT NULL CHECK (processor IN ('stripe')),

    -- The receipt whose money was taken back, and the collection that produced it. Both, for the
    -- same reason the refund table keeps both: the payment is the financial anchor, the attempt
    -- carries the merchant the dispute belongs to.
    original_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
    collection_attempt_id uuid REFERENCES public.payment_collection_attempts (id) ON DELETE RESTRICT,
    provider_account_ref text NOT NULL,
    -- The transaction being disputed (`pi_…`), kept so evidence survives the attempt row.
    original_provider_transaction_id text,

    currency text NOT NULL DEFAULT 'USD',
    /*
     * THE DISPUTE'S OWN AMOUNT. Not the balance impact, not net of the dispute fee. See the header:
     * a 1500 return with a 1500 fee nets -3000, and restoring 3000 would bill the family twice.
     */
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),

    -- Stripe's own id for the dispute (`du_…`). THE economic identity.
    provider_dispute_id text NOT NULL CHECK (char_length(btrim(provider_dispute_id)) > 0),
    -- The provider's stated reason, e.g. `debit_not_authorized`. Evidence, never a rule.
    provider_reason text,

    /*
     * THE PROVIDER'S dispute lifecycle, and the boundary that matters.
     *
     * `warning_needs_response`, `needs_response`, `under_review`, `won`, `lost` are Stripe's; Alloy
     * adds nothing. What Alloy cares about is whether the money has actually LEFT, which the
     * provider announces separately as `charge.dispute.funds_withdrawn` — a dispute being OPENED is
     * not money moving, and reversing on `created` would restore a family's outstanding while the
     * cash is still there.
     */
    provider_state text,
    provider_state_at timestamptz,
    funds_withdrawn_at timestamptz,

    /*
     * Canonical recognition, exactly as the refund table models it: the provider fact and the Alloy
     * fact are separate, and "the provider withdrew but Alloy has not reversed" is a retry state
     * rather than a loss.
     */
    canonical_reversal_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
    canonical_recognized_at timestamptz,
    recognition_error text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

-- ONE DISPUTE, ONE ROW. Three events for one dispute collapse here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_disputes_provider_dispute
    ON public.payment_provider_disputes (processor, provider_dispute_id);

-- ONE DISPUTE, AT MOST ONE CANONICAL REVERSAL. The database refuses the second.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_disputes_canonical
    ON public.payment_provider_disputes (canonical_reversal_payment_id)
    WHERE canonical_reversal_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_payment_provider_disputes_org
    ON public.payment_provider_disputes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_provider_disputes_original_payment
    ON public.payment_provider_disputes (original_payment_id)
    WHERE original_payment_id IS NOT NULL;

/*
 * ── WHO TOOK THE MONEY BACK ──
 *
 * `refunds_payment_id` already says WHICH receipt an outbound payment reverses. It cannot say who
 * decided, and until now it did not have to: every reversal in the system was an operator refund.
 * A provider-initiated reversal is the same shape and the opposite cause, so the origin is written
 * down rather than inferred — inferred from `processor`, a Stripe refund and a Stripe dispute are
 * indistinguishable.
 *
 * Existing rows are backfilled to `operator`, which is what every one of them is: Thread 8B had no
 * other way to create an outbound payment.
 */
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS reversal_origin text;

UPDATE public.payments
   SET reversal_origin = 'operator'
 WHERE refunds_payment_id IS NOT NULL
   AND reversal_origin IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_reversal_origin_vocabulary'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_reversal_origin_vocabulary
            CHECK (reversal_origin IS NULL OR reversal_origin IN ('operator', 'provider'));
    END IF;

    -- A reversal names both the receipt it reverses and who caused it, or it is not a reversal.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_reversal_origin_requires_original'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_reversal_origin_requires_original
            CHECK ((reversal_origin IS NULL) = (refunds_payment_id IS NULL));
    END IF;
END $$;

COMMENT ON TABLE public.payment_provider_disputes IS
    'Thread 8C: provider dispute evidence (ACH return today, card chargeback later). Not a ledger — the canonical reversal lives in payments.reversal_origin = provider.';
COMMENT ON COLUMN public.payments.reversal_origin IS
    'Thread 8C: who caused this outbound reversal — operator (a refund they asked for) or provider (money withdrawn by the bank or network).';
