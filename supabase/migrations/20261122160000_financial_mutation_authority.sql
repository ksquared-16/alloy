-- =============================================================================
-- W7-F010 — A SIGNED-IN SESSION CANNOT MUTATE MONEY TABLES DIRECTLY.
--
-- Measured on certification (rolled back): `authenticated` held INSERT/UPDATE/DELETE on
-- `charges`, admitted by `org_id = current_org_id()` plus a role-NAME gate. `current_org_id()`
-- answers only when the database holds exactly one org, so multi-tenant databases were closed
-- by accident — but on a single-org database an owner/admin/ops session could, through
-- PostgREST, insert a charge already posted, flip a draft to posted (bypassing
-- postChildcareCharge, the period gate, posting review, the named-person rule and the F008
-- journal transaction: 0 entries), and edit a draft's amount and dates.
--
-- The same shape held on `payments`, `payment_allocations` and `ledger_transactions`, and
-- `resolved_obligations` was OPEN TODAY on every tenant: its write policies use
-- has_org_role(owner/admin/ops), not current_org_id(). Two SECURITY DEFINER functions with no
-- org or caller check were executable by sessions: `post_ledger_transaction` (authenticated) and
-- `stamp_payment_posted_to_ledger_at` (authenticated AND anon).
--
-- No supported runtime writes these tables through a session client: every writer reaches them
-- through the service role and the canonical Financials services (writer census, 2026-10-09).
-- So the session write path is removed, not re-gated, and no second writer is created:
--   * authenticated/anon lose INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES; SELECT stays;
--   * the permissive session write policies are dropped (reads are untouched — the restrictive
--     role gates also govern SELECT and are kept);
--   * the three definer functions are service_role only.
--
-- Re-runnable: REVOKE/GRANT are idempotent; DROP POLICY IF EXISTS.
-- =============================================================================

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['charges', 'payments', 'payment_allocations', 'ledger_transactions', 'resolved_obligations'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM authenticated, anon', t);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
        END IF;
    END LOOP;
END $$;

DROP POLICY IF EXISTS "charges_insert_same_org" ON public.charges;
DROP POLICY IF EXISTS "charges_update_same_org" ON public.charges;
DROP POLICY IF EXISTS "payments_insert_same_org" ON public.payments;
DROP POLICY IF EXISTS "payments_update_same_org" ON public.payments;
DROP POLICY IF EXISTS "payment_allocations_insert_same_org" ON public.payment_allocations;
DROP POLICY IF EXISTS "payment_allocations_update_same_org" ON public.payment_allocations;
DROP POLICY IF EXISTS "ledger_transactions_insert_same_org" ON public.ledger_transactions;
DROP POLICY IF EXISTS "ledger_transactions_update_same_org" ON public.ledger_transactions;
DROP POLICY IF EXISTS "ledger_transactions_delete_same_org" ON public.ledger_transactions;
DROP POLICY IF EXISTS "resolved_obligations_insert_org" ON public.resolved_obligations;
DROP POLICY IF EXISTS "resolved_obligations_update_org" ON public.resolved_obligations;

DO $$
DECLARE
    f regprocedure;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        to_regprocedure('public.post_ledger_transaction(uuid)'),
        to_regprocedure('public.stamp_payment_posted_to_ledger_at(uuid)'),
        to_regprocedure('public.reconcile_consumption_correction(uuid,uuid,jsonb)')
    ] LOOP
        IF f IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
        END IF;
    END LOOP;
END $$;
