-- W-61 / M21 — deleting a role must not silently delete the authority it held.
--
-- `03-implementation-qa-sequence.md` §47, W-61 item 3. `role_permission_grants` carries TWO
-- foreign keys over the same column pair, to the same target, and both are ON DELETE CASCADE:
--
--   role_permission_grants_role_definitions_fkey  (org_id, role_key) -> role_definitions  CASCADE
--   role_permission_grants_role_fk                (org_id, role_key) -> role_definitions  CASCADE
--
-- (`20260329165048_remote_schema.sql:6513,6518` — verified against the baseline this pass.)
--
-- So deleting one `role_definitions` row deletes every grant that role held, silently, with no
-- record that authority was destroyed. The operator sees a role disappear; they do not see the
-- permission set disappear with it, and nothing can reconstruct what it was.
--
-- **This is the exact hazard Phase 0 fixed on the NEIGHBOURING column and left on this one.** Its
-- own comment records that the legacy `permission_key` pair "disagreed: one RESTRICT, one CASCADE —
-- meaning deleting a catalog key could silently delete grants", and it replaced that pair with a
-- single `ON DELETE RESTRICT` (`20260729120000_...sql:133-140`). This migration applies the same
-- correction to `role_key`: collapse the duplicate pair to ONE constraint, and make it RESTRICT.
--
-- **Why RESTRICT is safe here, established from source rather than assumed.** Nothing deletes a
-- role definition today:
--   - no product source does — locked by `tests/access/roleKeyIntegrityAndGrantReplacement.test.ts`
--     ("no product source deletes a role_definitions row"), which carries a positive control;
--   - no migration does — `DELETE FROM role_definitions` appears nowhere under supabase/migrations;
--   - retirement is a SOFT operation: `PATCH /api/admin/rbac/roles/[role_key]` sets `is_active`,
--     and `role_definitions` rows are seeded per org by Phase 0's trigger and backfill.
-- RESTRICT therefore changes no working path. It converts a silent success into a stated error for
-- an operation the product does not perform, which is what makes it a safe narrowing rather than
-- the unannounced kind W-8 is this initiative's own record of.
--
-- **Additive and replay-safe.** Every statement is guarded, so a clean replay or disaster-recovery
-- restore reaches the same state. That is deliberate: the Phase 0 migration was NOT idempotent and
-- its re-run failed on exactly this shape — an unguarded constraint ADD (see
-- `docs/handoffs/access-roles-v2-migration-reconciliation.md` §4.2).
--
-- NOT APPLIED BY THIS COMMIT. Authored only. The apply channel is OD-1 and remains the operator's.

-- ---------------------------------------------------------------------------
-- 1. Fail closed before touching a constraint: no grant may be orphaned.
--
--    Both existing FKs already guarantee this, so a non-zero count here means the schema is not
--    what this migration was written against and the collapse must not proceed silently.
-- ---------------------------------------------------------------------------

DO $preflight$
DECLARE
    orphaned bigint;
BEGIN
    SELECT count(*) INTO orphaned
    FROM public.role_permission_grants AS g
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.role_definitions AS rd
        WHERE rd.org_id = g.org_id
          AND rd.role_key = g.role_key
    );

    IF orphaned > 0 THEN
        RAISE EXCEPTION
            'W-61/M21 aborted: % role_permission_grants row(s) reference a role_definitions row that does not exist. Re-adding the foreign key would fail; resolve the orphans first.',
            orphaned;
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. Collapse the duplicate pair to one constraint, ON DELETE RESTRICT.
--
--    Dropped by name and IF EXISTS so the statement is replay-safe: on a second run the pair is
--    already gone and the canonical constraint is re-created identically.
-- ---------------------------------------------------------------------------

ALTER TABLE public.role_permission_grants
    DROP CONSTRAINT IF EXISTS role_permission_grants_role_fk;

ALTER TABLE public.role_permission_grants
    DROP CONSTRAINT IF EXISTS role_permission_grants_role_definitions_fkey;

ALTER TABLE public.role_permission_grants
    ADD CONSTRAINT role_permission_grants_role_definitions_fkey
    FOREIGN KEY (org_id, role_key)
    REFERENCES public.role_definitions (org_id, role_key)
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT role_permission_grants_role_definitions_fkey ON public.role_permission_grants IS
    'W-61/M21: the ONE foreign key from a grant to its role. ON DELETE RESTRICT — deleting a role that still holds grants is refused, not cascaded, so authority is never destroyed without a record. Retire a role with is_active = false instead.';
