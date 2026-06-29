# Analytics Surface Builder — replacement product

**Status:** Product correction (June 2026). The authoring model for Analytics is **replaced**, not improved.

**The one workflow:** `Settings → Surfaces → Operational Intelligence → Section → Add Card → Card type → Metric → Renderer → Configure → Publish`. The operator never sees `metric_definitions`, `metric_visualizations`, `metric_placements`, "display styles", or "where it appears". Surfaces owns Analytics; the platform quietly manages calculations, renderers, placements, and runtime wiring — exactly like Focus Panels, Queue Rows, and Workspace.

---

## 1. High-fidelity mockups (open in a browser)

The actual UI, in the Alloy design system (`mockups/_shared.css`, Pine/Midnight). Not wireframes.

| File | Screen |
|---|---|
| `mockups/builder-01-operational-intelligence.html` | **Surface Builder canvas** — Settings → Surfaces → Operational Intelligence. Sections rail, live cards, drag, Add card, unpublished-changes bar, Publish. |
| `mockups/builder-04-card-type-picker.html` | **Add Card · step 1** — card-type gallery (KPI, Trend, Gauge, Comparison, Chart, Breakdown, Table, Health, Narrative, Insight, Recommendation, Forecast, Affected work, Action panel, Command panel). |
| `mockups/builder-02-add-card-metric-picker.html` | **Add Card · step 2** — Metric picker grouped by business process; question-led, "Live/Available/Set up" status; live preview. No implementation terms. |
| `mockups/builder-03-configure-card-placement.html` | **Add Card · step 4** — Configure: renderer, label, question, tone thresholds, drill, and **"Appears on"** (placement belongs to the card, multi-surface). Live preview. |

**The test:** open `builder-01`. It should read as "yes, that is obviously how Analytics should be built" — a Surface composed of Sections and Cards, identical in spirit to the Focus Panel builder.

---

## 2. Convergence plan — every `/settings/analytics` screen

`/settings/analytics` stops being the operator workflow. Verdicts:

| Today (`/settings/analytics`) | Writes | Verdict | New home |
|---|---|---|---|
| **"Calculations"** tab (MetricBuilderPanel) | `metric_definitions` | **Move → Advanced** | Platform → Operational Calculations (define formula/source/grain). Pickable as a Metric in the builder. |
| **"Display styles"** tab (VisualizationBuilderPanel) | `metric_visualizations` | **Merge + rename** | Becomes the **Renderer** step inside Add Card / card config. Standalone tab **deleted**. The word "visualization/display style" → **Renderer**. |
| **"Where it appears"** tab (PlacementBuilderPanel) | `metric_placements` | **Delete (as a tab)** | Placement moves **into the card** ("Appears on"). `metric_placements` still written — invisibly, by the builder. The phrase "where it appears" **disappears**. |
| **"Combined scores"** tab (RollupBuilderPanel) | `metric_rollups` | **Move → Advanced** | Platform → Operational Calculations (Rollups). The resulting rollup is pickable as a **Health** card metric. |
| **"Targets"** (legacy KpiTargetsPanel) | KPI config | **Delete** | Folded into card **tone thresholds** (Configure step). |
| **"Visibility"** (legacy OipVisibilityPanel) | pack visibility | **Delete** | Folded into card visibility + section management. |
| **"+ New metric"** flow (MetricSetupFlow) | 3 tables | **Replace** | Add Card flow handles placement; defining a brand-new calculation routes to Platform → Operational Calculations → New calculation. |
| **Metric snapshot button** | snapshots | **Move → Advanced** | Platform → Operational Calculations (Snapshots / Adapters). |
| **`/settings/analytics` route** | — | **Reframe → Advanced** | Becomes **Platform → Operational Calculations** (admin-only: formula, source, threshold, target, rollup, snapshot, adapter, version). Not the normal path. |

Result: **one** authoring place (Surfaces); **one** advanced place (Operational Calculations); zero implementation vocabulary in the operator path.

---

## 3. Implementation slices (start after mockups are approved)

Reuses the Focus Panel Surface Builder, the Card Language / Metric renderers, the placements API, and the runtime already shipped. No new builder, card language, placement system, dashboard architecture, runtime, or renderer system.

1. **S1 · Surface editor kind.** Add `editor: "operational-intelligence"` to the OI dashboards entry in `useSurfacesConfigurationSettings.ts`; render an `AnalyticsSurfaceBuilder` shell that mirrors `FocusPanelSummarySurfaceEditor` (load → canvas → inspector → publish). Surfaces "Configure" opens the builder, not the placements tab.
2. **S2 · Canvas from placements.** Sections map to `placement_zone` (overview/health/trends/comparisons) or a `surface_key` per section. Render cards with the existing `MetricPlacementRenderer` (`surface=operational_intelligence`) — the config→runtime path already merged into the modal reuses the same resolution.
3. **S3 · Add Card flow.** Card type → Metric picker (from the Operational Calculations registry, grouped by business process) → Renderer (`MetricVisualizationType`) → Configure → write `metric_visualization` (if new) + `metric_placement` via the existing POST APIs. Immediate, no draft/publish split for placements.
4. **S4 · Card Inspector.** Edit label (visualization label), renderer (visualization_type), thresholds (definition `threshold_config`), drill (drill registry), and **Appears on** (create/remove placements across surfaces) via existing PATCH APIs.
5. **S5 · Reorder / resize.** Drag → `sort_order` PATCH; span cycle. Mirror `moveSummaryCardToIndex` / `cycleSummaryCardSpan`.
6. **S6 · Reframe Platform.** Move the four builder tabs + snapshots behind **Platform → Operational Calculations (advanced)**; relabel; keep deep-links for admins. Update Surfaces nav so Dashboards & Analytics surfaces all carry the builder editor.
7. **S7 · Publish + refresh.** Lightweight "Published" confirmation; fire `ANALYTICS_V2_SNAPSHOTS_UPDATED` so the runtime Analytics modal reloads.

Each slice is independently shippable and replaces one piece of the current UI. After S1–S7, the answer to *"how do I add a metric to Operational Intelligence, the Workspace Header, or a Work Unit Header?"* is one workflow: **build the Surface.**
</content>
