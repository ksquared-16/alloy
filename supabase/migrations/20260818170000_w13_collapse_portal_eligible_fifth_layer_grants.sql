-- W-13 / AD-22 — the grants that let the fifth authority layer be removed from application code.
--
-- `04-authentication-model.md §3.6` (A2-8) records that `portalEligible` is a FIFTH layer: authority
-- that sits between L3 (assignment) and L4 (resolved set), is stored in no table, is scoped to no org,
-- belongs to neither branch, and at two gates satisfies a capability check ON ITS OWN. The operator's
-- standing directive is "the role hierarchy is still too deep — reduce to four layers." Removing the
-- layer means those gates must read a capability instead of a role literal.
--
-- **This migration changes no one's access. It only makes explicit, as grant rows, the authority that
-- application code was already conferring implicitly via role literals.** It is therefore additive and
-- idempotent, and it MUST be applied before the code change that stops honouring the literals — that
-- ordering is the whole point. W-8 is this initiative's own record of what an unannounced narrowing
-- costs; a narrowing whose guaranteeing grants are not yet present is the same mistake with a migration
-- attached.
--
-- What the code does today, and what each row below preserves:
--
--   `canManageUsersAndRoles`  — `roleKeys.includes("admin")` returns true unconditionally, so every org
--                               `admin` manages Users & Roles whether or not a grant says so.
--                               Preserved by: admin -> settings.users_roles.
--
--   `requirePortalOrUsersRolesManageAuth` — admits any portal-eligible principal (`admin` OR `ops`) to
--                               the RBAC catalog READS. Preserved by: admin, ops -> settings.users_roles.read.
--
-- The read gate deliberately receives the WEAKER key. Granting `ops` the full `settings.users_roles`
-- would preserve its reads and simultaneously hand it the MUTATION capability it does not have today,
-- because `canManageUsersAndRoles` accepts that one key. A preservation migration that widens is not a
-- preservation migration.
--
-- `20260807170000_w12_seed_default_rbac_enumerated_grants.sql` already seeds both keys for NEW orgs via
-- `seed_default_rbac`. This migration covers orgs that already exist, and does not depend on that
-- migration having been applied: it seeds the catalog rows it needs before granting them.

-- ---------------------------------------------------------------------------
-- 1. The catalog row.
--
--    `permission_definitions` is the ONLY catalog table. W-9 consolidated the three-way catalog:
--    `permissions` and `permission_keys` survive as VIEWS, and the single surviving foreign key is
--    `role_permission_grants_permission_definitions_fkey`. RL-7 (`catalogConsolidationLock.test.ts`)
--    fails any migration after the consolidation that writes through a deprecated name — which this
--    migration originally did, having been modelled on the pre-consolidation `20260505120100`.
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_definitions (key, group_key, label, is_active)
VALUES ('settings.users_roles.read', 'settings', 'View users & roles', true)
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label     = EXCLUDED.label,
    is_active = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- 2. The grants. `role_permission_grants (org_id, role_key)` is FK'd to
--    `role_definitions (org_id, role_key)`, so a role a given org does not define is skipped rather
--    than failing the migration — an org with no `ops` role_definition simply has no `ops` row.
-- ---------------------------------------------------------------------------

-- admin -> settings.users_roles.
-- Re-asserted rather than assumed: 20260505120100 backfilled this for every org existing THEN, and
-- `seed_default_rbac` covers new orgs, but the code path being removed never depended on the row, so
-- nothing has been keeping it true in between.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'settings.users_roles', true
FROM public.role_definitions AS rd
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE
SET allowed = true;

-- admin, ops -> settings.users_roles.read (the RBAC catalog read gate).
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'settings.users_roles.read', true
FROM public.role_definitions AS rd
WHERE rd.role_key IN ('admin', 'ops')
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE
SET allowed = true;

-- `allowed = true` on conflict is deliberate and is the one place this migration can be said to change
-- state: an operator who has explicitly set `allowed = false` for one of these pairs has their setting
-- restored. That is correct here — today the role literal overrides that `false` anyway, so the row was
-- never being honoured. Making it true is what stops the collapse from being a silent narrowing for
-- exactly the principals whose grant row disagreed with the literal.
