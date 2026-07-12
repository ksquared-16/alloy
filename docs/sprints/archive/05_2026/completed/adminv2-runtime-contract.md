# AdminV2 runtime contract

## Purpose

AdminV2 UI must not **assemble after open**. Loading, skeletons, and layout shifts must be **composer-owned**, not section-owned. This doc defines the platform contract; implementation lives under `web/lib/adminV2/runtime/contract/`.

## Principles

1. **Composer decides reveal** — drawer sections and route lanes register contracts; they do not invent independent loading gates.
2. **Above-fold = ready or reserved** — missing data may not resize the drawer after first paint.
3. **Queues** — cached rows, settled empty, or error only; never row skeleton as the visible settled lane.
4. **Tabs** — header/actions independent of active tab for inquiry workflow drawers; workflow tabs pre-mount when surface is ready.

## Drawer section contract

Each section registers:

| Field | Meaning |
|-------|---------|
| `sectionKey` | Stable identifier |
| `surface` | `opportunity` \| `parent` \| `child` \| `generic` |
| `canRenderFromSeed` | Typed snapshot may paint without full hydrate |
| `blocksFirstPaint` | Included in coordinated above-fold gate |
| `reservedLayout` | `minHeightClass` (+ optional `reserveVariant`) for final geometry |
| `belowFoldLazy` | May mount after reveal (enrichment) |
| `hasRenderableData` / `renderReady` | Record predicates |
| `fallbackMode` | `hidden` \| `reserved` \| `skeleton-inside-reserved-box` \| `block-drawer-reveal` |

**Registry:** `web/lib/adminV2/runtime/contract/registry/*`

**Validation:** `validateDrawerSectionRegistry` — fails `above_fold_missing_reserve` when an above-fold section blocks reveal without reserve or seed path.

## Drawer composer

`composeAdminV2DrawerRuntime(input)` returns:

- `canRevealDrawerFrame`
- `canRevealHeaderActions`
- `canRevealActiveTab`
- `sectionsToRender` / `sectionsReserved` / `sectionsBlocking`
- `backgroundHydrateNeeded`

**Consumer:** `AdminEntityDrawer.tsx` uses the plan for inquiry opportunity overview reveal and person child/parent pending gates.

## Route / queue contract

Re-exports and extends:

- `workUnitPageContentReady` — full-page gate until first lane settles; no warm bypass exposing row skeleton.
- `resolveWorkUnitQueueLaneRevealState` — `hidden_until_settled` \| `ready_with_cache` \| `ready_with_rows` \| `ready_empty` \| `ready_error`
- `adminV2QueueMayShowRowSkeleton` — always `false` for settled display

Work-unit page maps `hidden_until_settled` → `queue_lane.state = held` and `rowsHeld` on the queue model.

## Tabs contract

- `adminV2DrawerHeaderActionsTabIndependent` — inquiry workflow: actions not tied to active tab.
- `adminV2DrawerTabsPremountWhenSurfaceReady` — workflow tabs mounted when drawer surface is ready (`opportunityDrawerTabSession.ts`).

## Adding a new drawer section

1. Add entry to the correct registry file with `reservedLayout` or `canRenderFromSeed` + `renderReady`.
2. Run `web/tests/adminV2/runtime/adminV2RuntimeContract.test.ts`.
3. Wire UI to render/reserve via existing components (e.g. `PersonDrawerSectionCoordinatedReserve`) — do not add a new full-body skeleton branch without updating the registry.

## Tests

Permanent contract tests: `web/tests/adminV2/runtime/adminV2RuntimeContract.test.ts`

Regression companions: `web/tests/adminV2/workUnitCoordinatedRevealRegression.test.ts`, `web/tests/admin/drawer/drawerCoordinatedFirstPaintRegression.test.ts`

## Related

- `docs/archive/2026-06-superseded-system/record-system.md` — record/drawer truth boundary
- `docs/archive/2026-06-superseded-system/workspace-system.md` — queue preview vs authoritative records
- `docs/sprints/archive/05_2026/completed/adminv2_performance_closeout.md` — historical reveal-gate work
