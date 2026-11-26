---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Decision Architecture — ratification & implementation recommendations

**Status:** Proposed. The disposition of every discovery from the initiative, sorted into: **platform doctrine**, **RFC**, **implementation work**, **future research**, and **discarded**. Companion to [`alloy-decision-architecture.md`](./alloy-decision-architecture.md). Assume implementation begins immediately after ratification.

---

## 1. Becomes platform doctrine (ratify into existing canonical docs — no new runtime)

These are settled and should be written into the owning canonical documents in one ratification PR:

| Doctrine | Owning canonical doc | One-line statement |
|----------|----------------------|--------------------|
| **Pressure = Gap** | [`operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) | Operational Pressure is the derived gap between the Expectation and Fact ledgers; it is the cross-domain attention signal. Derived, never stored. |
| **The Commit Boundary** | [`operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) | Commit is the single boundary between a decision and truth: reversible before, authoritative (supersede-only) after. |
| **The Decision is the primitive** | [`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) + [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md) | Every operational domain is a decision domain; the operator experience is problem → options → tradeoffs → commit; the runtime is `resolve → evaluate → preview → commit`. |
| **BOS decision doctrine** | [`ai-platform.md`](../modules/ai-platform.md) | BOS sees pressure, computes ranking/options/consequences, explains, proposes — and never chooses or commits. |
| **`resolve` verb** | [`canonical-interaction-model.md`](../operator/canonical-interaction-model.md) | Add `resolve` to the universal verb set as the prospective counterpart to `complete`. |
| **Commit / Publish are one pattern** | [`configuration-platform.md`](../modules/configuration-platform.md) note | Publish is Commit over configuration assets; same boundary pattern, Studio home. |

---

## 2. Becomes one RFC (the buildable specification)

A single RFC — *"The Decision Runtime"* — in [`../rfcs/`](../rfcs/), mirroring `operational-expansion-phase1.md`, specifying the **composition** (not new machinery):

1. **Pressure read-model** — a derived `Gap { subject, modality, temporality, severity, expectation_ref, fact_ref }` over the Expectations engine, surfaced through the existing attention/Current-Work path. Conformance: derived + recomputable, no authoritative store.
2. **The Decision card archetype** — register `decision` in the Focus Panel card library ([§7](./alloy-decision-architecture.md)): problem · options (ranked) · tradeoffs (before→after) · commit. Read-only-consequences first, commit-capable when the edit substrate lands.
3. **Preview-over-N** — the one genuinely new stage: run the runtime's preview phase over multiple candidate realities and diff them. Everything it needs (Preview phase, registered Calculations) exists.
4. **Commit adapter** — the runtime's commit phase + effective-dated supersede, invoked from a committed Decision; the generalization of the `approve_enrollment` handoff.
5. **Options adapter** — deterministic search + BOS proposal bridge + objective scoring.

Exit criteria: a decision runs end-to-end in **Scheduling** (the first domain) and one **fast-path** domain (Processing or Communications) with zero new runtime and zero parallel calculation math.

---

## 3. Becomes implementation work (sequenced)

| # | Work | Depends on |
|---|------|-----------|
| 1 | Pressure read-model + attention surfacing (Scheduling gaps) | Expectations engine (exists) |
| 2 | `decision` Focus Panel card (read-only) | Focus Panel card library (exists) |
| 3 | Preview-over-N + tradeoff diff | Preview phase + Calculations (exist) |
| 4 | Commit adapter (schedule_assignments supersede) | effective-dating (exists) |
| 5 | Options adapter (deterministic first, BOS second) | BOS proposal lifecycle (exists) |
| 6 | Second domain (Processing or Communications) — proves fast path | steps 1–4 |

Scheduling is the reference domain because its **entire operational substrate is already built** (placements, schedule assignments, capacity/ratio resolvers, the room×date occupancy projection) — only the decision surface is greenfield.

---

## 4. Future research (not now)

- **Multi-decision sequencing / replay** — reconstructing state by replaying committed decisions; auditing at a point in time.
- **Cross-workspace decision hand-off** — route-level navigation carrying an open decision as portable context (a named platform gap today).
- **Staffing supply modeling (G3)** — real staff/shift/coverage so ratio-gap decisions can *fill* (not just detect) gaps.
- **Objective authoring** — where per-domain optimization objectives live in the configuration model.
- **AI-generated candidate quality** — when BOS proposals beat deterministic search, and how to measure it.

---

## 5. Discarded (removed completely)

These served discovery and are gone from the final architecture and product:

| Discarded | Why | Survives as |
|-----------|-----|-------------|
| **Operational Planning** (as a named layer/capability) | it was decision-making in Work under another name | the **Decision** (in Work) |
| **Plan** (as the operator's object) | operators change reality, not documents | the decision's change-record (engineering only) |
| **Studio as the home of planning** (Iteration 2) | planning is live, in-flow, pressure-driven — not design-time | Studio = config authoring only |
| **Simulation, Alternative Reality, Proposed Reality** (as distinct concepts) | all the same thing | **Preview** |
| **Optimization** (as a headline feature) | it is only *how options are generated and ranked* | the options step of a Decision |
| **Apply** (as a distinct verb) | duplicate of Commit | **Commit** |
| **Plan board / Studio design canvas** (as the Scheduling identity) | the calendar is one visualization, not the product | the **Roster** view |

---

## 6. Net change to Alloy

- **New runtimes:** 0.
- **New platform concepts:** 1 primitive (**Decision**) + 1 derived read-model (**Pressure**), both composed from existing capabilities.
- **New operator concepts:** 0 the operator must learn beyond *problem → options → tradeoffs → commit*.
- **New Focus Panel archetypes:** 1 (**Decision card**).
- **Concepts removed:** 7 (§5).

The initiative's lasting artifact is not Scheduling and not Planning. It is the recognition that **Alloy is a platform for making operational decisions**, expressible in one primitive over the ledgers it already has.

---

## Cross-references

- [`alloy-decision-architecture.md`](./alloy-decision-architecture.md) — the final architecture.
- [`operational-decision-platform.md`](./operational-decision-platform.md) — the discovery reasoning.
