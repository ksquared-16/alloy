# Workspace Visibility — Department Access Scope Fix

**Sprint:** June 2026  
**Status:** Implemented

## Root cause

`GET /api/admin/departments` (and `/adminV2/workspace`) filters by **`getAdminAccessContext`**:

- `department_scope = all` → all active org departments
- `department_scope = restricted` → only `user_department_access` rows for `(user_id, org_id)`

Builder-owned lifecycle departments were created in `departments` but **no `user_department_access` row** was inserted for restricted users, so the API correctly omitted them from the workspace tile list.

## Fix

`ensureLifecycleDepartmentWorkspaceAccess({ orgId, departmentId, currentUserId })`:

- No-op when `department_scope = all`
- Inserts `user_department_access` when `department_scope = restricted` and row missing
- Does **not** change global permissions or scope mode

Called from:

- `POST /api/admin/departments` when metadata is activation-owned
- `repairLifecycleWorkspaceVisibility` (with refreshed scope dimensions before API verify)

## Validation

New check: **Workspace access/membership provisioned** — passes only when `user_department_access` exists (restricted) or scope is `all`.

`Visible in /workspace API` now requires both API list membership **and** access provisioned.

## Tests

`web/tests/lifecycle/lifecycleWorkspaceDepartmentAccess.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleWorkspaceDepartmentAccess.test.ts
```

After deploy: create or **Repair workspace visibility** on a lifecycle, then refresh `/adminV2/workspace` — tile should appear for restricted-scope users.
