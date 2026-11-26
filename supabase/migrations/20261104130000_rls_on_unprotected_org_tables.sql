-- RLS ON THE TWO TABLES THAT NEVER HAD IT
--
-- MEASURED on the deployed primary 2026-09-30 (census
-- `identity-access-model-a-authority-census.sql`): of 322 public base tables, 320
-- have RLS enabled. The two that do not:
--
--   payment_provider_disputes        RLS off, 0 policies, authenticated: SELECT, org_id present
--   commercial_policy_exceptions     RLS off, 0 policies, authenticated: SELECT, org_id present
--
-- Both carry `org_id`. With RLS off and a standing `authenticated` SELECT grant,
-- ANY authenticated principal reads EVERY organization's rows. That is a
-- cross-tenant READ exposure on a payments table and on a commercial-terms table.
-- Neither has a write exposure: INSERT/UPDATE/DELETE are `service_role` and
-- `postgres` only.
--
-- `rls-authority-model-director-gate.md` reported ONE such table in September and
-- recommended repairing it as its own slice. The second appeared since; both are
-- repaired here on identical terms. Every sibling `payment_*` table enables RLS, so
-- the omission reads as an oversight rather than a decision.
--
-- WHAT THIS DELIBERATELY DOES NOT DO.
--
--   * It does not revoke the `authenticated` SELECT grant. With RLS enabled and no
--     policy admitting `authenticated`, the grant already yields zero rows, and
--     revoking SELECT is a separate, broader decision than closing a leak.
--   * It does not copy the sibling read policy. The nearest sibling shape is
--     `payment_provider_refunds_same_org :: (org_id = current_org_id())`, and
--     `current_org_id()` returns NULL whenever more than one organization exists —
--     measured: 3 orgs, so it denies. Copying it would import a predicate that is
--     load-bearing in exactly one deployment shape and inert in the other, and
--     would LOOK like an org-scoped read while granting nothing. Choosing between
--     that and `has_org_role` is a Financials read-semantics decision, not a
--     tenancy-leak repair, so it is ledgered rather than guessed.
--
-- The result is therefore deliberately strict: after this migration nothing reads
-- these tables except `service_role`. That is exactly what the supported product
-- does today — `lib/financials/payments/providerDispute.ts` and
-- `lib/financials/reductions/commercialPolicyExceptionService.ts` are the only
-- readers, both server modules running under service role — so the change is
-- invisible to the product and closes the leak completely. If a future surface
-- needs an org-scoped authenticated read, it adds the policy then, with the
-- semantics decided rather than inherited.
--
-- Re-runnable: ENABLE ROW LEVEL SECURITY is idempotent, and each policy is dropped
-- before it is created.

-- ── payment_provider_disputes ──────────────────────────────────────────────
ALTER TABLE public.payment_provider_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access payment_provider_disputes"
    ON public.payment_provider_disputes;
CREATE POLICY "service role full access payment_provider_disputes"
    ON public.payment_provider_disputes
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ── commercial_policy_exceptions ───────────────────────────────────────────
ALTER TABLE public.commercial_policy_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access commercial_policy_exceptions"
    ON public.commercial_policy_exceptions;
CREATE POLICY "service role full access commercial_policy_exceptions"
    ON public.commercial_policy_exceptions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- SELF-TEST — SCOPED TO THE TWO TABLES THIS MIGRATION REPAIRS.
--
-- The tempting assertion here is the estate-wide one: "no table in `public` is
-- left without RLS." It is deliberately NOT made. `migrationSelfTestScope.test.ts`
-- records why: an embedded guard runs once, against whatever exists that day, so an
-- estate-wide claim inside a two-table migration turns an unrelated lane's new
-- table into a refusal to apply THIS migration. Assert what you did; a repo lock
-- holds the invariant as the tree grows, and
-- `tests/access/rlsEstateCoverage.test.ts` is that lock.
-- ---------------------------------------------------------------------------
DO $selftest$
DECLARE
    v_tbl text;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY['payment_provider_disputes', 'commercial_policy_exceptions']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = v_tbl AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'RLS is still disabled on %', v_tbl;
        END IF;

        -- RLS enabled with no policy denies EVERY principal, including the server
        -- modules that are the only real readers. Protected and broken are not the
        -- same outcome, so the policy is asserted, not assumed.
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy p
              JOIN pg_class c ON c.oid = p.polrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = v_tbl
        ) THEN
            RAISE EXCEPTION '% has RLS enabled and no policy: the service-role reader cannot reach it', v_tbl;
        END IF;
    END LOOP;

    RAISE NOTICE 'RLS enabled with a service-role policy on payment_provider_disputes and commercial_policy_exceptions';
END;
$selftest$;
