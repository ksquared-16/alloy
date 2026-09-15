-- SCHEDULES AND JOBS STOP BEING "WHOEVER IS CALLED admin" — AND THE MONEY STOPS HIDING IN THEM.
--
-- Fourteen handlers under `schedules/` and `jobs/` authorized on the literal `admin` role key. Ten
-- of them are genuinely scheduling and job operations. FOUR are not: they post money.
--
--   schedules/[id]/post-customer-payment   a cash receipt
--   schedules/[id]/post-vendor-payout      a cash out
--   schedules/[id]/post-completion         a GL journal entry
--   jobs/[id]/charges                      a receivable charge, posted immediately
--
-- Authority follows the business consequence, not the URL folder. `scheduling.write` is labelled
-- "Manage scheduling", and `20260505164000_permission_grid_keys.sql` — the migration that minted it
-- — defines `billing.read` as a SEPARATE family in the same statement. The catalog's own vocabulary
-- already refuses to let scheduling mean money, so folding a cash receipt into it would hide money
-- authority inside a generic manage key.
--
-- ── WHY A NEW FINANCIALS KEY AND NOT AN EXISTING ONE ──
--
-- `fin.write` is held by `admin` AND `ops` and is already enforced elsewhere, so reusing it would
-- hand `ops` four money operations it cannot reach today — and removing it from `ops` to compensate
-- would revoke authority ops genuinely exercises. `fin.adjust` is admin-only, but its own
-- description scopes it to "a manual credit, waiver, write-off or correction that REDUCES what a
-- family owes"; a receipt, a payout and a journal entry are none of those. Neither is truthful.
--
-- `fin.post` is bounded to posting and implies nothing else: not responsibility, not subsidy, not
-- adjustments, not reporting, not reconciliation, not arbitrary journal editing.
--
-- ── THE TWO REUSED KEYS WERE CATALOGUED AND DEAD ──
--
-- `scheduling.write` and `ops.jobs.write` have existed for months, granted to admin and ops, and
-- enforced NOWHERE: their only executable reference was `unenforcedPermissionKeys.json`, whose own
-- header calls such keys "a control that changes nothing - revocation theatre". Enforcing them is
-- what makes them real. That is also why the `ops` default has to be corrected in the same
-- migration: without it, a cleanup that was supposed to preserve behaviour would hand `ops` ten
-- operations the role-title gate denied it a moment earlier.
--
-- ── AND WHY THE REMOVAL CANNOT BE A BLANKET DELETE ──
--
-- A grant nobody chose may be corrected; a grant an organization DELIBERATELY made is theirs. D2
-- made `mutation_events` the immutable record of every access change, so the discriminator is
-- simply whether any audited change ever touched that key in that organization. The test is applied
-- INSIDE this migration rather than read from a census snapshot, so a grant deliberately made
-- between the census and this apply is still preserved.
--
-- The predicate is ROLE-PRECISE, and that is not a detail. An org-wide test was the first draft, and
-- the certification tenant showed why it was wrong: of its 68 audited events naming these keys, 66
-- concern the ADMIN role. Admin history would then have protected an ops grant nobody ever chose,
-- which inverts the doctrine — preserving by accident exactly where it should correct. The event has
-- to name the same role whose grant is in question.
--
-- Measured on the deployed primary at 2026-09-14T16:30:59Z: three active ops roles, two holding a
-- key, both with zero audited events of any kind, no ambiguous case anywhere.

DO $guard$
BEGIN
    IF to_regclass('public.permission_definitions') IS NULL THEN
        RAISE EXCEPTION 'SCHEDJOBS ABORT: public.permission_definitions is absent.';
    END IF;
    IF to_regclass('public.role_permission_grants') IS NULL THEN
        RAISE EXCEPTION 'SCHEDJOBS ABORT: public.role_permission_grants is absent.';
    END IF;
    IF to_regclass('public.mutation_events') IS NULL THEN
        RAISE EXCEPTION 'SCHEDJOBS ABORT: public.mutation_events is absent; provenance cannot be established and no grant may be removed without it.';
    END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE CAPABILITY. Financials-owned, though its enforcement sites are served from
