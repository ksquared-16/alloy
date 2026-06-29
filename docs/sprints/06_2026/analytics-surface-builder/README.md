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

## 3. One builder for every surface — generalize, never fork

**Architectural rule:** there is exactly **one** `SurfaceBuilder` in Alloy. We do **not** create `AnalyticsSurfaceBuilder` (that forks the platform). We **extract** the canonical builder out of the Focus Panel implementation into a generic `SurfaceBuilder` and migrate Focus Panel to consume it. Operational Intelligence is then the **second consumer** — zero new builder code. The builder never knows what kind of surface it is building; it receives a `SurfaceDefinition`.

### The contract — `SurfaceDefinition`

The only surface-specific inputs. Everything else (tree, canvas, inline insertion, drag/reorder, Inspector chrome, publish) is shared.

```ts
type SurfaceDefinition = {
  surfaceType: string;                 // "focus_panel" | "operational_intelligence" | "executive_performance" | "workspace_header" | "work_unit_header" | "report"
  title: string;
  sections: "none" | "fixed" | "authorable";   // Focus Panel = none (single canvas); OI = authorable
  availableCardTypes: CardTypeDef[];           // renderer-backed: KPI, Trend, Gauge, Comparison, Breakdown, Chart, Table, Health, Narrative, Insight, Recommendation, Forecast, Affected work, Action, Command
  availableContentSources: ContentSourceProvider;  // lists pickable Content — OI = Operational Calculations registry; Focus Panel = entity fields/relations
  inspectorSchema: InspectorSchema;            // which Inspector tabs/fields this surface's cards expose
  persistence: SurfacePersistenceAdapter;      // load / insert / move / configure / publish — Focus Panel = entity_layouts; OI = metric_placements (the ONLY surface-specific I/O)
  canvasRenderer: (state) => ReactNode;        // renders the live surface — Focus Panel renderer; OI = MetricPlacementRenderer
};
```

`<SurfaceBuilder definition={focusPanelSurfaceDefinition} />` and `<SurfaceBuilder definition={operationalIntelligenceSurfaceDefinition} />` are the **same component**. Focus Panel and OI differ only in their definition.

### Extraction sequence (start now)

1. **R1 · Extract `SurfaceBuilder`.** Lift the chrome out of `FocusPanelSummarySurfaceEditor` / `FocusPanelCardInspector` into generic `SurfaceBuilder` + `SurfaceInspector`, parameterized by `SurfaceDefinition` + adapters. No behaviour change. Gated by the existing Focus Panel builder tests (`focusPanelSummarySurfaceEditor.test.tsx`, `focusPanelEditMode.test.tsx`, `focusPanelCanvasFinalization.test`).
2. **R2 · Focus Panel becomes a consumer.** Define `focusPanelSurfaceDefinition` (entity-layout persistence adapter, entity-field content source, focus-panel card types/inspector) and render it through `SurfaceBuilder`. **Pixel + behaviour parity** — the Focus Panel test suite stays green. This proves the generalization before Analytics touches it.
3. **R3 · Operational Intelligence becomes the second consumer.** Define `operationalIntelligenceSurfaceDefinition`: `sections: "authorable"`; card types = the metric renderers; content = the Operational Calculations registry; persistence adapter = `metric_placements` (existing POST/PATCH APIs, no draft/publish split); canvas = `MetricPlacementRenderer` (`surface=operational_intelligence`). The OI builder appears with **no new builder code** — just the definition. Surfaces "Configure" opens it.
4. **R4 · Card Inspector contract.** OI's inspector schema → Card · Content · Renderer · Promote: Title (viz label), Renderer (`visualization_type`), thresholds (`threshold_config`), drill (drill registry), **Promote to** = create/remove placements across surfaces.
5. **R5 · The rest are just definitions.** Executive Performance, Enrollment Intelligence, Financial Performance, Workspace Header, Work Unit Header, Reports = additional `SurfaceDefinition`s. No new builder.
6. **R6 · Replace `/settings/analytics`.** Rename route → **Operational Calculations** (Platform, advanced); move the calculation/rollup/snapshot tabs there; delete "Targets"/"Visibility". Surfaces nav: every Dashboards & Analytics surface carries the builder editor.
7. **R7 · Publish + refresh.** "Published" confirmation; fire `ANALYTICS_V2_SNAPSHOTS_UPDATED` so the runtime modal reloads.

After R1–R7 there is **one builder, one interaction model, one platform**. The answer to *"how do I add a metric to Operational Intelligence, the Workspace Header, or a Work Unit Header?"* is the same as for Focus Panels: **build the Surface** — in the one `SurfaceBuilder` that powers them all.

> **Risk gate:** R1–R2 touch the live Focus Panel builder. They ship only when the full Focus Panel builder test suite is green at parity. No Analytics work lands until Focus Panel runs on the extracted `SurfaceBuilder`.
</content>
