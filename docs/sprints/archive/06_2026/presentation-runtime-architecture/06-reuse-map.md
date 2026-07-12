# Reuse Map — Presentation Runtime

**Path:** `docs/sprints/archive/06_2026/presentation-runtime-architecture/06-reuse-map.md`
**Status:** Architecture sprint — design only (June 2026)
**Companion:** [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md), [`05-surface-inventory.md`](./05-surface-inventory.md)

---

## 1. Purpose

This map identifies what Alloy **reuses**, what needs a **compatibility layer**, what should be **retired**, and where **extension points** exist — so the Presentation Runtime Architecture sprint produces an honest migration path, not a greenfield fantasy.

---

## 2. Reuse as-is (frozen — do not rebuild)

These are production-ready or design-frozen artifacts that the Presentation Runtime builds on directly.

| Artifact | Location | Role in Presentation Runtime |
|---|---|---|
| **Runtime spine** | `canonical-interaction-model.md` | Operational interaction hierarchy — unchanged |
| **Universal Card anatomy** | `universal-card-system.md`, `UniversalCard.tsx` | Card shell primitive — platform-owned anatomy |
| **8 Card Archetypes** | `universal-universal-card-archetypes.md`, `FocusPanelCardRenderer.tsx` | Structural card behavior — frozen |
| **5 Interaction models** | `card-interaction-expansion-doctrine.md` | Expansion/drill/workspace/subject-change — frozen |
| **Content templates** | `card-content-template-field-inclusion-doctrine.md` | Field inclusion at compact/expanded/drill depths — frozen |
| **Configuration Mode shell** | `ConfigurationModeShell.tsx`, `BusinessProcessConfigurationShell.tsx` | Experience Builder page shell — reuse directly |
| **Configuration Mode nav** | `configurationModeNav.ts`, `SidebarConfigurationModeNav.tsx` | Settings nav — rename "Layouts" → "Design Surfaces" |
| **Layout Gallery** | `LayoutGalleryClient.tsx` | Design Surface gallery — extend with new categories |
| **Layout Assignment Card** | `LayoutAssignmentCard.tsx` | BP → Design Surface assignment — relabel |
| **Field Catalog** | `fieldCatalog.ts`, `field_definitions` table | Data Source for Slots — universal |
| **Typography tokens** | `presentationTypography.ts` (tiers 1–6) | Renderer typography contract — universal |
| **Date formatters** | `presentationDateFormat.ts` | Renderer date contract — universal |
| **Visual language** | `alloy-visual-language.md`, `configurationRuntime.css` | Bend Pine / Midnight / Stone / white canvas — universal |
| **Reveal / performance gates** | `adminv2-runtime-performance-doctrine.md` | All surfaces inherit — never weaken |
| **Action execution pipeline** | `executeAdminAction`, `action_definitions`, `action_placements` | Action CTAs route here — universal |
| **Publishing APIs** | `/api/admin/entity-layouts` CRUD + publish + duplicate + rollback | Design Surface lifecycle — reuse |
| **Surface registry** | `surfaceLayoutRegistry.ts` | Surface keys, zones, platform shell slots — extend |
| **BP layout resolution** | `business_process_layout_assignments`, `workViewsConfigV1` | Assignment resolution — extend with Viewpoint layer |
| **Work Views** | `workViewsConfigV1.ts`, `mergeOperationalViewMetadata.ts` | Perspective (lens) config — unchanged |
| **BOS rail** | BOS Assist rail | Unchanged in Experience Builder |
| **Metric visual components** | `MetricKpiCard`, `MetricTrendCard`, `MetricVisualRenderer` | Analytics Renderers — reuse as Renderer catalog entries |
| **Form engine** | `FormEngineRenderer.tsx`, `FormSchemaV1` | Capture runtime — separate but shares authoring chrome |
| **Document composition** | `documentComposition.ts` | Document Design Surface blocks — reuse |

---

## 3. Compatibility layers (bridge during migration)

These exist today as parallel systems. The Presentation Runtime introduces a **compatibility layer** that lets them coexist while converging.

