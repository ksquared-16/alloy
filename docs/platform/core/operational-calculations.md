# Operational Calculations

**Status:** Canonical (June 2026). Platform doctrine for the trusted, versioned definitions of measurable business facts.

**Relationship to existing platform:** This doctrine **formalizes and governs** the calculation layer that already exists in the Operational Intelligence Platform (OIP). It does **not** introduce a second metric system, a new compute engine, or new snapshot tables. An Operational Calculation is a *governed descriptor* that points at an existing OIP resolver. The math stays in OIP. See [`../modules/ai-platform.md`](../modules/ai-platform.md), [`business-process-system.md`](business-process-system.md), [`placement-system.md`](placement-system.md).

---

## 1. Philosophy

Every number an operator trusts — Enrollment Health, Tour Conversion, Revenue, AR Aging, Ratio Compliance — is a **measurable business fact**. Today those facts are computed in OIP resolvers and consumed, with subtly different framing, by many surfaces: Analytics, workspace headers, work-unit metrics, Business Process tiles, Focus Panel cards, Reports, Optimization Centers, BOS, and (increasingly) AI reasoning.

The risk is **drift**: the same fact computed two ways, or framed with two different grains, two different windows, two different "what counts" rules. When that happens, operators stop trusting the platform.

**Operational Calculations** are the answer. They are the canonical, versioned, governed definitions of those facts.

- They are **not** Analytics. Analytics *displays* calculations.
- They are **not** Reports. Reports *arrange* calculations over time and grain.
- They are **not** Charts. Charts *shape* calculation output into series.
- They are **not** Cards. Cards *render* a single resolved calculation.
- They are **not** a new compute engine. OIP already computes; calculations *describe and govern* that computation.

> **One fact, one definition, one owner, many consumers.** No consumer defines its own calculation. Every operational number originates from a registered Operational Calculation.

Treat calculations like **APIs**: stable contracts, explicit versions, documented consumers, deliberate deprecation.

---

## 2. Ownership

An Operational Calculation is the **shared source of truth** for:

| Consumer | What it consumes |
|---|---|
| Analytics surfaces | Resolved values, comparisons, breakdowns, drill targets |
| Workspace header metrics | Point values + health |
| Work Unit metrics | Scoped point values |
| Business Process tiles | Pack-scoped KPI values |
| Focus Panel metrics | Record-grain values (via Operational Context) |
| Reports | Tabular period output |
| Optimization Centers | Constraint diagnoses + simulation inputs |
| BOS | Recommendation triggers |
| AI reasoning (future) | Trusted facts for grounding |

**Rule:** a consumer never re-derives a fact. If a surface needs a number that does not yet exist as a calculation, the answer is to **register a calculation**, not to compute locally.

The **Calculation Logic Owner** named in each descriptor is accountable for the underlying OIP resolver and its correctness. The descriptor is the contract; the owner maintains the implementation behind it.

---

## 3. What every Operational Calculation declares

Each calculation is a declarative descriptor with these fields. They mirror, and are validated against, the existing OIP `MetricDefinition` it wraps.

| Field | Meaning |
|---|---|
| **Calculation Key** | Stable identifier. For wrapped OIP facts this **is** the `OipMetricKey` (e.g. `enrollment.tour_conversion_rate`). |
| **Business Process** | Owning process / pack (`enrollment`, `communications`, `forms`, `operational_health`, `financial`, `capacity`). |
| **Question Answered** | The operator question in one sentence ("How many scheduled tours actually happened?"). |
| **Grain** | Supported entity scopes (`org`, `site`, `department`, `work_unit`, `record`). Reuses `MetricEntityScope`. |
| **Aggregation Rules** | How values combine across grain (`count`, `sum`, `avg`, `rate`, `ratio`, `median`). |
| **Dimensions** | Segmentable dimensions (`lifecycle_stage`, `status_key`, `site_id`, …) — validated against the source adapter's `supportedDimensions`. |
| **Required Inputs** | Source tables / read models the calculation depends on. |
| **Dependencies** | Other calculations this one composes (for rollups / health scores). |
| **Calculation Logic Owner** | The OIP resolver / team accountable for correctness. |
| **Snapshot Strategy** | `event_window`, `entity_snapshot`, or `evaluator_snapshot`; whether values are exhaustive or bounded. |
| **Refresh Strategy** | Live evaluation vs snapshot cadence (`metric_platform_snapshots`). |
| **Consumers** | Declared downstream surfaces (used for impact analysis on change). |
| **Permissions** | Access-scope rule (org/site/department) enforced via `AdminAccessScopeDimensions`. |
| **Version** | Monotonic version of the *contract* (not the data). |
| **Testing Strategy** | How correctness is proven (fixture, golden snapshot, parity test). |
| **Deprecation Strategy** | Replacement key + sunset rule when retired. |

