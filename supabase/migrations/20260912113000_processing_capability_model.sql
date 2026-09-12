-- PROCESSING STOPS BEING "WHOEVER IS CALLED admin" — AND STARTS ASKING AT ALL.
--
-- This cluster arrived with two opposite problems, and a migration that only fixed one of them
-- would have left the product less safe than it looks.
--
-- Twelve Processing and POS handlers authorized on the literal `admin` role key, and one shared
-- helper — `operatorRouteContext` — on `admin` OR `ops` for seven identity routes. That is
-- job-title authority: an organization could not let someone work an identity queue without also
-- calling them an administrator or an operations user.
--
-- Beside those gates sat real Processing mutations that asked NOTHING beyond portal admission:
-- classifying a case, persisting operator decisions, running a detection pass, previewing and
-- COMMITTING a related-record proposal. Anyone who could reach the admin shell could commit them.
-- Gating those is an intentional security tightening and is called out as such — it is not
-- compatibility preservation, and describing it that way would hide a real behaviour change.
--
-- ── WHY FOUR KEYS AND NOT ONE ──
--
-- `processing.operate` is the ordinary work, and `ops` already had it through the operator context,
-- so `ops` keeps it. Everything else in this cluster is something `ops` could NOT do, which is
-- precisely why each gets its own key: folding any of them into `operate` would hand `ops` an
-- authority it has never held.
--
--   `processing.archive`            — taking a case out of the queue. admin-only today.
--   `processing.documents.manage`   — renaming a source document, and DELETING one along with the
--                                     Processing case it opened and the stored file.
--   `processing.dev_cleanup`        — the test-data reset.
--
-- ── WHY NOT REUSE documents.write ──
--
-- It was the obvious reuse for the two document operations and it is the one this migration
-- deliberately refuses. `documents.write` is granted to `ops` in every organization that has an ops
-- role. Reusing it would have handed `ops` a destructive delete — document, Processing case, stored
-- file — that it cannot reach today. A general Documents authority must not silently become a
-- Processing one, so the narrow key exists for exactly that reason.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──
--
-- No `processing.read`. The ordinary Processing GETs — the queue, a case, a recommendation,
-- discovery decisions — are open to any admitted portal member today, and adding a read capability
-- would REMOVE access people currently have. That is a separate product decision.
--
-- No job titles. `school_director` and `regional_lead` gain nothing.
--
-- No environment policy. `processing.dev_cleanup` is a capability, never a licence: the route and
-- the planner both already refuse in production through `assertProcessingDevCleanupAllowed`, and
-- that refusal is independent of any grant made here. An administrator in production is still
-- refused.

DO $guard$
BEGIN
    IF to_regclass('public.permission_definitions') IS NULL THEN
        RAISE EXCEPTION 'PROCESSING ABORT: public.permission_definitions is absent.';
    END IF;
    IF to_regclass('public.role_permission_grants') IS NULL THEN
        RAISE EXCEPTION 'PROCESSING ABORT: public.role_permission_grants is absent.';
    END IF;
    IF to_regclass('public.role_definitions') IS NULL THEN
        RAISE EXCEPTION 'PROCESSING ABORT: public.role_definitions is absent.';
    END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CAPABILITIES.
--
-- Each final segment — `operate`, `archive`, `manage`, `dev_cleanup` — becomes its own row in the
-- role editor rather than folding into a shared read/write radio. There is no implication between
-- these keys, and one operator gesture must not hand out a second, stronger authority by accident.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES
    ('processing.operate', 'processing', 'Work processing cases',
     'Advance a case: classify it, resolve identity, record decisions and commit proposed records.', true),
    ('processing.archive', 'processing', 'Archive processing cases',
     'Take a processing case out of the work queue.', true),
    ('processing.documents.manage', 'processing', 'Manage source documents',
     'Rename a source document, or delete an unused one along with the case it opened and its file.', true),
    ('processing.dev_cleanup', 'processing', 'Reset processing test data',
     'Run the processing test-data reset. Refused in production whoever holds it.', true)
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPATIBILITY GRANTS — preserve exactly what each role could already do.
--
-- Selected FROM `permission_definitions`, which is both the validation the catalog FK requires and
-- the reason this cannot grant a key that does not exist. `ON CONFLICT DO NOTHING` makes it
-- idempotent AND preserves organization customization: a row an administrator has already edited —
-- including one deliberately set to `allowed = false` — is left exactly as they left it.
-- ─────────────────────────────────────────────────────────────────────────────

