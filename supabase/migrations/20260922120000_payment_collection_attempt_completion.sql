-- =============================================================================
-- PAYMENTS V1 · W3 — COLLECTION COMPLETION. Two nullable columns, and nothing else.
--
-- W1 gave an organisation a merchant. W2 gave a payer a stored method. W3 closes the loop between
-- them and the money: which stored method an attempt actually used, and when the provider expects
-- the money to land.
--
-- ── WHY THESE TWO AND NO MORE ──
--
-- `payment_method_id` is PROVENANCE. Until now an attempt recorded the rail and the payer but not
-- the instrument, so "which card did we charge in March" was unanswerable from canonical data — the
-- only trace was a provider id in a webhook payload. It is nullable because every attempt written
-- before W2 predates stored methods, and because a present-payer collection legitimately has none.
--
-- `expected_settlement_on` is a PROJECTION. ACH is not instant, and an operator who cannot say when
-- the money should arrive either invents a date or tells a family nothing.
--
-- ── WHAT expected_settlement_on IS NOT, WHICH IS THE WHOLE POINT ──
--
-- Not `received_at`. Not `effective_at`. Not `posted_at`. Not settlement truth, and not an
-- accounting-period authority. It is what the PROVIDER currently expects, cached so a surface can
-- say it without a provider round trip, and it may be revised while the attempt is nonterminal.
--
-- NO FINANCIAL CALCULATION MAY READ IT. The moment a balance, an outstanding, a period or a report
-- depends on it, a provider's guess has become Alloy's money — and the canonical dates on `payments`
-- are the ones that survive the provider being wrong.
--
-- ── NO DESTRUCTIVE CHANGE, AND NO NEW TABLE ──
--
-- The recognition queue W3 productizes already exists as an index on this table
-- (`processor_state = 'succeeded' AND canonical_payment_id IS NULL`, 20260909190000). W3 gives it an
-- operator surface and one registered action; it does not give it a store of its own.
-- =============================================================================

ALTER TABLE public.payment_collection_attempts
    ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods (id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS expected_settlement_on date;

COMMENT ON COLUMN public.payment_collection_attempts.payment_method_id IS
    'The canonical Payment Method Reference this attempt collected with, when a stored method was used. Historical provenance: it is never nulled or repointed when the method is later revoked or replaced, because the attempt names what actually happened.';

COMMENT ON COLUMN public.payment_collection_attempts.expected_settlement_on IS
    'When the PROVIDER currently expects this collection to settle. Operator projection only — never received_at, effective_at, posted_at, settlement truth or an accounting-period authority, and no financial calculation may depend on it.';

/*
 * ON DELETE RESTRICT, deliberately.
 *
 * A stored method is already never deleted — an operator's "Remove" is a revocation — so this FK
 * costs nothing in normal operation. It exists to make the accidental case impossible: a method row
 * that some future cleanup tried to delete would take the provenance of every payment it ever made
 * with it, and the database refuses rather than letting that be a code review's problem.
 */

-- Answering "which attempts used this method" without scanning, for the method-revocation and
-- merchant-replacement cases where provenance is the question being asked.
CREATE INDEX IF NOT EXISTS idx_payment_collection_attempts_method
    ON public.payment_collection_attempts (payment_method_id)
    WHERE payment_method_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SELF-TEST — the DDL above either took effect or this migration fails.
-- A failed apply does not roll back DDL, so this asserts shape rather than assuming the statements
-- ran. It also re-asserts the recognition index, because W3's operator surface reads it and a
-- migration that silently lost it would leave the queue scanning the whole table.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cols int;
BEGIN
    SELECT count(*) INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_collection_attempts'
      AND column_name IN ('payment_method_id', 'expected_settlement_on');
    IF v_cols <> 2 THEN
        RAISE EXCEPTION 'collection completion columns are missing: found % of 2', v_cols;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payment_collection_attempts'
          AND column_name = 'expected_settlement_on' AND data_type = 'date'
    ) THEN
        RAISE EXCEPTION 'expected_settlement_on must be a date, not a timestamp: it is a projected DAY, not a moment';
    END IF;

    IF to_regclass('public.idx_payment_collection_attempts_method') IS NULL THEN
        RAISE EXCEPTION 'the method provenance index was not created';
    END IF;

    IF to_regclass('public.idx_payment_collection_attempts_unrecognized') IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'payment_collection_attempts'
              AND indexdef ILIKE '%canonical_payment_id IS NULL%'
        ) THEN
        RAISE EXCEPTION 'the recognition queue index is absent; W3''s Needs Recognition lens depends on it';
    END IF;

    RAISE NOTICE 'collection completion: payment_method_id and expected_settlement_on present, provenance index created, recognition index intact';
END $$;
