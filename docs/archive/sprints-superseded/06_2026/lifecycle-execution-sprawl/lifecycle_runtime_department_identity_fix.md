# Lifecycle Builder — Single Selected Department ID Source of Truth

**Sprint:** June 2026  
**Status:** Implemented

## Problem

Catalog `department_id`, board state, repair target, validation route, and View links could reference different department UUIDs. Validation could pass for Enrollment while the created lifecycle’s dedicated department was absent from `/adminV2/workspace`.

## Solution

### `LifecycleRuntimeIdentity`

Central model in `web/lib/lifecycle/lifecycleRuntimeIdentity.ts`:

- `runtimeDepartmentId` — **only** ID for validation, workspace, View links, work units, actions, delete, repair
- `catalogDepartmentId` — catalog row’s department (may drift after repair until sync)

### Rules

1. `LifecycleBuilderPrimary` owns `identity` state; catalog selection calls `buildIdentityFromCatalogEntry`.
2. `LifecycleActivationBoard` is controlled by `identity` + `onIdentityChange` (no `initialDepartmentId` / enrollment boot scan).
3. Repair returns `runtimeDepartmentId` → `setIdentity` + catalog refresh + workspace cache bust.
4. Drift (`catalogDepartmentId !== runtimeDepartmentId`) → banner + block validation until **Use runtime department**.
5. Validation requires `runtimeDepartmentId`; View links use `workspaceDeptHref(runtimeDepartmentId)`.

## Key files

- `web/lib/lifecycle/lifecycleRuntimeIdentity.ts`
- `web/components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleRuntimeIdentityDebug.tsx`
- `web/components/adminV2/settings/lifecycle/LifecycleIdentitySyncBanner.tsx`

## Tests

`web/tests/lifecycle/lifecycleRuntimeDepartmentIdentity.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleRuntimeDepartmentIdentity.test.ts
```
