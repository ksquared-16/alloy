# Workspace system

## Purpose

Document **Admin V2 workspace**: departments, work units, queues, and how operators navigate work — without confusing queue UI data for canonical records.

## Current state

- Routes under **`web/app/adminV2/`** compose the shell (`AdminV2Shell.tsx`) with workspace navigation and embedded perf overlay.
- **Departments** and **work units** model organizational scope; work units may carry **`queue_definition`** (validated v1 JSON) driving lane behavior.
- **`QueueService`** (`web/lib/queues/QueueService.ts`) interprets queue definitions, applies org timezone bounds, status definitions, filters/sorts allowlists, and returns summaries + item lists for opportunities/jobs/etc.
- **`AdminV2PerfOverlay`** (`web/components/admin/AdminV2PerfOverlay.tsx`) exposes client perf markers (`window.__alloyPerf` per `web/lib/perf/alloyPerfGlobal.ts`).
- Hooks such as **`useDepartmentQueueData`** fetch schedules and related lists for department views.

## How it works

- Workspace registry / links: **`web/lib/workspace/registry.ts`** (e.g. schedule metrics, paths).
- Work unit types and queue derivation helpers: **`web/lib/workspace/types.ts`**, **`web/lib/workspace/workUnitQueueDerived.ts`**.
- Queue UI config: **`web/lib/ui-v2/queueUiConfig.ts`**.
- API routes for workspace/department KPIs and queue operations are spread across **`web/app/api/admin/...`** (e.g. departments, schedules).

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Admin V2 shell | `web/app/adminV2/components/AdminV2Shell.tsx` |
| Perf overlay | `web/components/admin/AdminV2PerfOverlay.tsx`, `web/lib/perf/alloyPerfGlobal.ts` |
| Queue service | `web/lib/queues/QueueService.ts` |
| Queue definition schema | `web/lib/config/queueDefinitionSchema.ts` |
| Workspace types | `web/lib/workspace/types.ts` |
| Department page example | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` |

## Guardrails

- **Queues = preview:** Sorting/filtering is allowlisted in `QueueService`; fields not in previews may still exist on the entity — load entity GET when needed.
- **Do not** bypass org scope when listing work units or queue items (service uses admin client — callers must enforce org context).

## Known gaps / risks

- **Needs verification:** Full map of all workspace API routes vs UI entry points for each vertical.
- **Needs verification:** Attendance/staffing depth (may be thin or vertical-specific — see `product/scheduling.md`).

## When this doc must be updated

When `queue_definition` schema version changes, department routing changes, or perf overlay contract.
