# Analytics — Operational Intelligence Platform (Architecture + Design Sprint)

**Status:** Product architecture + visual design sprint (June 2026). Design-first; implementation second.
**Sequenced after:** the Analytics/KPI implementation audit (prior chat).
**Governs convergence of:** OIP V1 (`web/lib/metrics/**`), Analytics V2 (`metric_*` tables), KPI V1 strips (`web/lib/kpi/**`).

> This sprint designs the Analytics platform Alloy should own for the next decade — **not** an improvement of the current analytics module. It treats Analytics as a first-class Operational Surface built on the Presentation Runtime, Card Language, and Surface doctrine. It does **not** invent a parallel dashboard architecture.

---

## The thesis

Analytics is not a reporting page, a dashboard collection, or a BI clone. It is the platform layer through which an organization **understands, optimizes, and improves operational performance**. It obeys the one Alloy spine:

```
Business Process → Operational Context → Surface → Composition → Cards → Actions → Work
```

Two equal objectives:

1. **Understand** — what is happening, why, and what is likely next.
2. **Improve** — every insight opens a path to corrective work and then measures the result.

```
Measure → Understand → Decide → Act → Measure Again
```

Analytics never ends with a chart. It ends with operational work.

---

## Deliverables in this sprint

| Phase | Deliverable | File |
|---|---|---|
| 1 | Product Architecture (IA, doctrine, navigation, surface hierarchy, metric hierarchy, roll-up, OI model, reporting model, Metric Card Language) | [`01-product-architecture.md`](./01-product-architecture.md) |
| 2 | High-fidelity visual concepts (10 mockups) | [`mockups/`](./mockups/) |
| 3 | Implementation / convergence strategy | [`03-implementation-strategy.md`](./03-implementation-strategy.md) |
| 4 | **Runtime convergence analysis** (providers, context, drill, actions, backend matrix, dependency report, implementation order) | [`04-runtime-convergence.md`](./04-runtime-convergence.md) |

### Phase 2 mockup index

| # | Surface | File |
|---|---|---|
| 1 | Executive Performance | [`mockups/01-executive-performance.html`](./mockups/01-executive-performance.html) |
| 2 | Operational Intelligence | [`mockups/02-operational-intelligence.html`](./mockups/02-operational-intelligence.html) |
| 3 | Enrollment Analytics | [`mockups/03-enrollment-analytics.html`](./mockups/03-enrollment-analytics.html) |
| 4 | Financial Performance | [`mockups/04-financial-performance.html`](./mockups/04-financial-performance.html) |
| 5 | Workspace Header Metrics | [`mockups/05-workspace-header-metrics.html`](./mockups/05-workspace-header-metrics.html) |
| 6 | Work Unit Header Metrics | [`mockups/06-work-unit-header-metrics.html`](./mockups/06-work-unit-header-metrics.html) |
| 7 | Focus Panel Metrics | [`mockups/07-focus-panel-metrics.html`](./mockups/07-focus-panel-metrics.html) |
| 8 | Optimization Center (Enrollment Capacity) | [`mockups/08-optimization-center.html`](./mockups/08-optimization-center.html) |
| 9 | Metric Card Gallery | [`mockups/09-metric-card-gallery.html`](./mockups/09-metric-card-gallery.html) |
| 10 | Responsive behavior | [`mockups/10-responsive.html`](./mockups/10-responsive.html) |

---

## Implementation slices (status)

| Slice | Scope | Status |
|---|---|---|
| 1 | Metric Card Language re-chrome + Dashboard category + dev preview | ✅ Merged (`0a6d0bf7`) |
| 1.5 | Header density compatibility + visual QA | ✅ Merged (`ca0ad6a7`) |
| 2 | Surface composition beyond KPI tiles (charts, filters, drill grammar, command/report/optimization previews) | ✅ Merged (`8433f5ef`) |
| 3 | Runtime convergence analysis — architecture roadmap, no broad implementation | ✅ [`04-runtime-convergence.md`](./04-runtime-convergence.md) |
| 4+ | Wire real data (Phase A–E in convergence doc) | 🔜 Next execution |

Dev preview: `/dev/analytics-surface-mocks` (404 in production).

---

## Non-negotiables (carried from platform doctrine)

- **Metric math stays in OIP / `metric_definitions`.** Presentation never computes or overrides truth (`presentation-runtime-doctrine.md` §6).
- **Analytics = the Dashboard Design Surface category.** No second configuration model.
- **One Metric archetype, many Renderers.** KPI / Trend / Comparison / Gauge / Scorecard / Table / Sparkline are renderers, not archetypes.
- **No storage migration authorized here.** `metric_placements` is the dashboard composition store; OIP owns calculation.
- **Do not disrupt Core Four Focus Panel work or runtime-performance protected files.** Header convergence is gated behind the perf test suite.

---

## Related doctrine

| Concern | Doc |
|---|---|
| Presentation Runtime (Analytics = Design Surface category) | `docs/platform/operator/presentation-runtime-doctrine.md` |
| Card Language / Archetypes / Universal Card | `docs/platform/operator/card-language.md`, `card-archetypes.md`, `universal-card-system.md` |
| Operational Context boundary | `docs/platform/operator/operational-context-boundary.md` |
| OIP (metric math) | `docs/platform/modules/operational-intelligence-platform.md` |
| Analytics V2 platform | `docs/platform/analytics/metric-platform-doctrine.md`, `metric-data-model.md` |
| Surface inventory (Analytics rows) | `docs/sprints/06_2026/presentation-runtime-architecture/05-surface-inventory.md` |
