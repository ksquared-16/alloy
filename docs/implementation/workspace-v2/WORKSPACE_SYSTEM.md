# Workspace system (implementation)

**Doctrine:** Org → department → work unit → record; queues are projections — see [workspace-work-unit-scope-doctrine.md](../../../architecture/workspace-work-unit-scope-doctrine.md).

## Route shape (Admin V2)

Base: **`/adminV2/workspace`**

- **Department-scoped queues:** `/adminV2/workspace/dept/[departmentId]/…`
  - **Unassigned jobs:** `…/unassigned`
  - **Today’s schedule:** `…/scheduled-today` (schedule-first data)
  - **Needs attention:** `…/needs-attention` with optional **`?exception=<type>`** (see [NEEDS_ATTENTION_WORK_UNIT.md](./NEEDS_ATTENTION_WORK_UNIT.md))

Department metadata (`name`, `key`) is loaded via **`GET /api/admin/departments`** inside `DepartmentQueueRouteShell`.

## Hierarchy roles

| Layer | Role in UI |
|-------|------------|
| **Workspace** | Shell: command center, nav into departments, KPI/signal blocks (see `web/app/adminV2/` layouts). |
| **Department** | Coordination: department name + **lanes** (secondary queues). |
| **Work unit / lane** | Execution: primary queue for the selected **mode** (`unassigned` \| `scheduled_today` \| `needs_attention`). |
| **Record** | Job (or other entity) opened in **drawer** or full admin — authoritative detail; queue row is preview only. |

## Queue modes (`DepartmentJobsQueueMode`)

Defined in `web/hooks/useDepartmentQueueData.ts`:

- **`unassigned`** — `GET /api/admin/jobs?assigned_vendor_unassigned=true&limit=200`
- **`scheduled_today`** — `GET /api/admin/schedules?scheduled_on=today&limit=200`
- **`needs_attention`** — two job list fetches merged, then client-side exception filter (see [API_CONTRACTS.md](./API_CONTRACTS.md))

## Interaction flow (simplified)

1. User picks **department** → lane URL sets **`mode`**.
2. **`useDepartmentQueueData`** loads rows (jobs and/or schedules).
3. **`buildRealWorkUnitWorkspaceModel`** (`web/lib/ui-v2/adapters/realWorkUnitFromJobs.ts`) maps rows → `WorkUnitWorkspaceModel` (signals, KPIs, primary queue, optional context block).
4. **Visual context** derived from `departmentKey` + **lane** (`mode` maps to lane keys for resolver — see [VISUAL_CONTEXT_SYSTEM.md](./VISUAL_CONTEXT_SYSTEM.md)).
5. Opening a row → navigate to job (or drawer) — record payload from **`GET /api/admin/entity/jobs/:id`** (or equivalent) is truth; queue item is not.

## Work unit kind (code)

`web/lib/workspace/workUnitKinds.ts`:

- **`NEEDS_ATTENTION_WORK_UNIT`** — `key: "needs_attention"`, `kind: "exception"`.
- Used for **routing / copy** semantics; DB `work_units` rows should align by **`key`** when present.

## Related components

- `web/components/admin/workspace/DepartmentQueueRouteShell.tsx`
- `web/components/admin/workspace/DepartmentJobsQueuePage.tsx`
- `web/lib/workspace/types.ts` — workspace navigation types, attention categories
