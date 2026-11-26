---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Operational Optimization

**Status:** Proposed — companion to [`operational-planning-platform.md`](./operational-planning-platform.md). One of the sprint's primary discovery objectives: Scheduling should not merely expose operational truth; it should help operators produce **better** operational outcomes.

---

## 1. Definition

**Operational Optimization** is the generation and ranking of candidate **Plans** that satisfy an operator's intent, scored by their simulated consequences. It answers *"what are my options, and which is best?"* — and it **emerges from Operational Calculations; it does not replace them.**

```
Optimize(intent, base) =
    candidates = generate(intent, config, currentIntent)   // valid Plans
    scored = candidates.map(c => ({ plan: c, sim: Simulate(c) }))
    ranked = scored.sortBy(objectiveFn)                     // deterministic score
    → RankedOptions[]  (each: a Plan + its SimulationResult + a score + rationale)
```

Worked example (the sprint's own): *child requires care* → options `{ Room A, Room B, delay start one day, add float teacher, swap Noah }` → each carries **projected impacts** on occupancy, ratios, labor, commercial, billing, and future conflicts.

---

## 2. Deterministic-first, BOS-assisted

Optimization is defined in two tiers so the MVP needs no AI and the platform stays honest about where intelligence lives.

### 2.1 Tier 1 — deterministic optimization (MVP; no BOS required)

- **Generation** is a deterministic search over **Configuration + current Intent**: enumerate valid rooms (capacity/ratio/program-eligible), valid schedule patterns (`childcare_schedule_rules`, operating windows), and valid staffing moves. Validity uses the same resolvers Execution uses (`resolveOperationalCapacity`, `resolveRatio`, `resolveConfigRule`).
- **Scoring** is a deterministic function of the **simulated Calculations**: ratio headroom, occupancy fit, fill %, labor delta, commercial delta, conflict count. Weights are configurable objectives (§4).
- A **ranked list of valid options with projected consequences is already optimization.** No model, no black box — just Simulation applied to a generated candidate set and sorted.

This tier is buildable *today* on the existing resolvers and the `aggregateExpectedOccupancyByRoomDate` projection.

### 2.2 Tier 2 — BOS-assisted optimization

BOS extends generation and explanation under the ratified rule *"BOS proposes; humans approve"* ([`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md); `web/lib/bos/bosProposalLifecycle.ts`):

- **Non-obvious candidate generation** — moves a deterministic enumerator won't surface: *swap Noah to Room B to open a seat for the new child*, *delay start one day to clear a ratio cliff*, *add a float teacher for Tue/Thu only*. BOS proposes these as candidate Plans.
- **Natural-language rationale** — "Room B keeps every day within ratio and adds $420/mo tuition with no labor change" — attached to a ranked option.
- **Boundary:** BOS **never commits** and **never computes the numbers** — it proposes Plans; Simulation (registered Calculations) computes their consequences; the operator ranks and commits. BOS is a candidate *source* and a *narrator*, not an authority.

---

## 3. Optimization emerges from Calculations — it does not replace them

This is the doctrinal spine of the discovery. The sprint brief's instruction — *"Optimization should emerge naturally from Operational Calculations — not replace them"* — maps exactly onto Alloy's frozen boundary:

- Calculations **measure what IS / what a plan projects** (occupancy, ratio, capacity). They carry **no judgment**.
- Optimization **compares** those measurements across candidate Plans and **orders** them by an objective. The judgment lives in the *objective function*, authored as configuration — never inside the Calculation.

So Optimization adds **no new truth and no new math.** It is Simulation (which is Calculations over projected Intent) run across many candidates, plus a sort. This keeps *"one fact, one definition, one owner, many consumers"* intact — Optimization is just another consumer.

---

## 4. Objectives — what "better" means

Optimization needs an **objective function**, and "better" is org-configurable, not hardcoded. A Scheduling objective is a weighting over projected quantities:

| Objective term | Source | Typical direction |
|----------------|--------|-------------------|
| Ratio compliance / headroom | `resolveRatio` | maximize (stay within tiers) |
| Occupancy fit / fill % | `aggregateExpectedOccupancyByRoomDate` ÷ capacity | maximize toward target |
| Labor cost delta | required-staff × labor rate | minimize |
| Commercial delta (tuition/revenue) | consumption preview | maximize |
| Conflict count | Simulation conflicts | minimize (hard-zero for blocking) |
| Continuity (child/room/teacher stability) | Plan diff vs current | maximize (fewer moves) |

Objectives are **L1 Configuration** (Planning reads them). Different orgs optimize for different things (fill vs continuity vs labor); the engine ranks by whatever objective the org authored. Blocking conflicts are a hard filter, not a soft penalty — an over-capacity or ratio-breaching option is invalid, not merely low-ranked.

---

## 5. Consequence visualization

Every ranked option carries its full `SimulationResult`, so the operator sees **projected impacts** per option, not just a score:

- **Occupancy / ratio / fill** per Room × Day cell.
- **Labor** — staff the option demands.
- **Commercial / billing** — tuition and revenue delta.
- **Future conflicts** — downstream Room×Day cells the option would break.
- **Diff** — exactly which Intent changes (moves, new assignments) the option commits.

This is the mission's "projected impacts" board, and it is **the same Simulation output** reused per candidate — no bespoke optimization UI data.

---

## 6. Optimization is a platform primitive, extracted

The engine owns **generation-search, scoring, and ranking**; the plugin owns **its candidate space (proposable deltas), its objective terms, and its validity constraints.** Staffing optimization (cover a ratio gap: assign, float, or split) is the *same engine* with a Staffing candidate space and objective — no new optimization runtime.

---

## 7. Boundaries

- Optimization **does not compute truth** — it ranks Simulation outputs (which are Calculations).
- Optimization **does not commit** — it produces ranked Plans; the operator commits one.
- Optimization **does not encode judgment in Calculations** — judgment lives in the configurable objective.
- BOS **proposes and narrates; it does not decide.**

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime.
- [`operational-simulation.md`](./operational-simulation.md) — the per-candidate projection Optimization ranks.
- [`operational-plan-and-commit.md`](./operational-plan-and-commit.md) — candidate Plans and the commit of the chosen one.
- [`../core/operational-calculations.md`](../core/operational-calculations.md) — the measurement layer Optimization consumes.
- [`../modules/ai-platform.md`](../modules/ai-platform.md) — BOS "proposes; humans approve."
