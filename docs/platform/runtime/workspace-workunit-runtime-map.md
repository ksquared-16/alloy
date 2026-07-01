# Workspace / Work Unit Runtime Map

**Status:** Canonical  
**Branch:** `feat/workspace-workunit-clean-runtime`  
**Routes:** `/workspace`, `/workspace/work-unit/[workViewSlug]`

This document is the source of truth for section ownership on the two operator-facing runtime routes. Every visible section has a stable label, an owning component, an owning model, and a test that protects it. If you add a new section, add it here first.

---

## Canonical Section Labels

### `/workspace` — `WS.*`

| Label | `data-alloy-section` | Visible Purpose | Owning Component | Owning Model | Endpoint / Data Source | Config Source | Allowed Children | Status |
|---|---|---|---|---|---|---|---|---|
| `WS.PAGE_SHELL` | `WS.PAGE_SHELL` | Full page container | `WorkspaceRootShell` | `page.tsx` state | `GET /api/admin/departments` (critical) | None | `WS.HEADER`, `WS.PROCESS_GRID`, `WS.RIGHT_RAIL` | Canonical |
| `WS.HEADER` | `WS.HEADER` | Org name + health summary | `WorkspaceCommandHeader` | KPI placements | `GET /api/admin/workspace-kpi-placements?surface=workspace` | OIP surface key | `WS.HEADER_CALCULATIONS` | Canonical |
| `WS.HEADER_CALCULATIONS` | `WS.HEADER_CALCULATIONS` | Operational metrics / KPI band | `MetricPlacementRenderer` (inside header) | OIP metric values | OIP warm cache + `GET /api/admin/workspace-kpi-placements` | `/calculations` + `/surfaces` | None | Canonical |
| `WS.PROCESS_GRID` | `WS.PROCESS_GRID` | Grid of process navigation tiles | `WorkspaceRootLifecycleGrid` | `OperatorLifecycleLandingCard[]` | `loadOperatorLifecycleLandingCards()` | Lifecycle catalog | `WS.PROCESS_TILE` | Canonical |
| `WS.PROCESS_TILE` | `WS.PROCESS_TILE` | Single process entry card | `LegacyProcessNavTile` or `EnrollmentOperationalSurfaceTile` | `OperatorLifecycleLandingCard` | (inherited from grid) | Lifecycle catalog + WU queue definition | `WS.PROCESS_TILE_WORK_VIEWS` | Canonical |
| `WS.PROCESS_TILE_WORK_VIEWS` | `WS.PROCESS_TILE_WORK_VIEWS` | List of Work View entry links inside a tile | `WorkViewEntryList` (inside tile) | `OperatorLifecycleLandingCard.workQueues` | `resolveOperatorLifecycleWorkQueueNavEntriesForDepartment()` | WU queue definition lanes / saved Work Views | None | Canonical |
| `WS.RIGHT_RAIL` | `WS.RIGHT_RAIL` | Right sidebar: quick actions | `WorkspaceRootActionsRail` | None | None | None | None | Canonical |

---

### `/workspace/work-unit/[workViewSlug]` — `WU.*`

| Label | `data-alloy-section` | Visible Purpose | Owning Component | Owning Model | Endpoint / Data Source | Config Source | Allowed Children | Status |
|---|---|---|---|---|---|---|---|---|
| `WU.PAGE_SHELL` | `WU.PAGE_SHELL` | Full work-unit surface | `WorkUnitSlugRouteHost` → `AdminV2OpportunityWorkUnitPage` | `WorkUnitWorkspaceModel` | `POST /api/admin/work-units/:id/bootstrap` | None | `WU.HEADER`, `WU.WORK_VIEW_PILLS`, `WU.QUEUE_REGION`, `WU.FOCUS_PANEL`, `WU.RIGHT_RAIL` | Canonical |
| `WU.HEADER` | `WU.HEADER` | Work unit header banner | (inside `AdminV2OpportunityWorkUnitPage`) | `WorkUnitWorkspaceModel.focusLabel` + KPIs | Bootstrap payload | None | `WU.HEADER_TITLE`, `WU.HEADER_CALCULATIONS` | Canonical |
| `WU.HEADER_TITLE` | `WU.HEADER_TITLE` | Parent process name | (inside header) | `WorkUnitWorkspaceModel.focusLabel` | Bootstrap | None | None | Canonical |
| `WU.HEADER_CALCULATIONS` | `WU.HEADER_CALCULATIONS` | Work unit KPI / metric band | `MetricPlacementRenderer` (inside header) | OIP resolved values | OIP warm cache + surface config | `/calculations` + `/surfaces` | None | Canonical |
| `WU.WORK_VIEW_PILLS` | `WU.WORK_VIEW_PILLS` | Horizontal strip of sibling Work View pills | (pill strip inside WU page) | `WorkUnitWorkspaceModel` pills / `extractPipelineExecutionLanes` | `GET /api/admin/work-units/:id/queue-summaries` | WU queue definition | `WU.ACTIVE_WORK_VIEW_PILL` | Canonical |
| `WU.ACTIVE_WORK_VIEW_PILL` | `WU.ACTIVE_WORK_VIEW_PILL` | Currently selected Work View pill | (active pill inside strip) | Active queue key — set by `initialQueueKey` from slug resolution then user click | (same as pill strip) | None | None | Canonical |
| `WU.QUEUE_REGION` | `WU.QUEUE_REGION` | Work queue rows area | (queue block inside WU page) | Queue rows | `GET /api/admin/work-units/:id/queue-rows?queue=:key` | None | `WU.CONDENSED_QUEUE_ROW` | Canonical |
| `WU.CONDENSED_QUEUE_ROW` | `WU.CONDENSED_QUEUE_ROW` | Single condensed record row | (row component inside queue block) | Queue row item | (inherited from queue region) | None | None | Canonical |
| `WU.FOCUS_PANEL` | `WU.FOCUS_PANEL` | Focus Panel / record detail drawer | `AdminDrawerContext` → drawer surface | Opportunity / record VM | `AdminDrawerContext.openDrawer()` → record bootstrap | Record layout config | None | Canonical |
| `WU.RIGHT_RAIL` | `WU.RIGHT_RAIL` | Fixed right actions rail | `actionsRail` section inside WU workspace | `WorkUnitWorkspaceModel.actionsRail` | Bootstrap | None | None | Canonical |

