# Runtime Convergence — Execution Plan

**Path:** `docs/platform_convergence/runtime_convergence_execution_plan.md`  
**Date:** 2026-06-07  
**Status:** Implementation roadmap — engineering handoff  
**Goal:** Move Alloy from multiple presentation systems to a **single layout-driven runtime**

**Frozen inputs (do not redesign):**

| Document | Role |
|----------|------|
| [`layout_contract_v1.md`](./layout_contract_v1.md) | Layout runtime contract: doc shape, surfaces, item kinds, widget keys, resolver order, readiness semantics |
| [`runtime_convergence_inventory.md`](./runtime_convergence_inventory.md) | As-built inventory of every parallel presentation system |

**Governing doctrine (must not regress during implementation):**

- [`docs/system/adminv2-runtime-performance-doctrine.md`](../system/adminv2-runtime-performance-doctrine.md) — composed reveal, known-empty, queue lane hold, stale guards
- [`docs/system/drawer-view-model-runtime-contract.md`](../system/drawer-view-model-runtime-contract.md) — VM first-paint settlement rules
- [`docs/system/work-unit-surface-context-contract.md`](../system/work-unit-surface-context-contract.md) — `QueueRowContext` / `WorkUnitSurfaceContext` consumption model
- [`docs/sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md) §7 — builder → queue → context → drawer → layout integration
- [`docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md`](../sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md) — lifecycle subject grain; no enrollment branching in layout JSON

---

## Out of scope (explicit)

| Item | Reason |
|------|--------|
| Navigation / sidebar cutover | Not runtime presentation |
| Legacy `/admin` → `/adminV2` route migration | Admin cutover sprint |
| Seed reset / demo tenant rebuild | [`seed_world_v1.md`](./seed_world_v1.md) is separate |
| VM query optimization / payload slimming | Backend performance phase |
| Department workspace block registry (`workspace/registry.ts`) | Workspace surface not in Layout V1 contract (`drawer \| queue` only) |
| List table column migration | Follows drawer convergence; not blocking queue/drawer runtime |

---

## Convergence target (single runtime)

Production surfaces resolve presentation through one path:

```
resolveLayout(org, entity, surface, context?)
    → published entity_layouts doc (or bridged record_drawer_layouts / registry fallback)
    → LayoutRuntimeRenderer (drawer | queue)
    → item renderer (field | field_group | related_list)
    → widget registry (widget_placeholder)
    → readiness derived from layout section plan + VM/queue payload (replaces parallel reveal registries)
```

**Drawer surfaces** resolve primarily by `entity_type + surface`, with profile/variant discriminators (e.g. person parent vs child).

**Queue surfaces** resolve by `entity_type + surface` **plus contextual discriminators** — not one layout per lifecycle. A single lifecycle (e.g. enrollment) may publish **multiple queue row layout variants** (pipeline case rows, child-grain touring rows, candidate-grain waitlist rows). All variants render through the same layout runtime and Layout Contract V1 blocks; no parallel waitlist presentation stack.

Parallel systems retire **entity-by-entity** after parity is proven. Layer 0 (`entityPresentation.ts`) remains the terminal fallback until the last entity publishes a layout doc.

---

## Phase dependency graph

```
Phase 0 — Layout runtime consumption (foundation)
    │
    ├──► Phase 1 — Widget convergence (registry + renderer)
    │         │
    │         ├──► Phase 2 — Reveal contract convergence
    │         │         │
    │         │         ├──► Phase 3 — Opportunity drawer convergence
    │         │         │         │
    │         │         │         └──► Phase 4 — Opportunity queue convergence
    │         │         │
    │         │         ├──► Phase 5 — Person drawer convergence
    │         │         │         │
    │         │         │         └──► Phase 6 — Child drawer convergence
    │         │         │
    │         └─────────┴──► Phase 7 — Legacy presentation removal
    │
    └──► (Phase 0 record-layout V1 bridge runs in parallel with Phase 3–6)
```

Phases 3–6 may overlap once Phase 0 + 1 + 2 gates pass. Phase 7 is continuous cleanup per entity, with a final Layer 0 retirement gate.

---

## Phase 0 — Layout runtime consumption

### Objective

Wire the existing Layout V2 foundation into **production render paths** behind an org-scoped adoption flag. Establish parity tests proving `resolveLayout()` output renders equivalently to today's presentation for seeded entities.

### Scope

- Production layout resolver invocation at drawer/queue open (read path only initially)
- Queue resolver accepts layout context discriminators (`lifecycle_key`, `stage_key`, `work_unit_key`, `queue_type`, `grain`) — implementation completes in Phase 4; Phase 0 defines the contract shape only
- Production renderer extracted from proof components (`LayoutRecordView`, `LayoutPreviewRenderer`)
- Record layout V1 → LayoutDoc bridge for opportunity workflow and person runtime variants
- Org adoption flag separate from preview flag (`LAYOUT_V2_PREVIEW_ENABLED`)
- Golden parity suite: registry fallback vs published doc vs bridged record layout

### Affected files

| Area | Files |
|------|-------|
| Resolver | `web/lib/layout/layoutResolver.ts`, `web/lib/layout/entityLayoutsRepo.ts`, `web/lib/layout/featureFlag.ts` (new runtime flag) |
| Bridge | `web/lib/layout/migrateFromRegistry.ts`, new `web/lib/layout/bridgeRecordLayoutV1.ts` (record_drawer_layouts → LayoutDoc) |
| Production renderer | new `web/lib/layout/runtime/LayoutRuntimeRenderer.tsx`, `web/lib/layout/runtime/renderFieldItem.tsx`, `web/lib/layout/runtime/renderSection.tsx`; refactor from `web/components/layout/LayoutRecordView.tsx` |
| Field values | `web/lib/layout/resolveItemValue.ts`, `web/lib/admin/fieldValues.ts`, `web/lib/admin/typedFieldValues.ts` |
| Drawer entry (shadow mode) | `web/components/admin/AdminEntityDrawer.tsx`, `web/components/admin/vmDrawer/*` (parallel render compare, not cutover) |
| Queue entry (shadow mode) | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` (feature branch render) |
| APIs | `web/app/api/admin/entity-layouts/route.ts`, new `web/app/api/admin/entity-layouts/effective/route.ts` |
| Tests | `web/tests/layout/layoutV2.test.ts`, new `web/tests/layout/runtimeParity.test.ts`, new `web/tests/layout/recordLayoutV1Bridge.test.ts` |
| Docs | Update `web/lib/layout/layoutV2.ts` header when runtime adoption begins |

### Risks

| Risk | Mitigation |
|------|------------|
| Extra drawer-open fetch for `entity_layouts` | Read whole doc once; cache per `(org_id, entity_type, surface)` with publish-version invalidation; colocate with existing bootstrap |
| Parity drift between proof renderer and production renderer | Single renderer module shared by proof + runtime; golden snapshots per entity |
| Record layout V1 bridge incomplete for workflow virtual sections | Bridge only fields already modeled in `effectiveDrawerLayoutPreview.ts`; widget keys deferred to Phase 1 |
| Accidental reveal regression during shadow mode | Shadow render must not mount above-fold; compare in dev/staging telemetry only until Phase 3 cutover |

### Acceptance criteria

- [ ] `resolveLayout({ entityType, surface, orgId })` callable from server drawer bootstrap with ≤1 additional query on cold path
- [ ] Queue layout resolve contract accepts optional context discriminators (typed; full matching logic may stub to default until Phase 4)
- [ ] Production renderer renders all Sprint 1 item kinds (`field`, `field_group`, `related_list`, `widget_placeholder` stub) from a validated `LayoutDoc`
- [ ] Org with zero published layouts resolves to **byte-identical structure** as today's registry fallback (golden test for all 18 entity types, drawer surface)
- [ ] Opportunity `workflow_v1` record layout bridges to LayoutDoc matching `effectiveDrawerLayoutPreview` output
- [ ] Person `runtime_v1` variant bridges to LayoutDoc matching `personDrawerLayoutSettingsPreview`
- [ ] Runtime adoption flag defaults **off**; flag on enables shadow comparison without changing operator-visible UI
- [ ] `cd web && npx tsc --noEmit` clean; layout parity test suite green
- [ ] No changes to adminv2 reveal gates, queue empty semantics, or composed payload evaluation in this phase

---

## Phase 1 — Widget convergence

### Objective

Replace `customSectionContent` injection and hardcoded inquiry/person module mounting with a **closed widget registry** keyed by `widget_placeholder.refKey`, aligned with `LAYOUT_WIDGET_CATALOG` and extended for production widgets.

### Scope

- Widget registry module mapping `widgetKey → React component + data dependencies`
- Initial widget keys (minimum for Phases 3–6):
  - Opportunity: `children_list`, `tour_summary`, `tasks`, `actions`, `recent_communication`, `notes`, `family_contacts`, `inquiry_right_column`, `required_information`, `operational_tasks`
  - Person: `parent_summary`, `child_summary`, `household`, `address`, `employee_status`, `bos_panel`, `relationships`, `enrollment_activity`
  - Shared: `communications`, `unified_status`, `activity_feed`
- Widget readiness predicates (data deps for reveal) registered per widget
- Extend `LAYOUT_WIDGET_CATALOG` and layout builder picker to match registry
- `widget_placeholder` renders through registry in production renderer (Phase 0)

### Affected files

| Area | Files |
|------|-------|
| Registry | new `web/lib/layout/runtime/widgetRegistry.ts`, `web/lib/layout/runtime/widgetTypes.ts` |
| Catalog | `web/lib/layout/fieldCatalog.ts` (`LAYOUT_WIDGET_CATALOG`) |
| Opportunity widgets | `web/components/admin/opportunity/OpportunityInquiryChildrenSection.tsx`, `FamilyContactsPanel.tsx`, `OpportunityInquirySummaryRightColumn.tsx`, `OpportunityInquiryTourDateBlock.tsx`, `OpportunityDrawerRequiredInformationPanel.tsx`, `OpportunityOperationalTasksSection.tsx`, `web/components/admin/vmDrawer/VmInquiryRightColumn.tsx` |
| Person widgets | `web/components/admin/entity/PersonDrawer*.tsx` (operating section components) |
| Shared | `web/components/admin/communications/CommunicationsDrawerSection.tsx`, `web/lib/admin/unifiedDrawerStatus.ts` |
| Renderer | `web/lib/layout/runtime/LayoutRuntimeRenderer.tsx` |
| Migration | `web/lib/layout/migrateFromRegistry.ts`, `web/lib/layout/defaultLeadLayouts.ts`, `web/lib/layout/seedFromCurrentPresentation.ts` |
| Settings | `web/lib/layout/builderOps.ts`, `web/components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx` |
| Tests | new `web/tests/layout/widgetRegistry.test.ts`, widget readiness unit tests per key |

### Risks

| Risk | Mitigation |
|------|------------|
| Widget data fetching inside renderer violates VM contract | Widgets receive preloaded payload slices from VM/bootstrap; no widget-initiated above-fold fetch |
| Unbounded widget key proliferation | Closed registry; `parseLayoutDoc` validates keys against allow-list at publish time |
| BOS/operational widgets tightly coupled to opportunity drawer | Widget owns data contract; layout doc only positions by key |
| Person parent/child widget variants | Registry keys include profile suffix or `visibleWhen` on layout item |

### Acceptance criteria

- [ ] Every `widgetKey` in `LAYOUT_WIDGET_CATALOG` resolves to a registered component or explicit stub with operator-visible "not configured" state
- [ ] Production inquiry workflow sections (`inquiry_children`, tour, right column, family contacts) render exclusively via widget registry when layout doc places them
- [ ] `customSectionContent` map in `EntityDrawerOverview` unused for any widget key in registry (assertion test)
- [ ] Widget readiness deps declared and consumed by Phase 2 reveal plan
- [ ] Published layout doc with unknown widget key rejected at publish boundary
- [ ] Settings builder can add/remove/reorder widget placeholders from catalog

---

## Phase 2 — Reveal contract convergence

### Objective

Derive coordinated reveal, section readiness, and shell geometry from the **layout section plan** instead of parallel AdminV2 section registries and ad hoc shell contracts. Preserve adminv2-runtime-performance doctrine verbatim.

### Scope

- Layout-derived section plan: `{ sectionKey, kind, minHeightClass, readinessDeps, revealGroup }`
- Replace consumption of:
  - `web/lib/adminV2/runtime/contract/registry/opportunityDrawerSections.ts`
  - `web/lib/adminV2/runtime/contract/registry/parentDrawerSections.ts`
  - `web/lib/adminV2/runtime/contract/registry/childDrawerSections.ts`
- Adapt `composedDrawerPayload` to evaluate readiness from layout plan + widget readiness registry
- Adapt shell compilation (`compileOpportunityRecordDrawerShell`, job `compileShell`) to read geometry from layout doc metadata
- Tab pre-mount contract reads tab list from layout doc `metadata.tabs`
- **Do not** remove reveal gates or weaken stale-response guards

### Affected files

| Area | Files |
|------|-------|
| Layout plan | new `web/lib/layout/runtime/buildLayoutSectionPlan.ts`, new `web/lib/layout/runtime/layoutRevealPlan.ts` |
| Reveal evaluation | `web/lib/admin/drawer/composedDrawerPayload/evaluateComposedDrawerPayload.ts`, `sectionRequirements.ts` |
| Registries (deprecate) | `web/lib/adminV2/runtime/contract/registry/*`, `drawerSectionContract.ts`, `drawerComposerPolicy.ts` |
| Shell contracts | `web/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell.ts`, `web/lib/adminV2/drawerPipeline/adapters/job/compileShell.ts`, `web/lib/adminV2/drawerPipeline/compileShellFromSections.ts` |
| Tab contract | `web/lib/adminV2/runtime/contract/drawerTabsContract.ts`, `web/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs.ts` |
| Drawer chrome | `web/components/admin/drawer/DrawerComposedPreparingState.tsx`, `web/components/admin/entity/PersonDrawerSectionCoordinatedReserve.tsx`, `web/components/admin/opportunity/OpportunityInquiryChildrenShellChrome.tsx` |
| Tests | `web/tests/admin/drawer/drawerDeterminism.test.ts`, `web/tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts`, `web/tests/admin/drawer/composedDrawerPayload.test.ts`, `web/tests/adminV2/workUnitCoordinatedRevealRegression.test.ts` |

### Risks

| Risk | Mitigation |
|------|------------|
| Reveal regression (partial above-fold paint) | Required test suite from adminv2-runtime-performance rule must pass unchanged; compare reveal timelines in staging |
| Layout doc missing min-height metadata | Seed defaults from current shell contracts; backfill migration for published opportunity layouts |
| VM first-paint deps diverge from layout plan | VM composer builds `first_paint` from same `buildLayoutSectionPlan()` output |
| Dual registry during transition | Feature flag: `LAYOUT_RUNTIME_REVEAL=1` switches evaluation source; both paths must agree in shadow mode before cutover |

### Acceptance criteria

- [ ] `evaluateComposedOpportunityDrawerPayload` and `evaluateComposedPersonDrawerPayload` derive required section keys from layout plan, not hardcoded registry arrays
- [ ] Opportunity inquiry drawer above-fold reveals only when layout plan `revealGroup: above_fold` sections + widget deps settle
- [ ] Tab pre-mount list equals layout doc `metadata.tabs` (workflow opportunity) or resolver fallback
- [ ] Shell min-height classes sourced from layout section metadata, not duplicated in shell contract TS constants
- [ ] All protected tests in adminv2-runtime-performance rule pass with zero assertion changes unless explicitly documenting new layout-derived keys
- [ ] Parallel section registries marked `@deprecated` with zero production imports after cutover flag on

---

## Phase 3 — Opportunity drawer convergence

### Objective

Make the opportunity inquiry drawer **fully layout-driven** for all open paths (VM + any remaining legacy). Retire duplicate inquiry JSX, Layer 0 opportunity overview sections, and record-layout V1 as the primary config store for opportunity drawer.

### Scope

- Publish default opportunity drawer layout from `defaultLeadLayouts.ts` + bridged workflow sections for all orgs (migration script, not seed reset)
- VM body (`OpportunityDrawerVmRuntime`) renders overview via `LayoutRuntimeRenderer` instead of `OpportunityDrawerInquiryWorkflowOverview` hardcoded composition
- Retire legacy inquiry block in `AdminEntityDrawerLegacy.tsx` (~L16277+)
- Retire `OpportunityTourDrawerSection.tsx` legacy path
- Migrate settings editors (`OpportunityWorkflowV1SectionsEditor`, order editor, field placements) to write `entity_layouts` drafts (record_drawer_layouts becomes read-compat bridge only)
- Suppress Layer 0 `opportunities.drawer.overviewSections` when published layout exists
- Opportunity tabs: layout doc metadata replaces `opportunityInquiryWorkflowTabs.ts` hardcoded strip

### Affected files

| Area | Files |
|------|-------|
| VM runtime | `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx`, `OpportunityDrawerVmTabPanes.tsx`, `OpportunityDrawerInquiryWorkflowOverview.tsx` (retire or reduce to thin adapter) |
| Legacy drawer | `web/components/admin/AdminEntityDrawerLegacy.tsx` (remove inquiry workflow block) |
| Pipeline | `web/lib/adminV2/drawerPipeline/adapters/opportunity/*`, `buildAboveFoldRenderModel.ts` |
| VM compose | `web/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts`, `web/lib/admin/loadOpportunityDrawerOperationalBootstrap.ts` |
| Record layout (bridge) | `web/lib/admin/effectiveRecordDrawerLayout.ts`, `web/lib/recordChrome/effectiveDrawerLayoutPreview.ts`, `web/lib/admin/opportunityWorkflowV1SectionConfig.ts`, `web/lib/admin/opportunityWorkflowV1DrawerOrder.ts`, `web/lib/fields/fieldPlacementV1.ts` |
| Layer 0 | `web/lib/entityPresentation.ts` (opportunities drawer) |
| Settings | `web/components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx`, `OpportunityWorkflowV1*Editor.tsx`, `LayoutSectionFieldsPanel.tsx` |
| Migration | new `web/scripts/migrateOpportunityDrawerLayoutToEntityLayouts.ts` |
| Tests | `web/tests/adminV2/opportunityRecordDrawerShellContract.test.ts`, `web/tests/adminV2/viewModel/opportunityDrawerViewModelComposer.test.ts`, `web/tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts` |

### Risks

| Risk | Mitigation |
|------|------------|
| Operator-customized workflow section order lost | Migration reads org `record_drawer_layouts` and publishes equivalent `entity_layouts` draft before cutover |
| Inquiry workflow regression on non-enrollment tenants | Cutover flag per org; kill switch retains VM hardcoded body (`NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH`) |
| Field placement / requiredness rules break | `fieldPlacementV1` rules port to layout item metadata; integrity validator extended |
| Settings UX gap during editor migration | Settings preview and runtime read same `entity_layouts` doc post-migration |

### Acceptance criteria

- [ ] Opportunity drawer overview renders from published `entity_layouts` doc (surface: `drawer`, entity: `opportunities`) on VM path for orgs with adoption flag
- [ ] No production code path mounts `OpportunityDrawerInquiryWorkflowOverview` hardcoded grid when layout runtime flag on
- [ ] Legacy inquiry block removed from `AdminEntityDrawerLegacy` when layout runtime flag on globally
- [ ] Settings → Layouts → Opportunity edits persist to `entity_layouts` and reflect in runtime within publish cycle
- [ ] `getEntityPresentation("opportunities").drawer.overviewSections` not read on layout-runtime path (grep assertion)
- [ ] Workflow tab strip matches pre-convergence tab order and labels (snapshot test)
- [ ] All opportunity drawer protected tests green

---

## Phase 4 — Opportunity queue convergence

### Objective

Make work-unit opportunity queue rows and lane presentation **layout-driven**, consuming `QueueRowContext` / `WorkUnitSurfaceContext` per frozen contract. Retire hardcoded `web/lib/ui-v2/*Presentation*` plans for enrollment pipeline rows.

**Queue layout variant model (required):** Runtime convergence must support **multiple queue layout variants within a single lifecycle**. Do **not** treat queue convergence as one queue layout per lifecycle. The waitlist queue is the canonical example — it shares enrollment lifecycle context but requires a distinct row structure (candidate-grain, placement sections, program-category grouping) from standard pipeline case rows.

All queue row variants resolve through the **same** `resolveLayout()` + `LayoutRuntimeRenderer` path using **Layout Contract V1 blocks** (`field`, `field_group`, `related_list`, `widget_placeholder`). No separate waitlist runtime, waitlist renderer, or waitlist-specific presentation module may be introduced.

### Queue layout resolution (target model)

Queue layout docs are selected by base key plus optional contextual discriminators passed at resolve time:

| Discriminator | Role | Example |
|---------------|------|---------|
| `entity_type` | Base entity for queue row surface | `opportunities` |
| `surface` | Always `queue` for row layout | `queue` |
| `lifecycle_key` | Lifecycle family scope | `enrollment` |
| `stage_key` | Stage lens within lifecycle | `waitlist`, `tour_scheduling`, `lead` |
| `work_unit_key` | Work unit override (optional) | `enrollment_pipeline` |
| `queue_type` | Lane/queue semantic type | `pipeline`, `waitlist`, `needs_attention` |
| `grain` | Row membership grain | `case`, `child`, `candidate` |

**Resolution order (most specific wins):**

```
published org layout matching (entity_type, surface, layout_key)
    where layout_key or metadata encodes discriminators
    → work_unit_key + queue_type + grain match
    → lifecycle_key + stage_key + queue_type + grain match
    → lifecycle_key + queue_type + grain match
    → queue_type + grain default
    → entity_type + surface default (registry / defaultLeadLayouts fallback)
```

Multiple published docs may coexist for the same lifecycle (e.g. `enrollment_pipeline_case_row` vs `enrollment_waitlist_candidate_row`). The runtime selects the doc whose discriminator metadata best matches the active lane context from `queue_definition` + `WorkUnitSurfaceContext` / `QueueRowContext`. Layout JSON does **not** embed enrollment branching logic — discriminators are resolved in platform code; the doc only declares structure.

### Scope

- Extend `resolveLayout()` (Phase 0) to accept queue layout context discriminators and return the best-matching published doc
- Publish **multiple** queue surface layout docs per enrollment lifecycle:
  - **Standard enrollment pipeline row** — case-grain CRM compact bands (lead, tour, follow-up lanes)
  - **Child-grain row variant** — touring / per-child lanes where grain ≠ case
  - **Waitlist queue row variant** — candidate-grain; distinct sections/widgets (placement priority, program category, candidate meta) — **not** a repackaged standard enrollment row
- `LayoutRuntimeRenderer` queue mode replaces band assembly in `workUnitQueueRowPresentation.ts` for **all** variants via the same renderer
- Complete `QueueRowContext` adapter: case-grain (shipped) → child-grain → candidate-grain per lifecycle contract
- Attach `WorkUnitSurfaceContext` to work-unit bootstrap API (includes active lane discriminators for layout resolve)
- AdminV2 `QueueBlock` resolves row layout per item from lane context + `_queue_row_context` — not one doc for the whole work unit
- Retire parallel presentation: `crmQueueRowPreviewPresentation.ts`, `workUnitQueueRowHeaderPresentation.ts`, `queuePlacementPriority*Presentation.ts`, `waitlistQueueBlockSectionPlan.ts`, `waitlistQueueSectionPresentation.ts` band logic — **absorb into layout doc blocks/widgets**, not a forked runtime
- Queue definition JSON remains **data/filter authority** (membership, lane keys, grain metadata); layout doc owns **row structure and bands**
- Dept legacy `QueueBlock` unchanged in this phase (out of scope: dept workspace registry)

**Explicit non-goals:**

- Do **not** force waitlist rows into the standard enrollment pipeline row layout
- Do **not** introduce a separate waitlist runtime, waitlist QueueBlock, or waitlist-only renderer
- Do **not** collapse to one queue layout per lifecycle or per work unit

### Affected files

| Area | Files |
|------|-------|
| Queue layout resolver | `web/lib/layout/layoutResolver.ts` (queue context discriminators), new `web/lib/layout/resolveQueueLayoutContext.ts` |
| Queue layout docs | `web/lib/layout/defaultLeadLayouts.ts` (add waitlist + child-grain variants), `web/lib/layout/migrateFromRegistry.ts` (`queueLayoutFromRegistry`) |
| Layout metadata schema | `web/lib/layout/layoutV2.ts`, `web/lib/layout/layoutV2Schema.ts` (discriminator fields on doc metadata — no enrollment logic in doc body) |
| Runtime renderer | `web/lib/layout/runtime/LayoutRuntimeRenderer.tsx` (queue surface mode — single renderer for all variants) |
| QueueBlock | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` (per-row/per-lane layout resolve) |
| Work-unit page | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` |
| Row context | `web/lib/workUnits/buildPartialQueueRowContext.ts`, `lifecycleSubjectContracts.ts`, new `buildChildGrainQueueRowContext.ts`, `buildCandidateGrainQueueRowContext.ts`, `web/lib/workUnits/attachQueueRowContextToItems.ts` |
| QueueService | `web/lib/queues/QueueService.ts`, `web/lib/queues/queueRowGrainContext.ts`, `childGrainEnrollmentQueue.ts`, `candidateGrainWaitlistQueue.ts` |
| UI-v2 plans (retire) | `web/lib/ui-v2/workUnitQueueRowPresentation.ts`, `crmQueueRowPreviewPresentation.ts`, `workUnitQueueRowHeaderPresentation.ts`, `enrollmentQueueRowPreviewPolicy.ts`, `queuePlacementPriorityPresentation.ts`, `queuePlacementPriorityV2Presentation.ts`, `queuePlacementWaitlistCandidatePresentation.ts`, `web/lib/orchestration/placement/waitlistQueueBlockSectionPlan.ts`, `web/lib/orchestration/placement/waitlistQueueSectionPresentation.ts` |
| Queue UI config | `web/lib/ui-v2/queueUiConfig.ts` (retain filter/section normalization; remove row band overrides) |
| Bootstrap APIs | `web/app/api/admin/work-units/[id]/operational-bootstrap/route.ts`, `web/app/api/admin/queues/[workUnitId]/[queueKey]/route.ts` |
| Tests | `web/tests/adminV2/workUnitQueueLaneRevealState.test.ts`, new `web/tests/layout/queueLayoutVariantResolve.test.ts`, new `web/tests/layout/waitlistQueueLayoutParity.test.ts`, `web/tests/workUnits/buildPartialQueueRowContext.test.ts` |

### Risks

| Risk | Mitigation |
|------|------------|
| Queue row context incomplete for child/candidate grain | Phase 4 gated on context adapters; case-grain cutover first with flag |
| False empty queue states | Preserve `rowsLoading` / `rowsHeld` / `shouldApplyWorkUnitQueueRowsResponse` — layout renderer is row body only |
| CRM compact row regression | Golden row snapshots per queue key + grain before/after |
| `queue_definition.ui.row_preview` vs layout doc conflict | Layout doc wins for structure when published; queue_definition retains filter/lane keys and grain metadata only |
| Waitlist forced into enrollment row layout | Explicit waitlist layout variant doc; acceptance test asserts structural diff from case-grain doc |
| Separate waitlist runtime introduced | Code review gate: waitlist must use `LayoutRuntimeRenderer` queue mode + widget registry only |
| Resolver ambiguity (multiple matching docs) | Deterministic specificity ordering; unit tests per discriminator combination |
| One-layout-per-lifecycle oversimplification | Publish at least two enrollment docs (pipeline case + waitlist candidate) before cutover |

### Acceptance criteria

- [ ] `resolveLayout()` accepts queue context discriminators (`lifecycle_key`, `stage_key`, `work_unit_key`, `queue_type`, `grain`) and returns the most specific published doc
- [ ] Multiple queue layout docs may exist for the same lifecycle; resolver picks by discriminator match, not lifecycle alone
- [ ] AdminV2 work-unit `QueueBlock` renders row body from the **lane- and grain-appropriate** queue layout doc when org adoption flag on
- [ ] **Waitlist queue layout (canonical case):** candidate-grain waitlist lane resolves to a dedicated queue layout variant — placement sections, program-category grouping, and candidate meta rendered via Layout Contract V1 blocks/widgets — **structurally distinct** from the standard enrollment pipeline case row layout
- [ ] Waitlist rows are **not** rendered by applying the standard enrollment row layout with conditional hiding; they use the waitlist variant doc
- [ ] No new waitlist-specific runtime module, renderer, or QueueBlock fork — waitlist and pipeline rows share `LayoutRuntimeRenderer` queue mode
- [ ] All queue row variants use only Layout Contract V1 item kinds (`field`, `field_group`, `related_list`, `widget_placeholder`)
- [ ] `_queue_row_context` on every item for enrollment pipeline work unit (case, child, candidate grains)
- [ ] `WorkUnitSurfaceContext` returned on work-unit operational bootstrap (includes lane discriminators used for layout resolve)
- [ ] No import of `resolveWorkUnitQueueRowPresentationPlan` or waitlist-specific `*Presentation*.ts` modules on layout-runtime path
- [ ] Queue lane pills, counts, and filters unchanged (`queue_definition` authority preserved)
- [ ] Protected queue reveal tests green; no false empty states in manual enrollment pipeline + waitlist walkthrough
- [ ] Row click → drawer open payload uses `drawer_open` from `QueueRowContext`

---

## Phase 5 — Person drawer convergence

### Objective

Converge parent and generic person drawers onto layout runtime. Operating modules become layout sections/widgets; person VM body renders through `LayoutRuntimeRenderer`.

### Scope

- Publish person drawer layouts: generic, parent (`runtime_v1`), emergency profiles as layout doc variants (`layout_key` or `metadata.profile`)
- `PersonsDrawerVmBody` uses layout runtime instead of `PersonDrawerOperatingSections` + `EntityDrawerOverview` dual path
- Migrate `personDrawerLayoutRuntime.ts` variant keys into layout doc sections
- Person tabs: layout doc `metadata.tabs` replaces hardcoded `OPERATING_TAB_LIST` in `PersonsDrawerVmBody.tsx`
- Retire `personDrawerPresentationProfile.ts` section filtering when layout variant encodes visibility
- Settings → Layouts → Person writes `entity_layouts` (extends beyond preview-only today)
- Generic person path converges; child-specific deferred to Phase 6

### Affected files

| Area | Files |
|------|-------|
| VM runtime | `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx`, `PersonsDrawerVmBody.tsx` |
| Operating sections | `web/components/admin/entity/PersonDrawerOperatingSections.tsx`, `PersonDrawerParentSummary.tsx`, `PersonDrawerParentHouseholdSection.tsx`, `PersonDrawerHouseholdAddress.tsx`, `PersonDrawerEmployeeStatusSection.tsx`, `PersonDrawerParentSummaryBosPanel.tsx` |
| Layout runtime | `web/lib/admin/person/personDrawerLayoutRuntime.ts`, `personDrawerParentOperatingSections.ts`, `personDrawerOperatingOverviewSections.ts`, `resolvePersonDrawerVmOverviewSections.ts`, `personDrawerPresentationProfile.ts` |
| Legacy | `web/components/admin/AdminEntityDrawerLegacy.tsx` (person paths) |
| Layer 0 | `web/lib/entityPresentation.ts` (persons drawer) |
| Record layout | `web/lib/recordChrome/personDrawerLayoutSettingsPreview.ts`, `web/lib/admin/effectiveRecordDrawerLayout.ts` |
| Settings | `web/components/adminV2/settings/PersonRuntimeV1LayoutPreviewPanel.tsx`, `RecordDrawerCompositionWorkspace.tsx` |
| Widgets | Phase 1 person widget keys |
| Tests | `web/tests/admin/person/personDrawerLayoutRuntime.test.ts`, `web/tests/admin/personDrawerControlPlane.test.ts`, `web/tests/admin/person/personDrawerOperatingOverviewSections.test.ts`, `web/tests/adminV2/personLayoutSettingsVisibility.test.ts` |

### Risks

| Risk | Mitigation |
|------|------------|
| Parent vs generic profile regression | Variant resolution from person record role flags identical to today before cutover |
| VM flag off paths (`NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM`) | Legacy path also uses layout runtime when adoption flag on — single renderer |
| Relationship / enrollment activity widgets | Phase 1 registry; fallback to legacy injection until widgets ship |
| Tab strip mismatch (VM adds communications) | Layout doc default includes communications tab for parent profile |

### Acceptance criteria

- [ ] Person VM overview renders from layout doc for parent and generic profiles with adoption flag on
- [ ] `PersonDrawerOperatingSections` not mounted on layout-runtime path
- [ ] `OPERATING_TAB_LIST` constant unused on layout-runtime path
- [ ] Org person layout variant (parent/generic/emergency) resolves to correct published doc
- [ ] Settings → Layouts → Person publish affects runtime section order and visibility
- [ ] Composed person payload readiness uses layout reveal plan (Phase 2)
- [ ] Protected person drawer tests green

---

## Phase 6 — Child drawer convergence

### Objective

Converge child person drawer chrome onto layout runtime as a **distinct layout variant**, despite shared `PersonsDrawerVmRuntime` router. Child lifecycle rails, header executive strip, and child-specific widgets become layout sections/widgets.

### Scope

- Publish child layout variant doc (`metadata.profile: child` or dedicated `layout_key`)
- Child widgets: `child_summary`, `child_household`, `child_medical`, `child_bos_panel`, `child_header_chips`, lifecycle modules
- Child lifecycle rail → layout sections with `metadata.module_nav: true` or dedicated widget `child_lifecycle_rail`
- Wire `personDrawerChildLifecycleSlots.ts` placements into layout doc positions
- Child tab strip and reveal plan distinct from parent (separate published doc)
- Retire `PersonDrawerChildLifecycleRail.tsx`, `PersonDrawerChildHeaderExecutive.tsx`, `PersonDrawerChildLifecycleSummary.tsx`, `PersonDrawerChildLifecycleRoadmap.tsx` as direct mounts
- Remove orphaned `ChildDrawerVmRuntime.tsx` (dead code per inventory)

### Affected files

| Area | Files |
|------|-------|
| VM runtime | `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx`, `PersonsDrawerVmBody.tsx` |
| Child components | `web/components/admin/entity/PersonDrawerChild*.tsx`, `PersonDrawerChildSummaryBosPanel.tsx`, `PersonDrawerHouseholdSection.tsx` |
| Layout runtime | `web/lib/admin/person/personDrawerChildOperatingSections.ts`, `personDrawerChildLifecycleSlots.ts`, `web/lib/adminV2/runtime/contract/registry/childDrawerSections.ts` (retire) |
| Legacy | `web/components/admin/AdminEntityDrawerLegacy.tsx` (child person paths), `web/components/admin/vmDrawer/ChildDrawerVmRuntime.tsx` (delete) |
| VM compose | `web/lib/adminV2/viewModel/drawer/` child compose modules, `childDrawerFirstViewportContract.ts` |
| Tests | `web/tests/admin/person/personDrawerChildStabilization.test.ts`, `web/tests/admin/person/personDrawerChildFinalization.test.ts`, `web/tests/admin/person/personDrawerArchitecturePass2.test.ts` |

### Risks

| Risk | Mitigation |
|------|------------|
| Child vs parent record mis-routing | Variant resolver keyed on child chrome detection unchanged; layout doc selected after profile resolution |
| Lifecycle module nav regression | Snapshot tests for module nav order; min-height from layout metadata |
| Child medical section data sensitivity | Widget owns field policy; layout doc positions only |
| Shared VM runtime conflates parent/child | Separate published docs; runtime selects by profile before render |

### Acceptance criteria

- [ ] Child person drawer renders from child layout variant doc with adoption flag on
- [ ] Child lifecycle rail and header executive strip render as layout widgets/sections, not hardcoded mounts
- [ ] `CHILD_DRAWER_SECTION_REGISTRY` (parallel registry) fully retired
- [ ] `ChildDrawerVmRuntime.tsx` deleted; no dead VM runtime files
- [ ] Child composed payload readiness matches layout reveal plan
- [ ] Child drawer protected tests green; child chrome visually unchanged vs pre-convergence snapshots

---

## Phase 7 — Legacy presentation removal

### Objective

Remove parallel presentation systems for converged entities (opportunity, person/child, enrollment queue). Retire Layer 0 drawer config, legacy JSX paths, duplicate registries, and orphaned adapters. **Layer 0 table columns and unconverged entities remain until follow-on sprints.**

### Scope

**Remove (post Phases 3–6 cutover):**

- Layer 0 drawer sections/tabs/relatedModules for: `opportunities`, `persons`
- Legacy opportunity inquiry block and person operating JSX in `AdminEntityDrawerLegacy`
- `OpportunityDrawerInquiryWorkflowOverview.tsx` (after VM uses layout runtime exclusively)
- Parallel reveal registries: `web/lib/adminV2/runtime/contract/registry/*`
- Hardcoded tab constants: `opportunityInquiryWorkflowTabs.ts`, `OPERATING_TAB_LIST`
- UI-v2 queue row presentation modules retired in Phase 4
- Orphaned VM files: `PersonDrawerVmRuntime.tsx`, `ChildDrawerVmRuntime.tsx`
- `customSectionContent` entries for converged widget keys
- Record layout V1 write paths for opportunity/person (read-compat bridge remains until all orgs migrated)

**Retain (until follow-on):**

- `entityPresentation.ts` for unconverged entities (customers, locations, jobs, schedules, vendors, etc.)
- `AdminEntityDrawerLegacy` for unconverged entities
- Dept workspace `workspace/registry.ts` and legacy `QueueBlock`
- List table columns from Layer 0

**Expand layout runtime (follow-on tracks within Phase 7):**

| Track | Entities | Prerequisite |
|-------|----------|--------------|
| 7a | Job, Schedule | Phases 0–2; schedule already uses `layout_blocks` |
| 7b | Location | `locationDrawerLayoutTarget.ts` blockers resolved |
| 7c | Remaining Layer 0 entities | Settings → Layouts entity expansion |
| 7d | Layer 0 table surface | Drawer convergence complete per entity |
| 7e | `entityPresentation.ts` deletion | All entities + tables migrated; golden parity |

### Affected files

| Area | Files |
|------|-------|
| Layer 0 | `web/lib/entityPresentation.ts` (remove converged entity drawer blocks) |
| Legacy monolith | `web/components/admin/AdminEntityDrawerLegacy.tsx` (reduce by converged entity branches) |
| VM adapters | Retire inquiry workflow overview; simplify pipeline adapters |
| Registries | Delete `web/lib/adminV2/runtime/contract/registry/*` after Phase 2 cutover verified |
| Record layout V1 | Deprecate write APIs for opportunity/person; keep read bridge with sunset date |
| UI-v2 | Delete retired `*Presentation*.ts` files from Phase 4 |
| Opportunity filters | `web/lib/recordChrome/opportunityDrawerOverviewFilters.ts` → layout runtime filters |
| Docs | Update `runtime_convergence_inventory.md` status; mark convergence complete per entity |

### Risks

| Risk | Mitigation |
|------|------------|
| Premature Layer 0 removal breaks unconverged entities | Removal gated per entity with grep-based assertion tests |
| Org without published layout falls through to broken state | Resolver registry fallback must remain until Phase 7e |
| Hidden legacy path still mounts old JSX | Feature flag removal audit; kill switches documented per entity |
| Record layout V1 orphan rows in DB | Read bridge ignores unmigrated orgs; migration script reports coverage |

### Acceptance criteria

- [ ] Zero production imports of removed modules (CI grep check)
- [ ] `entityPresentation.ts` drawer config absent for opportunities and persons
- [ ] `AdminEntityDrawerLegacy.tsx` line count reduced; no opportunity inquiry or person operating branches
- [ ] Parallel reveal registries deleted; composed payload reads layout plan only
- [ ] UI-v2 queue row presentation files deleted; queue rows layout-driven for enrollment work units
- [ ] All protected adminv2 runtime tests green after removal
- [ ] Inventory doc updated with convergence status per entity
- [ ] Unconverged entities still function via Layer 0 fallback (regression smoke on customers, jobs, locations)

---

## Cross-phase engineering gates

Every phase merge must satisfy:

| Gate | Command / check |
|------|-----------------|
| TypeScript | `cd web && npx tsc --noEmit` |
| Module imports | `cd web && npm run verify:module-imports` (when adding `web/lib/layout/runtime/*`) |
| AdminV2 reveal regression | `cd web && npm run test -- tests/admin/drawer/drawerDeterminism.test.ts tests/admin/drawer/composedDrawerPayload.test.ts tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts tests/adminV2/workUnitQueueLaneRevealState.test.ts tests/adminV2/workUnitCoordinatedRevealRegression.test.ts` |
| Layout parity | `cd web && npm run test -- tests/layout/` |
| Feature flag default | New runtime flags default **off** until phase acceptance criteria met |
| No scope creep | PR template confirms: no navigation, admin cutover, seed reset, or VM optimization changes |

---

## Migration and rollout strategy

| Step | Action |
|------|--------|
| 1 | Ship Phase 0 behind `LAYOUT_RUNTIME_ENABLED` (org allow-list) |
| 2 | Run migration script per org: bridge `record_drawer_layouts` → publish `entity_layouts` draft for opportunity + person |
| 3 | Enable shadow parity logging in staging; fix diffs before operator cutover |
| 4 | Enable layout runtime per org for opportunity drawer (Phase 3) |
| 5 | Enable queue layout for enrollment pipeline work units (Phase 4) — publish **multiple** queue variants per lifecycle (pipeline case row + waitlist candidate row minimum) before lane cutover |
| 6 | Enable person then child variants (Phases 5–6) |
| 7 | Global flag on; Phase 7 removal PR per entity group |
| 8 | Monitor: drawer open latency, reveal timing, queue false-empty reports |

**Rollback:** each phase retains a kill switch reverting to pre-phase renderer path without data migration rollback (published layout docs remain in DB).

---

## Success metrics

| Metric | Target |
|--------|--------|
| Presentation code paths | 1 resolver + 1 renderer for drawer and queue (per adopted org) |
| Parallel registries | 0 section/tab reveal registries post Phase 7 |
| Opportunity drawer | 100% layout-doc-driven for adopted orgs |
| Enrollment queue rows | 100% layout-doc-driven + `QueueRowContext` attached; multiple queue layout variants per lifecycle supported |
| Waitlist queue rows | Dedicated queue layout variant (candidate-grain); same runtime as pipeline rows; no separate waitlist stack |
| Person/child drawer | 100% layout-doc-driven for adopted orgs |
| Layer 0 drawer usage | opportunities + persons removed; ≤16 entities remain until 7e |
| Protected test suite | Green throughout; zero reveal doctrine regressions |
| Operator-visible regression | None — parity snapshots match pre-convergence for default layouts |

---

## Appendix A — Entity convergence status tracker

Update this table as phases complete.

| Entity | Drawer | Queue | Layout settings | Phase |
|--------|--------|-------|-----------------|-------|
| Opportunity | Parallel (VM + legacy + Layer 0) | ui-v2 plans + queue_definition; **multiple variants required** (pipeline + waitlist) | Settings + record V1 | 3, 4 |
| Person (parent/generic) | VM + operating JSX + Layer 0 | N/A | Preview only | 5 |
| Person (child) | VM + child JSX + Layer 0 | N/A | Preview only | 6 |
| Job | Layer 0 + pipeline | N/A | Preview only | 7a |
| Schedule | Layer 0 + layout_blocks | N/A | Preview only | 7a |
| Location | Layer 0 + custom JSX | N/A | Not in settings | 7b |
| Others (14 entities) | Layer 0 | N/A | Not in settings | 7c |

---

## Appendix B — Widget key master list (Phase 1 target)

| widgetKey | Current owner component | Phase |
|-----------|-------------------------|-------|
| `children_list` | `OpportunityInquiryChildrenSection` | 1, 3 |
| `tour_summary` | `OpportunityInquiryTourDateBlock` | 1, 3 |
| `family_contacts` | `FamilyContactsPanel` | 1, 3 |
| `inquiry_right_column` | `OpportunityInquirySummaryRightColumn` / `VmInquiryRightColumn` | 1, 3 |
| `required_information` | `OpportunityDrawerRequiredInformationPanel` | 1, 3 |
| `operational_tasks` | `OpportunityOperationalTasksSection` | 1, 3 |
| `tasks`, `reminders`, `actions`, `notes`, `recent_communication` | BOS/comms modules | 1, 3 |
| `parent_summary` | `PersonDrawerParentSummary` | 1, 5 |
| `child_summary` | `PersonDrawerChildSummary` | 1, 6 |
| `household` | `PersonDrawerHouseholdSection` / `PersonDrawerParentHouseholdSection` | 1, 5–6 |
| `address` | `PersonDrawerHouseholdAddress` | 1, 5–6 |
| `employee_status` | `PersonDrawerEmployeeStatusSection` | 1, 5 |
| `bos_panel` | Parent/child BOS panels | 1, 5–6 |
| `relationships` | `PersonDrawerVisibilitySections` | 1, 5 |
| `enrollment_activity` | `PersonDrawerEnrollmentActivity` | 1, 5 |
| `child_lifecycle_rail` | `PersonDrawerChildLifecycleRail` | 1, 6 |
| `unified_status` | `unifiedDrawerStatus.ts` | 1 |
| `communications` | `CommunicationsDrawerSection` | 1 |
| `waitlist_placement_v1/v2` | placement presentation modules → layout widgets in **waitlist queue variant doc** | 1, 4 |
| `waitlist_section_header` | `waitlistQueueSectionPresentation.ts` → layout section in waitlist variant | 4 |
| `waitlist_program_category_group` | `waitlistQueueBlockSectionPlan.ts` → layout section grouping in waitlist variant | 4 |

---

## Appendix D — Queue layout variant examples (enrollment lifecycle)

Canonical illustration: **one lifecycle, multiple queue layout docs**. All docs use Layout Contract V1 blocks only.

| layout_key (example) | Discriminators | Row structure intent |
|----------------------|----------------|----------------------|
| `enrollment_pipeline_case_row` | `lifecycle_key: enrollment`, `queue_type: pipeline`, `grain: case` | CRM compact bands: header, attention, people, facts, actions |
| `enrollment_child_grain_row` | `lifecycle_key: enrollment`, `grain: child`, `stage_key: tour_scheduling` | Per-child touring row; child subject labels from `QueueRowContext` |
| `enrollment_waitlist_candidate_row` | `lifecycle_key: enrollment`, `queue_type: waitlist`, `grain: candidate` | Candidate meta, placement priority widgets, program-category sections — **not** pipeline case bands |

**Anti-pattern (forbidden):** mapping waitlist lanes to `enrollment_pipeline_case_row` with inline `if queue_type === waitlist` band overrides in renderer or QueueBlock.

---

## Appendix C — Files explicitly frozen (do not weaken)

From adminv2-runtime-performance doctrine — any phase touching these requires the full protected test suite:

- `web/components/admin/AdminEntityDrawer.tsx`
- `web/components/admin/entity/*Drawer*`
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
- `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx`
- `web/lib/admin/drawer/composedDrawerPayload/*`
- `web/lib/adminV2/runtime/contract/*` (until Phase 2 retires with replacement)
- `web/lib/workspace/*Queue*`

---

*This plan implements the convergence inventory. It does not replace `layout_contract_v1.md`. When the two documents conflict, the layout contract wins.*
