# Phase 1 — Analytics Product Architecture

**Status:** Architecture design (June 2026). Design-first; freeze before implementation.
**Scope:** The information architecture, doctrine, navigation, surface hierarchy, metric hierarchy, roll-up model, Operational Intelligence model, reporting model, and Metric Card Language for Alloy Analytics.

> Design the ideal product as if no Analytics UI exists. Convergence comes in Phase 3.

---

## 0. The one-paragraph product

**Alloy Analytics is the layer that turns operational records into organizational understanding and routes understanding back into operational work.** It is not a destination you visit to look at charts; it is a *lens* that exists everywhere — a workspace header tile, a work-unit strip, a Focus Panel card, a full Intelligence surface, an Optimization Center where decisions are made, and a Reporting surface where results are exported. Every expression speaks one Metric language, draws from one calculation engine (OIP), composes through one Surface model, and ends — always — at a record, a queue, and an action.

---

## 1. First principles (frozen)

| # | Principle | Consequence |
|---|---|---|
| **P1** | Design the ideal product first | We do not preserve today's modal/settings split. The ideal is a first-class Intelligence surface family + embedded metrics everywhere. |
| **P2** | Metrics originate from work | Every metric is traceable down to the records that produced it. Roll-up and drill-down are the same axis, traversed in opposite directions. |
| **P3** | Metrics always provide context | A metric card answers *What happened? Why? What should I do?* — never a bare number. |
| **P4** | Analytics is part of the OS | Same Surface doctrine, Card Language, interaction grammar, Universal Card, spacing, typography, hierarchy. No separate design language. |

### Alloy Law applied to metrics (extends Card Language Law #4)

> **A metric card never owns a number. It assembles a number.** Canonical records own facts; OIP owns calculation; the Card assembles the answer and the next action. Metric cards are projections, never storage.

---

## 2. The Analytics spine

Analytics is a faithful instance of the platform spine — not a new pipeline:

```
Business Process
  → Operational Context        (what subject/scope are we measuring?)
    → Surface                  (Intelligence surface, header strip, Focus Panel, report)
      → Composition            (Zone → Metric Card → Slot → Renderer)
        → Cards                (Metric archetype cards)
          → Actions            (Drill, Compare, Investigate, Correct)
            → Work             (queue, record, workflow, action)
```

**Mapping to existing code/doctrine names** (do not fork — reuse these):

| Spine node | Alloy canonical | Lives in |
|---|---|---|
| Operational Context | `OperationalContext` | `web/lib/adminV2/runtime/operationalContext/` |
| Surface | **Design Surface** (category = Dashboard / Intelligence) | `metric_placements` + `entity_layouts` |
| Composition | Composition axis: Design Surface → Zone → Card → Slot → Renderer | `presentation-runtime-doctrine.md` §4–5 |
| Cards | **Metric** archetype | `card-archetypes.md` |
| Actions | Card interaction families (Observe → Reveal → Focus → Edit → Act → **Navigate**) | `card-language.md` |
| Work | queue / record / workflow / action | existing runtime |

There is **no `CompositionEngine` class** and we do not create one. "Composition" is the axis defined in the Presentation Runtime, expressed in code as placement resolution + renderer dispatch.

---

## 3. Information Architecture

Analytics has **three structural tiers** and **two delivery modes**.

### 3.1 Structural tiers (the metric hierarchy)

```
ORGANIZATION            ← Executive Performance (org health, growth, revenue, forecast)
  │
  ├ BUSINESS PROCESS    ← Process Intelligence (Enrollment, Billing, Attendance, Comms, Staff, Compliance)
  │   │
  │   ├ WORK STREAM      ← Work Unit / Queue health (throughput, response time, bottlenecks, needs attention)
  │   │   │
  │   │   └ RECORD       ← the family, child, invoice, schedule, message — the origin of every number
```

Every metric declares its **grain** (the lowest record it rolls up from) and its **scope path** (org → process → work stream → record). This is what makes drill-down deterministic.

### 3.2 Delivery modes

1. **Embedded metrics** — metric cards living inside other surfaces (workspace header, work-unit header, business-process tile, Focus Panel, drawer). Micro/compact density. The metric *comes to the operator*.
2. **Intelligence surfaces** — dedicated Analytics Design Surfaces (Executive Performance, Operational Intelligence, process Intelligence surfaces, Optimization Centers, Reporting). Standard/expanded density. The operator *goes to the metric* to understand and decide.

Both modes render the **same Metric cards** at different densities (Card Language: Surface Independence — only density changes).

### 3.3 Top-level Analytics navigation

Analytics is reached as an **Intelligence** capability in the platform nav (not a "/analytics page"). It opens an Intelligence surface family with a left perspective rail:

