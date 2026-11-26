# Lifecycle Simulation Cleanup and Real Retest

**Sprint:** June 2026  
**Status:** Implemented

## Problem

`simulatePreFixLifecycleE2E.ts` created multiple **E2E Admissions (pre-fix sim)** departments in the normal dev org, polluting `/adminV2/workspace` with fake tiles.

## Immediate cleanup

```bash
cd web

# 1. Dry run — list simulation departments (no deletes)
SIMULATION_ORG_ID=<your-org-uuid> npx tsx scripts/cleanupLifecycleSimulationDepartments.ts

# 2. Execute cleanup
CONFIRM_SIMULATION_CLEANUP=1 SIMULATION_ORG_ID=<your-org-uuid> \
  npx tsx scripts/cleanupLifecycleSimulationDepartments.ts
```

Cleanup removes departments matching `isSimulationDepartmentRow()` in `web/lib/lifecycle/lifecycleSimulationMarkers.ts`:

- Name contains `E2E Admissions`, `pre-fix sim`, or starts with `[SIM]`
- Name starts with `Verify Lifecycle` (dev verify button, pre-fix)
- Key `e2e_admissions_*`, `verify_lifecycle_*`
- Description mentions pre-fix simulation

**Protected (never deleted):** `enrollment`, `operations`, `finance`, `compliance`, `system`

Also removes: `user_department_access`, builder-owned work units (via `deleteActivationLifecycleForDepartment`), restores opportunities on simulation work units to **enrollment_pipeline** when possible.

## Prevent recurrence

| Guard | Env var |
|--------|---------|
| Allow simulation writes | `ALLOW_SIMULATION_WRITES=1` |
| Target org | `SIMULATION_ORG_ID` (required for simulate; preferred for cleanup) |
| Name prefix | `[SIM] ` via `simulationLifecycleDisplayName()` |
| Confirm cleanup | `CONFIRM_SIMULATION_CLEANUP=1` |

`simulatePreFixLifecycleE2E.ts` **refuses to run** without `ALLOW_SIMULATION_WRITES=1` and `SIMULATION_ORG_ID`.

Dev **Create + verify** button prefixes names with `[SIM]` so they are easy to clean and visually distinct.

## Real retest (manual, UI only)

After cleanup, hard refresh `/adminV2/workspace` — no E2E / pre-fix / `[SIM]` tiles.

1. **Lifecycle Builder** → Create lifecycle named **Admissions Test** (not `[SIM]`).
2. Confirm `GET /api/admin/departments/:id/persistence-audit` shows `builder_owned_marker: true`.
3. Lifecycle appears in builder catalog.
4. Tile on `/adminV2/workspace`.
5. Department page → Work Unit Queue.
6. Work-unit page → records for selected statuses.
7. Record drawer → **Add Parent** (if configured on activation).

## Tests

`web/tests/lifecycle/lifecycleSimulationCleanup.test.ts`

```bash
cd web && npm run test -- tests/lifecycle/lifecycleSimulationCleanup.test.ts
```

## Related

- `docs/sprints/archive/06_2026/lifecycle_admin_scope_and_persistence_truth.md`
