# Lifecycle Runtime Binding E2E Fix

**Path:** `docs/sprints/06_2026/lifecycle_runtime_binding_e2e_fix.md`  
**Status:** Implemented  
**Related audit:** `lifecycle_runtime_binding_audit.md`

## Problem

Lifecycle Builder saved config, but workspace runtime showed the legacy **Enrollment Pipeline** label, and work-unit queues returned **zero rows** because opportunities were not bound to the lifecycle department pipeline or status filters did not match Create Lead.

## Fixes

### Work unit creation (`POST …/stage-work-unit`)

- Default `work_units.name` is the **primary lane label** for the stage (e.g. lead → **New Leads**), not `"Enrollment pipeline"`.
- Still uses `work_units.key = enrollment_pipeline` (platform contract).

### Queue filters (`syncDepartmentQueueForStage`, status PATCH, manual sync)

- Lead stage lane filters include selected status keys **plus** `new_inquiry` so platform **Create Lead** rows match the same lane as builder-selected statuses.

### Create Lead (`executeCreateLeadAction`)

- When `department_id` is set, resolves `work_unit_id` from the department’s `enrollment_pipeline` row.
- Uses first activation `status_keys[0]` for that lifecycle when present.

### Activation board

- Saves `work_unit_id` / `work_unit_name` to activation immediately after queue create (snapshot callback).
- After status save, PATCHes queue `sync_statuses` when a work unit already exists.
- Default queue name in the work unit card from stage lane label.

### Runtime validation

- Falls back to department `enrollment_pipeline` work unit when activation pointer missing.
- Record count scoped to **`work_unit_id`** (same as QueueService).
- Filter expectation uses the same expanded status keys as queue sync for lead stage.

## Verification

- `web/tests/lifecycle/lifecycleRuntimeBinding.test.ts`
- Manual: create lifecycle → save statuses → create queue → `/workspace` tile → `/dept` panel title → Create Lead → `/work-unit` lane count
