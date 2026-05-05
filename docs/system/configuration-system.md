# Configuration system

## Purpose

Define what **configuration** is allowed to control vs what must remain **platform-owned** logic — preventing “JSON became the codebase” failures.

## Current state

Config surfaces include (non-exhaustive):

- **Users & Roles (CRM settings)** — Tables **`user_access_profiles`**, **`user_department_access`**, **`user_site_access`** hold **data visibility** per `(user_id, org_id)` (`department_scope` / `site_scope` plus optional allow lists). **Capabilities** stay on **`user_roles`** and **`role_definitions`** / **`role_permission_grants`**. Canonical sites are **`locations`** rows with **`location_type = 'site'`**. Runtime enforcement resolves scope via **`getAdminAccessContextCached`** + helpers in **`web/lib/admin/accessScope.ts`** on entity reads, queue builders, actions, and **direct admin mutators** touching jobs, schedules, opportunities, work units, etc. (out-of-scope targets → **404**). **Admin settings UI:** **`/adminV2/settings/users-roles`** (two tabs: Users, Roles). Legacy **`/adminV2/settings/user-access`** redirects there. **APIs:** **`GET /api/admin/settings/users-roles/members`** (enriched member list for managers); **`GET` / `PATCH /api/admin/users/[userId]/access-scope`**, **`PATCH /api/admin/users/[userId]/role`**, **`POST /api/admin/users`**, **`POST /api/admin/users/[userId]/remove`**, RBAC **`/api/admin/rbac/*`** mutations — all require org **`admin`** role_key **or** permission **`settings.users_roles`** (see migration **`supabase/migrations/20260505120100_settings_users_roles_permission.sql`**). Catalog **`GET`** for **`/api/admin/rbac/roles`**, **`/permissions`**, **`/grants`** allows **portal (admin/ops)** or the same managers (so ops can read catalogs; only managers change grants). **`resolveAdminAccessDimensionsForOrgMember`** (`web/lib/admin/resolveAdminAccessCore.ts`) previews scope for a **specific org** (multi-org safe). Migration: **`supabase/migrations/20260504103000_user_access_scope_tables_v1.sql`** (triggers enforce site rows and department org match).
- **Status definitions** — per-entity allowed keys and display labels (`fetchEffectiveStatusDefinitions`, `web/lib/admin/statusDefinitionsResolve.ts`, admin APIs).
- **Queue definitions** — `work_units.queue_definition` validated as v1 (`web/lib/config/queueDefinitionSchema.ts`).
- **Record / drawer layouts** — org overrides in **`record_drawer_layouts`**, templates in **`record_layouts`** (`web/app/api/admin/record-layouts/route.ts`).
- **Person / role type** metadata for dropdowns (`web/lib/admin/personTypeSettings.ts`).
- **Queue UI** presentation hints (`web/lib/ui-v2/queueUiConfig.ts`).

## How it works

1. **Validated JSON** — queue definitions and similar pass schema validation before persistence (see `QueueService` load path, seed scripts).
2. **Effective resolution** — admin UI fetches “effective” config per org with fallbacks (e.g. status definitions, layouts).
3. **Presentation vs behavior** — config can steer labels, ordering, which keys appear, and which workflow is wired in DB — but **authorization**, monetary calculations, and cross-entity invariants must remain in server code/workflows as appropriate.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Queue schema | `web/lib/config/queueDefinitionSchema.ts` |
| Record layouts API | `web/app/api/admin/record-layouts/route.ts` |
| Status resolve | `web/lib/admin/statusDefinitionsResolve.ts` |
| Access scope (CRM) | `web/lib/admin/accessScope.ts`, `web/lib/admin/getAdminAccessContext.ts`, `web/app/api/admin/users/[userId]/access-scope/route.ts` |
| Admin entity types for statuses | `web/lib/admin/statusDefinitionsAdminEntityTypes.ts` |

## Guardrails

- **Opportunity `metadata`:** Treat it as **inquiry / enrollment context** (program interest, tour, desired start, notes, structured inquiry payloads), **not** as the canonical store for **household child identity**. Child names and DOB for queue previews must be enriched from **`customer_members`** via **`opportunities.customer_id`** (see **`docs/system/workspace-system.md`** and **`docs/system/entity-model.md`**). Do not add new features that **require** child names to live only in metadata.
- **Do not** encode one-off business rules only in config if other orgs would break — platform must validate.
- **Do not** hardcode strings/keys in UI that should be driven by status definitions or layout config when those systems already apply.
- **Do** extend schema/version when changing queue or layout shape with migration + validation.

## Known gaps / risks

- **Needs verification:** Single index of all JSON columns used as “config” in production (beyond those listed).
- Archived audits referenced hardcoded workflow debt — confirm with `docs/archive/2026-05-02-docs-reset/` if needed, but treat codebase grep as truth.

## When this doc must be updated

New config tables, new schema versions, when elevating a concern from code → config or vice versa, or when **policy for what may live in opportunity JSON metadata** changes.
