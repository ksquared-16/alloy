# Enrollment process cleanup and Lifecycle Builder UI simplification (June 2026)

## Problem

The shared `enrollment` department accumulated multiple `lifecycle_builder_v1.processes[]` entries (Enrollment, Enrollment(s), Lead Management). The Lifecycle Builder catalog showed one row per process. Delete failed because the API blocks process removal on the protected Enrollment department.

## Cleanup script

**Path:** `web/scripts/cleanupEnrollmentLifecycleProcesses.ts`  
**Logic:** `web/lib/lifecycle/cleanupEnrollmentLifecycleProcesses.ts`

### Behavior

1. Loads `departments` where `key = enrollment` for the target org.
2. Prints active processes (name, key, id, stage count).
3. **Dry run by default** — prints processes to remove and final state preview.
4. Writes only when `CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1`.
5. After write, prints final active process list.

### Org env

`ORG_ID`, `SIMULATION_ORG_ID`, or `DEV_QUEUE_ORG_ID` (first set wins).

### Commands

```bash
cd web
# Preview dedupe (remove stray duplicates, keep one Enrollment process)
ORG_ID=<uuid> npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts

# Apply dedupe
CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1 ORG_ID=<uuid> npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts

# Preview full clean slate (remove all lifecycle_builder_v1 processes on Enrollment)
CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 ORG_ID=<uuid> npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts

# Apply full clean slate (requires BOTH flags)
CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1 CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 ORG_ID=<uuid> npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts
```

### What is removed / kept

**Dedupe mode (default)**

| Action | Detail |
|--------|--------|
| **Remove** | `Enrollment(s)`, duplicate `Enrollment` processes, `Lead Management` test process |
| **Keep** | One canonical process (`key = enrollment` preferred, else best Enrollment-named process with stages) |
| **Preserve** | Enrollment department row, work units, opportunities, persons, customers |

**Full clean slate (`CLEAR_ALL_ENROLLMENT_LIFECYCLES=1`)**

| Action | Detail |
|--------|--------|
| **Remove** | All `lifecycle_builder_v1.processes[]` and `active_process_id` on Enrollment |
| **Preserve** | Department row, other metadata keys, work units, all CRM records |
| **Result** | Lifecycle Builder shows no Enrollment process until user creates a new lifecycle |

## UI changes

| Change | Detail |
|--------|--------|
| Lifecycle selector | `LifecycleCatalogSelect` — `Lifecycle: [dropdown]` + `+ New Lifecycle` |
| Stage nav | Unchanged tab rail (`LifecycleStageNav`) |
| Legacy copy | Removed from primary page, shell, board; **Advanced Configuration** only |
| Delete | Active only when `catalogEntry.can_delete` (builder-owned); protected Enrollment shows disabled button + tooltip |
| Catalog | `can_delete: false` for protected shared enrollment via `isProtectedSharedLifecycleDepartment` |

## Verification

```bash
cd web && npm run build
cd web && npm run test -- tests/lifecycle/cleanupEnrollmentLifecycleProcesses.test.ts
cd web && npm run test -- tests/adminV2/lifecycleBuilderUxConsolidation.test.ts
cd web && npm run test -- tests/adminV2/lifecycleBuilderActivationConsolidation.test.ts
```

## Catalog source (primary builder)

The dropdown is built **only** from `departments.metadata.lifecycle_builder_v1.processes[]` (active processes). There is **no** fallback to `defaultLifecycleBuilderV1()`, work units, or status stages.

If a lifecycle still appears after metadata clear, typical causes:

1. **Stale React identity** — board showed the old name while the catalog was empty (fixed: clear identity when row missing; board only mounts when a catalog row is selected).
2. **Another department** — builder-owned test department with the same display name.
3. **Metadata not empty** — enrollment row still has processes in `lifecycle_builder_v1`.

Catalog fetch uses `cache: no-store` and API `Cache-Control: no-store`.

## Follow-up

After full clear, refresh Lifecycle Builder — expect **No lifecycles yet** and **+ New Lifecycle**. Create a new lifecycle from scratch.
