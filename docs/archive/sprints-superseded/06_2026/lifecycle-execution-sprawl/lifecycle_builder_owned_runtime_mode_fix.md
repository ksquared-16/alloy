# Lifecycle Builder-Owned Runtime Mode Fix

**Path:** `docs/sprints/archive/06_2026/lifecycle_builder_owned_runtime_mode_fix.md`  
**Status:** Implemented

## Problem

Builder-owned lifecycles (e.g. Lead Management with Lead → New Leads, Qualification → Qualification) still rendered **legacy `enrollment_pipeline` pipeline lanes** on `/dept` (New Leads, Tours, Follow Up, Waitlist, Enrolling, Enrolled) because:

- `operational-bootstrap` always probed `enrollment_pipeline` for `pipeline_surface`
- `/dept` chose `pipeline_lanes` when that row existed
- Stage queue create often left a single `enrollment_pipeline` row with the full v2 template

## Solution

### Builder-owned runtime mode

When `departments.metadata.lifecycle_builder_owned_v1` is present (or any `lifecycle_wu_*` work unit exists):

| Surface | Behavior |
|---------|----------|
| `loadDeptOperationalBootstrap` | `pipeline_surface = null`; `work_units` list filtered to lifecycle stage rows only |
| `/dept` page | Never `pipeline_lanes`; always per–work-unit cards (`wu_summaries`) |
| Legacy `enrollment_pipeline` | Hidden from display; inactivated on repair when no opportunities bound |

### Work unit rows

`POST /api/admin/enrollment-process/stage-work-unit` on builder-owned departments:

- Creates `work_units.key = lifecycle_wu_{stage}` (e.g. `lifecycle_wu_lead`)
- `queue_definition` = single-section lane; filters only **explicitly saved** statuses (no auto `new_inquiry`)
- Metadata: `lifecycle_builder_owned_v1`, `lifecycle_stage_key`, `lifecycle_process_id`, `status_keys`, optional `lifecycle_stage_label`
- Blocks legacy `enrollment_pipeline` POST on builder-owned depts

### Repair

**Settings → More → Repair lifecycle work units**  
`POST /api/admin/lifecycle-catalog/repair-work-units`

- Ensures `lifecycle_wu_*` per builder stage
- Syncs filters from saved statuses
- Inactivates `enrollment_pipeline` when safe (zero opportunities)

### Validation

New checks:

- `dept_runtime_lifecycle_work_units` — at least one `lifecycle_wu_*` row
- `dept_no_legacy_pipeline_lanes` — legacy template lanes must not drive `/dept`

Compact validation **Work units visible** fails if either check fails.

### New stage defaults

- Statuses: `stageSavedStatusKeys(..., { explicitAssignmentsOnly: true })` when `activation_owned` — canonical org defaults do not pre-select
- Field requirements: builder-owned stages without department override show **empty** required/recommended rules until Save

### Workspace

- Lifecycle description on create → `departments.description` (existing `LifecycleCreateForm` + `lifecycleWorkspaceTileDescription`)
- Tile subline lists lifecycle work unit names when `lifecycle_wu_*` rows exist

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleBuilderOwnedRuntime.test.ts tests/lifecycle/lifecycleStageWorkUnit.test.ts
```

Manual:

1. Open builder-owned lifecycle → **Repair lifecycle work units**
2. `/dept` shows **New Leads** and **Qualification** cards only
3. Validation → Work units visible = Pass; no legacy lanes