---

## Route Behavior (canonical)

### `/workspace`
- Lifecycle cards loaded via `loadOperatorLifecycleLandingCards()`
- Each tile's `workQueues[]` entries link to `/workspace/work-unit/[workViewSlug]` — **no `?queue=` params, no legacy dept URLs**
- Default entry href = first queue with key `new_leads`, else `workQueues[0]`

### `/workspace/work-unit/[workViewSlug]`
- Server: `loadWorkUnitSlugRouteMetaServer(slug)` → `WorkUnitSlugRouteCacheEntry` `{ workUnitId, workUnitKey, departmentId, initialQueueKey }`
- Client: `WorkUnitSlugRouteHost` seeds cache, mounts `AdminV2OpportunityWorkUnitPage` with `WorkUnitSlugRouteProvider`
- `AdminV2OpportunityWorkUnitPage` reads `initialQueueKey` from `WorkUnitSlugRouteContext` to set the active queue on first render
- Pill click updates `?queue=` URL param in-page (no full navigation)
- Row click → `AdminDrawerContext.openDrawer()` → Focus Panel opens in-page

### Slug resolution priority (`resolveWorkUnitByRouteSlug`):
1. Direct work unit key match (e.g., `enrollment-pipeline` → `enrollment_pipeline` WU)
2. Pipeline queue lane match (e.g., `new-leads` → `new_leads` lane in `enrollment_pipeline` WU, `initialQueueKey: "new_leads"`)
3. Lifecycle stage work unit for queue lane

### `fetchWorkUnitsForSlugResolution` strategy 2 (lifecycle):
- Always includes `enrollment_pipeline` WU alongside stage WUs when stage keys are found
- Ensures `findQueueLaneOwner` can prefer the pipeline aggregate over per-stage WUs

---

## What is deleted / redirected

| Old path | Action | Target |
|---|---|---|
| `/workspace/dept/[deptId]/work-unit/[wuId]` | Redirect | `/workspace` |
| `?queue=...&work_view=...` params from Workspace nav | Eliminated | Work View slug URL instead |
| `resolveDeptPipelineExecSurface` raw layout guard | Deleted | `extractPipelineExecutionLanes` handles normalization |
| `resolveDeptPipelineExecSurfaceServer` raw layout guard | Deleted | Same |

---

## State Ownership

| State | Owner | How set | How cleared |
|---|---|---|---|
| Active Work View / queue key | `AdminV2OpportunityWorkUnitPage` URL state (`?queue=`) | `initialQueueKey` on mount; user pill click | Route change |
| Pill counts | `GET /api/admin/work-units/:id/queue-summaries` | After bootstrap; re-fetched on `OPPORTUNITY_QUEUE_UPDATED_EVENT` | Route change |
| Queue rows | `GET /api/admin/work-units/:id/queue-rows?queue=:key` | After active queue is set; re-fetched on pill change | Route change |
| Focus Panel record | `AdminDrawerContext` | Row click → `openDrawer()`; deep-link from URL `/:workViewSlug/:recordId` | Drawer close |
| Focus Panel default on pill switch | `AdminDrawerContext` | Defaults to first row in new queue when switching Work Views | User close |
| Work View slug → WU identity | `WorkUnitSlugRouteCache` | Server `loadWorkUnitSlugRouteMetaServer` → `initialRouteMeta` | TTL / slug change |

---

## Duplicate / Deprecated Section Rules

- **One owner per label.** If two components render the same `data-alloy-section`, the second is a bug. Tests assert uniqueness within a rendered tree.
- **Compatibility wrappers** must set `data-alloy-compat="true"` on the duplicate and document why in this file.
- **Deprecated sections** must set `data-alloy-deprecated="true"` and have a migration path documented here.

Currently deprecated: none.  
Currently compatibility-wrapped: none.

---

## Tests That Protect These Sections

| Test file | What it covers |
|---|---|
| `tests/workspace/workspaceRuntimeSections.test.ts` | Asserts canonical sections render; asserts no deprecated sections render |
| `tests/lib/admin/resolveWorkUnitByRouteSlug.test.ts` | Slug resolution — new-leads, active-pipeline, enrollment-pipeline direct key |
| `tests/workspace/extractPipelineExecutionLanes.test.ts` | Lane extraction — v1, v2 domain, sibling pill strip |
| `tests/lib/adminV2/buildWorkspaceNavDeptChildren.test.ts` | Nav children hrefs, active slug matching, queueKey priority |
