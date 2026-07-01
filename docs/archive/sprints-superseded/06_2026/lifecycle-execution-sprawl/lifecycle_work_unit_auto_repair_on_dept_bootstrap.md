# Lifecycle work unit repair (Settings) + dept inspect (runtime)

**Sprint:** 06/2026  
**Status:** Implemented (bootstrap auto-repair **removed** per performance guardrails)

## Problem

Builder-owned lifecycle departments switched off legacy `enrollment_pipeline` runtime, but many tenants still had **no `lifecycle_wu_*` rows**. `/dept` filtered to lifecycle stage work units only and showed a generic dead end:

> No configured Work Unit UI was found for this department.

## Solution

### Operational bootstrap (`loadDeptOperationalBootstrap`) — read-only

Per [lifecycle_runtime_performance_guardrails.md](./lifecycle_runtime_performance_guardrails.md), dept bootstrap **does not** repair work units on navigation.

1. After loading `work_units`, call `inspectBuilderOwnedLifecycleWorkUnitsForDept` (sync, no extra queries).
2. Return `lifecycle_work_unit_runtime` debug metadata for empty states (`repair_attempted` is always `false`).
3. Pass `departmentWorkUnitIdsForLifecycleScope` from the same `work_units` fetch into queue summaries (lifecycle status scope without a second WU list query).

### `/dept` empty states

| Condition | UI |
|-----------|-----|
| Builder-owned, no stage queue config | “No Work Unit Queues have been configured yet.” + **Configure Lifecycle** → `/adminV2/settings/lifecycle` |
| Builder-owned, config exists but still no rows | Debug panel (builder-owned, stage/config/WU counts, reason) + **Configure Lifecycle** (repair is Settings-only) |
| Non-builder-owned, no work units | Legacy generic message (unchanged) |

### Settings repair (operator-initiated)

**Repair lifecycle work units** (`POST /api/admin/lifecycle-catalog/repair-work-units`):

- Repairs only stages with saved queue config.
- Accepts `queue_names_by_stage` for all stages with explicit status saves.
- Bumps workspace/dept cache via `notifyWorkspaceDepartmentsChanged` + stage bootstrap + catalog refresh.

`autoRepairBuilderOwnedLifecycleWorkUnitsForDept` remains available for explicit server paths; it is **not** invoked from operational bootstrap.

## Key modules

- `web/lib/lifecycle/builderOwnedLifecycleRuntime.ts` — eligibility, repair, inspect, debug builder
- `web/lib/workspace/loadDeptOperationalBootstrap.ts` — inspect + lifecycle scope ids
- `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` — empty states + debug
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx` — repair button

## Tests

- `web/tests/lifecycle/lifecycleWorkUnitAutoRepair.test.ts`
- `web/tests/workspace/deptOperationalBootstrap.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleWorkUnitAutoRepair.test.ts tests/workspace/deptOperationalBootstrap.test.ts
```