A descriptor is **invalid** if it claims a grain, dimension, or source the underlying OIP definition does not support. Registry integrity tests enforce this.

---

## 4. Architecture

```
Business Process
  → Operational Calculation (governed descriptor)        ← THIS DOCTRINE
      → OIP resolver / source adapter (computes)         ← existing, frozen
      → metric_platform_snapshots (pre-computed)         ← existing, frozen
  → Metric Resolver (point / trend / breakdown)          ← existing + 1 new (breakdown)
  → Resolved surface model (presentation-ready)
  → Analytics Renderer / Card
  → Surface
```

The descriptor layer sits **above** OIP and **below** every consumer. It is the contract surface. Crucially:

- **Calculations do not compute.** They reference `OipMetricKey` and delegate to `evaluateMetricDefinition` / snapshot reads.
- **Calculations are not surfaces.** A surface (Analytics dashboard, report, header) *requests* a calculation at a grain.
- **The UI never knows where a calculation originates.** It asks for a key at a grain and receives a presentation-ready result.

### 4.1 The runtime contract

A surface section asks the platform *what question, what scope, what grain, what drill* — never *how to compute*:

```
Surface declaration
  → AnalyticsContext (org, access scope, filters, date range)
  → a request (calculation key + grain + groupBy + drill)
  → Provider dispatch (point / trend / breakdown / report / optimization)
  → resolved surface model (formatted value, health, comparison, segments, drill)
  → Renderer
```

`AnalyticsContext` is defined in `web/lib/analytics/runtime/types.ts`; the request and the resolved result are realized by the server model builder (`operationalSurface.ts` → `OperationalSurfaceModel`). They **extend**, and never replace, `MetricEvaluationContext` / `MetricResolveContext` / `AdminAccessScopeDimensions`.

### 4.2 Provider dispatch (no new engine)

| Provider | Resolves via | Status |
|---|---|---|
| Point / health | `evaluateMetricDefinition`, snapshot read | Existing |
| Trend / comparison | snapshot series + period-over-period | Existing |
| Breakdown / segments | `evaluateMetricBreakdown` (group-by) | **New, Phase 2** |
| Chart series | breakdown output reshaped (presentation only) | Phase 2 |
| Report rows | report provider | Phase 3 |
| Optimization | `childcareOperational/*` read models wrapped | Phase 3 |

---

## 5. Lifecycle

A calculation moves through governed states, mirroring `MetricDefinitionStatus`:

```
draft → active → archived
```

- **draft** — registered, not yet consumed in production surfaces.
- **active** — a stable contract; consumers may bind. Breaking changes require a version bump.
- **archived** — superseded; descriptor names its replacement key and a sunset window.

**Versioning rule:** the descriptor `version` tracks the *contract* (grain, dimensions, question, semantics). A pure performance change to the underlying resolver does **not** bump the version. A change to *what counts* (numerator/denominator, window, grain) **does**, and must list the affected `Consumers`.

**Deprecation rule:** never delete a key in active use. Archive it, point it at a successor, and let consumers migrate within the sunset window. The registry's consumer list is what makes safe deprecation possible.

---

## 6. Registration

Calculations are registered **declaratively** in code — the canonical source of truth — alongside the OIP registry they wrap:

```
web/lib/analytics/calculations/
  registry.ts        ← OPERATIONAL_CALCULATIONS: Record<key, OperationalCalculation>
  types.ts           ← OperationalCalculation descriptor type
```

The registry is the operational analogue of the Entity Registry, Action Registry, Field Registry, and Surface Registry — but focused on **facts**.

Design rules:

- **Declarative over imperative.** A calculation is data, not a class.
- **Wrap, don't fork.** Every descriptor references an `OipMetricKey`; integrity tests assert the OIP definition exists and supports the declared grain/dimensions.
- **No over-engineering.** Start with the facts that exist. Add governance metadata; do not invent speculative calculations.
- **Single registration point.** One registry, queried by key, by business process, and by consumer.

---

## 7. Runtime

The runtime is intentionally thin — it is wiring, not a framework.

