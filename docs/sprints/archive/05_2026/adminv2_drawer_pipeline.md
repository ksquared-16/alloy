# AdminV2 generic drawer pipeline

## Goal

One reusable drawer pipeline for AdminV2 entity drawers. Entity adapters supply data and slot values; a shared contract and render model own composition rules.

Opportunity is the first adapter. **Job (Admin V2)** is the second. Work-unit, department, and BOS are out of scope.

Sprint expansion audit: [`adminv2_drawer_pipeline_expansion.md`](./adminv2_drawer_pipeline_expansion.md).

## Doctrine

1. **Structure from shell** — `DrawerShellContract` freezes tabs, section slots, and geometry. No overview section owns above-fold layout.
2. **Values hydrate in slots** — `DrawerAboveFoldRenderModel` describes what to show; background hydrate may only update existing slot values, not reshape layout.
3. **No warnings on pending enrichment** — `DrawerEnrichmentState.background_full_failed` is set only when background `surface=full` fails after final retry. Primary omissions are not failures.
4. **Full-hydrate gates affect values, not layout** — `drawerFullBoundValuesReady` controls strip/activity value phases, not column count or panel swap.
5. **Generic renderer owns composition** — `AdminEntityDrawer` (today) reads the pipeline snapshot; entity-specific components fill slots.

See also: `docs/sprints/archive/05_2026/adminv2_shell_doctrine_preload_structure_hydrate_data_only.md`.

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
  compileShellFromSections.ts   # generic shell from sections + lifecycle map
  assemblePipelineState.ts    # enrichment + hydration + above-fold wiring
  overviewSections.ts         # overviewSectionsFromAboveFoldModel
  enrichmentState.ts
  layoutLock.ts
  sectionRenderModel.ts
  hydrationPlan.ts
  adapters/opportunity/
  adapters/job/               # Admin V2 job record drawer
  index.ts

web/components/admin/drawer/
  DrawerAboveFoldRenderer.tsx # header_signals slot (job); opportunity inquiry TBD
```

## Adding a new entity drawer adapter

1. **Sections** — Frozen `EntityDrawerSectionConfig[]` in `adapters/<entity>/sections.ts` (no runtime discovery in the host).
2. **Compile shell** — `compileDrawerShellFromSections` or entity-specific wrapper (`compileJobDrawerShell`, `opportunityShellToDrawerShellContract`).
3. **Deferred sections** — `deferredSections.ts`: keys with `below_fold_deferred` lifecycle; primary attach list for `DrawerHydrationPlan`.
4. **Above-fold slots** — Extend `DrawerAboveFoldRenderModel` only when a new above-fold region is required; prefer value-only updates on hydrate.
5. **Pipeline state** — `assembleDrawerPipelineState` + `buildXAboveFoldRenderModel`.
6. **Host wiring** — `useMemo` → pipeline; `overviewSectionsFromAboveFoldModel`; `DrawerAboveFoldRenderer` for generic slots.
7. **Tests** — `tests/adminV2/drawerPipeline/<entity>DrawerPipeline.test.ts` + doctrine tests.

### Primary vs full hydrate

| Surface | Purpose | May change layout? |
|---------|---------|-------------------|
| `drawer_visible` / bootstrap | Fast open footprint | No — skeleton values only |
| `drawer_primary` | Authoritative header + above-fold values | No |
| `full` (background) | Deferred sections, registry, relationships | **No** — values only |

Pass `background_full_failed: true` only when background `surface=full` fails after final retry.

### Child components — forbidden

- Discovering overview section order or column layout from field defs at runtime
- Swapping compact → full panel above the fold on hydrate
- Showing “record did not load” while `full_pending`
- Mounting new above-fold regions after first paint (use shell slots + `value_phase`)

### Known gaps

- Opportunity inquiry summary JSX still in `AdminEntityDrawer` (not yet a slot renderer component)
- Legacy job path still uses `configDrivenOverviewSections` ranking
- Schedule/customer adapters not started
- Server shell attach registry still opportunity-specific

## Job adapter (Admin V2)

```ts
import { buildJobDrawerPipelineState, JOB_DRAWER_V2_OVERVIEW_SECTIONS } from "@/lib/adminV2/drawerPipeline";

const pipeline = buildJobDrawerPipelineState({
  tabs: jobDrawerV2TabListResolved,
  record: overviewData,
  drawer_id: drawer.id,
  schedules: jobSchedules,
  payment_status_label,
  payment_is_paid,
  payment_failed,
  cleaning_record_modal: showJobRecordModalV2,
});

// Header: <DrawerAboveFoldRenderer model={pipeline.above_fold} />
// Sections: overviewSectionsFromAboveFoldModel(pipeline.shell, pipeline.above_fold.sections)
```

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
