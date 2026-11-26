-- OD-8 / W-15 — the grant that lets `admin/users` GET stop being authorized by admission.
--
-- **What this closes.** `GET /api/admin/users` — the operator roster — is gated on portal
-- eligibility: `admin` OR `ops`, evaluated as a role literal in application code. `W-15`'s burndown
-- converts non-capability gates to the canonical capability under `OD-7`, and this handler was the
-- one recorded exception: `settings.users_roles.read` is resolved WITHOUT requiring `portalEligible`,
-- so converting risked admitting a principal holding the key through a custom role.
--
-- The `Q15` census, executed 2026-08-19 against the deployed tenant through the governed trusted-host
-- path, answered both halves of that question:
--
--   * `C1 = 0` — NO deployed role outside `admin`/`ops` holds `settings.users_roles.read`. The
--     widening population the exception was written against is empty, so the conversion admits nobody
--     new.
--   * `B4` — `ops` is missing `settings.users_roles.read` in **2 organizations**. Converting before
--     preserving that grant would NARROW: operators who can read the roster today could not tomorrow.
--
-- Hence the sequence `OD-8` sets, and the reason this file exists: **preserve → verify → convert**,
-- never `convert → silently lock out ops`. `W-8` is this initiative's own record of what an
-- unannounced narrowing costs, and `20260819120000` is the precedent inside this branch — it granted
-- `ops` the analytics read key before `W-13` removed the `portalEligible` leg from `canReadAnalytics`.
--
-- **Why this migration exists when `20260818170000` already grants the same pair.** That migration
-- grants `admin, ops -> settings.users_roles.read` for every `role_definitions` row, and it is
-- authored and unapplied — which is why `B4` still observes the gap on the deployed tenant. So the
-- grant is not new. What is new is that a SECOND, independent gate now depends on that coverage
-- holding, and this file makes the dependency fail closed rather than inherited: it re-asserts the
-- grant idempotently, computes the exact missing population, and REFUSES to complete if any
-- organization defining `ops` is left uncovered. `20260818170000` has no such verification, so
-- "it was already granted" was an assumption this conversion must not rest on.
--
-- **Narrow by construction.** One permission key, one role key. `OD-8` explicitly does not authorize
-- `settings.users_roles` (the MUTATION capability), and the guard at the end proves this migration
-- granted nothing else rather than asking a reader to confirm it from the statement above.
--
-- Additive and idempotent. Changes no principal's effective access: every `ops` operator this grants
-- already reads the roster today through the admission leg the code change then removes.

-- ---------------------------------------------------------------------------
-- 1. Preflight: the capability must exist in the CANONICAL catalog, and be active.
--
--    `RL-7` requires every writer to validate against `permission_definitions` — the table the
--    foreign key names — rather than merely spelling the key correctly. The FK would reject a bad
--    key, but failing with a constraint error is not the same as refusing to grant a capability that
--    does not exist, and it would abort mid-migration rather than state the problem.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
    catalog_rows bigint;
    ops_orgs bigint;
    missing bigint;
BEGIN
    SELECT count(*) INTO catalog_rows
    FROM public.permission_definitions
    WHERE key = 'settings.users_roles.read' AND is_active;

    IF catalog_rows = 0 THEN
        RAISE EXCEPTION
            'OD-8 aborted: settings.users_roles.read is absent or inactive in permission_definitions. '
            'Apply 20260818170000 (which seeds the catalog row) before this migration.';
    END IF;

    -- The target role must exist somewhere, or this migration is a no-op pretending to be a
    -- preservation. An environment with no `ops` role at all is legitimate; one where the role
    -- vanished between authoring and applying is not, and only the count can tell them apart.
    SELECT count(*) INTO ops_orgs FROM public.role_definitions WHERE role_key = 'ops';

    SELECT count(*) INTO missing
    FROM public.role_definitions rd
    WHERE rd.role_key = 'ops'
      AND NOT EXISTS (
          SELECT 1 FROM public.role_permission_grants g
          WHERE g.org_id = rd.org_id
            AND g.role_key = 'ops'
            AND g.permission_key = 'settings.users_roles.read'
            AND g.allowed
      );

    -- The exact missing population, recorded in the migration output. `Q15-B4` observed 2 on the
    -- deployed tenant; this states what it is in the environment actually being migrated, because a
    -- census answers one database and this answers this one.
    RAISE NOTICE 'OD-8 preservation: % org(s) define ops, % missing settings.users_roles.read', ops_orgs, missing;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. The grant. ONE role, ONE capability, validated by join rather than by spelling.
--
--    The join against `permission_definitions` makes this a no-op on an environment where the key is
--    absent or deactivated, instead of an abort — and it makes it structurally impossible for this
--    statement to grant a key the catalog does not define.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions AS rd
JOIN public.permission_definitions AS pd
  ON pd.key = 'settings.users_roles.read'
 AND pd.is_active
WHERE rd.role_key = 'ops'
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE
SET allowed = true;

-- ---------------------------------------------------------------------------
-- 3. Fail closed, on both directions of the approval's boundary.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
    uncovered bigint;
    manage_leak bigint;
BEGIN
    -- (a) COVERAGE. After this runs, every org defining `ops` must satisfy the roster read by
    --     CAPABILITY, because the next commit stops satisfying it by admission. An org missed here
    --     loses the roster for its ops operators the moment the code lands.
    SELECT count(*) INTO uncovered
    FROM public.role_definitions rd
    WHERE rd.role_key = 'ops'
      AND NOT EXISTS (
          SELECT 1 FROM public.role_permission_grants g
          WHERE g.org_id = rd.org_id
            AND g.role_key = 'ops'
            AND g.permission_key = 'settings.users_roles.read'
            AND g.allowed
      );

    IF uncovered > 0 THEN
        RAISE EXCEPTION
            'OD-8 aborted: % org(s) define ops without settings.users_roles.read. Converting the '
            'admin/users gate would narrow their roster access.',
            uncovered;
    END IF;

    -- (b) NO WIDENING BEYOND THE APPROVAL. `OD-8` authorizes the READ key and explicitly not
    --     `settings.users_roles`, the mutation capability. This asserts the boundary as a property
    --     of the database rather than as a claim about the statement above: if `ops` holds the
    --     managing key anywhere, either this migration granted it or something else did, and both
    --     are conditions this conversion must not proceed under.
    SELECT count(*) INTO manage_leak
    FROM public.role_permission_grants g
    WHERE g.role_key = 'ops'
      AND g.permission_key = 'settings.users_roles'
      AND g.allowed;

    IF manage_leak > 0 THEN
        RAISE EXCEPTION
            'OD-8 aborted: ops holds settings.users_roles (the MANAGE capability) in % org(s). '
            'This approval covers the read capability only.',
            manage_leak;
    END IF;
END
$verify$;
