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

---

## Section ownership & runtime labels (as built)

Every visible section has exactly ONE owner, stamped with a `data-runtime-label` and (for
top-level sections) a `data-alloy-section`. Full ownership audit, config sources, and loading
owners live in **`presentation-runtime-v2-handoff.md` §2**. Summary:

| Label | Owner (`web/`) | Config/data source |
| --- | --- | --- |
| `WS.HEADER` / `WS.HEADER_CALCULATIONS` | `components/presentation/workspace/WorkspaceHeader.tsx` / `WorkspaceHeaderCalculations.tsx` | published `workspace_header` surface (metric_placements) + OIP warm cache |
| `WS.PROCESS_TILE` / `WS.PROCESS_GRID` | `components/presentation/workspace/ProcessTile.tsx` / `ProcessGrid.tsx` | `OperatorLifecycleLandingCard` |
| `WS.PROCESS_TILE_WORK_VIEWS` | `components/presentation/workspace/WorkViewList.tsx` | landing `workQueues` + `useWorkViewTotals` |
| `WU.HEADER` / `WU.HEADER_CALCULATIONS` | `components/presentation/workUnit/WorkUnitHeader.tsx` / `WorkUnitHeaderCalculations.tsx` | published `work_unit_header` surface doc + OIP warm cache |
| `WU.WORK_VIEW_PILLS` | `components/presentation/workUnit/WorkViewPillStrip.tsx` | configured views + `useWorkViewTotals` (active = live rows total) |
| `WU.QUEUE` | `components/presentation/workUnit/QueueRegion.tsx` | rows API (`work_view_id`); order = Work View `sort_v1` (server) |
| `WU.QUEUE_ROW` | `components/presentation/workUnit/CondensedQueueRow.tsx` | frozen `QueueRowContext` + published Queue Row surface (`pipeline-queue-row`) for slot visibility/labels |
| `FP.SURFACE` | `components/presentation/workUnit/FocusPanelSurface.tsx` + `InlineOpportunityFocusPanel.tsx` | published Focus Panel Summary doc (composition engine) + drawer VM; modal shell suppressed on work-unit paths |
| `RR.SURFACE` | `components/presentation/rightRail/RightRailSurface.tsx` | inline anchor (hidden when empty) — the VISIBLE command rail is the shell rail below |
| `LEFT_NAV` (shell) | `app/adminV2/components/Sidebar.tsx` | `OperatorLifecycleLandingCard` (same as tiles) + `useWorkViewTotals` counts |
| `RIGHT_RAIL` (shell) | `app/adminV2/components/AdminV2PersistentCommandRail.tsx` + `workspace/WorkspaceCommandRailShell.tsx` + `CommandRailBosMount.tsx` | page-registered Actions/Telemetry + `GlobalAssistantContext` (BOS) |

Both shell rails mount in `app/adminV2/components/AdminV2Shell.tsx` ABOVE the route children →
persistent (never remounted) across `/workspace ↔ /workspace/work-unit/*` and row switches.

## Loading & reveal contract (as built)

Shell first, content fills in. No rail-level spinner or skeleton-collapse. WS/WU surfaces reveal
atomically under `model.ready` (WS = Route-VM seed; WU = `configSettled`, which includes the
published header doc + queue-row config). Metric cards, work-view count badges, and the left-nav
count use FIXED slots with stable placeholders — values fill in place, no layout jump. FP.SURFACE
pending renders the SAME published card grid with card-shaped placeholders (gated on the published
doc settling, so pending strategy == resolved strategy) — no "Preparing…" spinner, no modal, no
arrangement reflow. Full detail in `presentation-runtime-v2-handoff.md` §5–§6.

## Handoff

Session-to-session transition package (ownership audit, deletion inventory, deletion execution
plan, known risks, deferred items, recommended next task) lives in
**`presentation-runtime-v2-handoff.md`**.