| Component | Path | Role |
|---|---|---|
| `OperationalCalculationRegistry` | `web/lib/analytics/calculations/registry.ts` | Catalog + lookup of governed descriptors |
| `AnalyticsContext` | `web/lib/analytics/runtime/types.ts` | Scope/filter envelope passed into every request |
| `DrillResolver` | `web/lib/analytics/runtime/drillResolver.ts` | Calculation + selection → `NavigationIntent` |
| Surface model builder | `web/lib/analytics/runtime/operationalSurface.ts` | Resolves metrics + breakdown + drills (server) |
| Runtime surface | `web/components/adminV2/intelligence/OperationalIntelligencePanel.tsx` | Renders the model inside the Workspace → Analytics modal |
| Metric resolvers | `web/lib/metrics/*` | Existing OIP computation (frozen) |

**Surface model, not a routed page.** The Operational Intelligence runtime renders inside the existing Workspace → Analytics modal (client state), fed by `GET /api/admin/intelligence/operational` which wraps the server model builder. Configuration lives in Surfaces; routes are implementation details, not product surfaces.

**Doctrine:** presentation never computes; context is server-trusted (never trust client `org_id`); every visualization declares grain; no metric dead-ends — a calculation either declares a drill or is explicitly `exploratoryOnly`.

---

## 8. Consumers

Consumers bind to a calculation **by key at a grain**, never to a resolver:

- **Analytics** requests `{ key, grain, groupBy?, drill? }` and renders the resolved result.
- **Headers / tiles** request point values through the existing placement pipeline.
- **Focus Panel** requests record-grain values via Operational Context (`context_type=record`).
- **Reports** request tabular period output.
- **Optimization Centers** request constraint diagnoses.
- **AI** (future) reads resolved calculations as grounded facts.

Each consumer is declared on the descriptor so that a change to a calculation produces a precise impact list.

---

## 9. Testing

| Layer | What it proves |
|---|---|
| Registry integrity | Every descriptor wraps a real `OipMetricKey`; declared grain/dimensions ⊆ source support; no orphan consumers. |
| Resolver parity | A calculation's resolved value equals the OIP value for the same scope (no drift introduced by the descriptor layer). |
| Drill resolution | Every non-`exploratoryOnly` calculation resolves a valid `NavigationIntent`; access scope respected. |
| Modal deep-link + drill guard | `?workspaceModal=analytics` opens the runtime modal; drills navigate internal paths only. |

Tests live under `web/tests/analytics/`. Existing OIP/metric tests remain authoritative for the math itself.

---

## 10. Governance

- **One owner per calculation.** The Calculation Logic Owner is accountable for correctness.
- **Change is versioned and impact-scoped.** A semantic change bumps the version and names affected consumers.
- **No shadow facts.** A surface computing its own number is a governance violation; the fix is registration.
- **Deprecation is deliberate.** Archive with a successor; never silently delete.
- **The registry is canonical.** Code registration is the source of truth; database `metric_definitions` rows are the runtime projection.

---

## Appendix A — Boundaries (what NOT to build)

| Temptation | Why not |
|---|---|
| A second metric compute engine | OIP already computes; calculations describe and govern. |
| New snapshot / metric tables | `metric_platform_snapshots` + OIP are authoritative. |
| Client-side calculation | Violates the presentation-never-computes doctrine. |
| A `CompositionEngine` class for Analytics | `placementResolver` + `renderMetricPlacements` already compose. |
| Per-surface calculation definitions | One definition, many consumers — by doctrine. |
| Duplicating OIP keys | Wrap the key; integrity tests forbid forks. |

## Appendix B — Key file index

| Concern | Path |
|---|---|
| Calculation descriptor type | `web/lib/analytics/calculations/types.ts` |
| Calculation registry | `web/lib/analytics/calculations/registry.ts` |
| Analytics runtime types | `web/lib/analytics/runtime/types.ts` |
| Surface model builder | `web/lib/analytics/runtime/operationalSurface.ts` |
| Runtime surface (modal) | `web/components/adminV2/intelligence/OperationalIntelligencePanel.tsx` |
| Runtime data API | `web/app/api/admin/intelligence/operational/route.ts` |
| DrillResolver | `web/lib/analytics/runtime/drillResolver.ts` |
| OIP registry (wrapped) | `web/lib/metrics/registry.ts` |
| OIP metric types | `web/lib/metrics/types.ts` |
| Metric platform types | `web/lib/metrics/platform/types.ts` |
| Render pipeline | `web/lib/metrics/platform/renderMetricPlacements.ts` |
| Runtime convergence analysis | `docs/sprints/06_2026/analytics-operational-intelligence-platform/04-runtime-convergence.md` |
</invoke>
