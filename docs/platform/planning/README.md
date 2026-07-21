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

## Read in this order

1. **[operational-planning-platform.md](./operational-planning-platform.md)** — the flagship. The thesis, the loop, what already exists, the four primitives, the plugin contract, boundaries, success criteria.
2. **[operational-plan-and-commit.md](./operational-plan-and-commit.md)** — the Operational Plan object and the Operational Commit lifecycle (the seam into truth).
3. **[operational-simulation.md](./operational-simulation.md)** — Simulation as a reusable, deterministic, write-free primitive.
4. **[operational-optimization.md](./operational-optimization.md)** — Optimization: candidate generation, ranking, consequences, BOS relationship.
5. **[scheduling-reference-implementation.md](./scheduling-reference-implementation.md)** — Scheduling as the first plugin: product, domain, grain (Room × Day), workspace (Work | Studio).
6. **[planning-focus-panel-evolution.md](./planning-focus-panel-evolution.md)** — the planning card, Workspace ↔ Focus Panel symmetry, cross-workspace planning.
7. **[platform-discoveries-and-roadmap.md](./platform-discoveries-and-roadmap.md)** — the classification ledger, doctrine updates, and MVP → V2 → V3 roadmap.

## Companion mockups

Polished, visually-faithful mockups (inheriting the frozen Alloy visual language — Poppins, Bend Pine `#00A283`, River Stone field, signature pine-left-accent white panels) accompany this set: Scheduling Overview, the Room × Day Planning Board, Optimization, Simulation & Commit, the Scheduling Focus Panel planning card, and Studio. See the sprint deliverable gallery.

## What this discovery deliberately did not do

Per the sprint constraints: no implementation plans, no React components, no CRUD screens, no redesign of the frozen foundations (Operational Facts / Calculations / Expectations / Intelligence / Business Process Runtime / Configuration Runtime / Focus Panel / visual language). Engineering is named only where it validates that the architecture is buildable. Nothing here is pushed, merged, or promoted.