```
Intelligence
├── Executive Performance         (org)            — board/owner lens
├── Operational Intelligence      (org → today)    — director/manager lens
├── Process Intelligence
│     ├── Enrollment Intelligence
│     ├── Billing / Financial Performance
│     ├── Attendance Intelligence
│     ├── Communications Intelligence
│     ├── Staff / Labor Intelligence
│     └── Compliance Intelligence
├── Forecasting                   (org / process)  — projection lens
├── Optimization Centers
│     ├── Enrollment Capacity Optimization
│     ├── Schedule / Labor Optimization
│     ├── Revenue Optimization
│     └── Staff Planning
└── Reporting                     (statements, compliance, exports, board packets)
```

This list is **configuration-driven** (each row is a Design Surface in the Dashboard category, filtered by Viewpoint), not hardcoded navigation.

---

## 4. Analytics Doctrine (the laws)

1. **Analytics is a Design Surface category, not a product.** Every analytics experience is a Dashboard-category Design Surface composed of Zones → Metric Cards → Slots → Renderers. There is exactly one configuration model (the Experience Builder).
2. **Calculation is owned by OIP.** Aggregation, filters, windows, thresholds, rollups live in `metric_definitions` / OIP. Presentation never computes. A surface cannot change what a number means.
3. **Every metric is contextual.** A Metric card must be able to answer *What / Why / What now*. A card that can only show a number is incomplete (it may still render at micro density, but the Why/Action exist at depth).
4. **Roll-up and drill-down are one axis.** A metric knows its grain and scope path; navigation traverses that path in both directions deterministically.
5. **No metric dead-ends.** Every Metric card exposes a Navigate action into Business Process → Work Unit → Queue → Record → Action. Navigation is the least-preferred interaction (prefer reveal/transform), but it is **always available** at depth.
6. **One Metric language everywhere.** A KPI tile in the workspace header and a KPI in Executive Performance are the same card at different densities — same source, same tone semantics, same drill target.
7. **Improvement is a first-class loop.** Optimization Centers and Insight/Recommendation renderers exist so that Analytics produces *decisions and work*, not just observations. The loop (Measure → Understand → Decide → Act → Measure Again) is the product, not a tagline.
8. **Audience is a Viewpoint, not a separate build.** Executive vs Director vs Teacher vs Parent views of the same metrics are Viewpoints (audience axis) layered over one composition — never forked surfaces.

---

## 5. Surface Hierarchy (Analytics Design Surfaces)

Each surface declares: **entity/scope binding · ownership model · primary zones · key Metric card types**. Ownership models are from `presentation-runtime-doctrine.md` §10.

| Surface | Scope | Ownership | Primary zones | Key Metric cards |
|---|---|---|---|---|
| **Executive Performance** | Org | Fully Configurable | Health · Growth · Financial · Forecast | Health gauge, Scorecard, Trend, Forecast, Comparison |
| **Operational Intelligence** | Org / today | Hybrid | Pulse · Attention · Throughput · Bottlenecks | KPI, Health, Breakdown, Needs-Attention, Insight |
| **Enrollment Intelligence** | Process | Fully Configurable | Funnel · Conversion · Capacity · Sources | KPI, Funnel/Breakdown, Trend, Comparison |
| **Financial Performance** | Org / Account | Fully Configurable | Revenue · AR · Margin · Cash | Currency KPI, Trend, Comparison, Forecast, Table |
| **Attendance Intelligence** | Process / Child | Fully Configurable | Occupancy · Ratio · Absence | KPI, Health (ratio), Breakdown, Trend |
| **Communications Intelligence** | Process | Fully Configurable | Delivery · Response · Volume | KPI, Trend, Breakdown |
| **Staff / Labor Intelligence** | Process / Person | Fully Configurable | Utilization · Cost · Coverage | KPI, Comparison, Trend, Breakdown |
| **Compliance Intelligence** | Org / Process | Fully Configurable | Status · Gaps · Audit | Health, Scorecard, Table |
| **Forecasting** | Org / Process | Fully Configurable | Projection · Scenarios · Confidence | Forecast, Trend, Comparison |
| **Optimization Center** (per domain) | Process / Work Stream | Hybrid (command) | Diagnosis · Levers · Simulation · Apply | Insight, Recommendation, Breakdown, Comparison + **Actions** |
| **Reporting** | Org / Process | Fully Configurable | Statement · Period · Export | Table, Scorecard, Currency, signed/print blocks |
| **Embedded (header/strip/tile/FP)** | varies | Hybrid | header_metrics / tile_metrics / primary_metrics | Micro/compact KPI, Health, Trend |

### Optimization Centers are command surfaces, not dashboards

An Optimization Center is structurally a Design Surface but functionally a **work command center**:

