# Analytics Architecture — Metric Definition vs Metric Presentation

**Path:** `docs/sprints/06_2026/presentation-data-analytics-architecture/04-analytics-architecture.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 2 — Analytics architecture

---

## 1. The clean split (the whole point)

Analytics is **two architectures**, and the boundary between them must stay clean forever.

```
OPERATIONAL INTELLIGENCE            EXPERIENCE BUILDER
(Metric Definition)                 (Metric Presentation)
─────────────────────────           ─────────────────────────
What the number IS                  How the number is SHOWN
the single source of truth          one placement among many
```

| Metric **Definition** — Operational Intelligence owns | Metric **Presentation** — Experience Builder owns |
|---|---|
| Calculation | Renderer |
| Aggregation | Placement |
| Filters | Card |
| Periods | Sizing |
| Dimensions | Comparison **display** |
| Comparisons (which are computed) | Visualization |
| Formatting **defaults** | Threshold **coloring** (display) |
| Metric lifecycle | Grouping |
| Metric governance | — |
| Semantic bands (good/warning/critical) | Whether/how to show bands |

> One sentence: **Operational Intelligence decides the number; the Experience Builder decides the picture.**

## 2. Why the split must stay clean

If presentation could redefine the math, the same metric would mean different things on different surfaces — the exact failure Alloy's convergence is meant to prevent. A metric must mean **one thing everywhere**; only its *picture* varies by surface. So:

- The number on a Focus Panel KPI, an Analytics Dashboard chart, and a printed report is **identical** — same definition, same value — even though the renderers differ.
- A surface can never invent an aggregation, filter, or period that changes the value. It can only choose **among definition-exposed parameters** and choose **how to draw** the result.

## 3. The boundary contract

A Metric reference (taxonomy kind 4) carries a **stable metric key** plus a **presentation profile** chosen from what the definition *exposes*:

| Field in the reference | Chosen by | Constraint |
|---|---|---|
| `metric_key` | EB (picks the metric) | Must exist in OI |
| **dimension slice** | EB | Only from dimensions the definition declares |
| **period** | EB | Only from periods the definition supports |
| **comparison** | EB | Only comparisons the definition computes |
| **renderer + options** | EB | Per renderer contract |
| **band display** | EB | Bands themselves come from the definition |

The Experience Builder selects from a **menu the definition publishes**. It never types a formula. This is the analytics expression of the "business concepts, not fields" principle: the admin picks *Projected Tuition · this term · vs last term · as a KPI*, never a SQL aggregate.

## 4. The `Metric` Presentation Type

A Metric reference resolves to the rich `Metric` shape:

```
Metric {
  value        : scalar (Money | Percentage | Number | Score | Duration)
  unit         : declared by definition
  period       : selected period + its bounds
  comparison   : { baseline value, delta, direction }   (if selected)
  dimensions   : selected slice (e.g., by Location)
  bands        : [ good | warning | critical thresholds ]  (if defined)
  provenance   : { definition version, computed-at, freshness }
}
```

Renderers accept either the full `Metric` (KPI Card, Trend, Gauge, Scorecard, Chart) or its scalar projection (`Currency` accepts `Metric→Money`; `Percentage` accepts `Metric→Percentage`). See [`05-renderer-contracts.md`](./05-renderer-contracts.md).

## 5. Thresholds and coloring — the subtle boundary

The trickiest case, resolved explicitly:

| Threshold concern | Lives in | Why |
|---|---|---|
| **Semantic bands** (e.g., "occupancy ≥ 95% = critical") that carry **operational meaning** | **Definition (OI)** — governed | The meaning of "critical" must be consistent and auditable across every surface |
| **Whether to show** bands, and **how** (color, badge, icon) | **Presentation (EB)** | Pure visualization choice |
| **Cosmetic, surface-local thresholds** with no operational meaning | **Presentation (EB)**, flagged presentation-only | Convenience; must not masquerade as governed truth |

> Rule: a threshold that *means something to the business* is a band published by the definition. A threshold that is *just a color choice* is presentation. When in doubt, it belongs to the definition.

## 6. Convergence with the rest of the model

Analytics is **not a separate configuration model.** A Metric reference flows through the **same** Binding → Slot → Card → Surface pipeline as a canonical field. Therefore:

- A **dashboard** is just a Design Surface whose Card Type is **Metric** and whose renderers are analytics renderers — edited with the identical Edit Mode from the Experience Builder V2 sprint.
- A **Focus Panel** can host a metric card beside a canonical card with no special machinery.
- A **report** or **document** can embed the same metric.

This is the "Analytics is identical" law from the editable-runtime sprint, expressed at the data layer: identical because metrics are *just another typed reference.*

## 7. Lifecycle & governance (definition side, referenced only)

The Experience Builder **references** but does not own:

- **Metric lifecycle** (draft → published → deprecated) — EB shows availability; deprecated metrics warn at bind time and block publish.
- **Metric governance** (who may define/change math, approval) — OI concern.
- **Metric versioning** — the reference carries the definition version in provenance so a surface can detect when a metric's math changed.

## 8. What this architecture must not do

- Must not let a surface change a metric's calculation, aggregation, filter, or period beyond the definition's exposed menu.
- Must not duplicate metric math into Computed (kind 8) — that would fork truth (see taxonomy §8 Metric vs Computed).
- Must not create an analytics-only builder, data model, or condition system.
- Must not treat AI-generated estimates as metrics — AI outputs are kind 6 with provenance, not governed metrics.

## 9. Cross-references

| Concern | Doc |
|---|---|
| Metric as a source kind | [`02-data-taxonomy.md`](./02-data-taxonomy.md) §4, §8 |
| `Metric` type in renderer contracts | [`05-renderer-contracts.md`](./05-renderer-contracts.md) |
| Analytics placement UX | [`07-data-source-browser.md`](./07-data-source-browser.md) + mockup `07-analytics-placement` |
| Ownership answers | [`08-architecture-recommendations.md`](./08-architecture-recommendations.md) |
| Analytics as a Design Surface | `docs/platform/operator/presentation-runtime-doctrine.md` |
