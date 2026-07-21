---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Operational Planning Platform — discovery set

**Status:** Proposed — Product Office / Chief Product Architect discovery (July 2026). Scheduling is the proving ground; the **Operational Planning Platform** is the deliverable. Not doctrine until ratified.

## The thesis in one paragraph

Operational Planning is **not a new truth-flow layer and not a new product**. Alloy's doctrine already reserves a **Planning *plane*** (Configuration / Planning / Operations / Records / Intelligence) and has frozen the truth-flow axis at five layers ("no sixth layer"). The discovery is that Planning is the **maturation of that plane into a first-class runtime** — a reusable `propose → simulate → optimize → commit` loop that composes primitives Alloy already built (the Expectations **Preview**, the Commercial **simulator**, the `approve_enrollment` **handoff**, **effective-dated supersede**, **registered Calculations**, the **BOS proposal lifecycle**) into one operator experience, with per-domain plugins. Scheduling is its first complete expression; Attendance, Staffing, Capacity, Commercial, and Enrollment Convergence follow with **zero new runtime**.

> **Iteration 4 (what Alloy *is*) — current apex.** The sprint zoomed out past planning: Alloy is not fundamentally a platform that *manages work* — it is a platform that moves operators from **operational pressure to operational truth**: a **Decision Platform**. The missing abstractions: **Pressure = a Gap** (Expectations − Facts, already derived), **Decision** = the episode that closes a gap, **Commit** = the decision→truth boundary. It is **composition, not a new runtime** — the Decision Loop *is* the existing `Resolve→Evaluate→Preview→Commit` execution runtime. Validated across **nine domains including Processing & Communications** (the non-Scheduling certified workspaces). Read **[operational-decision-platform.md](./operational-decision-platform.md)** first; it subsumes (does not discard) Iterations 1–3 — Planning is the Scheduling *decision domain*.
>
> *Lineage:* I1 Planning plane→runtime · I2 validate-by-inheritance (Work is the spine; **Studio placement later withdrawn**) · I3 Planning-in-Work, operators manipulate reality not plans · **I4 the Decision Platform** (planning is one decision domain).

## Read in this order

1. **[operational-decision-platform.md](./operational-decision-platform.md)** — *(Iteration 4, apex)* Alloy as a Decision Platform: Pressure=Gap, Decision as primitive, the Decision Loop (= existing runtime), the Commit Boundary, BOS, cross-domain — **no new runtime.**
2. **[operational-pressure-and-decision-loop.md](./operational-pressure-and-decision-loop.md)** — *(Iteration 4)* the pressure taxonomy, the refined loop, Decision vs Action vs Work, the Resolve verb, doctrine additions.
3. **[decision-cross-domain-validation.md](./decision-cross-domain-validation.md)** — *(Iteration 4)* the loop across nine domains incl. Processing & Communications; the platform/domain line.
4. **[operational-planning-runtime.md](./operational-planning-runtime.md)** — *(Iteration 3)* the **Scheduling decision domain**: planning-in-Work, reality-not-plans, the lifecycle.
5. **[planning-cross-domain-validation.md](./planning-cross-domain-validation.md)** — *(Iteration 3)* planning across eight domains (precursor to #3).
6. **[operational-planning-platform.md](./operational-planning-platform.md)** — the plane→runtime thesis, no-sixth-layer, the primitives, the plugin contract.
7. **[operational-plan-and-commit.md](./operational-plan-and-commit.md)** · **[operational-simulation.md](./operational-simulation.md)** · **[operational-optimization.md](./operational-optimization.md)** — the primitives (Commit, Simulation=consequence engine, Optimization=candidate generation).
8. **[scheduling-reference-implementation.md](./scheduling-reference-implementation.md)** · **[planning-focus-panel-evolution.md](./planning-focus-panel-evolution.md)** — Scheduling specifics.
9. **[platform-discoveries-and-roadmap.md](./platform-discoveries-and-roadmap.md)** — the classification ledger and roadmap.
10. **[studio-platform.md](./studio-platform.md)** · **[architecture-validation.md](./architecture-validation.md)** — *(Iteration 2, partially superseded)* Studio survives as config-authoring only.

## Companion mockups

- **[`mockups/scheduling-planning-mockups-v3.html`](./mockups/scheduling-planning-mockups-v3.html)** — *(Iteration 3, current)* nav redesigned around the discovered model: **Work = Overview · Planning · Roster · Attendance · Insights**, with planning **woven** as the **Resolve** flow in the Focus Panel (problem → propose a *proposed reality* → simulate → compare → commit). The board is demoted to **Roster** (one visualization of reality); **Studio shrinks to config assets only.** The UI emerges from *what the operator does after opening Scheduling* — face pressure, resolve it in place.
- **[`mockups/scheduling-planning-mockups-v2.html`](./mockups/scheduling-planning-mockups-v2.html)** — *(Iteration 2, superseded placement)* transcribed from real component markup; Work is the Alloy spine, but places planning in Studio (reversed by Iteration 3). Retained as the fidelity/critique record.
- **[`mockups/scheduling-planning-mockups.html`](./mockups/scheduling-planning-mockups.html)** — *(Iteration 1, retained)* the first-generation gallery.

## What this discovery deliberately did not do

Per the sprint constraints: no implementation plans, no React components, no CRUD screens, no redesign of the frozen foundations (Operational Facts / Calculations / Expectations / Intelligence / Business Process Runtime / Configuration Runtime / Focus Panel / visual language). Engineering is named only where it validates that the architecture is buildable. Nothing here is pushed, merged, or promoted.
