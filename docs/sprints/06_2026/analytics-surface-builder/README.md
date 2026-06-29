# Analytics Surface Builder — one builder, every surface

**Status:** Product correction (June 2026). The Analytics authoring model is **replaced**. Operational Intelligence becomes a **Surface Type** inside the existing Surface Builder — the same builder that powers Focus Panels, Queue Rows, Workspace Headers, and Work Unit Headers. We do not invent another builder; we extend the one we have.

**The whole product:** `Settings → Surfaces → Operational Intelligence → (canvas) → Section → Card → Publish`. The operator never sees `metric_definitions`, `metric_visualizations`, `metric_placements`, "display styles", or "where it appears". Analytics is **content** inside a Surface; the platform writes the implementation underneath.

---

## 1. The replacement builder (open in a browser)

Alloy design system (`mockups/_shared.css`). Production-quality HTML, not wireframes. Mirrors the Focus Panel builder: **left tree + component library · center live canvas · right contextual Inspector**, with inline "+ Add card" insertion (the same "+ line" pattern). No tabs, no wizard, no forms-first config.

| File | Screen |
|---|---|
| `mockups/builder-canvas.html` | **The complete builder.** Left: Surface tree (Operational Intelligence → Sections → Cards) + Available components (KPI, Trend, Gauge, Comparison, Breakdown, Chart, Table, Health, Narrative, Insight, Recommendation, Forecast, Affected work, Action, Command). Center: live canvas of real runtime cards, selected card highlighted, inline "+ Add card". Right: contextual Inspector (Card · Content · Renderer · Promote) with Content picker, Renderer chips, Title, Question, Tone thresholds, Comparison, Drill, and **Promote to** (the surfaces this card appears on). |
| `mockups/builder-add-card-inline.html` | **Add card, inline.** Click "+ Add card" → an in-place panel opens on the canvas: pick a card type, pick its Content (grouped, question-led, Live/Set-up status), live preview, Insert. No full-screen wizard. |

**The test:** open `builder-canvas.html`. It should read like Figma/Webflow for surfaces — one canvas, one interaction model — and obviously the same builder as Focus Panels. If it reads as "a better Analytics Configuration page", it failed.

---

## 2. Convergence plan — every `/settings/analytics` screen

`/settings/analytics` stops being the Analytics product. It becomes **Platform → Operational Calculations** (admin-only). Verdicts:

| Today (`/settings/analytics`) | Writes | Verdict | New home |
|---|---|---|---|
| **"Calculations"** tab (MetricBuilderPanel) | `metric_definitions` | **Move → Advanced** | Platform → Operational Calculations (formula, source, grain). Surfaces as **Content** in the picker. |
| **"Display styles"** tab (VisualizationBuilderPanel) | `metric_visualizations` | **Merge** | Becomes the **Renderer** control in the card Inspector. Standalone tab **deleted**. |
| **"Where it appears"** tab (PlacementBuilderPanel) | `metric_placements` | **Delete** | Replaced by **Promote to** in the card Inspector. `metric_placements` written invisibly. |
| **"Combined scores"** (RollupBuilderPanel) | `metric_rollups` | **Move → Advanced** | Platform → Operational Calculations. The rollup is pickable as **Health** card content. |
| **"Targets" / "Visibility"** (legacy) | KPI/pack config | **Delete** | Folded into card tone thresholds + visibility. |
| **"+ New metric"** (MetricSetupFlow) | 3 tables | **Replace** | The builder's Add-card + Content flow; brand-new calculations route to Platform → Operational Calculations. |
| **Metric snapshot button** | snapshots | **Move → Advanced** | Platform → Operational Calculations (Snapshots / Adapters). |
| **`/settings/analytics` route** | — | **Replace (rename)** | Becomes **Operational Calculations** (Platform). Not where operators build Operational Intelligence. |

Net: **one** authoring place (Surfaces), **one** advanced place (Operational Calculations). Zero implementation vocabulary in the operator path.

---

## 3. Implementation slices — start now, ship aggressively

Reuse `FocusPanelSummarySurfaceEditor` + `FocusPanelCardInspector` (the canonical builder + Inspector), the Card Language / `MetricVisualRenderer`, the placements API (writes immediately, no draft/publish split), the Operational Calculations registry (Content picker), and the shipped runtime. Build nothing new.

1. **S1 · Operational Intelligence as a Surface Type.** Give the OI dashboards entry an `editor`; render an `AnalyticsSurfaceBuilder` shell cloned from `FocusPanelSummarySurfaceEditor` (toolbar + centered live canvas + contextual Inspector + inline insertion). Surfaces "Configure" opens the builder.
2. **S2 · Canvas from runtime.** Render the canvas with the existing config-driven path (`metric_placements` → `MetricPlacementRenderer`, `surface=operational_intelligence`) that the runtime modal already uses. Sections = `placement_zone` (or a `surface_key` per section).
3. **S3 · Left tree + component library.** Surface tree (sections → cards) + "Available components" = the card-type vocabulary. Drag/click inserts.
4. **S4 · Add card (inline).** "+ Add card" → card type → Content (Operational Calculations registry, grouped by business process) → write `metric_visualization` (if new) + `metric_placement` via existing POST APIs. Mirror the FP "+ line" catalog.
5. **S5 · Card Inspector.** Clone `FocusPanelCardInspector` tabs → Card · Content · Renderer · Promote: Title (viz label), Renderer (`visualization_type`), thresholds (`threshold_config`), drill (drill registry), **Promote to** = create/remove placements across surfaces, via existing PATCH APIs.
6. **S6 · Reorder / resize.** Drag → `sort_order` PATCH; span cycle. Mirror `moveSummaryCardToIndex` / `cycleSummaryCardSpan`.
7. **S7 · Replace `/settings/analytics`.** Rename route → **Operational Calculations** (Platform, advanced); move the four builder tabs + snapshots there; delete "Targets"/"Visibility". Surfaces nav: every Dashboards & Analytics surface carries the builder editor.
8. **S8 · Publish + refresh.** "Published" confirmation; fire `ANALYTICS_V2_SNAPSHOTS_UPDATED` so the runtime modal reloads.

Each slice independently replaces a piece of the current UI. After S1–S8 the answer to *"how do I add a metric to Operational Intelligence, the Workspace Header, or a Work Unit Header?"* is one workflow: **build the Surface** — in the one builder that powers them all.
</content>
