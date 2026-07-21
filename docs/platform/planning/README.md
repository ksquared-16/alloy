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

> **Iteration 3 (what Planning actually is) — current.** Starting from operator behavior, this sprint **reverses Iteration 2**: planning begins with operational **pressure while operating on live reality**, so it lives in **Work**, not Studio (which stays config-authoring only). The deeper discovery: the operator manipulates **reality (proposed)**, not "plans." Read **[operational-planning-runtime.md](./operational-planning-runtime.md)** first — where any earlier doc disagrees, it governs — with **[planning-cross-domain-validation.md](./planning-cross-domain-validation.md)** proving the model across eight domains.
>
> *Lineage:* Iteration 1 = the Planning plane→runtime thesis; Iteration 2 = validate-by-inheritance (correctly: Work is the Alloy spine, Alloy commits plans-not-records; **incorrectly: Planning in Studio** — withdrawn here).

## Read in this order

1. **[operational-planning-runtime.md](./operational-planning-runtime.md)** — *(Iteration 3, definitive)* what Planning is: the runtime, the mental model (reality, not plans), Planning-in-Work, the lifecycle, the universal pattern.
2. **[planning-cross-domain-validation.md](./planning-cross-domain-validation.md)** — *(Iteration 3)* the model across Attendance/Staffing/Commercial/Billing/Capacity/Forecasting/Resource/OI; the platform/Scheduling line.
3. **[operational-planning-platform.md](./operational-planning-platform.md)** — the plane→runtime thesis, no-sixth-layer, the primitives, the plugin contract (placement corrected to Work).
4. **[operational-plan-and-commit.md](./operational-plan-and-commit.md)** — Commit and the change lifecycle (the Plan re-cast as the back-of-house change-record).
5. **[operational-simulation.md](./operational-simulation.md)** — Simulation as a reusable, deterministic, write-free primitive.
6. **[operational-optimization.md](./operational-optimization.md)** — Optimization as multi-future comparison.
7. **[scheduling-reference-implementation.md](./scheduling-reference-implementation.md)** — Scheduling as the first plugin (Work sections corrected).
8. **[planning-focus-panel-evolution.md](./planning-focus-panel-evolution.md)** — the planning card, cross-workspace planning.
9. **[platform-discoveries-and-roadmap.md](./platform-discoveries-and-roadmap.md)** — the classification ledger and MVP → V2 → V3 roadmap.
10. **[studio-platform.md](./studio-platform.md)** · **[architecture-validation.md](./architecture-validation.md)** — *(Iteration 2, partially superseded)* retained for the record; Studio survives as config-authoring only.

## Companion mockups

- **[`mockups/scheduling-planning-mockups-v3.html`](./mockups/scheduling-planning-mockups-v3.html)** — *(Iteration 3, current)* nav redesigned around the discovered model: **Work = Overview · Planning · Roster · Attendance · Insights**, with planning **woven** as the **Resolve** flow in the Focus Panel (problem → propose a *proposed reality* → simulate → compare → commit). The board is demoted to **Roster** (one visualization of reality); **Studio shrinks to config assets only.** The UI emerges from *what the operator does after opening Scheduling* — face pressure, resolve it in place.
- **[`mockups/scheduling-planning-mockups-v2.html`](./mockups/scheduling-planning-mockups-v2.html)** — *(Iteration 2, superseded placement)* transcribed from real component markup; Work is the Alloy spine, but places planning in Studio (reversed by Iteration 3). Retained as the fidelity/critique record.
- **[`mockups/scheduling-planning-mockups.html`](./mockups/scheduling-planning-mockups.html)** — *(Iteration 1, retained)* the first-generation gallery.

## What this discovery deliberately did not do

Per the sprint constraints: no implementation plans, no React components, no CRUD screens, no redesign of the frozen foundations (Operational Facts / Calculations / Expectations / Intelligence / Business Process Runtime / Configuration Runtime / Focus Panel / visual language). Engineering is named only where it validates that the architecture is buildable. Nothing here is pushed, merged, or promoted.
