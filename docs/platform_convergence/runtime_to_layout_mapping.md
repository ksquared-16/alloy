# Runtime → Layout Contract V1 Mapping

**Status:** Migration blueprint (mapping only — no implementation, no migrations, no code, no new concepts).
**Authority:** [layout_contract_v1.md](./layout_contract_v1.md) is the frozen target. Where this mapping and the contract differ, the contract wins.
**Answers:** *“How does every active presentation artifact become a Layout Contract V1 artifact?”*

### Reconciliation note (read first) — updated against the shared doc set
The three companion docs that were absent when this mapping was first written — `runtime_convergence_inventory.md`, `field_catalog_convergence_audit.md`, `seed_world_v1.md` — are **now present** (synced from staging, 2026-06-06). This mapping has been reconciled against them. Authoritative facts that changed:
- **`runtime_convergence_inventory.md` is the authoritative artifact list** (7 production presentation layers, ~Sections 3–14). The artifact tables below are a **code-derived subset** retained for the contract-mapping view; for completeness and ownership, defer to the inventory. Where labels differ, the inventory wins on artifact naming, this doc wins on *target Layout Contract representation*.
- **“Reveal Contracts” corrected.** The earlier interpretation (record-open / `openDrawer` / `linkTarget`) was wrong. Per inventory §6.3, §6.10, §7, §11, **reveal contracts are the AdminV2 runtime section reveal/readiness gates** — `web/lib/adminV2/runtime/contract/*`, `composedDrawerPayload/*`, `drawerSectionContract.ts`, coordinated reveal/“Preparing…” gating — not navigation. The Reveal Contracts section below is rewritten accordingly. Record-open/deep-link is now listed separately as *navigation*, not a reveal contract.
- **Surface naming corrected.** Production `LAYOUT_SURFACES` (`web/lib/layout/layoutV2.ts`) = `drawer | queue`. This doc’s prior `list` surface is the **`queue`** surface; entity **list-table columns** are a distinct Layer-0 concern (`buildEntityTableColumns`) explicitly out of Layout V2 sprint scope.

### Frozen target vocabulary (from contract V1, for reference)
- **Block kinds (closed):** `section`, `relationship_section`, `repeater`, `widget`, `queue`. (Naming bridge to production `DrawerSectionKind`: `widget` ↔ `widget_placeholder`; `relationship_section`/`repeater` ↔ `related_list`; the production kinds `injected_system`, `workflow_virtual`, `header_region` are absorbed into `section`/`widget` per contract §2 — see contract Clarification log C2.)
- **Tab Registry (closed):** `overview, enrollment, children, parents, documents, communications, tasks, related, financials, payments, ledger, activity, automation`.
- **Widget Registry (closed):** `lifecycle_rail, needs_attention, bos_recommendation, lifecycle_actions, tasks_summary, documents, related_records, pricing_breakdown`.
- **Surfaces:** `drawer`, `queue` (aligned to `LAYOUT_SURFACES` in `layoutV2.ts`).

Migration complexity scale: **Low** (config reshape, renderer already exists) · **Medium** (renderer or binding work behind an existing seam) · **High** (collection/relationship/compute semantics not yet rendered declaratively).

---

## Drawer Sections

The drawer body is rendered today by config-driven section components plus entity-specific JSX inside the drawer container. Each below maps to a contract Block.

