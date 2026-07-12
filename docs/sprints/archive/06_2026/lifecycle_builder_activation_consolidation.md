# Lifecycle Builder — Activation UX Consolidation

**Date:** 2026-05-31  
**Status:** Implemented  

## Summary

The activation board is now the **primary Lifecycle Builder** on `/adminV2/settings/lifecycle`. The previous hub UI remains under **Advanced / legacy setup**.

## Workspace visibility audit (root causes)

| # | Check | Finding |
|---|--------|---------|
| 1 | Department row created? | `POST /api/admin/departments` in activation mode with `lifecycle_activation_owned_v1` |
| 2 | Active? | `is_active` defaults true on POST |
| 3 | Correct `org_id`? | Server-side from admin context |
| 4 | Owned metadata? | `lifecycle_activation_owned_v1: true` on create |
| 5 | `fetchWorkspaceActiveDepartments` filter? | Now applies **same access scope** as `GET /api/admin/departments` |
| 6 | `/workspace` data source? | `GET /api/admin/departments` + `is_active !== false` (unchanged client filter) |
| 7 | Hidden without work units? | **No** — tiles render with `0 work units` |
| 8 | Pagination? | **No** — full list rendered |
| 9 | Stale cache? | **Yes (fixed)** — `sessionStorage` workspace root cache could hydrate stale tiles; `notifyWorkspaceDepartmentsChanged` + `alloy:workspace-departments-changed` event refetch |
| 10 | View link dept id? | Validation links use activation `departmentId` |

### Fixes applied

- `GET /api/admin/departments` returns **active + access-scoped** rows (aligned with workspace).
- Validation uses `fetchWorkspaceActiveDepartments(..., dim)` — **fails** if department exists in org but not in user's workspace list (restricted scope).
- Cache bust + workspace page refetch on lifecycle create/delete.

## UX

- Header: Lifecycle name, Stage, **Add Stage**, **Delete Lifecycle** / **Delete Stage**
- Cleanup: Delete Work Unit Queue, Remove Action, Remove all statuses from stage
- Capitalized **Lifecycle** in operator copy

## Tests

`web/tests/adminV2/lifecycleBuilderActivationConsolidation.test.ts`
