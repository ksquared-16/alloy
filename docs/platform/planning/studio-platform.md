---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The Studio Platform — the operational design environment

**Status:** Proposed — Iteration-2 discovery. Companion to [`operational-planning-platform.md`](./operational-planning-platform.md). This is the sprint's central new discovery: **Planning does not need its own workspace paradigm — it is what Studio *is*, generalized.**

---

## 1. The reframe that made the architecture fit Alloy

Iteration 1 placed the planning loop (build → simulate → optimize → commit) in **Work** mode and rendered it as a bespoke board. That is precisely why it "felt like a Scheduling app, not Alloy." Forcing the architecture to live inside the frozen workspace exposed the correction:

> **Work operates today's committed reality. Studio designs tomorrow. The planning loop is "design tomorrow" — so it lives in Studio.**

Every certified workspace already has this split ([`operational-workspace-shell.md`](../operator/operational-workspace-shell.md)):

- **Work** — *"runtime operational work (live records, queues, decisions)."* → "How do I operate today?"
- **Studio** — *"design-time setup (the reusable assets that power Work)."* → "How do I design tomorrow?"

Processing's Studio designs **forms, packets, fields, branding**. The discovery is that "design-time" is broader than configuration: **Studio is the operational *design environment*, and configuration is only its first expression.** Planning is its second.

---

## 2. Studio has a shape — and it is the planning loop

Look at what Processing's Studio actually does and abstract it:

```
Processing · Studio:   author a form  →  preview it  →  (compare versions)  →  PUBLISH  →  Work uses it
Scheduling · Studio:   build a plan   →  simulate it →   compare candidates →  COMMIT   →  Work operates it
```

These are **the same verb family.** Studio is where you construct a design object, project/preview its behavior, compare alternatives, and cross a **publish/commit door** into the live runtime. The planning `propose → simulate → optimize → commit` loop is not a new invention bolted onto the workspace — **it is the Studio loop, with an *operational* design object (a Plan) instead of a *configuration* design object (a form).**

| Studio verb | Configuration expression (Processing) | Operational expression (Scheduling / Planning) |
|-------------|----------------------------------------|-----------------------------------------------|
| **Author** | edit a form / field / packet | draft an Operational Plan (proposed Intent deltas) |
| **Preview** | render the form as operators will see it | **Simulate** the plan (projected reality) |
| **Compare** | diff form versions | **Optimize** — compare candidate futures |
| **Publish / Commit** | publish the layout to the runtime | **Commit** the plan to L2 Intent |
| **The door** | publish → runtime parity (a frozen invariant) | commit → execution (the one-way seam) |

The frozen *"publish → runtime parity is mandatory"* invariant ([`os-runtime-map.md`](../foundation/os-runtime-map.md)) is the configuration-domain version of *"what you simulate is what you commit"* ([`operational-simulation.md`](./operational-simulation.md)). They are the same law: **the design environment must faithfully predict the runtime.**

---

## 3. The discovery: Studio Platform

**Studio is a reusable Alloy platform capability, not a per-workspace feature.** Extract it.

**Studio Platform** = the design-time runtime that lets an operator: construct a design object, preview/project its runtime behavior faithfully, compare alternatives, and cross a governed door into the live runtime — with the design object held **separate from committed truth** until that door.

A workspace's Studio is a **Studio Platform instance** parameterized by its **design object**:

| Workspace | Studio design object | Preview | Door |
|-----------|----------------------|---------|------|
| Processing | form / packet / field / branding | render preview | Publish (layout → runtime) |
| Scheduling | **Operational Plan** (Room × Day) | **Simulation** | **Commit** (plan → Intent) |
| Staffing | Coverage Plan (Staff × Day) | Simulation | Commit |
| Capacity | Capacity Plan (Room × Term) | Simulation | Commit |
| Commercial | Rate/Offering change | Simulation | Commit |
| Experience Builder | Focus Panel composition | canvas preview | Publish |

This is why the architecture *fits*: the **Planning Runtime is the operational specialization of the Studio Platform.** Scheduling inherits Studio the way it inherits the Workspace Shell — by changing the design object, not the environment.

---

## 4. What this does to the workspace (Workspace Evolution)

Nothing structural — that is the point. Scheduling is `WorkspaceShell` with `Work | Studio`, changing only **title, nav items, operational content**. The evolution is conceptual, not chrome:

- **Work mode graduates to the Alloy spine.** Scheduling · Work is **Overview + Work Views (queues) + Focus Panel** — operating today's committed schedule reality (unplaced children, ratio risks today, schedule↔attendance mismatches, plans awaiting commit). It is indistinguishable from Processing · Work because it *is* Processing's Work architecture. **No board in Work.**
- **Studio mode graduates from config to operational design.** Scheduling · Studio hosts the planning loop: **Plans · Simulation · Optimization · Commit**, plus the design assets (Rooms · Rules · Calendar · Patterns). This is the "Studio Platform made operational."

The Room × Day matrix — the thing that made v1 "feel like a scheduling app" — **is not the workspace and is not in Work.** It is *one perspective inside a Studio plan-authoring surface*, rendered on the existing **Studio design canvas** (the Experience-Builder-class canvas + Focus-Panel inspector), where the canvas content happens to be a matrix. The canvas primitive is inherited; only its content is Scheduling-specific — which is exactly the sanctioned boundary (*inherit everything above the operational content*).

---

## 5. Why not a new primitive for the plan board?

The compositional test — *"if you invent a new primitive, first prove the existing one cannot express it"*:

- **Operating surfaces (Work)** are expressed with **Work Views / Queues + Focus Panel**. A "schedule" is a Work View perspective; a room or child or plan is a Focus Panel subject. No new primitive.
- **The plan-authoring surface (Studio)** is expressed with the **Studio design canvas + inspector** — the same canvas+inspector the Experience Builder already ships for composing Focus Panel layouts. The plan board is that canvas with matrix content. No new primitive.
- **Comparison of candidate plans** is expressed as a **Work View** (a perspective whose rows are candidate futures) or side-by-side Focus Panels. No new primitive.

The only Scheduling-specific *content* is the matrix cell renderer and the domain vocabulary — permitted operational content, not new chrome.

---

## 6. Studio Platform boundaries

- Studio **does not write truth** until its door (Publish/Commit). Design objects stay in `proposed`/draft standing.
- Studio **does not own a new shell** — it is the design-time half of the existing `WorkspaceShell`.
- Studio **does not replace Configuration** — configuration is one Studio design object; Planning is another. Both are Studio.
- Studio's **preview must faithfully predict the runtime** (publish-parity / simulate-fidelity are the same law).

---

## 7. Studio Platform discovery, classified

| Discovery | Class |
|-----------|-------|
| Studio is the reusable operational design environment (author→preview→compare→door) | **Studio Platform** |
| Planning Runtime = the operational specialization of Studio | **Planning Runtime** |
| The plan board = the Studio design canvas (inherited from Experience Builder), matrix content | **Workspace Evolution** |
| Work leads with the Alloy spine (Overview + Work Views + Focus Panel), no board | **Workspace Evolution** |
| Publish-parity and simulate-fidelity are one law (design must predict runtime) | **Future Platform Doctrine** |

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime (now a Studio specialization).
- [`architecture-validation.md`](./architecture-validation.md) — the critique cycle that forced this reframe.
- [`../operator/operational-workspace-shell.md`](../operator/operational-workspace-shell.md) — Work vs Studio definitions.
- [`../operator/experience-builder-doctrine.md`](../operator/experience-builder-doctrine.md) — the canvas + inspector design-time primitive the plan board inherits.