| # | Current section artifact | Current owner | Current file | Runtime purpose | Target Block | Complexity | Dependencies |
|---|---|---|---|---|---|---|---|
| DS-1 | Overview section renderer | `EntityDrawerOverview` | `web/components/admin/entity/EntityDrawerOverview.tsx` | Renders `overviewSections` (or DB `overviewSectionsOverride`) as field grids | `section` | Low | Catalog (`field_definitions`/`field_section_definitions`); `entityFieldRegistryAttach` |
| DS-2 | Single section container | `EntityDrawerSection` | `web/components/admin/entity/EntityDrawerSection.tsx` | Collapsible grid (`gridCols 1\|2`), title, expanded state | `section` (grid semantics §2.2) | Low | DS-3 |
| DS-3 | Field cell | `EntityDrawerField` | `web/components/admin/entity/EntityDrawerField.tsx` | Renders one field by `renderHint`; inline edit | field reference within a block (§2.3) | Low | Catalog field class + `renderHint` |
| DS-4 | DB-driven sections bridge | attach helper | `web/lib/admin/entityFieldRegistryAttach.ts` | Loads `field_definitions` + `field_section_definitions` + `field_values` onto the row; powers DB-driven sections (person today) | data binding for `section`/`relationship_section` (§8.1.3) | Low | Catalog tables |
| DS-5 | Registry section definitions | layout registry | `web/lib/entityPresentation.ts` (`overviewSections`) | The declared section/field tree per entity | the `blocks` array of a drawer LayoutDoc (seeded default §7.2) | Medium | Tab/Block vocab; merge model |
| DS-6 | Subsections (grouped blocks) | registry + overview | `entityPresentation.ts` (`subsections`), `getJobUnifiedPricingSection` | One level of nested grouping (e.g. Jobs → Pricing → Summary/Discount) | nested `section` (or `widget:pricing_breakdown` for the pricing case) | Medium | DS-1; pricing widget |
| DS-7 | Relationship-as-field sections | overview + linkTarget | `EntityDrawerOverview` + `EntityDrawerLinkTarget` | A field that resolves a related record and opens its drawer | `relationship_section` (to-one) / relationship field (§6.2) | Medium | Relation descriptor; reveal (RC-1) |
| DS-8 | Household / parent summary (target) | not yet declarative | drawer JSX | Summarize related household/parent on enrollment | `relationship_section` (to-one) | High | Relation (to-one); source binding |
| DS-9 | Required vs Recommended info (target) | not yet declarative | n/a | Split required/recommended catalog fields | two `section`s with field `group` (§9 seam 2) | Medium | Catalog `is_required`/`is_recommended`; completeness compute |
| DS-10 | Child requirements / notes (target) | not yet declarative | n/a | Per-child requirement + note fields | `section` (per repeater item) | Medium | DS-3; repeater item layout (QC/§6.3) |

**Net:** every drawer section is a `section`, `relationship_section`, or (for collections) a `repeater` item layout. Field cells become field references. The DB bridge (DS-4) and registry (DS-5) are the seeded-default producers of these blocks.

> Reconciliation (inventory §3, §6–§8): the section surface is larger than the rows above. `EntityDrawerOverview/Section/Field` are the **shared chrome** for the Layer-0 path; opportunity and person also render via **VM/pipeline** (`vmDrawer/*`, `drawerPipeline/*`) and hardcoded inquiry/operating JSX (`PersonDrawerOperatingSections.tsx`, `OpportunityDrawerInquiryWorkflowOverview.tsx`). Production **injected** section kinds — `injected_system` (`__unified_status`), `workflow_virtual` (opportunity workflow v1), `widget_placeholder`/`related_list`, `header_region` — map onto contract blocks per the C2 naming bridge (`widget`/`section`). The default+override chain in production is **Layer 0 → `record_drawer_layouts` (org) → `record_layouts` (global) → `entity_layouts` (V2 target)**, which the contract abstracts as “seeded default ⊕ org override” (§7.2).

---

## Tabs

Today tab **membership** is config-driven (`drawer.tabs: DrawerTabKey[]`) but tab **content routing** is largely hardcoded as `if (drawerTab === … && drawer.type === …)` in the drawer container.