```
Diagnose (what's wrong + why)  →  Levers (configurable inputs)  →  Simulate (projected impact)  →  Apply (creates work / config change)  →  Track (impact over time)
```

It composes Insight + Recommendation + Breakdown + Comparison cards **plus first-class Actions** (e.g. "Open 4 spots in Toddler A", "Rebalance staff schedule", "Launch waitlist outreach"). Actions route through existing action/workflow paths — Analytics never mutates truth directly.

---

## 6. Metric Hierarchy (the metric model)

### 6.1 Anatomy of a metric definition (OIP-owned)

A metric is defined once and reused everywhere:

```
Metric Definition
├── key / label / description
├── grain                 (record type it rolls up from: opportunity, child, invoice, schedule…)
├── scope path            (org → process → work_stream → record)
├── source                (resolver / source_key → OIP adapter)
├── aggregation           (count, rate, median, sum, ratio, composite)
├── window                (period config; comparison window)
├── unit / precision / format
├── thresholds            (target_config / threshold_config → health bands)
├── dimensions            (site, program, room, stage, source, status — for breakdown & drill)
└── drill target          (queue / record set this metric resolves into)
```

### 6.2 The three measurement kinds

| Kind | Question shape | Examples |
|---|---|---|
| **State** | How much / how many right now? | Lead count, occupancy, AR balance, needs attention |
| **Rate / Quality** | How well? | Tour conversion, delivery rate, ratio compliance, form completion |
| **Flow / Time** | How fast / trend? | Time-to-tour, response time, revenue trend, throughput |

Every metric is exactly one kind; the kind informs the default Renderer (State→KPI, Rate→Gauge/Health, Flow→Trend).

### 6.3 Roll-up model

Roll-up is a **composition over child metrics**, defined in OIP (`metric_rollups`), not in presentation:

```
Health Score (org)
 = weighted composite of
     Enrollment Health (process)
     Financial Health (process)
     Operational Health (process)
     Compliance Health (process)

Enrollment Health (process)
 = composite of
     Tour Conversion (rate)
     Pipeline Velocity (flow)
     Capacity Fill (state)
     Needs Attention (state, inverse)
```

Rules:
- A roll-up declares its **children, weights, and combinator** (sum / avg / weighted_avg / best / worst / composite_score / health_score).
- A roll-up is itself a metric — it can be placed, rendered, and drilled like any other.
- **Drill-down on a roll-up reveals its children**, then each child drills to its grain records. This is Principle 2 made mechanical.

### 6.4 Drill axis (single, bidirectional)

```
Org Health  ──drill──▶  Enrollment Health  ──drill──▶  Tour Conversion  ──drill──▶  Tours queue (filtered)  ──drill──▶  Family record  ──act──▶  Schedule tour
            ◀──roll-up──                  ◀──roll-up──                 ◀──contributes──                      ◀──belongs──
```

A teacher/operator reads it bottom-up ("how does my work contribute?"); an executive reads it top-down ("which records cause this?"). Same path.

---

## 7. Operational Intelligence model

Operational Intelligence is the **"today" lens** — the manager/director surface that answers *what needs attention now and where the operation is constrained*. It is distinct from Executive Performance (strategic, period-over-period) and from process Intelligence (deep single-process analysis).

OI composes four zones:

1. **Pulse** — the small set of live KPIs that define operational health right now (health strip + 3–5 KPI cards).
2. **Attention** — Needs-Attention and Readiness metrics that resolve directly into work queues (Intelligence archetype + Metric archetype side by side).
3. **Throughput** — flow metrics (response time, processing time, queue aging) with trend.
4. **Bottlenecks** — Breakdown cards that segment a constrained metric by dimension (which room, which queue, which stage) — each segment is a drill target.

OI is **Hybrid** ownership: platform owns the zone topology and card types; tenants configure which metrics appear and their thresholds. OI is the natural home of the current "Operational Intelligence" modal content, promoted to a real surface.

---

## 8. Reporting model

Reporting is the **export / statement / period** delivery of metrics. It shares the Metric language but adds period-locking, formatting, and output rendering.

| Concept | Definition |
|---|---|
| **Report** | A Design Surface (Reporting category) bound to a period and scope, composed of Table / Scorecard / Currency / signed blocks. |
| **Period lock** | A report renders a **snapshot** (`metric_platform_snapshots`) for a fixed period — reproducible, not live. |
| **Output renderers** | Print-optimized blocks, PDF, CSV/export, board-packet layout (reuse Document Design Surface renderers where they exist). |
| **Types** | Financial statements, compliance/government reports, operational exports, executive summaries, board packets. |

Reporting reuses the same metric definitions and roll-ups; it differs only in **time-binding (snapshot vs live)** and **output renderer**. It does not get its own metric system.

---

## 9. Metric Card Language