-- `admin` could reach every one of these operations, so it receives all four.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key IN ('processing.operate', 'processing.archive', 'processing.documents.manage', 'processing.dev_cleanup')
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- `ops` was admitted by the operator context — and by nothing else in this cluster — so it receives
-- exactly `processing.operate`. Archive, destructive document management and the test-data reset
-- were all beyond it before this migration and remain beyond it after.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key = 'processing.operate'
WHERE rd.role_key = 'ops'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — the migration proves its own compatibility claim before it lands.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
    v_catalog      bigint;
    v_admin_short  bigint;
    v_ops_wide     bigint;
    v_ops_operate  bigint;
    v_director     bigint;
BEGIN
    SELECT count(*) INTO v_catalog
      FROM public.permission_definitions
     WHERE key IN ('processing.operate', 'processing.archive',
                   'processing.documents.manage', 'processing.dev_cleanup')
       AND group_key = 'processing' AND is_active;
    IF v_catalog <> 4 THEN
        RAISE EXCEPTION 'PROCESSING SELF-TEST: expected 4 active processing keys, found %.', v_catalog;
    END IF;

    -- Every active admin role holds all four.
    SELECT count(*) INTO v_admin_short
      FROM public.role_definitions rd
     WHERE rd.role_key = 'admin' AND rd.is_active
       AND (SELECT count(DISTINCT g.permission_key)
              FROM public.role_permission_grants g
             WHERE g.org_id = rd.org_id AND g.role_key = 'admin'
               AND g.permission_key IN ('processing.operate', 'processing.archive',
                                        'processing.documents.manage', 'processing.dev_cleanup')) <> 4;
    IF v_admin_short <> 0 THEN
        RAISE EXCEPTION 'PROCESSING SELF-TEST: % admin role(s) did not receive all four keys.', v_admin_short;
    END IF;

    -- `ops` must not have been widened past the one authority it already had.
    SELECT count(*) INTO v_ops_wide
      FROM public.role_permission_grants g
     WHERE g.role_key = 'ops'
       AND g.permission_key IN ('processing.archive', 'processing.documents.manage', 'processing.dev_cleanup');
    IF v_ops_wide <> 0 THEN
        RAISE EXCEPTION 'PROCESSING SELF-TEST: ops received % key(s) it never had.', v_ops_wide;
    END IF;

    -- And it must not have been narrowed out of the one it did.
    SELECT count(*) INTO v_ops_operate
      FROM public.role_definitions rd
     WHERE rd.role_key = 'ops' AND rd.is_active
       AND NOT EXISTS (SELECT 1 FROM public.role_permission_grants g
                        WHERE g.org_id = rd.org_id AND g.role_key = 'ops'
                          AND g.permission_key = 'processing.operate');
    IF v_ops_operate <> 0 THEN
        RAISE EXCEPTION 'PROCESSING SELF-TEST: % ops role(s) lost processing.operate.', v_ops_operate;
    END IF;

    -- No job titles: the director roles gain nothing.
    SELECT count(*) INTO v_director
      FROM public.role_permission_grants g
     WHERE g.role_key IN ('school_director', 'regional_lead')
       AND g.permission_key LIKE 'processing.%';
    IF v_director <> 0 THEN
        RAISE EXCEPTION 'PROCESSING SELF-TEST: director roles received % processing key(s).', v_director;
    END IF;
END
$selftest$;
