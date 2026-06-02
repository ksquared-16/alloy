# Lifecycle runtime performance guardrails

**Status:** Active (mandatory for lifecycle runtime work)

## Principle

Lifecycle composes into the existing AdminV2 performance model. It does **not** replace workspace, department, or work-unit loading architecture.

## Runtime navigation (`/workspace`, `/dept`, `/work-unit`)

Must **not**:

- Auto-repair work units or reassign opportunities on page load
- Run lifecycle-wide record scans or reconciliation during navigation
- Add bootstrap queries beyond the existing operational-bootstrap contract
- Add polling, N+1 lookups, or background reconciliation

May:

- Use existing `work_units` + `queue_definition` data already loaded by bootstrap
- Apply lifecycle **status filters** in the same queue query paths as other departments
- Reuse department `work_units` ids from the dept bootstrap fetch for lifecycle scope (no second WU list query)

## Department bootstrap

- **No** `repairLifecycleWorkUnits` on `/dept` operational bootstrap
- Read-only `inspectBuilderOwnedLifecycleWorkUnitsForDept` for empty-state debug only
- Pass `departmentWorkUnitIdsForLifecycleScope` from the same `work_units` query into queue summaries

## Work unit queues

- Same summary / pagination / preview model as non-lifecycle work units
- Lifecycle status scope uses preloaded department work unit ids when provided (dept path)
- Standalone `/work-unit` without preload uses strict `work_unit_id` unless ids are preloaded (no extra dept scan)

## Settings validation

- Expensive checks allowed (operator-triggered refresh only)
- Must not change runtime navigation performance

## Record repair

- **Manual only:** `POST /api/admin/lifecycle-catalog/attach-records` and Settings **Attach matching records**
- Never automatic during navigation

## Queue zero-records diagnosis (operator / dev)

- **Script:** `cd web && npx tsx scripts/traceLifecycleQueueRecords.ts` (requires `SIMULATION_ORG_ID` or `DEV_QUEUE_ORG_ID`; optional `TRACE_DEPARTMENT_ID`, `TRACE_WORK_UNIT_ID`)
- **Dev API:** `GET /api/admin/work-units/:id/queues` includes `lifecycle_queue_debug` when `NODE_ENV=development`, lifecycle scope, and a lane count is 0

## Implementation references

| Concern | Module |
|---------|--------|
| Dept inspect (no repair) | `inspectBuilderOwnedLifecycleWorkUnitsForDept` |
| Settings repair | `repairLifecycleWorkUnits`, `attachMatchingRecordsToLifecycleWorkUnits` |
| Queue scope | `lifecycleOpportunityQueueScope.ts` + `QueueService` preload |
