# AdminV2 generic drawer pipeline

## Goal

One reusable drawer pipeline for AdminV2 entity drawers. Entity adapters supply data and slot values; a shared contract and render model own composition rules.

Opportunity is the first adapter. Work-unit, department, and BOS drawers are out of scope until they adopt the same pattern.

## Doctrine

1. **Structure from shell** — `DrawerShellContract` freezes tabs, section slots, and geometry. No overview section owns above-fold layout.
2. **Values hydrate in slots** — `DrawerAboveFoldRenderModel` describes what to show; background hydrate may only update existing slot values, not reshape layout.
3. **No warnings on pending enrichment** — `DrawerEnrichmentState.background_full_failed` is set only when background `surface=full` fails after final retry. Primary omissions are not failures.
4. **Full-hydrate gates affect values, not layout** — `drawerFullBoundValuesReady` controls strip/activity value phases, not column count or panel swap.
5. **Generic renderer owns composition** — `AdminEntityDrawer` (today) reads the pipeline snapshot; entity-specific components fill slots.

See also: `docs/sprints/05_2026/adminv2_shell_doctrine_preload_structure_hydrate_data_only.md`.

## Pipeline types (`web/lib/adminV2/drawerPipeline/types.ts`)

| Type | Role |
|------|------|
| `DrawerShellContract` | Frozen layout: tabs, overview sections, section slots, geometry |
| `DrawerEnrichmentState` | `primary_loaded`, `full_pending`, `full_complete`, `background_full_failed` |
| `DrawerHydrationPlan` | Staged GET surfaces (`visible` / `primary` / `full`) |
| `DrawerSectionRenderModel` | Per-section lifecycle + `value_phase` |
| `DrawerAboveFoldRenderModel` | Above-fold slots (e.g. `inquiry_summary` for opportunity) |
| `DrawerPipelineState` | `{ shell, enrichment, hydration_plan, above_fold }` |

## Module layout

```
web/lib/adminV2/drawerPipeline/
  types.ts
  enrichmentState.ts      # buildDrawerEnrichmentState, warning helpers
  layoutLock.ts           # above-fold lock, below-fold / full-bound value gates
  sectionRenderModel.ts   # section lifecycle + stabilizeOverviewSectionsFromShell
  hydrationPlan.ts        # standard staged entity GET plan
  adapters/opportunity/   # first entity adapter
    compileShell.ts
    buildAboveFoldRenderModel.ts
    buildPipelineState.ts
    geometry.ts
    deferredSections.ts
  index.ts
```

## Adding a new entity drawer adapter

1. **Compile shell** — Map frozen record chrome / layout config → `DrawerShellContract` (mirror `adapters/opportunity/compileShell.ts`).
2. **Geometry reader** — Typed accessors for adapter-specific `geometry` flags (`readOpportunityDrawerGeometry`).
3. **Deferred sections** — `deferredSections.ts`: keys withheld from first paint, primary shell attach list for `DrawerHydrationPlan`.
4. **Build above-fold model** — `buildXAboveFoldRenderModel`: map shell + record + enrichment → `DrawerAboveFoldRenderModel` (no layout gates tied to `full_pending`).
5. **Build pipeline state** — `buildXDrawerPipelineState` wires enrichment, hydration plan, and above-fold model.
6. **Wire drawer host** — In `AdminEntityDrawer` (or a thin entity wrapper), `useMemo` → pipeline snapshot; overview sections via `overviewSectionsFromAboveFoldModel`; JSX reads slot fields only.
7. **Tests** — Pipeline unit tests for enrichment warnings, column stability, and section stabilization.

## Opportunity adapter (reference)

```ts
import {
  buildOpportunityDrawerPipelineState,
  opportunityShellToDrawerShellContract,
  overviewSectionsFromAboveFoldModel,
} from "@/lib/adminV2/drawerPipeline";

const shell = opportunityShellToDrawerShellContract(opportunityDrawerShellContract);
const pipeline = buildOpportunityDrawerPipelineState({
  shell,
  record: overviewData,
  drawer_id: drawer.id,
  background_full_failed: opportunityBackgroundFullHydrateFailed,
  workflow_v1: shell.layout_config_snapshot.inquiry_drawer_mode === "workflow_v1",
  above_fold_locked,
  first_paint_gates_active,
  enrichment_layout_ready,
  below_fold_enrichment_ready,
  task_assist_enabled: isTaskAssistV1UiEnabled(),
  // ...
});

const inq = pipeline.above_fold.inquiry_summary;
// inq.column_mode, inq.family_contacts, inq.task_preview, inq.what_matters
```

Legacy helpers in `opportunityDrawerLayoutStability.ts` remain for tests and bootstrap races; prefer the pipeline for new work.

## Server-side alignment

Opportunity primary fast-path still uses shell attaches listed in `OPPORTUNITY_PRIMARY_SHELL_ATTACHES` (`deferredSections.ts`). Hydration plan documents the same surfaces for client orchestration; server attach functions stay in `web/lib/admin/opportunityEntityRecord.ts` until a generic attach registry exists.

## Acceptance checklist

- [ ] Drawer opens with stable two-column inquiry summary when geometry reserves it
- [ ] No “full record did not load” during normal primary → background full
- [ ] Right column shows task preview / placeholders before full-bound strip
- [ ] `npm run test -- tests/adminV2/drawerPipeline` passes
- [ ] New entity work adds an adapter folder, not opportunity-only branches in `AdminEntityDrawer`
