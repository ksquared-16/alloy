# Lifecycle Builder — Promote Existing Lifecycles + Workspace Repair

**Sprint:** June 2026  
**Status:** Implemented

## Problem

- Existing lifecycles lived only under Advanced / legacy setup.
- Builder/activation lifecycles did not reliably appear on `/workspace`.

## Solution

### Primary Lifecycle Builder (`/settings/lifecycle`)

- Default surface: **Lifecycle Builder** (`LifecycleBuilderPrimary` + `LifecycleCatalogList`).
- Catalog merges **legacy** (`lifecycle_builder_v1` on shared departments) and **builder-owned** (`lifecycle_activation_owned_v1` dedicated departments).
- Each row shows: name, source, workspace runtime status, stage count, work unit count.
- Actions: select, create new, edit on board, delete (builder-owned or legacy with confirm), **Repair workspace visibility**.

### Advanced legacy editor

- Toggle label: **Advanced legacy editor** (not the only place lifecycles are listed).
- `LifecycleHubClient` remains for deep legacy JSON editing.

### Workspace visibility

| Source | Workspace tile behavior |
|--------|-------------------------|
| Legacy process on e.g. `enrollment` dept | One tile per **department**, not per process; repair may create a **dedicated** department named after the lifecycle |
| Builder-owned | Dedicated department; tile name must match lifecycle name |

**Workspace source of truth:** `GET /api/admin/departments` → `fetchWorkspaceActiveDepartments` with org + access scope. Client filters `is_active !== false` and uses session cache; bust via `notifyWorkspaceDepartmentsChanged` + `/workspace` refetch listener.

### Repair (`POST /api/admin/lifecycle-catalog/repair`)

- Ensures backing department exists, active, correct `org_id`, metadata attached.
- Builder-owned: activate/rename/sync activation metadata.
- Legacy: create or reuse dedicated department; **fails** if still missing from scoped workspace API after repair.
- Busts workspace cache from UI after success.

### Runtime validation

Checks (no overall pass unless workspace API includes the department):

- Exists in builder catalog
- Backing department exists
- Visible in `/workspace` API
- Current user access
- Workspace tile (name + cache note)
- Plus queue / records / actions checks when activation bundle exists

### Delete

- Builder-owned: `DELETE` lifecycle-activation (owned departments).
- Legacy: `POST /api/admin/lifecycle-catalog/delete` with `legacy_delete_confirm: true` after modal; demo-critical config protected in API.

## Key files

- `web/lib/lifecycle/lifecycleCatalog.ts` — catalog + `catalogValidationTruth`
- `web/lib/lifecycle/repairLifecycleWorkspaceVisibility.ts`
- `web/app/api/admin/lifecycle-catalog/*`
- `web/components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleCatalogList.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx`
- `web/lib/lifecycle/validateLifecycleActivationRuntime.ts`

## Tests

- `web/tests/lifecycle/lifecyclePromoteExistingAndWorkspaceRepair.test.ts`
- `web/tests/adminV2/lifecycleBuilderActivationConsolidation.test.ts` (catalog + advanced editor)
- `web/tests/lifecycle/lifecycleActivationRuntimeTruth.test.ts` (catalog validation truth)

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecyclePromoteExistingAndWorkspaceRepair.test.ts tests/adminV2/lifecycleBuilderActivationConsolidation.test.ts tests/lifecycle/lifecycleActivationRuntimeTruth.test.ts
```