--    under schedules/ and jobs/.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES
    ('fin.post', 'financials', 'Post financial transactions',
     'Post a financial consequence arising from operational work: a customer receipt, a vendor payout, a completion journal entry, or a manual receivable charge. Does not confer adjustments, responsibility, subsidy or reporting.', true)
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPATIBILITY. The four money routes were admin-only, so `fin.post` goes to admin
--    and to nobody else. No job title implies it.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd ON pd.key = 'fin.post'
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- Admin must also actually hold the two keys it is about to be authorized by. They have been
-- seeded for months, but a migration that enforces a key without confirming the grant is how an
-- administrator gets locked out of their own product.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd ON pd.key IN ('scheduling.write', 'ops.jobs.write')
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE DEFAULT-PACKAGE CORRECTION — class A only.
--
--    Remove the two write keys from `ops` ONLY where no audited access change has ever touched
--    that key in that organization. A row with any history is a decision someone made, and it
--    stays. This is deliberately narrower than the census that authorized it.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.role_permission_grants g
WHERE g.role_key = 'ops'
  AND g.permission_key IN ('scheduling.write', 'ops.jobs.write')
  AND NOT EXISTS (
      SELECT 1
        FROM public.mutation_events m
        JOIN public.role_definitions rd
          ON rd.id = m.subject_id AND rd.org_id = m.org_id
       WHERE m.org_id = g.org_id
         AND m.subject_type = 'role'
         AND rd.role_key = g.role_key
         AND (coalesce(m.new_state, '')      LIKE '%' || g.permission_key || '%'
           OR coalesce(m.previous_state, '') LIKE '%' || g.permission_key || '%')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — the migration proves its own compatibility claim before it lands.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
    v_cat        bigint;
    v_admin_short bigint;
    v_ops_kept   bigint;
    v_ops_finpost bigint;
    v_director   bigint;
BEGIN
    SELECT count(*) INTO v_cat FROM public.permission_definitions
     WHERE key = 'fin.post' AND group_key = 'financials' AND is_active;
    IF v_cat <> 1 THEN
        RAISE EXCEPTION 'SCHEDJOBS SELF-TEST: fin.post is not catalogued in the financials group.';
    END IF;

    -- Every active admin role holds all three keys it is now authorized by.
    SELECT count(*) INTO v_admin_short
      FROM public.role_definitions rd
     WHERE rd.role_key = 'admin' AND rd.is_active
       AND (SELECT count(DISTINCT g.permission_key) FROM public.role_permission_grants g
             WHERE g.org_id = rd.org_id AND g.role_key = 'admin' AND g.allowed
               AND g.permission_key IN ('scheduling.write', 'ops.jobs.write', 'fin.post')) <> 3;
    IF v_admin_short <> 0 THEN
        RAISE EXCEPTION 'SCHEDJOBS SELF-TEST: % admin role(s) would be locked out of routes they can reach today.', v_admin_short;
    END IF;

    -- ops receives no money-posting authority. It never had any.
    SELECT count(*) INTO v_ops_finpost FROM public.role_permission_grants
     WHERE role_key = 'ops' AND permission_key = 'fin.post';
    IF v_ops_finpost <> 0 THEN
        RAISE EXCEPTION 'SCHEDJOBS SELF-TEST: ops received fin.post, which it has never held.';
    END IF;

    -- Any ops grant that SURVIVED must be one with real audited history. If a class-A row is still
    -- here the DELETE did not do its job; if a row with history is gone, it took someone's decision.
    SELECT count(*) INTO v_ops_kept
      FROM public.role_permission_grants g
     WHERE g.role_key = 'ops'
       AND g.permission_key IN ('scheduling.write', 'ops.jobs.write')
       AND NOT EXISTS (
           SELECT 1
             FROM public.mutation_events m
             JOIN public.role_definitions rd
               ON rd.id = m.subject_id AND rd.org_id = m.org_id
            WHERE m.org_id = g.org_id
              AND m.subject_type = 'role'
              AND rd.role_key = g.role_key
              AND (coalesce(m.new_state, '')      LIKE '%' || g.permission_key || '%'
                OR coalesce(m.previous_state, '') LIKE '%' || g.permission_key || '%'));
    IF v_ops_kept <> 0 THEN
        RAISE EXCEPTION 'SCHEDJOBS SELF-TEST: % untouched seeded ops grant(s) survived the correction.', v_ops_kept;
    END IF;

    -- No job titles: the director roles gain nothing.
    SELECT count(*) INTO v_director FROM public.role_permission_grants
     WHERE role_key IN ('school_director', 'regional_lead')
       AND permission_key IN ('fin.post', 'scheduling.write', 'ops.jobs.write');
    IF v_director <> 0 THEN
        RAISE EXCEPTION 'SCHEDJOBS SELF-TEST: director roles received % key(s) they never had.', v_director;
    END IF;

    RAISE NOTICE 'SCHEDJOBS: fin.post catalogued, admin authorized for all three, ops holds no money posting, deliberate grants preserved.';
END
$selftest$;
