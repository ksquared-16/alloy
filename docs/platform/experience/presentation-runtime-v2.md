# Presentation Runtime V2

**Status:** Canonical (July 2026). Supersedes all prior Workspace / Work Unit presentation cleanup.

**Scope:** Presentation composition only. Backend, APIs, entities, queue model, calculations,
configuration, surface definitions, runtime state, Focus Panel internals, and the navigation
doctrine all stay. This replaces the View layer, not the platform.

**Product goal:** The operator operates one system, not pages. The Workspace process tile is the
collapsed state of a process; the Work Unit is its expanded state.

## The tree

```
PresentationRuntime                       (only layer that touches data)
↓
WorkspaceSurface                WS.SURFACE
 ├─ WorkspaceHeader             WS.HEADER
 ├─ OperationalAnswersRow       WS.ANSWERS
 ├─ ProcessGrid                 WS.PROCESS_GRID
 │   └─ ProcessTile             WS.PROCESS_TILE
 │       └─ WorkViewList        WS.WORK_VIEWS
↓  (soft nav: /workspace/work-unit/<slug>)
WorkUnitSurface                 WU.SURFACE
 ├─ WorkUnitHeader              WU.HEADER
 ├─ OperationalAnswersRow       WU.ANSWERS
 ├─ WorkViewPillStrip           WU.WORK_VIEWS
 ├─ QueueRegion                 WU.QUEUE
 │   └─ CondensedQueueRow       WU.QUEUE_ROW
 └─ FocusPanelSurface           FP.SURFACE   (hosts existing Focus Panel runtime)
↓
RightRailSurface                RR.SURFACE
```

That is the entire runtime. Each component owns exactly one responsibility, carries exactly one
runtime label (`data-runtime-label`), and has exactly one render site. No duplicate ownership.

## Data contract

Presentation components do not fetch. `PresentationRuntime` resolves the runtime model from the
existing (unchanged) data layer and hands resolved models down:

| Resolved model      | Source (existing, reused as-is)                                          |
| ------------------- | ------------------------------------------------------------------------ |
| current process     | LifecycleCatalog / `buildOperatorLifecycleLanding` → `OperatorLifecycleLandingCard` |
| current work view   | `workViewsConfigV1` + `resolveActiveWorkViewRuntimeContext` → `WorkViewRuntimeContext` |
| current queue       | queue API → `QueueItemsResult`; rows are the frozen `QueueRowContext` contract |
| current record      | drawer VM loaders → `OperationalContext` (Focus Panel reads once, never re-fetches) |
| current calculations| `CALCULATIONS` registry / `OperationalSurfaceModel` (OIP math, drill hrefs via DrillResolver) |

One operational answer model. One queue count model (`QueueSummary.count`). One queue row model
(`QueueRowContext`). Workspace and Work Unit consume the same runtime.

## Work Views

Both surfaces render the configured Work Views for the process — the same list, from
`work_views_v1`. No hardcoded arrays. No Enrollment-specific UI. No Pipeline-specific UI.

## Navigation

Path routing only: `/workspace` → click process → `/workspace/work-unit/<slug>` (soft nav per
`operational-navigation-contract.md`; `navigate` choreography per motion doctrine). Record deep
link is `/workspace/work-unit/<slug>/<recordId>`. No query-string routing. The dept-scoped
canonical page and the dept compat switcher are retired with the legacy tree.

## Acceptance

Workspace → click Active Pipeline → `/workspace/work-unit/active-pipeline` → header →
operational answers → horizontal work view pills → condensed queue → first row auto-opens the
Focus Panel. No dead queue page. No duplicate runtime. No layered presentation.

**Success test:** "Where is the Work Unit header rendered?" / "Where are Work Views rendered?" /
"Where are Queue Rows rendered?" / "Where does the Focus Panel open?" — each has exactly one answer.

## Cleanup rule

Only after the new presentation works: delete the old presentation tree, obsolete adapters,
obsolete tests, obsolete render paths. Two presentation runtimes never coexist past cutover.
