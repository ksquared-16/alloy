# Admin V2 — workspace migration slice 1 (real data, cleaning org)

**Status:** Implementation spec (staging-first). **Goal:** Define how the **real** workspace system already proven under `/admin/workspace` becomes the **first product slice** inside **`/adminV2`** — same backend, same resolver, same block registry — with **Admin V2 shell + visual language** as the outer frame. **Not** a mock rebuild, **not** a second config model, **not** a parallel resolver.

**Related:** [V2 workspace slice 1 (cleaning)](./v2-workspace-slice-1-cleaning.md) · [V2 workspace visual bridge](./v2-workspace-visual-bridge.md) · [Track A execution](./track-a-execution-plan.md) · [Track A batch 1](./track-a-batch-1.md)  
**Doctrine:** [Architecture README](../architecture/README.md) · [Workspace / work unit scope](../architecture/workspace-work-unit-scope-doctrine.md) · [RRS spec](../architecture/record-rendering-system-spec.md) · [Overview layout doctrine](../architecture/overview-layout-doctrine.md)

---

## 1. Reuse map (as-is vs adapted vs new)

### 1.1 Reuse exactly as-is

| Asset | Location / contract |
|--------|---------------------|
| **Department rows** | `GET /api/admin/departments` — real `departments` table per org |
| **Work unit rows** | `GET /api/admin/work-units?department_id=` — real `work_units` table |
| **Unassigned jobs queue** | `GET /api/admin/jobs?unassigned_work_unit=true` — existing list + enrichments |
| **Job entity (resolver)** | `GET /api/admin/entity/jobs/:id?surface=drawer|overview|full` — RRS v0 + flat payload |
| **Record overview layouts** | `record_overview_layouts` + cleaning org seed / effective row — no duplicate table |
| **Workspace layout config** | `web/lib/workspace/types.ts`, `registry.ts`, `partitionBlocks.ts` — **single registry**; `/adminV2` reads the same `getDepartmentWorkspaceLayout(department.key)` |
| **Org / auth context** | Existing `getAdminContext` / admin session — same tenant as `/admin` |
| **Seeded hierarchy (staging)** | Operations + `unassigned_jobs` work unit migration (cleaning org) — same rows |

### 1.2 Reuse with adaptation (same code paths, different mount)

| Piece | Today | In /adminV2 slice 1 |
|--------|--------|----------------------|
| **WorkspaceRenderer** | Used from `/admin/workspace/dept/[id]` with `presentation="department_bridge"` | **Import and call the same renderer** (or a thin wrapper that only sets shell-specific props). Do **not** fork a second renderer. |
| **Production workspace blocks** | `SignalsBlock`, `QueueBlock`, `KpiBlock`, `ActionsBlock`, `ContextBlock` with `presentation="bridge"` | Same components; optionally add **adminV2-only layout wrapper** (see below) that applies ambient + padding. |
| **Department / work unit pages** | `app/admin/workspace/**` | **New routes** under `app/adminV2/workspace/**` that duplicate **page-level data fetching** only (small pages), then delegate to shared components. |
| **Drawer open** | `AdminDrawerProvider` + `openDrawer({ type: "jobs", id, jobRecordSurface: "drawer" })` lives under `AdminLayout` | **Adaptation:** either (a) mount `AdminDrawerProvider` + `AdminEntityDrawer` inside `AdminV2Shell` for workspace routes, or (b) use a **shared root layout** pattern once safe. Hybrid is acceptable for slice 1. |
| **Breadcrumbs** | `WorkspaceChrome` (`variant="bridge"`) | Replace or supplement with **Admin V2** `BreadcrumbBar` / top bar patterns where the shell already defines hierarchy — **presentation only**. |
| **Work unit queue table** | `unassigned/page.tsx` — table + links | Same fetch + row handler; **restyle** with Admin V2 queue list classes (same approach as department bridge: optional nested `data-ws-surface` + shared `workspace.css`). |

### 1.3 New / adminV2-only (presentation & routing)

| Piece | Purpose |
|--------|---------|
| **`app/adminV2/workspace/**` routes** | Canonical URLs for slice 1 under V2 shell (see §2). |
| **`AdminV2Shell` workspace branch** | Already applies ambient + sidebar + `AICommandBar` for `pathname.startsWith("/adminV2/workspace")` — **extend** to host real workspace children instead of demo-only. |
| **Optional `AdminV2WorkspaceLayout`** | Thin layout segment that wraps children with providers needed for drawer (if not lifted). |
| **Visual zone composition** | Department: already specified in [visual bridge](./v2-workspace-visual-bridge.md) — `DepartmentWorkspaceBridgeShell` + `workspace.css`. Work unit: mirror `WorkUnitWorkspace` geometry when restyling unassigned queue. |
| **Nav entry** | Link from Admin V2 sidebar to `/adminV2/workspace` (or dept deep link) — **no new data**. |

