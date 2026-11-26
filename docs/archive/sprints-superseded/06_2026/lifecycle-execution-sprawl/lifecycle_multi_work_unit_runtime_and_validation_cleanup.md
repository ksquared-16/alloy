# Lifecycle Multi Work Unit Runtime + Validation Cleanup

**Path:** `docs/sprints/archive/06_2026/lifecycle_multi_work_unit_runtime_and_validation_cleanup.md`  
**Status:** Implemented  
**Related:** `lifecycle_runtime_binding_audit.md`, `lifecycle_runtime_binding_e2e_fix.md`

## Runtime model audit (summary)

| Question | Answer |
|----------|--------|
| Multiple `work_units` per department? | **Yes** — unique on `(department_id, key)` (`uq_work_units_department_key`). |
| Is `enrollment_pipeline` hardcoded? | **Legacy contract** for shared Enrollment dept — multi-lane v2 `queue_definition`. Lifecycle builder-owned departments use **`lifecycle_wu_{stage}`** per stage instead. |
| `/dept` listing | Active rows where `work_units.department_id = route id`, `is_active = true`, sorted by `sort_order` / bootstrap API. |
| `/work-unit/:id` | Resolves by **`work_unit_id`** (UUID); filters from that row’s `queue_definition`. |
| Lifecycle unique keys? | **Yes** — `lifecycle_wu_lead`, `lifecycle_wu_qualification`, etc. |
| Why not only `enrollment_pipeline`? | One pipeline = one panel with **lanes**; two builder stages need **two rows** so `/dept` shows two cards and each queue filters only that stage’s statuses. |

## Implementation

### Per-stage work units (`web/lib/lifecycle/lifecycleStageWorkUnit.ts`)

Builder-owned departments (`metadata.lifecycle_builder_owned_v1`) create:

| Field | Value |
|-------|--------|
| `key` | `lifecycle_wu_{stage_key}` |
| `name` | Operator queue name (e.g. New Leads) |
| `queue_definition` | Single-lane v2 opportunity queue, `layout: single_section` |
| `metadata` | `lifecycle_builder_owned_v1`, `lifecycle_stage_key`, optional `status_keys` |

`POST /api/admin/enrollment-process/stage-work-unit` creates one row per stage (409 only if that stage’s key already exists). Legacy non–builder-owned flow still uses one `enrollment_pipeline` row.

### `/dept` behavior

When any `lifecycle_wu_*` exists for the department:

- **Does not** enter enrollment pipeline lane mode (no “Enrollment Pipeline” mega-panel).
- Lists each stage work unit as its own throughput card (`deptThroughputWuRows`).
- Hides legacy `enrollment_pipeline` from cards when stage work units are present.

### Workspace tile

- Description: `departments.description` from `lifecycleWorkspaceTileDescription` (process description or lifecycle name).
- Subline: `Work units: New Leads, Qualification` when lifecycle stage work units exist (from GET `/api/admin/work-units`).

### Queue empty copy

`LIFECYCLE_STAGE_QUEUE_EMPTY_COPY` — “No records match these statuses yet.” (wire in work-unit surfaces as needed).

### Runtime validation UI

Compact five-row summary by default; full server checks + IDs under **Show technical details**.

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleStageWorkUnit.test.ts tests/lifecycle/lifecycleRuntimeBinding.test.ts
```

Manual: two stages → two queues → `/workspace` names → `/dept` two cards → each `/work-unit/:id` filters by stage statuses.

## Migration note

Existing lifecycles with a single `enrollment_pipeline` row keep working until operators create per-stage queues on builder-owned departments; new creates use `lifecycle_wu_*` keys. Second stage no longer fails with “pipeline already exists.”