| Parallel system A | Parallel system B | Compatibility layer | Migration direction |
|---|---|---|---|
| **LayoutDoc** (Section → Row → Column → Item) | **Universal Card grid** (Zone → Card → Slot → Renderer) | Derive card compositions from layout sections (`leadSummaryCardBlueprint.ts` pattern); map sections → zones, widgets → card types, fields → slots | LayoutDoc → DesignSurfaceDoc (card-native) |
| **Queue row v3** (`metadata.queue_record_layout`) | **LayoutDoc.sections[]** | Shared display Renderers + field catalog; separate document shapes intentionally | Queue row → DesignSurfaceDoc (queue category) |
| **VM-derived Focus Panel cards** (`deriveOpportunityFocusPanelCards.ts`) | **LayoutDoc-published Focus Panel** | Card Type catalog + Content Templates replace hardcoded derivation; derivation remains fallback | Derivation → configured Card Instances |
| **Analytics V2** (`metric_definitions` + `metric_visualizations` + `metric_placements`) | **OIP legacy** (`kpiRegistry`, `workspace_kpi_placement`) | Shared Metric Renderer catalog; V2 placement resolver extends to Design Surface assignment | OIP legacy → Analytics V2 → Design Surface placement |
| **LayoutDoc "Section"** | **Card-internal "Section"** (5C) | Lexical disambiguation in docs; LayoutDoc sections map to Zones or Cards during migration | LayoutDoc sections → Zones |
| **`perspectives_v1`** (stage-scoped) | **`work_views_v1`** (process-level) | `workViewsCompatibility.ts` merge layer — already exists | perspectives_v1 → retired when Work Views complete |
| **`record_drawer_layouts`** (legacy JSON) | **`entity_layouts`** (LayoutDoc) | Dual-write blocked when visual config on (Phase 5) | Legacy → retired after cutover |
| **`record_layouts`** (global templates) | **`entity_layouts`** | Fallback only when org has no published layout | Legacy → retired |
| **Forms visibility conditions** | **Layout/Card visibility conditions** | Shared condition grammar (proposed in §4.9 of runtime doctrine) | Unified condition engine |
| **ConfigurationRuntimeUniversalCard** (settings UI shell) | **UniversalCard** (runtime card) | Same visual language; different context (settings vs runtime) — do not conflate | Keep separate; shared tokens |

---

## 4. Extension points (where new surfaces plug in)

| Extension point | How to extend | Example |
|---|---|---|
| **Surface category** | Add category to `surfaceLayoutRegistry.ts` + Experience Builder queue + category editor | Add "Portal" category |
| **Card Type** | Platform adds to Card Type catalog with Archetype + Slot grammar + Content Template | Add "Subsidy" Card Type |
| **Renderer** | Platform adds to Renderer catalog with typography tier + visual token contract | Add "Map" Renderer |
| **Zone topology** | Platform defines zone grammar per category in registry | Add `sidebar` zone to Dashboard category |
| **Data Source resolver** | Platform adds resolver ref for Card Type Slot binding | Add `subsidy.eligibility` resolver |
| **Viewpoint** | Tenant adds audience scope with override rules | Add "Corporate" Viewpoint |
| **Inheritance level** | Platform extends cascade with new scope | Add "Franchise" level between Industry and Org |
| **Interaction model** | Platform adds to 5B catalog (requires doctrine amendment) | Future: "Split View" model |
| **Capture surface** | New form/document category with capture-specific validation | Add "Incident Report" form |

---

## 5. Legacy components to retire

