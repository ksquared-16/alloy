---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Operational Simulation

**Status:** Proposed — companion to [`operational-planning-platform.md`](./operational-planning-platform.md). Determines whether Alloy needs an explicit Simulation layer, and defines it as a reusable platform primitive.

---

## 1. The question, and the answer

*Does Alloy need an explicit Simulation layer?*

**Yes as a named primitive; no as a new runtime or store.** Simulation is the **generalization of a pattern Alloy already ships in three places** — the Operational Expectations **Preview**, the Commercial Execution **simulator**, and the BPR **Preview phase** — unified into one reusable capability the Planning Runtime calls. It introduces **no new calculation authority** and **writes no truth.**

---

## 2. Definition

**Operational Simulation** is the deterministic, write-free projection of a Plan's consequences: it runs the existing **Preview** evaluation and the registered **Operational Calculations** over a Plan's *projected state* (`current Intent + Plan deltas`) to produce projected **L3** (occupancy, ratio, staffing demand, fill) and projected **L5** (tuition, subsidy, revenue, labor cost).

```
Simulate(Plan) =
    projectedIntent = apply(Plan.deltas, currentIntent)          // in memory, no write
    L3 = registeredCalculations(projectedIntent, config, facts?) // same calcs Execution uses
    L5 = consumptionPreview(projectedIntent, commercialModel)     // the commercial preview, hypothetical
    conflicts = constraints(projectedIntent, config)              // ratio/capacity/schedule validity
    → SimulationResult { projectedL3, projectedL5, conflicts, keys }
```

The result is a **projected reality** the operator reads *before* committing.

---

## 3. The three precedents Simulation generalizes

| Precedent | What it proves | Anchor |
|-----------|----------------|--------|
| **Operational Expectations Preview** | *"the 'if authored, then' projection of a proposed act before ratification… pure evaluation over a hypothetical ledger; no writes."* A native what-if primitive. | [`operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) |
| **Commercial Execution simulator** | A full pipeline (`evaluate() → attribute() → expand()`) that is *"preview-only, deterministic, creates no financial truth"* and keyed (`resolutionKey`) for reproducibility. | [`commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md) |
| **BPR Preview phase** | The pre-commit projection of current→target + side effects so *"the operator is never surprised."* | [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md) |

Simulation is the recognition that these are **the same primitive**, applied to a Plan instead of a single act, across every projection a plugin declares.

---

## 4. The three invariants (why Simulation is trustworthy)

### 4.1 Determinism

Same Plan + same `configVersion` + same `intentVersion` ⇒ identical `SimulationResult`. This is not aspirational: the Commercial simulator already snapshot-tests `resolutionKey` determinism, and registered Calculations are *"typed, versioned, reproducible"* by contract ([`operational-calculations.md`](../core/operational-calculations.md)). Simulation inherits both. Determinism is what makes Optimization's ranking meaningful and Compare (§1.4 of the plan doc) stable.

### 4.2 Fidelity — *the simulator is the executor*

Simulation calls the **same registered Calculations** that Execution calls; it only substitutes a hypothetical Intent set. This is the load-bearing discipline:

> **What you simulate is computed by exactly what will compute reality after you commit.**

There is no "simulation math" that can drift from "real math," because there is only one math — the registered Calculation. The domain already has the exact projection Scheduling needs: `aggregateExpectedOccupancyByRoomDate()` (`web/lib/childcareOperational/expectations/scheduleExpectationCore.ts`) produces `ExpectedOccupancyEntry {roomLocationId, date, childCount}` and `ExpectedStaffingEntry`. Simulation feeds it projected Intent; Execution feeds it committed Intent; **same function.**

### 4.3 Purity — no writes, non-authoritative output

Simulation writes nothing. Its output is a **non-authoritative, recomputable cache** (Law 2). A `SimulationResult` is never a system of record, never edited in place, always reproducible by re-running. This obeys the "no L3 system-of-record" ruling exactly.

---

## 5. What a Scheduling Simulation projects (Room × Day)

For a Plan over a room and a date range, Simulation produces, per Room × Day cell:

| Projection | Registered calculation | Meaning |
|------------|------------------------|---------|
| **Expected occupancy** | `aggregateExpectedOccupancyByRoomDate` | children projected in room on day |
| **Binding capacity + availableNow** | `resolveOperationalCapacity` (`availableNow = binding − committed − offered`) | seats left; limiting factor named |
| **Required staff / ratio state** | `resolveRatio` (stepped tiers, mixed-age `most_restrictive`) | staff the plan demands; ratio headroom |
| **Fill %** | occupancy ÷ binding capacity | utilization |
| **Projected tuition / revenue** | consumption preview over `childcare_rate_*` | commercial impact of the plan |
| **Conflicts** | capacity/ratio/schedule validity | over-capacity, ratio breach, invalid pattern, downstream collisions |

The **conflict list is an output of Simulation, not a separate module** — this validates the sprint's hypothesis that "Conflicts may simply become one output of optimization rather than a first-class module." A conflict is a projected constraint violation; it appears wherever the projection appears.

---

## 6. Simulation is a platform primitive, extracted

**Extract to platform.** Simulation belongs in the Planning engine (`web/lib/planning/simulate`), not in Scheduling. It is grain-neutral: it takes a Plan and a plugin's declared projection set and returns a `SimulationResult`. Scheduling, Staffing, Capacity, and Commercial planning all call the same simulator with different projection sets.

The plugin supplies **which** Calculations to run; the engine supplies **that they run purely, deterministically, and without writes.**

---

## 7. Boundaries

- Simulation **does not compute** — it *invokes* registered Calculations. No parallel math.
- Simulation **does not write** — no truth, no facts, no draft charges. (The Commercial simulator already draws this line: no obligations, no posting.)
- Simulation **is not Forecasting.** Simulation projects *a specific Plan's* consequences; Forecasting projects *the future from history* (L3+L4 forward). Both live in the Planning plane, but Forecasting answers "what will happen if nothing changes" while Simulation answers "what happens if we commit *this*." Forecasting is a later plugin ([`platform-discoveries-and-roadmap.md`](./platform-discoveries-and-roadmap.md)).

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime.
- [`operational-optimization.md`](./operational-optimization.md) — ranks Plans by their SimulationResults.
- [`../core/operational-calculations.md`](../core/operational-calculations.md) — the calculation authority Simulation invokes.
- [`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md) — the proven write-free deterministic simulator.
- [`../core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) — the Preview primitive.
