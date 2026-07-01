# AdminV2 route shell pipeline

## Goal

Apply drawer-pipeline doctrine to AdminV2 **routes**: one stable shell, then hydrate values inside fixed regions. Not a speed sprint — fixes double loading, shell reshaping, and duplicate loading ownership.

Drawer pipeline: [`adminv2_drawer_pipeline.md`](./adminv2_drawer_pipeline.md).

## Doctrine

```text
RouteShellContract
→ RouteAboveFoldRenderModel
→ RouteSectionRenderModels
→ RouteHydrationPlan
→ BackgroundEnrichment
```

**Forbidden pattern:**

```text
Next loading.tsx shell → page cold shell → client setLoading shell → final page
```

**Required pattern:**

```text
one route shell (WorkspaceChrome / WorkspaceRootShell)
→ regions hydrate in-place (queue lane, KPI strip, tiles)
```

## Audit table

| Route | Current shell owner | Loading owners | Late composition risk | Duplicate fetch risk | Proposed shell contract | Fix phase |
|-------|---------------------|----------------|----------------------|----------------------|-------------------------|-----------|
| `/adminV2/workspace` | `WorkspaceRootShell` | Page `setLoading` only (no segment loader) | Low — tile counts refine in background | Dept list + WU list + deferred growth rollup | `route_id: workspace`, tile grid reserved | **Done** — single shell, `departmentsPending` |
| `/adminV2/workspace/dept/[departmentId]` | `WorkspaceChrome` + `DepartmentWorkspaceBridgeShell` | Was segment `loading.tsx` + page blocking cold shell | Medium — throughput presentation flip | Bootstrap + queue summaries | `route_id: department`, oper region reserved | **Done** — segment loader null, in-chrome loaders |
| `/adminV2/workspace/dept/.../work-unit/[workUnitId]` | `WorkspaceChrome` + `WorkUnitWorkspace` | Was page `WorkUnitWorkspaceColdShell` swap | Medium — queue model phases | Bootstrap session + legacy fan-out | `route_id: work_unit`, queue lane reserved | **Done** — no cold-shell swap |
| Drawers (`AdminEntityDrawer`) | Drawer pipeline | Separate from routes | N/A | Entity GET surfaces | Unchanged this sprint | Out of scope |

## Module layout

```
web/lib/adminV2/routeShellPipeline/
  types.ts
  routeShellTrace.ts          # [perf.route.shell] timings
  adapters/workUnit/
    placeholderModel.ts
    buildPipelineState.ts
  index.ts
```

## Work-unit double loading — root cause

1. **Two shell trees:** Page returned `WorkUnitWorkspaceColdShell` (WorkspaceChrome + cold layout) until `workUnitShellReady`, then swapped to `WorkspaceChrome` + `WorkUnitWorkspace` — perceived as two loading screens.
2. **Bootstrap re-arm:** `setLoading(true)` when cache miss cleared identity; cache hit avoided re-arm (`seededWorkUnitShellRef`).
3. **Segment loader:** Already `return null` in `loading.tsx` (correct); issue was page-level swap, not segment.

## Fix (work-unit)

- **Single owner:** Always `WorkspaceChrome` + `WorkUnitWorkspace`.
- **Placeholder model:** `buildWorkUnitRouteShellPlaceholder` until dept/WU identity exists.
- **In-region loading:** `operLaneLoading` from `RouteAboveFoldRenderModel` (pipeline), not a second page tree.
- **Trace:** `markRouteShellVisible`, `markRouteBootstrapReturned`, `markRouteFirstAboveFoldStable`.

## Dept / workspace fixes

- **Dept `loading.tsx`:** `return null` (page owns shell).
- **Dept page:** No `DepartmentWorkspaceColdShell` early return; bridge shell + `DeptOperationalRegionLoader` while `departmentPageBlockingLoad`.
- **Workspace page:** No `WorkspaceRootColdShell` swap; `WorkspaceRootShell` with `departmentsPending` / `kpiStripPlaceholder` during fetch.

## Instrumentation

Console prefix: `[perf.route.shell]`

| Event | Meaning |
|-------|---------|
| `route_shell_visible_ms` | First shell paint |
| `bootstrap_returned_ms` | Identity/bootstrap ready |
| `first_above_fold_stable_ms` | Queue lane / above-fold useful |
| `hydration_complete_ms` | Full region hydrate (optional) |
| `duplicate_loading_owner_detected` | Same owner registered twice |
| `post_shell_fetch` | Fetch after shell visible |

## Route vs drawer

| | Drawer pipeline | Route pipeline |
|--|-----------------|----------------|
| Host | `AdminEntityDrawer` | Workspace route pages |
| Shell | `DrawerShellContract` | `RouteShellContract` |
| Above-fold | Inquiry summary, header signals | Queue lane, dept oper panels, workspace tiles |
| Hydration | Entity GET surfaces | Bootstrap / queue / KPI APIs |

## Adding a route adapter

1. Define `RouteShellContract` regions for the route.
2. `buildXRoutePipelineState` — map bootstrap phases → `RouteAboveFoldRenderModel`.
3. Page always renders one chrome component; use placeholder models / `operLaneLoading` / `departmentsPending`.
4. Register loading owner only on page (`registerRouteLoadingOwner`); segment `loading.tsx` should be `null` or a no-op bridge.
5. Tests: no nested cold shell, single `WorkspaceChrome` return path.

## Known gaps / speed sprint follow-up

- Dept/workspace pipeline state builders not yet extracted (work-unit only).
- No server-side route shell compile yet (client-only).
- Timing baselines need manual capture in browser (`[perf.route.shell]` + existing `[wu-route-perf]`).

## Acceptance

- [x] Work-unit: at most one shell transition (chrome stable)
- [x] Dept: segment loader removed; bridge shell during blocking load
- [x] Workspace: no cold-shell component swap
- [x] Route shell trace helpers
- [x] Drawer pipeline untouched
