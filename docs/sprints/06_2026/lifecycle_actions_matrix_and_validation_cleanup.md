# Lifecycle Actions Matrix + Validation Cleanup

## Summary

Lifecycle Builder now treats **actions as lifecycle-level capabilities** with optional stage restrictions, not per-stage setup inside the guided board.

## UI

- **Stage guided board** (per stage): Required Information, Statuses, Work Unit Queue, Runtime Validation only.
- **Lifecycle Actions** (below stage configuration): matrix/table with rows for curated base actions and columns for Enabled, Display Label, placements, and optional stage restrictions.
- Copy: *Actions define what operators can do from workspace surfaces. Placements decide where actions appear. Stage restrictions are optional.*
- New lifecycles start with **no actions enabled** (no bulk preconfiguration).

## API

- `GET/PUT /api/admin/departments/[departmentId]/lifecycle-actions-matrix` — load/save matrix rows (`web/lib/lifecycle/lifecycleActionsMatrix.ts`).

## Runtime validation

- **Actions** check always passes; detail is `Optional: no actions configured yet.` when none saved, or a count when configured.
- **Queue filters**: status save (`PATCH` status-stages) syncs queue lanes via `syncDepartmentQueueForStage`. Validation auto-syncs on mismatch when possible. UI offers **Repair queue filters** for residual mismatches.

## Workspace tile description

- Lifecycle **description** on create (optional) stored on builder process and synced to `departments.description` for `/workspace` tiles (`lifecycleWorkspaceTileDescription`).

## Tests

- `web/tests/lifecycle/lifecycleActionsMatrixAndValidation.test.ts`

## Related

- Statuses helper copy removed from `LifecycleActivationStatusesStep` (guided card summary remains *Statuses included in this stage.*).