Continuation of `card-archetypes.md` (Metrics archetype) and `card-language.md`. **One archetype (`Metric`), expressed through Renderers and Compositions.**

### 9.1 Renderers vs Compositions vs related archetypes

The brief lists: KPI, Trend, Comparison, Forecast, Benchmark, Health, Breakdown, Insight, Recommendation. Classification:

| Item | Classification | Rationale |
|---|---|---|
| **KPI** | Renderer | One value + tone + threshold. |
| **Trend** | Renderer | Value + sparkline + direction over a window. |
| **Comparison** | Renderer | Value vs a baseline (period / target / segment). |
| **Forecast** | Renderer | Trend + projection + confidence band. |
| **Benchmark** | Renderer (Comparison variant) | Value vs external/peer/cohort baseline. |
| **Health** | Renderer | Gauge/band derived from a roll-up `health_score`. |
| **Breakdown** | Renderer | Value segmented by a dimension (bars/table); each segment is a drill target. |
| **Insight** | **Composition** | A Metric card whose primary content is a generated *Why* (BOS/OIP narrative) bound to one or more metrics. Still Metric archetype. |
| **Recommendation** | **Composition** | A Metric card whose primary content is a proposed *Action* with projected impact. Metric archetype + Action affordance. Borders the **Intelligence** archetype — see rule below. |

**Archetype boundary rule:** Insight and Recommendation remain **Metric** archetype when their subject is *a measurement and its trajectory*. When the subject is *an operational assessment of a record* ("this family is at risk"), that is the **Intelligence** archetype (Readiness/Attention cards). Needs-Attention *count* = Metric; the Needs-Attention *list of records* = Intelligence. Do not merge the two.

### 9.2 Every Metric card defines (the card contract)

| Field | Meaning |
|---|---|
| **Operational Question** | The human question the card answers ("Are tours converting?"). |
| **Metric Source** | Data Source = metric ref → OIP definition. |
| **Calculation Owner** | OIP / `metric_definitions`. Never the card. |
| **Display Value** | `formattedValue` (unit/precision from definition); null → reserve, never `0`. |
| **Comparison** | Optional baseline (prior period / target / segment / benchmark). |
| **Trend** | Optional sparkline + direction over window. |
| **Threshold** | `target_config` / `threshold_config` → health bands. |
| **Status / Tone** | healthy / warning / critical → shared tone tokens (green / amber / red / neutral / purple-intelligence). |
| **Context** | The *Why* — contributing dimensions, recent change, driver. |
| **Recommendation** | The *What now* — suggested action(s) with projected impact (when applicable). |
| **Navigation** | Drill target: Business Process → Work Unit → Queue → Record → Action. |
| **Actions** | Card-owned operations (Drill, Compare, Investigate, Correct, Export). |
| **Supported Surfaces** | Which surfaces/densities may host it (header, tile, FP, OI, dashboard, report, portal, mobile). |

### 9.3 Density ladder (Surface Independence)

| Density | Surface | Shows |
|---|---|---|
| **Micro** | Header strip / queue | Label · value · tone dot |
| **Compact** | Tile / work-unit header / Focus Panel | + comparison + mini-sparkline |
| **Standard** | OI / dashboard | + trend + threshold + context line |
| **Expanded** | Drill / Optimization Center | + breakdown + recommendation + actions + record list |
| **Report** | Reporting | period-locked, print/export renderer |

One card, five densities, identical identity and drill target.

### 9.4 Interaction depth (no dead-ends)

```
Observe (value+tone)
  → Reveal (comparison, sparkline)
    → Focus (breakdown segment / period)
      → Investigate (Why: drivers, contributing records)
        → Navigate (into queue/record)        ← only when transform is insufficient
          → Act (corrective action / workflow)
            → Measure Again (return shows impact)
```

---

## 10. What Phase 1 freezes (and what it defers)

**Frozen by this phase:**
- Analytics = Dashboard Design Surface category; one configuration model.
- The metric hierarchy (org → process → work stream → record) and the single bidirectional drill axis.
- The Metric archetype with Renderers (KPI/Trend/Comparison/Forecast/Benchmark/Health/Breakdown) and Compositions (Insight/Recommendation).
- The card contract (§9.2) and density ladder (§9.3).
- The Intelligence-surface family + Optimization Center command-surface concept + Reporting (snapshot) model.

**Deferred to later sprints (not decided here):**
- Generalized Design Surface document schema for dashboards (storage stays `metric_placements` near-term).
- Forecast/Benchmark math (OIP additions).
- Optimization Center simulation engine internals.
- Viewpoint UI, Portal/Mobile analytics editors.
- Reporting output-renderer catalog (PDF/board packet) details.

Phase 3 (`03-implementation-strategy.md`) converges today's three metric layers toward this ideal.
