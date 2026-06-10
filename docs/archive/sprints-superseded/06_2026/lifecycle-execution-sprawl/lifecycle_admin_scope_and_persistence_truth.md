# Lifecycle Admin Scope and Persistence Truth

**Sprint:** June 2026  
**Status:** Implemented

## Problem

1. Portal **admin/ops** users with `user_access_profiles.department_scope=restricted` were filtered like restricted users on `GET /api/admin/departments` and workspace tiles.
2. Builder-created lifecycles sometimes existed only as **settings config** on a shared department (e.g. Enrollment) without `lifecycle_builder_owned_v1`, so DB scans showed zero builder-owned runtime departments.
3. Validation could pass on catalog/config while **runtimeDepartmentId** was missing from the workspace API.

## Product rules

### Department visibility (Option A)

Users with portal role **`admin` or `ops`** see **all active org departments** on:

- `GET /api/admin/departments`
- `/adminV2/workspace` tile list
- Lifecycle catalog workspace checks

`user_access_profiles.department_scope=restricted` still applies to **non–admin/ops** roles. `user_department_access` is provisioned for builder-owned departments when restricted users create lifecycles.

Implementation: `effectiveDepartmentScopeDimensions()` in `web/lib/admin/accessScope.ts`, applied in `loadAdminRouteGate()`.

### Canonical builder-owned marker

New departments from the primary builder use:

```json
"metadata": {
  "lifecycle_builder_owned_v1": {
    "source": "lifecycle_builder",
    "created_by": "<user_id>",
    "created_at": "<iso>",
    "process_id": "<uuid|null>"
  },
  "lifecycle_builder_v1": { ... }
}
```

Legacy flags (`lifecycle_activation_owned_v1`, `activation_owned`) are still **read** for catalog/repair/delete; new creates write only the canonical object.

Config locations:

| Data | Location |
|------|----------|
| Process + stages | `departments.metadata.lifecycle_builder_v1` |
| Activation wizard state | `departments.metadata.lifecycle_activation_v1` |
| Builder ownership | `departments.metadata.lifecycle_builder_owned_v1` |

## Debug (development)

- **Access scope:** `GET /api/admin/access-scope-debug` — shown on `/adminV2/settings/lifecycle` and `/adminV2/workspace` via `AdminAccessScopeDebugPanel`.
- **Persistence audit:** `GET /api/admin/departments/:id/persistence-audit?process_id=`
- **Dev verify:** `LifecycleDevCreateVerifyButton` — same path as UI create (`createLifecycleViaBuilderPath`).

## Validation (no fake pass)

New checks:

- **Runtime department row exists**
- **Builder-owned metadata marker**
- **Not settings-only (has runtime department)**
- Workspace API / access use **effective** scope (admin bypass) and exact `runtimeDepartmentId`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleAdminScopeAndPersistence.test.ts
```

After create in UI, confirm persistence audit in dev console and that `lifecycle_builder_owned_v1` appears on the new `departments` row.
