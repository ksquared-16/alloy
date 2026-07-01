# Phase 3 — Implementation & Convergence Strategy

**Status:** Implementation planning (June 2026). Runs **only after** Phase 1 product architecture is frozen.
**Principle:** The implementation converges the existing platform toward the ideal product — it does not constrain the product vision.

> Reminder of the audit's core finding: there is no `/analytics` page. "Analytics" today = `/settings/analytics` (config) + the "Operational Intelligence" modal (runtime) + three coexisting metric layers. The ideal is a first-class **Intelligence** surface family + embedded metrics everywhere, on **one** configuration model.

---

## 1. Convergence audit — current vs ideal

| Ideal (Phase 1) | Today | Gap | Disposition |
|---|---|---|---|
| Intelligence surface family (Exec, OI, process, optimization, reporting) | "Operational Intelligence" modal + `/settings/analytics` builder | No runtime Intelligence surfaces; modal only | **Build** surfaces; promote modal content to Operational Intelligence surface |
| Analytics = Dashboard Design Surface category | `/settings/surfaces` has empty `dashboards` stub | Category not populated/authorable | **Wire** the stub to `metric_placements` |
| One Metric archetype, many renderers | V2 renderers exist (`MetricKpiCard`, `MetricTrendCard`, `MetricComparisonCard`, `MetricScorecard`, `MetricSparkline`, `MetricChip`) | Missing Health(gauge polish), Breakdown, Forecast, Benchmark, Insight, Recommendation | **Extend** renderer catalog incrementally |
| Calculation owned by OIP | OIP V1 computes; V2 delegates via adapters | Two snapshot stores (`metric_snapshots`, `metric_platform_snapshots`); 3 registries | **Converge on OIP-via-V2**; keep math in OIP |
| One Metric card chrome (Universal Card) | 3 chromes: `MetricKpiCard`, `OipKpiObjectCard`, `KPIVm` strips | Divergent visual language | **Unify** onto Universal Card shell |
| Embedded metrics via placements | `MetricPlacementRenderer` live on workspace/work-unit/tile headers (V2) + V1 `KPIVm` fallback | Duplicate header owners (V1 + V2) | **Demote then retire** V1 strips after parity |
| Bidirectional roll-up/drill | `metric_rollups` table + dimensions exist; drill UX not built | No deterministic drill → queue/record from a metric card | **Build** drill resolution (metric → queue scope) |
| Improvement loop (Optimization Centers) | None | Entirely new surface type | **New build** (later phase) — reuse action/workflow paths |
| Reporting (snapshot/period) | None (legacy dashboard only) | No report surfaces | **New build** (later phase) — reuse snapshot tables + document renderers |

---

## 2. Reusable platform components (do not rebuild)

| Component | Path | Reuse as |
|---|---|---|
| V2 placement render pipeline | `web/app/api/admin/analytics/render/route.ts`, `web/lib/metrics/platform/renderMetricPlacements.ts`, `placementResolver.ts` | Composition engine for all Analytics surfaces |
| `MetricPlacementRenderer` | `web/components/admin/metrics/MetricPlacementRenderer.tsx` | The runtime card-zone owner (embedded + surfaces) |
| `MetricVisualRenderer` + renderer set | `web/components/admin/metrics/Metric*.tsx` | The Metric renderer catalog (re-chrome onto Universal Card) |
| OIP engine + resolvers | `web/lib/metrics/metricEngine.ts`, `resolvers/*` | Calculation owner (never reimplement math) |
| `metric_definitions` / `_visualizations` / `_placements` / `_rollups` | migration `20260624120000` | Definition + composition store (no migration needed) |
| Surfaces config shell | `web/components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx`, `useSurfacesConfigurationSettings.ts` | Experience Builder home for Dashboard category |
| Universal Card / archetype body | `web/components/admin/focusPanel/UniversalCard.tsx`, `ArchetypeCardBody.tsx` | Shared card shell for Metric cards |
| Operational Context boundary | `web/lib/adminV2/runtime/operationalContext/*` | Scope/subject binding for record-grain metrics |
| Health rollup compute | `web/lib/metrics/metricRollups.ts`, `workspaceHealthSummary.ts` | Health gauge + Executive roll-up |

**Net:** ~70% of the runtime substrate already exists. The work is **chrome unification + surface wiring + drill resolution + renderer extensions**, not a rebuild.

---

## 3. Migration strategy (safe, reversible, parallel to Core Four)

Guardrails carried from the audit and `.cursor/rules/adminv2-runtime-performance.mdc`:
- No storage migration unless forced; `metric_placements` is the composition store.
- Header convergence touches **protected runtime files** → gated behind the perf test suite.
- No disruption to Core Four Focus Panel work (different files).
- Do not delete legacy until V2 parity is verified on real snapshot data.

