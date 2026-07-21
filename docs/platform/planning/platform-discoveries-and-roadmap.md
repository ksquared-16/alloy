---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Platform discoveries, classification ledger & roadmap

**Status:** Proposed — companion to [`operational-planning-platform.md`](./operational-planning-platform.md). The running classification of every discovery (Scheduling-specific vs reusable platform), the doctrine updates this proposes, and the MVP → V2 → V3 roadmap.

---

## 1. The classification ledger

Every discovery is tagged. The rule the sprint enforced throughout: **whenever a discovery is reusable, extract it to platform immediately — do not leave platform architecture hidden inside Scheduling.**

### 1.1 Reusable platform architecture (extract)

| Discovery | Class | Status of substrate | Owner doc |
|-----------|-------|---------------------|-----------|
| **Planning Runtime** — the `propose→simulate→optimize→commit` loop as a thin engine + per-domain plugins | Operational Planning Platform | New engine; primitives exist | [platform](./operational-planning-platform.md) |
| **Operational Plan** — proposed Intent deltas as a first-class object over `proposed` standing | Operational Planning Platform | Reuses Expectations standing substrate | [plan+commit](./operational-plan-and-commit.md) |
| **Operational Simulation** — deterministic, write-free projection via registered Calculations | Operational Simulation | Generalizes Preview + Commercial simulator | [simulation](./operational-simulation.md) |
| **Operational Optimization** — generate + rank candidate Plans; deterministic-first, BOS-assisted | Operational Optimization | New engine on existing resolvers | [optimization](./operational-optimization.md) |
| **Operational Commit** — generalized `approve_enrollment` handoff; atomic, previewed, supersede | Operational Commit | Generalizes one hardcoded handoff | [plan+commit](./operational-plan-and-commit.md) |
| **Planning Focus Panel card** — new reusable card type per workspace | Focus Panel Evolution | Follows `billing_preview` template | [focus-panel](./planning-focus-panel-evolution.md) |
| **Cross-workspace planning** — a `proposed` Plan is a durable, portable context | Operational Runtime | Card handoff exists; route-nav is a gap | [focus-panel](./planning-focus-panel-evolution.md) |
| **Plan diff / compare** — branch candidate Plans, diff SimulationResults | Operational Planning Platform | New | [plan+commit](./operational-plan-and-commit.md) |
| **Per-plugin grain** — engine grain-neutral; plugin declares grain (Room×Day, Staff×Day, Room×Term) | Operational Planning Platform | New | [platform](./operational-planning-platform.md) |
| **Configurable optimization objective** — "better" is L1 config, not hardcoded | Future Platform Doctrine | New | [optimization](./operational-optimization.md) |

### 1.2 Scheduling-specific (keep in the plugin)

| Discovery | Class |
|-----------|-------|
| Room × Day board rendering | Scheduling |
| Schedule patterns, ratio tiers, operating windows, room setup | Scheduling |
| The seven Scheduling plugin artifacts (deltas, projections, constraints, commit target) | Scheduling |
| Placement cascade School→Program→Room→Schedule vocabulary | Scheduling |

### 1.3 Future BOS

| Discovery | Class |
|-----------|-------|
| Non-obvious candidate generation (swap Noah, add float, delay start) | Future BOS |
| Natural-language option rationale | Future BOS |
| Proactive planning suggestions ("Room Sunflower will breach ratio Thursday") | Future BOS |

---

## 2. Doctrine updates this proposes

None of these *changes* a frozen law; all are additive and consistent with existing doctrine. If ratified, these are the canonical docs that would gain an entry:

| Doc | Proposed addition |
|-----|-------------------|
| [`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) | Planning plane matures from "forecast viewer" to the Planning Runtime; add the `propose→simulate→optimize→commit` loop and the "Commit is the seam" rule. |
| [`operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) | Note that the Planning plane may **draft** proposed L2 Intent (never authoritative until Commit) — reaffirms "no sixth layer," clarifies proposed-Intent handling. |
| [`focus-panel-card-library.md`](../operator/focus-panel-card-library.md) | Register the `planning` card type (archetype-instance) and its contract. |
| [`platform-decisions.md`](../foundation/platform-decisions.md) | A concise decision entry: "Operational Planning is a plane→runtime maturation, not a truth-flow layer." |
| **New RFC** in [`../rfcs/`](../rfcs/) | Promote this discovery to a numbered RFC (D-series) for ratification, mirroring `operational-expansion-phase1.md`. |