**Crystal rule:** **No** `adminV2_workspace_layouts` table and **no** parallel JSON schema for “which blocks show” in this slice. Layout = **`DepartmentWorkspaceLayout` from code registry** (future: same shape from DB, one pipe).

---

## 2. Route strategy

### 2.1 Recommended first routes (slice 1)

| Route | Role |
|--------|------|
| **`/adminV2/workspace`** | Entry: resolve default department (same logic as `/admin/workspace` — `GET /api/admin/departments`, `is_default` ?? first). `replace` to dept route. |
| **`/adminV2/workspace/dept/[departmentId]`** | Operations (or any dept): **real** `WorkspaceRenderer` + bridge shell; same block registry key as today. |
| **`/adminV2/workspace/dept/[departmentId]/unassigned`** | Unassigned jobs queue: **real** jobs list; row action → open job drawer (see §4.3). |

Optional later (same slice if trivial): slug alias **`/adminV2/workspace/dept/[departmentId]/wu/unassigned_jobs`** keyed off `work_units.key` — **not required** if `unassigned` path is the agreed bridge.

### 2.2 Coexistence with `/admin/workspace`

| Phase | `/admin/workspace` | `/adminV2/workspace` |
|--------|---------------------|------------------------|
| **Slice 1 (staging)** | **Keep** as proven fallback and for operators who bookmark it. | **Primary “product direction”** URL for new work; linked from Admin V2 nav. |
| **Short term** | Both call the **same** APIs, registry, and (ideally) **same** renderer components. | No duplicate business logic in route files beyond fetch + pass props. |
| **Cleanup** | After V2 slice is validated: redirect `/admin/workspace/*` → `/adminV2/workspace/*` **or** keep workspace only under V2 — **product decision**; doc should be updated once chosen. |

### 2.3 Record open behavior (from queue)

1. User clicks row → **`openDrawer({ type: "jobs", id, jobRecordSurface: "drawer" })`** (same as `/admin/workspace/.../unassigned`).
2. **`AdminEntityDrawer`** loads **`/api/admin/entity/jobs/:id?surface=drawer`**.
3. **Full record:** link continues to **`/admin/jobs/[id]`** (existing V1 page) until full record is intentionally moved under `/adminV2`.
4. **RRS overview tab** in drawer unchanged — still driven by **`surface=overview`** fetch + `record_overview_layouts`.

Drawer **must** be reachable from `/adminV2` routes — this is the main **integration** task for slice 1.

---

## 3. Data / config bridge (non-negotiables)

Direct statements for implementers and reviewers:

1. **Departments and work units** are **read from production APIs / tables** — no mock departments in slice 1.
2. **Queue rows** for Unassigned jobs come **only** from **`GET /api/admin/jobs?unassigned_work_unit=true`** (bridge param until queue interpreter is authoritative).
3. **Resolver output** and **overview bands** come from **existing** RRS + **`record_overview_layouts`** — no V2-only layout table.
4. **Which blocks appear on the department surface** is determined by **`getDepartmentWorkspaceLayout(department.key)`** in **`web/lib/workspace/registry.ts`** — `/adminV2` **imports that function**; it does not define a second registry.
5. **Signals metrics** (e.g. unassigned count) remain **derived from the same fetches** as today (e.g. jobs list `total` or dedicated query) — no fake KPI service.
6. **Styling** may differ between `/admin` and `/adminV2`; **data and config sources may not fork** for slice 1.

---

## 4. First slice composition (cleaning org)

### 4.1 Department — Operations in /adminV2

| Aspect | Choice |
|--------|--------|
| **Identity** | Department name from API; briefing headline from real `title` (same as current dept page). |
| **Blocks** | Same order as registry `operations`: signals → queue → kpi → actions → context. |
| **Dominant** | **Queue** block in **throughput lane** (Unassigned Jobs entry + deferred work units). |
| **Visual zones** | Per [visual bridge](./v2-workspace-visual-bridge.md): control deck (brief + signals + KPI), operational row (throughput), context lower, **command rail** (actions). |
| **Shell** | `AdminV2Shell` (ambient + sidebar) wrapping **`DepartmentWorkspaceBridgeShell`** + **`WorkspaceRenderer`** `presentation="department_bridge"`. |

### 4.2 Work unit — Unassigned Jobs in /adminV2

| Aspect | Choice |
|--------|--------|
| **Data** | Same job rows as `app/admin/workspace/dept/[id]/unassigned/page.tsx`. |
| **Columns** | Keep practical columns: label, customer, status, created — all from API payload. |
| **Actions** | Row: **Open drawer**; optional **Full record** link to `/admin/jobs/[id]`. |
| **Rail / secondary** | Minimal: e.g. link back to department, link to V1 Jobs list if useful — **registry-driven later**; slice 1 can hardcode one or two links in page only if not yet in block config. |
| **Visual** | Target **`WorkUnitWorkspace`-like** hierarchy (see visual bridge §3); reuse `workspace.css` queue list patterns (same nested `work_unit` surface trick if needed for CSS selectors). |

