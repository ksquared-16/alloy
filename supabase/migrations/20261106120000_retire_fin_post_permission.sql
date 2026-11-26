-- =============================================================================
-- PAYMENTS V1 · W6-A2 — RETIRING `fin.post`.
--
-- `fin.post` was not accidental authority fragmentation. It was minted deliberately (20260914113000)
-- for four handlers that posted money while being served from under `schedules/` and `jobs/`: a cash
-- receipt, a cash payout, a GL journal entry and an immediately-posted receivable charge.
-- `fin.write` is held by ops as well as admin, and `fin.adjust` is scoped by its own description to
-- corrections that REDUCE what a family owes, so neither was truthful for those four. A bounded
-- posting key was the right call.
--
-- All four handlers are deleted in the same change as this migration. Three had no caller anywhere.
-- The fourth, `jobs/[id]/charges`, was reached only by `JobManualChargeForm`, which had no importer
-- and was never rendered — so the form went with the route.
--
-- Canonical Payments owns these capabilities now: a registered action, then a collection attempt,
-- then the provider adapter, then canonical posting, then the Payment, then the allocation. NO ROUTE
-- WRITES MONEY. A permission no route enforces is, in this catalog's own words, "a control that
-- changes nothing".
--
-- ── WHAT THIS DELIBERATELY DOES NOT TOUCH ──
--
-- `scheduling.write` and `ops.jobs.write` stay, and `requireSchedulingJobsCapability` stays with
-- them: FIFTEEN live routes — schedules, jobs, assignments, discounts — enforce those two keys
-- through that helper. Retiring the helper alongside `fin.post` would strip their authority and
-- re-open the role-title gate the 20260914113000 slice exists to have closed.
--
-- The canonical Payments permissions — `fin.read`, `fin.write`, `fin.adjust`, `fin.provider` — are
-- untouched. This removes one key, not a family.
-- =============================================================================

-- Grants first: an org-scoped grant is what actually conveys authority, and a definitions row should
-- not be removed from underneath a live grant.
DELETE FROM public.role_permission_grants WHERE permission_key = 'fin.post';

DELETE FROM public.permission_definitions WHERE key = 'fin.post';

-- -----------------------------------------------------------------------------
-- SELF-TEST — the deletes above either took effect or this migration fails.
--
-- These are DML, so this asserts the resulting STATE rather than assuming the statements ran. It
-- also asserts what must SURVIVE: a retirement that quietly took a neighbouring key with it would
-- pass a test that only looked for absence.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v integer;
BEGIN
    SELECT count(*) INTO v FROM public.permission_definitions WHERE key = 'fin.post';
    IF v <> 0 THEN RAISE EXCEPTION 'fin.post is still catalogued (% rows)', v; END IF;

    SELECT count(*) INTO v FROM public.role_permission_grants WHERE permission_key = 'fin.post';
    IF v <> 0 THEN RAISE EXCEPTION 'fin.post is still granted (% rows)', v; END IF;

    -- The two keys the surviving helper enforces.
    SELECT count(*) INTO v FROM public.permission_definitions
     WHERE key IN ('scheduling.write', 'ops.jobs.write');
    IF v <> 2 THEN
        RAISE EXCEPTION 'the live scheduling keys must survive: expected 2, found %', v;
    END IF;

    -- Canonical Payments authority.
    SELECT count(*) INTO v FROM public.permission_definitions
     WHERE key IN ('fin.read', 'fin.write', 'fin.adjust', 'fin.provider');
    IF v <> 4 THEN
        RAISE EXCEPTION 'canonical Payments permissions must survive: expected 4, found %', v;
    END IF;
END $$;