| Current tab implementation | Current file | Target tab registry location | Complexity |
|---|---|---|---|
| `DrawerTabKey` union (8 keys) | `web/lib/entityPresentation.ts:191` | Tab Registry (§4.2) — superset; 5 keys (`enrollment, children, parents, communications, tasks`) are additions to converge onto | Low (membership) |
| Per-entity `drawer.tabs` arrays | `entityPresentation.ts` (registry entries) | `tabs[].key` of each drawer LayoutDoc, constrained to the registry | Low |
| Tab list resolution + fallback | `AdminEntityDrawer.tsx` (~`configTabs ?? ["overview","related","activity"]`) | Consumer resolution of effective doc (§8.1.1) | Low |
| Tab content routing (hardcoded per tab/type) | `AdminEntityDrawer.tsx` (`if (drawerTab===…)` guards) | Replaced by rendering `tab.blocks[]` (§4.3.1); legacy JSX is transitional fallback only | High |
| Overview “special” tab | `EntityDrawerOverview` | `overview` tab whose content is its `blocks` (no implicit content, §4.3.1) | Medium |
| Related tab | `RelatedRecordsTabs` invocation | `related` tab containing `widget:related_records` and/or `repeater` blocks | Medium |
| Documents tab | `EntityDocumentsSection` invocation | `documents` tab containing `widget:documents` (relabel “Forms/Documents”) | Low |
| Financials/Payments/Ledger/Activity/Automation tabs | drawer JSX | registry keys `financials/payments/ledger/activity/automation` with appropriate blocks/widgets | Medium |

**Net:** tab membership is already contract-shaped; the high-complexity work is converting hardcoded **tab content routing** into rendered `tab.blocks[]`. The registry union extends by 5 keys; no tab key is removed.

> Reconciliation (inventory §4): `AdminEntityDrawer.tsx` is a **router** (opportunity/person → VM via `vmDrawer/*`; else `AdminEntityDrawerLegacy.tsx`). Two production tab overrides already bypass Layer 0 and must converge onto layout-doc tab metadata: opportunity `inquiry_drawer_mode: workflow_v1` (`opportunityInquiryWorkflowTabs.ts`) and person VM `OPERATING_TAB_LIST` (`PersonsDrawerVmBody.tsx`). Jobs add a `rrs_overview` tab; tab pre-mount/reveal policy is a Reveal-Contract concern (RC-4), not membership.

---

## Queue Components

Queue presentation is a **live, multi-file stack** (inventory §5), not a demo. The contract target is the `queue` surface + `QueueLayout` (§3); entity **list-table** columns are a distinct Layer-0 concern (`buildEntityTableColumns`) explicitly out of Layout V2 sprint scope (kept here for reference). Reconciled facts: AdminV2 `QueueBlock` is **production** (work-unit shell), and there are **two** `QueueBlock`s (dual — inventory §6.9, §14).

