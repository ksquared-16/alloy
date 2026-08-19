-- W-60 / M20 — the two catalog compatibility views are retired.
--
-- `03-implementation-qa-sequence.md` §47, W-60. Phase 0 consolidated three catalog tables into one
-- (`permission_definitions`) and kept `permissions` and `permission_keys` as `security_invoker`
-- VIEWS so existing readers would not break. `01…§39` (`RM-4`) records what they are now: migration
-- residue, not a model concept.
--
-- **W-60 opened by auditing the base-table grant, not by dropping these** — §47 is explicit that
-- dropping the object carrying a contradiction is not the same as resolving it. That audit is done
-- and recorded in `tests/access/anonPrivilegeAccessControlSurface.test.ts`: the 2026-03-29 baseline
-- granted ALL on six access-control objects to `anon`, Phase 0 re-granted SELECT on these two, and
-- `20260804180000_platform_anon_privilege_revocation.sql` revoked all of it both broadly and
-- forward. The disagreement §47 describes — a `GRANT ALL` sitting under a policy scoped `TO
-- authenticated` — no longer rests on "luck of layering", and `S-13` now locks the pattern shut so a
-- future migration cannot re-open it. Only then does the drop become the right move.
--
-- **Verified before dropping, against the running database rather than from the migration text:**
--   - both objects are `relkind = 'v'` — still views, not tables that acquired data;
--   - ZERO other relations depend on them (`pg_depend` over `pg_rewrite`);
--   - ZERO product sources read them — `catalogConsolidationLock` already asserts that continuously,
--     over a discovered subject rather than a file list.
--
-- Nothing reads these. Dropping them removes the last object that can make the catalog look like it
-- has three names.

-- ---------------------------------------------------------------------------
-- 0. Fail closed if anything still depends on them.
--
--    A view or rule built on these between authoring and apply would be silently broken by the drop.
--    `DROP ... RESTRICT` would catch that too, but this names the dependent instead of failing with
--    a bare constraint message.
-- ---------------------------------------------------------------------------

DO $preflight$
DECLARE
    dependents bigint;
BEGIN
    SELECT count(*) INTO dependents
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class c ON c.oid = r.ev_class
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('permissions', 'permission_keys')
      AND c.relname NOT IN ('permissions', 'permission_keys');

    IF dependents > 0 THEN
        RAISE EXCEPTION
            'W-60/M20 aborted: % object(s) still depend on the catalog compatibility views. Repoint them at permission_definitions first.',
            dependents;
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Drop. RESTRICT, not CASCADE — if a dependent appears between the preflight and here, this must
--    fail rather than quietly delete whatever was built on top.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.permission_keys RESTRICT;
DROP VIEW IF EXISTS public.permissions RESTRICT;
