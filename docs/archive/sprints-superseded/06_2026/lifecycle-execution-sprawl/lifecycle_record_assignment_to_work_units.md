# Lifecycle record assignment to work units

**Sprint:** 06/2026  
**Status:** Implemented

## Problem

Lifecycle work units (`lifecycle_wu_*`) were created with correct `queue_definition` status filters, but **existing opportunities** still pointed at legacy `work_unit_id` values (e.g. `enrollment_pipeline`). Queue queries filtered on `opportunities.work_unit_id`, so `/work-unit` and `/dept` showed **0 records** despite matching `status_key`.

## Audit

`/work-unit/:id` queue load (`getWorkUnitQueueItems` / `getWorkUnitQueueSummaries` in `QueueService`) always applied:

```text
.eq("org_id", orgId)
.eq("work_unit_id", workUnitId)
```

plus `queue_definition` status filters via `applyOpsToJobQuery`.

Opportunities have **no** `department_id` column; department context is via `work_units.department_id` and optional `metadata.department_id` on create.

## Solution

### Preferred: status-derived queue visibility (no strict `work_unit_id`)

For builder-owned `lifecycle_wu_*` work units, opportunity queue base query uses:

- `org_id`
- `status_key` filters from `queue_definition` (unchanged)
- **Department scope:** `work_unit_id IS NULL` OR `work_unit_id IN (active work units on this department)`

This matches lifecycle stage/status configuration without requiring records to have been created after lifecycle setup.

Module: `web/lib/lifecycle/lifecycleOpportunityQueueScope.ts`  
Wired in: `web/lib/queues/QueueService.ts` (summaries + list items).

### Repair: attach matching records

`POST /api/admin/lifecycle-catalog/attach-records` (builder-owned only):

- Per `lifecycle_wu_*` stage: find opportunities in department scope whose `status_key` matches selected statuses and `work_unit_id` ≠ target lifecycle WU
- `UPDATE opportunities.work_unit_id` to the lifecycle WU (does **not** change `status_key`)

UI: **Attach matching records →** on Runtime validation when misassigned records are detected.

### Runtime validation

Records query uses the same department + status counting as queues:

- Reports total matching by status
- If matches exist on other work units: informational copy + repair affordance
- Zero matches: “No existing records match these statuses yet.” (pass, not fail)

### Create Lead

Unchanged path: `resolveLifecycleCreateLeadBinding` prefers `lifecycle_wu_{stage}` over legacy `enrollment_pipeline` and sets `work_unit_id` + `status_key` on insert.

## Future helper (not built)

“Create sample record matching this stage” — documented for a later sprint.

## Tests

`web/tests/lifecycle/lifecycleRecordAssignment.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleRecordAssignment.test.ts
```