### Sequenced slices

**Slice 1 — Metric chrome unification (UI-only, unprotected files).**
Re-chrome `MetricKpiCard` + siblings onto the Universal Card shell with the tone/drill/why anatomy from the gallery mockup. No data, readiness, or placement changes. Ship behind existing flag. *Exit:* one visual language for every metric card.

**Slice 2 — Dashboard category + dev preview.**
Populate `SURFACE_OBJECTS.dashboards` in `useSurfacesConfigurationSettings.ts`; add an `analytics-dashboard` editor stub backed by `metric_placements`. Add a dev preview (`web/app/dev/analytics-surface-mocks/`, 404 in prod) composing a sample Dashboard surface through `MetricVisualRenderer`. *Exit:* Analytics is an authorable Design Surface category end-to-end in a sandbox.

**Slice 3 — Drill resolution (no dead-ends).**
Add a metric → drill-target resolver: each `metric_definition` declares (or derives) a queue scope + dimension filter; the card's drill action opens that queue. Reuse existing queue routing. *Exit:* every metric card navigates to its records.

**Slice 4 — Promote Operational Intelligence to a surface.**
Render the "Operational Intelligence modal" content (`AnalyticsWorkspacePanel` / `OiV2MetricOverview`) as a real OI surface (Pulse/Attention/Throughput/Bottlenecks zones) using placements. Keep the modal as an entry point. *Exit:* OI surface live; modal is a launcher.

**Slice 5 — Header convergence (PROTECTED — perf suite required).**
Make V2 `MetricPlacementRenderer` the single owner of workspace/work-unit/tile header metrics once parity is verified; demote `KPIVm`/`workspace_kpi_placement` to fallback, then retire. Run the full drawer/work-unit reveal test suite + `tsc --noEmit`. *Exit:* one metric layer in headers.

**Slice 6+ — New surfaces (later phases).**
Executive Performance, process Intelligence surfaces, Forecasting, then Optimization Centers (command surfaces; reuse action/workflow paths), then Reporting (snapshot/period + document renderers). Each is a Dashboard-category Design Surface — no new architecture.

### Layer-convergence target

```
Today:  KPI V1 strips  +  OIP V1 engine  +  Analytics V2 config
                            │
Target: Analytics V2 (definitions/placements) over OIP V1 (calculation)
        — KPI V1 strips retired after Slice 5 parity
        — one snapshot store path; metric_snapshots (V1) retired after cutover
```

---

## 4. Recommended first implementation slice

**Slice 1 + Slice 2 together**, in a feature branch, parallel-safe to Core Four:
1. Re-chrome the V2 metric renderers onto Universal Card (matches `09-metric-card-gallery.html`).
2. Register the Dashboard surface category + dev preview composing `metric_placements` through `MetricVisualRenderer`.
3. Add the two near-term renderers used by the mockups: **Health (gauge)** polish and **Breakdown** (bars/segments).

This lands the visible KPI redesign, proves Analytics-as-Design-Surface in a sandbox, and touches **no protected runtime files** — fully reversible behind the existing flag.

---

## 5. Risks & dependencies

- **Protected runtime files** (`WorkUnitCommandSurface`, `WorkspaceOperationalPulseStrip`, `WorkspaceRootLifecycleGrid`, `KPIBlock`) — Slice 5 only; perf suite gated.
- **Three-layer entanglement** — converge after real-data parity; respect `null ≠ empty` / no-false-empty rules.
- **Snapshots off by default** — `ANALYTICS_V2_METRIC_PLATFORM_ENABLED` + cron must run for trend/forecast/report history.
- **Forecast/Benchmark math** — requires OIP additions; keep Concept until OIP supports projection + cohort baselines.
- **Optimization Center actions** — must route through existing action/workflow/event paths; Analytics never mutates truth directly.
- **Reporting period-locking** — depends on reliable `metric_platform_snapshots`; reuse document renderers for output.
- **Don't fork** — reuse `metric_placements` + `MetricVisualRenderer` + Experience Builder; introduce no `CompositionEngine` class and no second placement store.
- **Schema docs** — V2 tables missing from generated `docs/schema/*`; regenerate only if a DB change becomes necessary (none required for Slices 1–4).

---

## 6. Definition of done (platform-level)

- One Metric archetype, one card chrome, one configuration model (Dashboard Design Surface category).
- Calculation in OIP; visualization + placement in the Presentation Runtime.
- Every metric card answers What / Why / What now and drills to records — on every surface and form factor.
- KPI V1 strips and `metric_snapshots` (V1) retired after verified parity.
- Analytics surfaces (Exec, OI, process, optimization, reporting) authorable in the Experience Builder, scoped by Viewpoint.
