-- =============================================================================
-- PAYMENTS V1 · W6-A — RETIRING `fin.post`.
--
-- `fin.post` was not accidental authority fragmentation. It was minted deliberately
-- (20260914113000) for four handlers that posted money while being served from under `schedules/`
-- and `jobs/`: a cash receipt, a cash payout, a GL journal entry and an immediately-posted
-- receivable charge. `fin.write` was held by ops as well as admin and `fin.adjust` describes only
-- reductions, so neither was truthful for those four; a bounded posting key was the right call.
--
-- Canonical Payments has since taken the capability over. Money is recorded through a registered
-- action — `payment.record`, `payment.collect_card`, `payment.apply_to_charge` — under
-- `fin.write` / `fin.adjust` / `fin.provider`, and provider execution runs through a collection
-- attempt and its adapter. The four handlers were development-era duplicates of that, each with
-- ZERO fetch callers anywhere in the app, and W6-A deleted them in the same change as this file.
--
-- A permission no route enforces is, in this catalog's own words, "a control that changes nothing".
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──
--
-- It does not touch `scheduling.write` or `ops.jobs.write`, and it does not remove
-- `requireSchedulingJobsCapability`. Those two keys are enforced by a dozen LIVE routes — schedules,
-- jobs, assignments, discounts — and the helper is how they are enforced. The W6-A instruction made
-- removing the helper conditional on "zero route requiring requireSchedulingJobsCapability", and
-- that condition is false: deleting it would strip authority from those routes and re-open the
-- role-title gate the 20260914113000 slice exists to have closed.
--
-- No compatibility period. No dual authority. The grant goes with the key.
-- =============================================================================

-- The grants first: a permission_definitions row referenced by a live grant should not be removed
-- underneath it, and org-scoped grants are the thing that actually conveys authority.
DELETE FROM public.role_permission_grants WHERE permission_key = 'fin.post';

DELETE FROM public.permission_definitions WHERE key = 'fin.post';

-- -----------------------------------------------------------------------------
-- SELF-TEST — the deletes above either took effect or this migration fails.
--
-- A failed apply does not roll back DDL, and these are DML, so this asserts the resulting STATE
-- rather than assuming the statements ran. It also asserts what must SURVIVE: removing `fin.post`
-- must not have taken the two live scheduling keys with it.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_left integer;
    v_grants integer;
    v_survivors integer;
BEGIN
    SELECT count(*) INTO v_left FROM public.permission_definitions WHERE key = 'fin.post';
    IF v_left <> 0 THEN
        RAISE EXCEPTION 'fin.post is still catalogued (% rows)', v_left;
    END IF;

    SELECT count(*) INTO v_grants FROM public.role_permission_grants WHERE permission_key = 'fin.post';
    IF v_grants <> 0 THEN
        RAISE EXCEPTION 'fin.post is still granted (% rows)', v_grants;
    END IF;

    SELECT count(*) INTO v_survivors
      FROM public.permission_definitions
     WHERE key IN ('scheduling.write', 'ops.jobs.write');
    IF v_survivors <> 2 THEN
        RAISE EXCEPTION
            'the live scheduling keys must survive: expected 2, found %', v_survivors;
    END IF;

    -- And the canonical Payments permissions are untouched.
    SELECT count(*) INTO v_survivors
      FROM public.permission_definitions
     WHERE key IN ('fin.read', 'fin.write', 'fin.adjust');
    IF v_survivors <> 3 THEN
        RAISE EXCEPTION
            'canonical Payments permissions must survive: expected 3, found %', v_survivors;
    END IF;
END $$;
