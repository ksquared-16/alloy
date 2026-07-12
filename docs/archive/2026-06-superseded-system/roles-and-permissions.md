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

## Settings + Record UX Parity sprint — mutation boundaries (Card 7)

Verified **2026-05** for Cards 1–6 (field policy, drawer validation, layout integrity, action surface coherence). No permission model changes in that sprint.

| Surface | Who can mutate (server) | Scope |
|---------|-------------------------|--------|
| **Field definitions** (`/api/admin/field-definitions`) | Portal **`admin`** only (`ctx.role === "admin"`) | Org via `ctx.orgId`; **org-wide** defs — dept-restricted admins with admin role still edit all org field defs |
| **Layout integrity** | Read-only GET | Org-scoped |
| **Record PATCH** (opportunity/job) | Portal admin/ops auth + **`getAdminAccessContextCached`** | `assertExistingOpportunityMutableInAdminScope` / `assertJobInAccessScope` before field policy enforcement |
| **Action execute** | `requireAdminOrOps` + **`executeAdminAction`** | `accessScope` → `assertEntityDrawerRecordReadable` when scope restricts |
| **Drawer inline edit / registry buttons (client)** | **`canMutate`** = membership includes portal **`admin`** | UI disabled state is **not** security; server PATCH/execute gates apply |

### Ops drawer mutate — explicitly deferred

**Decision (Card 7):** Ops users may use the admin portal (`admin` + `ops` role_keys) for **read** and many **action execute** paths, but **drawer inline edit** and registry action buttons remain gated by client **`canMutate`**, which requires the portal **`admin`** role_key (`web/lib/admin/adminPortalRolePick.ts` → `hasPortalAdminMutateAccess`).

**Not in scope for the parity sprint:** Granting ops broad drawer write access. A future change should use explicit **`permission_key`** grants and scoped server checks — not `canMutate = ops`.

## Known gaps / risks

- **Needs verification:** Exhaustive list of admin routes with vs without scope enforcement (grep-driven maintenance). Settings access audit: sprint **`docs/sprints/archive/05_2026/settings_record_ux_parity_sprint.md`** Card 7; control plane **`docs/system/configuration-system.md`**.

## AI enrichment + Agent specialists (Task Assist, Orchestrator)

- **Capability keys (seeded):** Migration **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`** inserts **`ai.enrichment.use`** (default grant: org **`admin`**) and catalog-only **`ai.provider.config.manage`**, **`ai.telemetry.review`** (no default grants). Code: **`web/lib/ai/aiEnrichmentPermissions.ts`**.
- **Portal vs strict:** **`resolveAiEnrichmentPortalAccess`** gates **`POST /api/admin/ai/enrich-attention-suggestion`** and **`POST /api/admin/ai/task-assist/propose`**. When **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED=false`** (legacy), any portal **`admin` or `ops`** org role may call stub routes (aligned with **`requireAdminOrOps`** on other Task Assist APIs). When **`true`**, callers must have **`ai.enrichment.use`** in **`permissionKeys`** (union of grants for all role_keys in the org).
- **Org policy (separate from user grants):** Routes also evaluate **`org_settings.metadata.ai_policy`** (`enabled`, `provider`, `allowed_features` such as **`draft_enrichment`** or **`task_assist_draft`**). See **`docs/product/bos-foundation.md`** — *Agent permission matrix* (§ Implementation inventory).
- **Communications sends (Task Assist apply, composer, scheduled send mutations):** **`assertCommunicationsSendAllowed`** in **`web/lib/communications/communicationPermissions.ts`** — **`communications.send`** or legacy **`ops.messaging.write`**, or **`admin` / `ops`** role bypass.
- **Operational tasks (Task Assist):** **`requireAdminOrOps`** only today — no dedicated task permission key.
- **Workflow mutations:** **`requireAdmin`** on workflow CRUD routes — **not** ops-only; Workflow Assist apply must remain **admin** or a future **`workflows.manage`** key (see **`docs/product/bos-foundation.md`**).

## When this doc must be updated

New permission keys, changes to portal eligibility rules, or scope table/schema changes.
