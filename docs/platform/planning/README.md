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

> **Iteration 2 (validation by inheritance).** A second sprint forced the architecture to live inside the frozen Alloy workspace. Two docs carry the result and refine the model below: **[architecture-validation.md](./architecture-validation.md)** (the critique cycle; Optimization-as-futures; Simulation-as-alternative-reality; **Alloy commits plans, not records**) and **[studio-platform.md](./studio-platform.md)** (the central discovery: **Planning lives in Studio**, and Studio is a reusable platform capability). Where the two iterations differ, Iteration 2 governs — chiefly the **Work→Studio** placement of the loop.

## Read in this order

1. **[operational-planning-platform.md](./operational-planning-platform.md)** — the flagship. The thesis, the loop, what already exists, the four primitives, the plugin contract, boundaries, success criteria.
2. **[studio-platform.md](./studio-platform.md)** — *(Iteration 2)* Studio as the reusable operational design environment; Planning ⊂ Studio.
3. **[architecture-validation.md](./architecture-validation.md)** — *(Iteration 2)* the critique cycle and the refined Simulation / Optimization / Commit models.
4. **[operational-plan-and-commit.md](./operational-plan-and-commit.md)** — the Operational Plan object and the Operational Commit lifecycle (the seam into truth).
5. **[operational-simulation.md](./operational-simulation.md)** — Simulation as a reusable, deterministic, write-free primitive.
6. **[operational-optimization.md](./operational-optimization.md)** — Optimization: candidate generation, ranking, consequences, BOS relationship.
7. **[scheduling-reference-implementation.md](./scheduling-reference-implementation.md)** — Scheduling as the first plugin: product, domain, grain (Room × Day), workspace (Work | Studio).
8. **[planning-focus-panel-evolution.md](./planning-focus-panel-evolution.md)** — the planning card, Workspace ↔ Focus Panel symmetry, cross-workspace planning.
9. **[platform-discoveries-and-roadmap.md](./platform-discoveries-and-roadmap.md)** — the classification ledger, doctrine updates, and MVP → V2 → V3 roadmap.

## Companion mockups

- **[`mockups/scheduling-planning-mockups-v2.html`](./mockups/scheduling-planning-mockups-v2.html)** — *(Iteration 2, current)* composed **only** from certified Alloy primitives, transcribed from the real component markup (WorkspaceShell · Work\|Studio · Operational Health · Overview · Work Views/Queue · Focus Panel · the `ProcessingFormBuilder` design-time frame). Work is the Alloy spine; **Planning lives in Studio**; the Room × Day board is the Studio design canvas (Simulate⟷Preview, Commit⟷Publish). Goal: indistinguishable from Processing.
- **[`mockups/scheduling-planning-mockups.html`](./mockups/scheduling-planning-mockups.html)** — *(Iteration 1, retained)* the first-generation gallery; kept as the record the critique cycle worked from.

## What this discovery deliberately did not do

Per the sprint constraints: no implementation plans, no React components, no CRUD screens, no redesign of the frozen foundations (Operational Facts / Calculations / Expectations / Intelligence / Business Process Runtime / Configuration Runtime / Focus Panel / visual language). Engineering is named only where it validates that the architecture is buildable. Nothing here is pushed, merged, or promoted.
