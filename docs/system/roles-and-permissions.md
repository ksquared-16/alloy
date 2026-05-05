# Roles and permissions (V1)

## Purpose

Separate **capability** (what actions a user may perform) from **data visibility** (which departments and sites they see) — as implemented in `web/` for the admin API.

## Current state

- **Org membership:** `user_roles` stores `(user_id, org_id, role)` where `role` is a **`role_definitions.role_key`** (and legacy rows may still exist during migrations).
- **Capabilities (permission union):** `role_permission_grants` — for all `role_key` values the user holds in the org, **`allowed = true`** grants are unioned into **`permissionKeys`** (see `fetchPermissionKeys` in `web/lib/admin/resolveAdminAccessCore.ts`). Feature code should check **`permissionKeys`** (or dedicated helpers) rather than string-matching arbitrary role labels.
- **Portal shell eligibility:** Users need at least one of **`admin`** or **`ops`** role_keys in the org to pass **`portalEligible`** and use **`getAdminContextCached`** admin surfaces (`PORTAL_ROLES` in `resolveAdminAccessCore.ts`). This is a **small fixed** gate for the admin shell, not per-route business RBAC.
- **Data scope (visibility):** `user_access_profiles` — per `(user_id, org_id)`, **`department_scope`** and **`site_scope`** are `all` or `restricted`. When `restricted`, allow lists live in **`user_department_access`** and **`user_site_access`** (site rows reference **`locations`** with **`location_type = 'site'`**). Missing profile ⇒ both scopes default to **`all`** (legacy transition).
- **Enforcement:** Routes that participate in CRM/workspace scoping load **`getAdminAccessContextCached`**, derive **`scopeDimensionsFromAccess`**, and apply **`web/lib/admin/accessScope.ts`** helpers (e.g. `resolveRecordScopeConstraints`, `assertExistingOpportunityMutableInAdminScope`). Restricted users typically get **empty lists** or **404** on out-of-scope single records (deny-by-default).

## How it works

1. Request hits admin API → `getAdminContextCached` (org + portal) and often **`getAdminAccessContextCached`** (roles + permissionKeys + scope dimensions).
2. List/query routes filter by `org_id` ∩ department work units ∩ site locations when scope is restricted.
3. Mutations re-check scope on the target row before update.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Access core | `web/lib/admin/resolveAdminAccessCore.ts` |
| Request-scoped context | `web/lib/admin/getAdminAccessContext.ts` |
| Scope helpers | `web/lib/admin/accessScope.ts` |
| User access API | `web/app/api/admin/users/[userId]/access-scope/route.ts` |
| Schema | `supabase/migrations/20260504103000_user_access_scope_tables_v1.sql` (and related) |

## Guardrails

- **Role = capability; scope = visibility** — do not use role keys alone to infer department/site visibility; read **`user_access_profiles`** + junction tables.
- **Prefer permission grants** for new gates; avoid adding new **`if (role === 'manager')`** branches in APIs when a **`permission_key`** can express the rule. The **only** small fixed role-key list in core access resolution is **`PORTAL_ROLES`** (**`admin`** / **`ops`**) for **portal shell** eligibility — not a substitute for **`permissionKeys`** on features.
- **Do not** assume every admin route is scoped yet — new routes must opt in to **`getAdminAccessContextCached`** (see **`docs/execution/roadmap-and-gaps.md`**).

## Known gaps / risks

- **Needs verification:** Exhaustive list of admin routes with vs without scope enforcement (grep-driven maintenance).

## When this doc must be updated

New permission keys, changes to portal eligibility rules, or scope table/schema changes.