### 4.3 Record opening

| Step | Behavior |
|------|----------|
| **From queue** | `openDrawer` with **`jobRecordSurface: "drawer"`** so `_rrs` matches triage density. |
| **Hybrid** | **Acceptable:** drawer stays **`AdminEntityDrawer`** (V1 component) **mounted under V2 layout** for slice 1 — no full drawer redesign required. |
| **Overview** | **RRS overview** tab → `GET ...?surface=overview` — unchanged. |
| **Full** | **`/admin/jobs/[id]`** until a deliberate `/adminV2` record route exists. |

---

## 5. Implementation order (staged)

1. **Shell mount** — Ensure `/adminV2/workspace/**` uses `AdminV2Shell` workspace branch; add sidebar link “Workspace” (or “Operations”) pointing at `/adminV2/workspace`.
2. **Providers** — Add **`AdminDrawerProvider` + `AdminEntityDrawer`** (and any required auth/label providers already on `AdminLayout`) to the **minimal subtree** that needs them (layout segment under `adminV2/workspace` preferred over global adminV2).
3. **Department route** — `app/adminV2/workspace/dept/[departmentId]/page.tsx`: copy **fetch pattern** from `app/admin/workspace/dept/[departmentId]/page.tsx`; render **`WorkspaceRenderer`** with `department_bridge` + same `bridgeBriefTitle` props.
4. **Workspace index** — `app/adminV2/workspace/page.tsx`: same default-department redirect as `/admin/workspace`.
5. **Work unit route** — `app/adminV2/workspace/dept/[departmentId]/unassigned/page.tsx`: move **logic** from existing unassigned page into a **shared hook or component** (`useDepartmentWorkspaceData`, `UnassignedJobsQueue`) to avoid drift; page files stay thin.
6. **Queue presentation** — Apply Admin V2 queue styling to unassigned table (second visual bridge pass).
7. **Drawer integration** — Verify `openDrawer` from V2 routes; fix z-index / portal if shell overlaps drawer.
8. **Coexistence** — Document both URLs in README/changelog; optional banner “Preview: also available under /admin/workspace” — product call.

---

## 6. Deferred (explicitly not slice 1)

- Full migration of **all** `/admin/**` pages into `/adminV2`.
- **All** work units with dedicated routes and `queue_definition`-only queues.
- **Childcare / insurance** workspace layouts.
- **AI** briefing, AI KPI strip, AI command execution tied to real workspace actions.
- **Generalized queue interpreter** endpoint replacing `unassigned_work_unit=true` bridge.
- **Full job record page** redesign under `/adminV2`.
- **Complete** drawer visual redesign (hybrid with `AdminEntityDrawer` is OK).
- **DB-backed** workspace layout editor / `department_workspace_layouts` migration.
- **Company canvas** and **System map** as required entry to workspace (can remain separate demos).
- **Per-user work unit membership** (`work_unit_members`) and scoped queues.

---

## 7. Definition of done

Slice 1 is **done** when all of the following are true on **staging** (cleaning org):

1. **`/adminV2/workspace`** resolves to a **real** department and **`/adminV2/workspace/dept/:id`** shows **registry-driven** blocks with **live** signals + queue entry + KPI placeholder + actions + context — **no mock department model**.
2. **`/adminV2/workspace/dept/:id/unassigned`** lists **real** jobs from **`GET /api/admin/jobs?unassigned_work_unit=true`**.
3. **Opening a job** from that queue uses the **existing** resolver-backed entity route with **`surface=drawer`** and the user can reach **RRS overview** and **full** job page as today.
4. **No second source of truth** for workspace block layout: changes to `web/lib/workspace/registry.ts` affect **both** `/admin/workspace` and `/adminV2/workspace` (until one route is retired).
5. **Visual**: department view uses **Admin V2 shell** (ambient, sidebar) + **bridge shell** geometry; not a flat card stack on the primary surface.

At that point we can say: **this slice is real product shell + real backend**, not the `/adminV2/workspace` demo registry.

---

## Appendix — key code pointers

| Concern | Path |
|---------|------|
| Block types + layout | `web/lib/workspace/types.ts`, `registry.ts`, `partitionBlocks.ts` |
| Zoned renderer | `web/components/admin/workspace/WorkspaceRenderer.tsx`, `DepartmentWorkspaceBridgeShell.tsx` |
| Production dept page (reference) | `web/app/admin/workspace/dept/[departmentId]/page.tsx` |
| Unassigned queue page (reference) | `web/app/admin/workspace/dept/[departmentId]/unassigned/page.tsx` |
| Admin V2 shell | `web/app/adminV2/components/AdminV2Shell.tsx`, `layout.tsx` |
| Drawer | `web/contexts/AdminDrawerContext.tsx`, `web/components/admin/AdminEntityDrawer.tsx` |
| Resolver API | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Visual bridge spec | [v2-workspace-visual-bridge.md](./v2-workspace-visual-bridge.md) |