| # | Current queue artifact | Current owner | Current rendering path | Target Queue representation | Dependencies |
|---|---|---|---|---|---|
| QC-1 | Entity list-table columns | Legacy admin list pages + `DataTable` | `entityPresentation.table.columns` → `buildEntityTableColumns` → `DataTable` | Out of Layout V2 surface scope today; eventual `queue`/list surface `QueueLayout.columns` (§3) | Catalog fields / compute keys |
| QC-2 | Column builder | Legacy admin | `web/components/admin/entity/buildEntityTableColumns.tsx` | column `renderHint` resolution for `QueueLayout` | renderHint set; compute keys |
| QC-3 | Canonical queue definitions (v1/v2) | Platform config | `web/lib/config/enrollmentPipelineQueueDefinition{V1,V2}.ts`, `queueDefinitionV2Runtime.ts`, `queueDefinitionSchema.ts` | Org `work_units.queue_definition` (stored) read by `queue`-surface LayoutDoc; code constants → seed-only | `WorkUnitSurfaceContext`; v1 `pipeline_with_attention` / v2 `domain_with_attention` |
| QC-4 | AdminV2 queue block (**production**, work-unit shell) | AdminV2 workspace | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` ← `QueueVm` | **consumer** of `QueueLayout` (adopt, do not fork §3.2.3); per-row item render | `QueueVm`→`QueueLayout`; `QueueRowContext` |
| QC-4b | Dept-preview queue block (shared, lighter) | Legacy admin + AdminV2 dept | `web/components/admin/workspace/blocks/QueueBlock.tsx` | Same `QueueLayout` consumer; converge to feature parity (inventory §14 “two QueueBlocks”) | Same |
| QC-5 | Queue row/lane presentation plans (bands: header, attention, lifecycle, people, facts, actions) | AdminV2 workspace | `web/lib/ui-v2/workUnitQueueRowPresentation.ts`, `crmQueueRowPreviewPresentation.ts`, `queueUiConfig.ts` | Queue-row **blocks** consuming `QueueRowContext`; bands = stacked `relationship_section`/`repeater`/`widget` rows | `QueueRowContext`; `WorkUnitSurfaceContext` |
| QC-6 | Queue VM shape | `QueueVm`/`QueueItemVm` | `web/lib/ui-v2/workspace-types.ts` | view-model produced **from** a resolved `QueueLayout`; rollup/countBadge → `QueueLayout.rollup` | VM unchanged (no redesign) |
| QC-7 | Queue row zones (header / contact / children / tour / actions) | AdminV2 workspace | `workUnitQueueRowPresentation.ts` band keys; `childDesiredStartQueuePresentation.ts`, header presentation | per-row item layout of a `queue` block: header = title block, contact/children/tour = `relationship_section`/`repeater` rows, actions = `widget:lifecycle_actions` | Relation; item grid; action widget |
| QC-8 | Related-record sub-lists | `RelatedRecordsTabs` | builds tab list from `relatedModules` | `queue` block (embedded list) or `repeater` per related entity | RelatedModule → Relation/QueueLayout |
| QC-9 | Queue cohort/membership/routing | Platform config + work-unit | `QueueService.ts`, `work_units.queue_definition`, grain queues (`candidateGrainWaitlistQueue.ts`, `childGrainEnrollmentQueue.ts`) | cohort referenced by `key` (§3.3); **not** QueueLayout presentation | lifecycle/work-unit seam; `QueueService` (extend, do not fork) |
| QC-10 | Multiple queue layouts per lifecycle (standard stage queues vs. **waitlist**) | Platform config (variants) | stage→key map `enrollmentProcessStageQueueKeys.ts`; waitlist `waitlistQueueBlockSectionPlan.ts`, `queuePlacementWaitlistCandidatePresentation.ts`, `waitlistQueueSectionPresentation.ts` | distinct `queue` LayoutDoc per `queue_context` (§3.4); same `QueueLayout` shape + closed block vocab; waitlist = `queue_type: waitlist` | `queue_context` keys (lifecycle/stage/work-unit/queue-type/grain) ← `enrollmentProcessStageQueueKeys`, `queueGrainPresentation`, `WorkUnitSurfaceContext` |

**Net:** one `QueueLayout` *shape* serves the queue surface (list-table columns remain a separate Layer-0 concern for now); a lifecycle may have **multiple variants** disambiguated by `queue_context` (§3.4), with **waitlist as the canonical specialized variant** — confirmed real in code (inventory §5.5). The AdminV2 `QueueBlock`/`QueueVm` and `QueueService` remain **consumers** (VM not redesigned; QueueService extended, not forked); cohort/routing stays a lifecycle seam referenced by key. **No waitlist runtime, no separate waitlist presentation system** — the existing waitlist presentation files become a queue-layout variant.

> Note on the interrupted “Queue Final Polish” items (action-button styling, household display template, zone-vs-row naming, location-label vs UUID, row stacking): these are **consumer-render concerns** that live *below* this contract. The contract fixes that a queue card’s rows are `relationship_section`/`repeater` blocks (zones = card rows, §2.2/§6) and that fields render by catalog `renderHint` (e.g. location resolves to a label, not a UUID). Visual styling and field-mapping defaults are realized by the consumer/seeded default, not by changing the contract.

---

## Widgets

Rich, non-field-grid components exist today as bespoke React components wired by `if (tab===…)` guards. Each maps to a frozen `widgetKey`; internals are **wrapped, not rebuilt**.

| Current widget implementation | Current file | Future widget registry key | Migration notes |
|---|---|---|---|
| Documents panel | `web/components/admin/EntityDocumentsSection.tsx` | `documents` | Wrap under key; placed via `widget` block in `documents` tab. Separate `document_field_definitions` model stays its own catalog (contract references results, not that schema). |
| Related records tabs | `web/components/admin/RelatedRecordsTabs.tsx` | `related_records` | Wrap under key; or decompose into `queue`/`repeater` blocks where a single related list suffices. |
| Job pricing breakdown | `web/components/admin/JobPricingBreakdown.tsx` | `pricing_breakdown` | Wrap under key; tuition is placeholder-level only — no billing model change. |
| Receivable charges panel | `web/components/admin/JobReceivableChargesPanel.tsx` | `pricing_breakdown` (or financials-tab widget) | Same wrapping rule; financial logic untouched. |
| Status badge / header fields | `StatusBadge` + `headerFields` | (header rendering, not a body widget) | Header fields stay header-level; not a `widget` block. |
| Lifecycle rail | `web/components/admin/drawer/RecordLifecycleRail.tsx` (reads `resolveWorkUnitQueueDefinitionForDrawer.ts`); `PersonDrawer{Child,Parent}LifecycleRail.tsx` | `lifecycle_rail` | **Production** (not “target”); renders stages + readiness; presentation only (§5.3, §9). |
| Needs-attention | AdminV2 `SignalBlock` + queue attention buckets (`needsAttentionQueuePrioritySort.ts`) | `needs_attention` | Production; renders attention count + grouped reasons from compute; VM not redesigned. |
| BOS recommendation | `PersonDrawer{Child,Parent}SummaryBosPanel.tsx`; `OpportunityInquirySummaryRightColumn.tsx` | `bos_recommendation` | Production; logic is a lifecycle seam, widget renders the result; BOS owns data. |
| Lifecycle actions | drawer action buttons; `actionPlacementPresentation.ts` (settings labels) | `lifecycle_actions` | Production; action defs are lifecycle/operations; `workspace` action surface still unwired (inventory §14). |
| Tasks summary | `OpportunityOperationalTasksSection.tsx`; `MyTasksPanel.tsx` | `tasks_summary` | Production; renders task summary/count from compute. |
| Required-info / readiness | `OpportunityDrawerRequiredInformationPanel.tsx` | (`needs_attention`/`lifecycle_rail` readiness, §9 seam 2) | Production; readiness projection owns data. |
| Family contacts panel | `web/components/admin/opportunity/FamilyContactsPanel.tsx` | `related_records` / `relationship_section` | Production inquiry widget. |

**Net:** all eight registry keys are covered, and (reconciled against inventory §3.3–§3.4, §6.3) the lifecycle-facing widgets are **already production components**, not demo/targets — convergence **wraps** them under `widgetKey`s (internals swappable), it does not build them. No widget owns canonical data; none encode lifecycle rules.

---

## Reveal Contracts

**Corrected per `runtime_convergence_inventory.md` (§6.3, §6.10, §7, §11).** Reveal contracts are **not** the record-open/navigation mechanism. They are the **AdminV2 runtime section reveal/readiness gates**: the doctrine that coordinates *when* a drawer’s sections may paint (composed-payload readiness, per-section reveal gates, reserved geometry, “Preparing…” state) so the drawer reveals as one settled surface rather than popping in. This is **protected infrastructure** under the AdminV2 runtime-performance doctrine and **must not be weakened** by convergence. The contract integrates it as the **runtime readiness step**, not as a block kind.

| # | Current reveal contract | Current file | Relationship to layout block keys | Required convergence work |
|---|---|---|---|---|
| RC-1 | AdminV2 section reveal registries (reveal gates per section key: `lead_summary`, `bos_right_column`, `tour_slot`, `inquiry_children`; parent/child above-fold readiness) | `web/lib/adminV2/runtime/contract/registry/*`, `drawerSectionContract.ts` (`evaluateDrawerSectionPlan()`), `index.ts` (`drawerSectionRegistryForSurface()`) | Gates readiness of the **section/widget block** at a given `key` before paint; reveal keys correspond to layout block keys, not new kinds | Layout runtime exposes a **readiness contract per block key** (contract §8 resolution step); reveal-only, never section content |
| RC-2 | Composed drawer payload gates | `web/lib/admin/drawer/composedDrawerPayload/*` (`evaluateComposedDrawerPayload.ts`, `sectionRequirements.ts`) | “Required section keys ready” → reveal the composed drawer; maps to required block keys of the effective LayoutDoc | Absorbed as layout-runtime readiness evaluation; **do not weaken** per doctrine |
| RC-3 | Drawer composer policy + preparing state | `drawerComposerPolicy.ts` (`composeAdminV2DrawerRuntime()`), `DrawerComposedPreparingState.tsx`, `compileOpportunityRecordDrawerShell.ts` (reserved geometry, `shell_min_height_class`) | Coordinated reveal + reserved geometry per block; geometry is presentation metadata on blocks, not a kind | Layout runtime owns shell geometry/min-height as block metadata; reveal sequencing stays runtime doctrine |
| RC-4 | Tab reveal / pre-mount contract | `web/lib/adminV2/runtime/contract/drawerTabsContract.ts`, `opportunityDrawerTabSession.ts` | Reveal/pre-mount policy keyed to tab keys (Tab Registry) | Layout runtime tab contract carries pre-mount/reveal policy; tab keys unchanged |
| RC-5 | Work-unit queue lane reveal state | `web/lib/workspace/workUnitQueueLaneRevealState.ts`, `workUnitQueueLaneDisplay.ts` | Lane “settled/refreshing” gating for the `queue` surface | Layout runtime queue-surface readiness contract; protected by performance doctrine |

**Net:** reveal contracts converge into the layout runtime as a **readiness gate keyed by block/tab/queue keys** (contract §8 resolution sequence), preserving the AdminV2 reveal doctrine. They are presentation-timing, not block kinds, and must not be weakened.

> **Record-open / deep-link (navigation — distinct from reveal contracts).** `AdminDrawerContext.openDrawer({type,id})` / `closeDrawer` / `goBack`, field `linkTarget`, and related-record open are the **navigation entry point** that resolves *which* LayoutDoc to render (`type` ⇒ `entity_type`, `id` ⇒ bound record); deep-link is initiated from `relationship`/`repeater`/`related_records` blocks. Back-stack, accent chrome (`DRAWER_ACCENT_COLORS`), record-number subtitle, and create/prefill (`id="new"`, `SchedulePrefill`/`JobPrefill`) remain **consumer concerns outside** the frozen block/tab/widget vocabularies. Note: **work units have no drawer of their own** — queue membership opens opportunity/person/child drawers (inventory §1, §12).

---

## Legacy Admin Dependencies

Presentation-affecting dependencies that the contract supersedes or constrains. (Non-presentation data models are untouched; listed only where they bind into layout.)

| Current dependency | Current file / form | Layout Contract replacement |
|---|---|---|
| Hardcoded tab content routing (`if (drawerTab===… && drawer.type===…)`) | `AdminEntityDrawer.tsx` | Rendering `tab.blocks[]` of the effective drawer LayoutDoc (§4.3.1); legacy JSX = transitional fallback only |
| Code-only layout registry (`ENTITY_PRESENTATION_REGISTRY`) | `web/lib/entityPresentation.ts` | Becomes the **seeded default** producer of LayoutDocs (§7.2); org override is the source of truth via deterministic merge |
| `entity_field_registry` / `entity_layouts` TODO (header comment) | `entityPresentation.ts` header | The contract’s default+override+merge model (§7) — the named-but-unbuilt persistence becomes the override store (mechanics out of scope) |
| Field-definition entity allowlist (Settings API incl. `inquiry_child`) | `web/app/api/admin/field-definitions/route.ts`; `field_catalog_convergence_audit.md` | Catalog/config scope behind the contract. Per the ratified Child Model decision (`child_model_convergence_audit.md` §FINAL DECISION): **`inquiry_child` is a technical/config projection over OCM, not a product-facing layout entity.** Durable child = **Child / `customer_member`**; OCM child fields reach layouts only via an **enrollment-child context** (relationship section / repeater / widget). Allowlist is a catalog concern, not a layout surface |
| Custom-field admin editor | `web/components/admin/EntityFieldsClient.tsx` | Authors catalog fields the LayoutDoc references; field class/visibility per catalog, placement per LayoutDoc |
| Related-module config (`relatedModules`) bolted to Related tab | `entityPresentation.ts` | Generalized to `queue`/`repeater`/`relationship_section` blocks usable in any tab (§2) |
| Bespoke widget wiring (pricing/documents/related) | drawer JSX | Placement via `widget` blocks keyed to the Widget Registry (§5); components wrapped not rebuilt |
| **Record Layout V1** (org→global DB layouts) | `record_drawer_layouts` / `record_layouts`, `RecordLayoutConfigJson` (`effectiveRecordDrawerLayout.ts`); modes `inquiry_drawer_mode: workflow_v1`, `person_drawer_mode: runtime_v1`, `overview_section_order`, schedule `layout_blocks` | Behavior **absorbed** into the layout-runtime resolver as the override store (§7.2); `entity_layouts`/`LayoutDoc` is the V2 destination. (inventory §8) |
| AdminV2 VM + drawer pipeline + reveal contracts (**production**, not demo) | `web/components/admin/vmDrawer/*`, `web/lib/adminV2/drawerPipeline/*`, `web/lib/adminV2/runtime/contract/*` | Remain **consumers** of the contract; VM not redesigned (§8.4); reveal contracts integrate as the runtime readiness gate (Reveal Contracts §). Only the `adminV2/workspace` **demo** registries (`ui-v2/demo/*`) are out of scope (§10.4) |
| `document_field_definitions` (separate `doc_type` field model) | migrations + documents UI | Stays its own catalog; surfaced via `widget:documents`; contract references its rendered result, not its schema |
| Pipelines / pipeline_stages | `pipelines`, `pipeline_stages` | Lifecycle seam (§9 seam 3) surfaced via `lifecycle_rail`/`lifecycle_actions`; not redefined by layout |
| Child model (`customer_members` / OCM / `inquiry_child`) | schema + drawers; `inquiryChildFieldRegistry.ts`, OCM migrations | Per ratified Child Model decision: **durable child truth = Child / `customer_member`** (optionally linked to `persons`); **enrollment participation = OCM** (`opportunity_customer_members`); **`inquiry_child` = config projection over OCM, kept at data/runtime, not a product-facing layout entity.** Layouts prefer durable Child / Customer Member; OCM-scoped fields surface only via **enrollment-child context** (relationship section / repeater / widget), never a standalone entity layout, never raw table names. No separate inquiry-child runtime/presentation; waitlist/readiness/lifecycle/child-grain queues unchanged |
| Legacy person models (`contacts`) | schema + drawers | Not consolidated this sprint (§10.11); stay legacy. Parents/guardians resolve via the person catalog |

---

## Convergence Summary

Every active presentation artifact resolves to a Layout Contract V1 artifact:

- **Drawer sections** → `section` / `relationship_section` / `repeater` blocks; field cells → field references.
- **Tabs** → `tabs[].key` constrained to the Tab Registry (membership already config-shaped; content routing converts from hardcoded JSX to `tab.blocks[]`).
- **Queue** (`queue` surface; list-table columns are a separate Layer-0 concern) → one `QueueLayout` consumed by the AdminV2 `QueueBlock`/`QueueVm` and `QueueService`; a lifecycle may have **multiple variants** by `queue_context` (waitlist canonical); cohort/routing stays a referenced lifecycle seam.
- **Widgets** → the eight frozen `widgetKey`s; the lifecycle-facing widgets are already-production components that get wrapped, not built.
- **Reveal contracts** → the AdminV2 section reveal/readiness gates absorbed as the layout-runtime **readiness step keyed by block/tab/queue keys** (not a block kind, must not be weakened). Record-open/deep-link is separate **navigation**.
- **Legacy admin** → Layer-0 registry becomes the seeded default; Record Layout V1 (`record_drawer_layouts`→`record_layouts`) is the override store absorbed into the resolver; `entity_layouts`/`LayoutDoc` is the destination; AdminV2/VM and separate catalogs (documents, lifecycle) become consumers/seams, not parallel systems.

**Single-system guarantee preserved:** no artifact maps to a new presentation layer, a new runtime, a new VM, or a new lifecycle model. Each maps into the existing, frozen contract.

*End of Runtime → Layout Contract V1 Mapping.*
