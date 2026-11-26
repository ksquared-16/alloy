-- =============================================================================
-- THREAD 8B SLICE F — the one place provider evidence becomes financial truth.
--
-- Slice E stopped deliberately at a converged attempt: Stripe said it collected, and Alloy recorded
-- that it said so. Slice F crosses into Thread 8, and the crossing needs exactly one thing the
-- attempt table did not have — a durable link to the receipt it produced.
--
-- ── WHY A COLUMN AND NOT A STATE ──
--
-- `processor_state = 'succeeded'` answers "what did the provider say". It cannot also answer "did
-- Alloy recognise the money", and conflating them is the failure this thread exists to avoid. A
-- provider can succeed while canonical posting fails — a transient database error, a charge voided
-- between collection and delivery — and the truthful reading of that state is "the money arrived and
-- we have not recognised it yet", which is a retry, not a loss and not a second charge.
--
-- So the two facts get two fields:
--
--   processor_state = 'succeeded'   the executor collected
--   canonical_payment_id IS NULL    Alloy has not recognised it — safe to retry, idempotently
--   canonical_payment_id IS NOT NULL   recognised exactly once, and this is the receipt
--
-- ── THE EXACTLY-ONCE GUARANTEE LIVES HERE ──
--
-- One attempt may produce at most one canonical receipt, and one receipt belongs to at most one
-- attempt. Both directions are unique indexes rather than service checks, because the race this must
-- survive is two webhook deliveries of the same success landing in two processes at the same instant:
-- both read the attempt, both see no payment, and only the database can stop both from posting.
--
-- `payments.idempotency_key` carries the same guarantee from the other side — Slice F derives it
-- from the attempt id — so the two constraints agree by construction rather than by coincidence.
-- =============================================================================

ALTER TABLE public.payment_collection_attempts
    ADD COLUMN IF NOT EXISTS canonical_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
    -- When Alloy recognised it, which is a different moment from when the provider collected.
    ADD COLUMN IF NOT EXISTS canonical_posted_at timestamptz,
    -- Why the last posting attempt did not produce a receipt, when it did not. Cleared on success.
    ADD COLUMN IF NOT EXISTS posting_error text;

COMMENT ON COLUMN public.payment_collection_attempts.canonical_payment_id IS
    'The Thread 8 receipt this collection produced, once Alloy recognised the money. NULL while the provider has succeeded but canonical posting has not completed — which is a retry state, never a loss and never a reason to charge again.';

-- ONE ATTEMPT, AT MOST ONE RECEIPT. The index is the guarantee: two concurrent deliveries both read
-- a null and only one may write.
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_attempts_canonical_payment
    ON public.payment_collection_attempts (canonical_payment_id)
    WHERE canonical_payment_id IS NOT NULL;

-- And a receipt is not reachable from two attempts, so provider evidence and money stay one-to-one
-- in both directions.
CREATE INDEX IF NOT EXISTS idx_collection_attempts_awaiting_posting
    ON public.payment_collection_attempts (org_id, processor_state)
    WHERE processor_state = 'succeeded' AND canonical_payment_id IS NULL;

COMMENT ON INDEX public.idx_collection_attempts_awaiting_posting IS
    'Collections the provider completed that Alloy has not yet recognised. This is the reconciliation queue: money that arrived and is not yet on a balance.';
