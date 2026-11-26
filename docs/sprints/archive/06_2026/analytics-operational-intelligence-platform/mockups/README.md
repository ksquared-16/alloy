# Analytics — High-Fidelity Mockups (Phase 2)

Premium product concepts for the Analytics / Operational Intelligence Platform. Open the `.html` files in a browser (1440-wide frame; mockup 10 shows responsive form factors). All files share `_shared.css` — an Alloy-native design system (pine `#00a283` / midnight `#1a2332` / forge `#59678b`, operational tone language from `card-language.md`).

> These define the **visual language for implementation**. They optimize around the ideal Alloy product, not today's modal/settings analytics.

| # | File | Surface | Demonstrates |
|---|---|---|---|
| 1 | `01-executive-performance.html` | Executive Performance | Org health gauge + process health roll-up, growth, financial, 90-day forecast; owner Viewpoint |
| 2 | `02-operational-intelligence.html` | Operational Intelligence | "Today" lens: Pulse · Needs Attention (→ work) · Bottlenecks breakdown |
| 3 | `03-enrollment-analytics.html` | Enrollment Intelligence | Pipeline funnel, conversion KPI+trend, capacity/source breakdown, drill to families |
| 4 | `04-financial-performance.html` | Financial Performance | Currency KPIs, AR aging breakdown, statement-style table, financial tone |
| 5 | `05-workspace-header-metrics.html` | Embedded — workspace header | Micro-density KPI strip + health pills; cold/loading reserve (no false-empty) |
| 6 | `06-work-unit-header-metrics.html` | Embedded — work-unit header | Work-stream scorecard; bidirectional roll-up/drill; card contract |
| 7 | `07-focus-panel-metrics.html` | Embedded — Focus Panel | Record-scoped Metric cards beside Household/Children/Current Work |
| 8 | `08-optimization-center.html` | Optimization Center (Enrollment Capacity) | Diagnose → Levers → Simulate → Apply → Track; Insight + Recommendation → work |
| 9 | `09-metric-card-gallery.html` | Metric Card Language | All renderers (KPI/Trend/Comparison/Forecast/Benchmark/Health/Breakdown/Scorecard) + compositions (Insight/Recommendation) + density ladder |
| 10 | `10-responsive.html` | Responsive | One surface across desktop/tablet/mobile; density adapts, identity does not; Director Snapshot Viewpoint |

## Design principles encoded in the mockups

- **One Metric archetype, many renderers.** The same card chrome (Universal Card shell, tone rail, drill foot) carries every renderer.
- **Every card answers What / Why / What now.** Value (answer) + `mc-why` (context) + drill/recommendation (action).
- **No dead-ends.** Every card carries a `drill` affordance into Business Process → Work Unit → Queue → Record → Action.
- **Tone = operational state, not module identity** (green/amber/red/blue-financial/purple-intelligence).
- **Surface Independence.** Mockups 5–7 and 9's density ladder show the same cards at micro → expanded.
- **Improve, don't just observe.** Mockup 8 is a command surface where Analytics ends in work and re-measures.
