# Needs Attention work unit (implementation)

**Doctrine:** [Exception work unit](../../../architecture/workspace-work-unit-scope-doctrine.md) · [glossary — Exception type](../../../architecture/glossary.md)

## Definition

- **Canonical code constants:** `NEEDS_ATTENTION_WORK_UNIT` in `web/lib/workspace/workUnitKinds.ts` (`key: "needs_attention"`, `kind: "exception"`).
- **Route lane:** `mode === "needs_attention"` in `useDepartmentQueueData` / `DepartmentJobsQueuePage`.
- **Visual lane key:** `needs_attention` → resolver registry entry **`needs_attention`** (strong Amber) in `contextRegistry.ts`.

## Exception types

**Single source of truth:** `web/lib/workspace/exceptionTypes.ts`

- **Type:** `NeedsAttentionExceptionType` = `overdue_visit` | `payment_issue` | `high_value_unassigned` | `ready_for_assignment`.
- **`NEEDS_ATTENTION_EXCEPTIONS`:** per key: `label`, `description`, `severity`, `matches(job, nowMs)`, `filterLogic` (human-readable; intended to align with future `queue_definition`).
- **Order:** `NEEDS_ATTENTION_EXCEPTION_ORDER` — stable UI ordering.

Predicates use **`JobRowForWorkspaceMetrics`** (`web/lib/workspace/jobMetricsRow.ts`): e.g. `_next_schedule`, `receivable_outstanding_cents`, `gross_price_cents`, `work_unit_id`, `status_key`.

## Data flow

1. **Fetch:** For `needs_attention`, client loads:
   - `GET /api/admin/jobs?department_id=<dept>&limit=200`
   - `GET /api/admin/jobs?unassigned_work_unit=true&limit=200`
2. **Merge:** `mergeJobListsById` (`deriveDepartmentJobMetrics.ts`) dedupes by job id.
3. **Filter:**
   - **No `exception` query:** `filterJobsForNeedsAttentionWorkUnit` — union of all exception predicates (one row per job).
   - **With `?exception=<type>`:** `jobMatchesExceptionType` — single lane.
4. **Render:** `buildRealWorkUnitWorkspaceModel` receives **`exceptionFocus`**; queue title uses exception **label** when set.

## URL / query

- **Path:** `/adminV2/workspace/dept/[departmentId]/needs-attention`
- **Filter:** `?exception=<NeedsAttentionExceptionType>` — parsed by `parseNeedsAttentionExceptionParam` in `DepartmentJobsQueuePage` (invalid values ignored → full union behavior).

## Summary helpers (signals)

`deriveDepartmentJobMetrics.ts` exposes helpers used for **Operations** rollups (scheduled today, needs attention, high-touch counts) on the **same enriched job sample** (≤200 rows) — pragmatic, not full analytics.

## Queue behavior

- **Cap:** 200 rows per upstream request (same as other lanes).
- **Client-side filtering** after fetch — server does not yet filter by exception type (keeps one implementation path; exception logic centralized in `exceptionTypes.ts`).

## Action system

- **Per-exception `defaultAction`:** `{ kind: "open_queue", exception }` — deep-link to the filtered queue.
- **`quickActions`:** optional links to existing admin routes (e.g. `/admin/schedules`, `/admin/system/work-units`).
- **Attention block:** `web/components/admin/workspace/blocks/AttentionBlock.tsx` — navigates via `workspaceDeptQueueHref(..., "needs-attention", { exception })`.

## Related

- `web/lib/workspace/types.ts` — `WorkspaceAttentionCategoryKey`, routing types
- `web/lib/ui-v2/adapters/realWorkUnitFromJobs.ts` — queue VM + headline for exception focus
