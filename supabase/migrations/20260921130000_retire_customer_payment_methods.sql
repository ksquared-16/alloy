-- =============================================================================
-- PAYMENTS V1 · W2 — RETIRING `customer_payment_methods`.
--
-- Superseded development residue, removed on evidence rather than on taste:
--
--   * its ONLY writer, `persistBookingPaymentMethod`, had ZERO callers in the base this migration
--     ships with — nothing in the product could write a row;
--   * a read-only census of the deployed primary database (tha_f3abfc99acea02, 2026-09-20) found
--     `count(*) = 0`, with no oldest and no newest row. The local certification database likewise
--     held none. There is no data to migrate, because there is no data;
--   * its one remaining reader was a fallback in the Jobs collect-payment context route, which could
--     therefore only ever have read rows nothing produced. That fallback is removed in the same
--     change as this migration.
--
-- `payment_methods` (20260921120000) is the canonical replacement, and is not a rename of this: it is
-- org-scoped, models both rails, carries verification and usability lifecycles, and treats the
-- provider's id as an adapter reference rather than as identity.
--
-- ── WHY THIS IS A SEPARATE MIGRATION FROM THE ONE THAT CREATED payment_methods ──
--
-- Because it must be APPLIED LATER. A DROP takes effect the moment it runs, so applying it before
-- the deploy that stops reading the table would break the Jobs route in the window between. The
-- creating migration is safe to apply at any time; this one is applied only after the code that
-- stopped reading is live. Keeping them in one file would have forced the unsafe order.
--
-- No data migration. No compatibility view. No dual write.
-- =============================================================================

DROP TABLE IF EXISTS public.customer_payment_methods;

DO $$
BEGIN
    IF to_regclass('public.customer_payment_methods') IS NOT NULL THEN
        RAISE EXCEPTION 'customer_payment_methods still exists after the drop';
    END IF;

    -- The canonical replacement must be present, or this would leave the product with neither.
    IF to_regclass('public.payment_methods') IS NULL THEN
        RAISE EXCEPTION 'payment_methods is absent; refusing to leave no stored-method table at all';
    END IF;

    RAISE NOTICE 'customer_payment_methods is retired; payment_methods is the canonical stored method';
END $$;