| Component | Location | Replacement | Retire when |
|---|---|---|---|
| **`record_drawer_layouts`** | Legacy org drawer overrides | `entity_layouts` (LayoutDoc → DesignSurfaceDoc) | After visual editor cutover complete |
| **`record_layouts`** | Global config_json templates | `entity_layouts` | After all entities have org-published layouts |
| **`entityPresentation.ts`** ("Layer 0") | Transitional fallback | Published Design Surface per entity | After layout published for all entities |
| **`OPERATIONAL_FORM_SYSTEM_FIELDS`** | Forms fallback picker | `field_definitions` (Field Catalog) | After field registry convergence |
| **`CHILDCARE_LAYOUT_FIELD_CATALOG`** | Curated layout fallback | `field_definitions` | After field registry bootstrap complete |
| **`workspace_kpi_placement`** + code KPI registry | Parallel to Analytics V2 | Analytics V2 `metric_placements` + Design Surface assignment | After OIP → V2 migration |
| **`perspectives_v1`** | Stage-scoped lens compat | `work_views_v1` | After Work Views runtime convergence |
| **`AdminEntityDrawerLegacy`** | Non-converged entity drawer | Focus Panel + Subject Composition | After all entities converge |
| **`LayoutsSettingsHubClient`** | Legacy hub with `RecordDrawerCompositionWorkspace` | `LayoutsSettingsPageClient` (gallery → editor) | Already non-primary; delete when gallery is sole entry |
| **`LayoutConfigClient`** (advanced builder) | Section/row/column fallback | Category-specific Experience Builder editors | After visual editor covers all section ops |
| **Dept-first workspace landing** | Legacy workspace entry | Command Center (Workspace V3) | Already removed from operator UX |
| **Browse Mode / expanded queue State 1** | Retired UX | Compressed queue State 2 only | Dormant code — delete |
| **Analytics modal OIP pack path** | `AnalyticsWorkspacePanel.tsx` OIP packs | Analytics V2 `OiV2MetricOverview` + Design Surface dashboards | After V2 dashboard category ships |

---

## 6. Deletion opportunities

| Opportunity | Risk | Recommendation |
|---|---|---|
| Delete `record_drawer_layouts` table | Medium — some orgs may still have legacy overrides | Migrate → verify → delete in dedicated migration sprint |
| Delete `record_layouts` table | Low — global templates replaced by org layouts | Delete after confirming zero runtime references |
| Delete `entityPresentation.ts` | Low — transitional fallback | Delete when all entities have published layouts |
| Delete `LayoutConfigClient` | Low — advanced builder fallback | Keep until visual editor is feature-complete |
| Delete OIP pack registry (`kpiRegistry.ts`) | Medium — still consumed by analytics modal | Delete after Analytics V2 dashboard category replaces modal |
| Delete `perspectives_v1` compat layer | Medium — runtime convergence incomplete | Delete after Work Views fully converged |
| Consolidate 4 renderers into 1 | High — different input contracts (LayoutDoc vs VM vs FormSchema vs Metric) | **Do not consolidate renderers** — unify Renderer catalog, keep runtime adapters |
| Merge FormSchemaV1 into LayoutDoc | High — capture vs display are distinct runtimes | **Do not merge** — share authoring chrome, separate runtime contracts |

---

## 7. Migration phasing (recommended, not this sprint)

This sprint defines architecture only. Implementation should follow this phasing:

| Phase | Scope | Builds on |
|---|---|---|
| **P0 — Vocabulary + nav rename** | "Layouts" → "Design Surfaces" in nav, routes, copy. No behavior change. | Existing gallery + editor |
| **P1 — Configuration Mode shell for Design Surfaces** | Wrap `/settings/design-surfaces` in `ConfigurationModeShell` with category queue | Processes shell (reference) |
| **P2 — Card Type catalog + Lead Summary blueprint** | Generalize `leadSummaryCardBlueprint.ts` pattern; Card Type picker in editor | Existing blueprint work |
| **P3 — Focus Panel editor (card-native)** | Replace section/row/column editing with Zone/Card/Slot/Renderer for Focus Panel category | System 4/5/5A/5B/5C doctrine |
| **P4 — Queue Row editor** | Queue row category editor using shared Renderers | Queue v3 composer |
| **P5 — Analytics Dashboard category** | Dashboard category editor; metric placement via Design Surface | Analytics V2 + Metric Renderers |
| **P6 — Viewpoint layer** | Audience axis inheritance + override UI | Inheritance cascade |
| **P7 — Document / Communication / POS categories** | Category-specific editors | Document composition, POS shell |
| **P8 — Portal / Mobile categories** | Responsive Design Surface editors | Portal/mobile concepts |
| **P9 — Legacy retirement** | Delete compat layers per §5 | All prior phases complete |

---

## 8. Cross-references

| Concern | Doc |
|---|---|
| Presentation Runtime doctrine | [`01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`](./01-archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md) |
| Surface inventory | [`05-surface-inventory.md`](./05-surface-inventory.md) |
| Architecture recommendations | [`07-architecture-recommendations.md`](./07-architecture-recommendations.md) |
| Existing EB doctrine | `docs/platform/operator/experience-builder-doctrine.md` |
| Legacy architecture inventory | `docs/platform/governance/implementation-patterns.md` |
