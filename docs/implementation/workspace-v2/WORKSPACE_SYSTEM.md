# Workspace system (implementation)

**Doctrine:** Org → department → work unit → record; queues are projections — see [workspace-work-unit-scope-doctrine.md](../../../architecture/workspace-work-unit-scope-doctrine.md).

## Route shape (Admin V2)

Base: **`/adminV2/workspace`**

- **Department-scoped queues:** `/adminV2/workspace/dept/[departmentId]/…`
  - **Unassigned jobs:** `…/unassigned`
  - **Today’s schedule:** `…/scheduled-today` (schedule-first data)
  - **Needs attention:** `…/needs-attention` with optional **`?exception=<type>`** (see [NEEDS_ATTENTION_WORK_UNIT.md](./NEEDS_ATTENTION_WORK_UNIT.md))

Department metadata (`name`, `key`) is loaded via **`GET /api/admin/departments`** inside `DepartmentQueueRouteShell`.

## Workspace shell layout (Admin V2 — current)

Admin V2 uses a **shared `WorkspaceShellLayout` pattern** for **org**, **department**, and **work-unit** workspace surfaces (`web/components/admin/workspace/WorkspaceShellLayout.tsx`), mounted from the **`adminV2/workspace`** segment. This is the **current implemented standard**, not immutable final UX; see **`docs/architecture/workspace-work-unit-scope-doctrine.md`** (Presentation shell §). Shell changes **must not** imply queue API or resolver contract changes unless delivered explicitly in backend work.

Behavior in summary:

| Behavior | Intended shape |
|----------|----------------|
| **Main content** | **Primary scroll surface** — the main operational column owns vertical scrolling; avoid rival nested scrolls for throughput content. |
| **Command / action rail** | On desktop widths, contextual commands/actions sit in a **sticky** rail beside primary content; on **smaller screens** the rail **stacks** in normal document flow (not a cramped pinned column). |
| **Empty rail** | **collapses entirely** — no persistent “No configured actions” **dead panel** or placeholder tombstone purely to preserve layout. |
| **KPI strip** | **Compact orientation strip**, ~**4–5** headline metrics visible by default; configurability direction in **`docs/specs/workspace-kpi-doctrine.md`**. |
| **Ambient / background** | Near-white neutral ground with low-contrast texture — supports **operational** clarity, not decoration (see VISUAL_CONTEXT + architecture doctrine § visual system). |

**Presentation-only:** swapping shell layout/CSS does **not** redefine `queue_definition`, action catalogs, resolver payloads, or APIs.

## Queue row preview standard (`ui.row_preview`)

Queue rows use **config-selected, code-registered templates** — **not** free-form page-builder layouts.

**Supabase / `work_units.queue_definition`** (QueueDefinition v1) controls:

- **`ui.row_preview.variant`** — selects which **registered** renderer applies (`crm_compact`, `basic`, …).
- **`ui.row_preview.fields`** — gates which semantic slots the mapper fills (identity, status, contact, program, timing, notes, …).
- **`ui.row_preview.actions`** — selects which inline quick actions appear (e.g. open / call / email), merged with resolver-backed registry actions where wired.

**Code owns** approved templates (layout zones, CSS, stacking rules): e.g. **`CrmCompactQueuePreview`** + **`QueueBlock`** (`web/app/adminV2/components/workspace/blocks/QueueBlock.tsx`), `workspace.css`, and `getQueueUiConfig()` (`web/lib/ui-v2/queueUiConfig.ts`). There must be **no vertical-only JSX path** — tenants opt in **only** via stored `variant` + `fields` + `actions` on the work unit definition.

**Triage doctrine:** Queue preview supports **throughput and next step** in lane context. **Drawer / full record** remains **authoritative** for definitive state and edits.

**Enrollment pipeline example:** Definitions in Supabase migrations and `web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts` use `crm_compact` with fields such as `title`, `status`, `primary_contact`, `phone`, `email`, `child_name`, `program`, `desired_start_date`, `tour_date` and actions `open`, `call`, `email` — illustrative of production shape once applied per org.

## Count consistency standard

For **operator-facing** queue / work-unit / department counts presented as **authoritative** (pills, badges, headline totals for a named bucket):

- Use **exact count semantics** (e.g. **`count_mode=exact`** via `QueueService` / matching API usage) unless the UX **explicitly** labels a figure as approximate.
- **`count_mode=planned`** (PostgreSQL planner estimates) may exist for perf-sensitive **non-operator** callers — **do not** use planned counts for authoritative pills/KPI-style readouts where users reconcile against the drill-in list.
- **Consistency:** For the **same scope** after refresh, org / dept / work-unit surfaces should **not** show contradictory counts; prefer **defer / “…” / omission** over a confidently wrong integer.
- **Performance:** Batch or amortize counts where needed; inaccurate “fast” numbers are **not** acceptable for operational trust on those surfaces.

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

- `web/components/admin/workspace/WorkspaceShellLayout.tsx` — **shared workspace shell** (scroll surface, collapsible sticky rail mount)
- `web/components/admin/workspace/DepartmentQueueRouteShell.tsx`
- `web/components/admin/workspace/DepartmentJobsQueuePage.tsx`
- `web/lib/workspace/types.ts` — workspace navigation types, attention categories