---

## 3. Roadmap

### MVP — the smallest complete Operational Planning Platform

**Goal:** prove the loop end-to-end on Scheduling, using only the existing substrate.

- **Engine:** `web/lib/planning/` — Plan envelope (over `proposed` standing), `Simulate` (calls registered Calculations + Preview), `Commit` (BPR Preview→Commit + effective-dating), deterministic `Optimize` (search + score).
- **Scheduling plugin:** the seven artifacts; deltas = place/move child, set/adjust pattern; commit target = `schedule_assignments`/`child_placements`.
- **Workspace:** first real Scheduling `WorkspaceShell` (Family A, Work|Studio); Overview, Planning Board (Room × Day), Optimization, Simulation/Commit, Conflicts; Studio = patterns + rules + windows + rooms + objectives.
- **Focus Panel:** read-only `planning` card following `billing_preview`.
- **Deliberately excluded:** staff supply, forecasting, BOS optimization, closures table, cross-workspace route-nav.

**MVP success = a child is planned into a room, simulated (occupancy/ratio/commercial), optimized against valid rooms, and committed to effective-dated Intent — with zero new truth-flow layer and zero parallel calculation math.**

### V2 — planning maturity (Simulation, Optimization, Commit depth)

- **BOS-assisted optimization** — non-obvious candidates + rationale.
- **Plan branching + compare** — hold and diff multiple candidate Plans.
- **Write-capable planning card** — draft + commit from the Focus Panel (needs edit substrate).
- **Cross-workspace planning** — embedded resolution + route-nav with Plan preservation.
- **Staffing supply (G3)** — staff/shift/coverage/float modeling; ratio *gaps* become *fillable* (assign/float/split); `staffedCapacity` stops being `null`.
- **Forecasting plugin** — the Planning plane's forward projection from L3+L4 (distinct from Simulation): fill/revenue/labor forecasts.

### V3 — multi-domain planning

The architecture extends with **no new runtime** — each is a Planning plugin:

| Domain | Grain | Proposes | Commits to | Optimizes for |
|--------|-------|----------|-----------|---------------|
| **Attendance** | Room × Day | expected coverage, pre-planned absences | (uses schedule intent) | coverage vs demand |
| **Staffing** | Staff × Day | shift assignment, float, coverage | shift assignments | coverage, minimal labor |
| **Capacity** | Room × Term | open/close, reserve, re-cohort | capacity intent | fill, waitlist clearance |
| **Commercial** | Offering × Period | rate/offering changes | commercial intent | revenue, retention |
| **Enrollment Convergence** | Child × Term | placement + schedule + billing as one plan | agreement chain | fill + revenue + continuity |
| **Forecasting** | Site × Period | (read-only projection) | — | (informs all plans) |

**Enrollment Convergence** is the V3 keystone: a single Plan that spans placement, schedule, and commercial — the full realization of "transform enrollment intent into operational reality" as one committed act. Every domain above reuses the same engine, Plan object, Simulation, Optimization, Commit, and planning card.

---

## 4. Open questions for ratification

1. **Plan envelope storage** — confirm the `proposed`-standing substrate is the right home for the plan envelope, or whether a thin `operational_plans` coordinating table is warranted (must remain non-authoritative for projections).
2. **Objective authoring** — where optimization objectives live in the four-plane Configuration model.
3. **Authority for Commit** — reuse `operational_authorities`, and which grains require approval.
4. **Cross-workspace route-nav** — the one genuinely missing platform capability (rung 3 of the decision ladder).
5. **Forecasting vs Simulation boundary** — keep them as distinct Planning-plane primitives (confirmed direction) and name their shared substrate.

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime and thesis.
- [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) — the RFC template and the "no sixth layer" ruling.
- [`../governance/documentation-governance.md`](../governance/documentation-governance.md) — how a proposed doc becomes ratified doctrine.
