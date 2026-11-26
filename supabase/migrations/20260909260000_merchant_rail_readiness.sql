-- =============================================================================
-- THREAD 8C SLICE 1 — readiness is per RAIL, because a capability is per rail.
--
-- Thread 8B asked one question of a merchant: can it charge? `charges_enabled` answered it, and for
-- cards that was the whole truth. It is not the whole truth for ACH: the governed test merchant was
-- `charges_enabled` and `card_payments: active` while having no `us_bank_account_ach_payments`
-- capability at all. Collecting ACH on it would have been refused by the provider AFTER Alloy had
-- already told the operator the collection was under way.
--
-- So the merchant records what it can actually do per rail, resolved from the provider's own
-- capability rather than assumed from the fact that it can take cards. A merchant with no ACH
-- capability fails closed on ACH and keeps working for cards, which is the common real state.
-- =============================================================================

ALTER TABLE public.payment_provider_merchants
    ADD COLUMN IF NOT EXISTS ach_readiness text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_provider_merchants_ach_readiness_vocabulary'
    ) THEN
        ALTER TABLE public.payment_provider_merchants
            ADD CONSTRAINT payment_provider_merchants_ach_readiness_vocabulary
            CHECK (ach_readiness IS NULL
                   OR ach_readiness IN ('not_connected', 'onboarding_incomplete', 'restricted', 'ready'));
    END IF;
END $$;

/*
 * Deliberately left NULL for existing merchants rather than backfilled to anything.
 *
 * NULL means "nobody has asked the provider whether this merchant can do ACH", which is exactly
 * true of every row written before this migration. Backfilling `ready` would invent a capability;
 * backfilling `not_connected` would assert a refusal nobody checked. The resolver treats NULL as
 * not-ready for ACH and leaves card collection untouched, so the honest unknown fails closed on the
 * only rail it affects.
 */
COMMENT ON COLUMN public.payment_provider_merchants.ach_readiness IS
    'Thread 8C: whether this merchant can collect ACH, from the provider us_bank_account_ach_payments capability. NULL = never checked, which fails closed for ACH only.';
