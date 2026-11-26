-- =============================================================================
-- PAYMENTS V1 · W6-B — A REFUND OF HELD MONEY HAS TO REMEMBER WHICH LOT IT DISCHARGES.
--
-- Refunding a held deposit needs two facts recorded: the canonical outbound refund, and a
-- `refunded` disposition discharging the hold. `payment_hold_dispositions_refunded_names_payment_chk`
-- requires the disposition to name the refund payment it became, so it cannot be written until a
-- canonical refund row exists.
--
-- For a card refund, one does not exist when the operator's click returns. `requestProviderRefund`
-- asks Stripe and comes back with a provider refund that has not settled; the canonical row is
-- written later, by `recognizeProviderRefund`. The disposition therefore belongs at RECOGNITION —
-- and recognition has to be told which hold it is discharging.
--
-- ── WHY IT CANNOT BE DERIVED ──
--
-- A provider refund already names `original_payment_id`, so it is tempting to look up that payment's
-- open hold at recognition. That works only while a receipt has exactly one lot. A receipt holding a
-- refundable $500 security deposit AND a non-refundable $175 registration fee gives two candidates,
-- and choosing between them would be inventing which promise the organisation is keeping. So the
-- hold is CARRIED from the act that chose it.
--
-- NULL is the ordinary case: an ordinary refund discharges no hold and names none.
-- =============================================================================

ALTER TABLE public.payment_provider_refunds
    ADD COLUMN IF NOT EXISTS hold_id uuid REFERENCES public.payment_holds (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.payment_provider_refunds.hold_id IS
    'The held lot this refund discharges, carried from the act that chose it so recognition can write the `refunded` disposition. NULL for an ordinary refund. Never derived from the payment, because a receipt may hold more than one lot under different terms.';

CREATE INDEX IF NOT EXISTS idx_payment_provider_refunds_hold
    ON public.payment_provider_refunds (hold_id)
    WHERE hold_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- RECOGNITION IS RETRIED, SO THE DISPOSITION MUST BE WRITTEN AT MOST ONCE.
--
-- `recognizeProviderRefund` runs from the inline path AND from the webhook, and either may be
-- replayed. The canonical refund is already idempotent on its own key; the disposition needs the
-- same protection or a replayed event disposes the same money twice — which the hold's bounds
-- trigger would refuse, turning a duplicate event into a recognition FAILURE and leaving
-- `recognition_error` set on a refund that actually succeeded.
--
-- Partial, because only the refunded kind names a refund payment: released and applied dispositions
-- are unaffected and a hold may legitimately have many of them.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_hold_dispositions_one_per_refund
    ON public.payment_hold_dispositions (hold_id, refund_payment_id)
    WHERE kind = 'refunded' AND refund_payment_id IS NOT NULL;

COMMENT ON INDEX public.uq_payment_hold_dispositions_one_per_refund IS
    'One refunded disposition per (hold, refund payment). Recognition is replayed from both the inline path and the webhook; without this a replay disposes the same money twice and the bounds trigger turns a duplicate event into a spurious recognition failure.';

-- -----------------------------------------------------------------------------
-- SELF-TEST — the DDL above either took effect or this migration fails.
-- A failed apply does not roll back DDL, so this asserts the shape rather than assuming it ran.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    PERFORM 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payment_provider_refunds' AND column_name = 'hold_id';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment_provider_refunds.hold_id was not added';
    END IF;

    PERFORM 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_payment_hold_dispositions_one_per_refund';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'uq_payment_hold_dispositions_one_per_refund was not created';
    END IF;
END $$;
