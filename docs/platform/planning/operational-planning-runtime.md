---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# What Operational Planning is — the runtime, the object, the placement

**Status:** Proposed — Iteration-3 discovery. This document answers the question the first two iterations circled but never settled: **what *is* Operational Planning?** It begins from operator behavior, not UI, and it **reverses the Iteration-2 conclusion that Planning lives in Studio.** Where this doc and Iterations 1–2 disagree, this doc governs.

> **Elevated by Iteration 4 ([`operational-decision-platform.md`](./operational-decision-platform.md)).** Everything here is now understood as **the Scheduling *decision domain*** of a larger **Decision Platform**. Mapping: operational pressure = a **Gap** (Expectations − Facts); "propose a proposed reality" = **generate a candidate decision**; "Resolve" = open a **Decision** on a gap; "Commit" = the **decision→truth boundary**. This doc is not superseded — it is the first worked example of the platform.

---

## 1. Begin with the operator, not the screen

An operator never wakes up thinking *"I need to edit a plan."* They think:

- *I need somewhere for Ethan tomorrow.*
- *Thursday is over ratio.*
- *Two teachers called in sick.*
- *Attendance changed — can I still make this work?*
- *We just took another enrollment.*

**Planning begins with operational pressure, not with planning.** Every one of those sentences has the same shape: a **current reality**, a **problem pushing on it**, and a need to find a **change that makes it work** — safely, before committing. That shape *is* Operational Planning. Everything else (plans, boards, studios) is scaffolding we invented around it.

Three facts fall out of taking the operator seriously, and each overturns something the earlier iterations assumed:

1. **Pressure arises while operating.** It shows up in a queue, a roster, a forecast, an event — inside Work. The operator is *already operating* when the need to plan appears.
2. **Resolution must happen in flow.** Making the operator leave Work, go to a "planning studio," then return to Work to operate is the exact context-switch Alloy's continuity doctrine forbids (*"zoom-in, not page-swap; never feel like they navigated to a separate module"*).
3. **Planning is about reality, not documents.** The operator is trying to change *what will happen* — not to author a reusable artifact.

---

## 2. The decision: Planning lives in Work, not Studio

**Verdict: Planning belongs in Work.** Studio stays what the rest of Alloy already made it — the **design-time environment for reusable configuration assets** (forms, packets, fields, schedule patterns, ratio rules, workflows, branding).

### 2.1 Why Iteration 2 was wrong

Iteration 2 reasoned *"the planning loop is 'design tomorrow', therefore Studio."* That conflated two genuinely different activities:

| | **Studio (authoring)** | **Planning** |
|---|---|---|
| Operates on | context-free, reusable **assets** (a form, a rule, a pattern) | **live, specific reality** (this child, this Thursday, these teachers) |
| Has a "current reality"? | No — an asset is designed in the abstract | Yes — planning *starts* from current operational reality |
| Triggered by | a designer deciding to build/change a template | **operational pressure** while operating |
| Coupling to the day | none | total — it is *about* a specific operational moment |
| Output | a published asset the runtime reuses | a **committed change to reality** |

"Design tomorrow" was the trap: **planning designs *tomorrow's operations*, but it does so *while operating today*, on live reality, under pressure.** That is Work. Studio designs *the rules of the game*, context-free, ahead of time. The two only rhymed.

### 2.2 Doctrine already said so

Alloy's frozen plane model ([`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md)) puts *"Planning models future state without committing"* and *the commit itself is an Operations-plane **Startable action*** that writes effective-dated intent. Both the exploration (Planning plane) and the commit (Operations plane) are surfaced in the **Work** experience of a workspace — never in Studio. Iteration 2 contradicted the plane doctrine; **Iteration 3 restores it.** Studio was never in the plane model at all — it is the design-time face of the *Configuration* plane.

### 2.3 The nav that follows

```
Scheduling · Work        Overview · Planning · Roster · Attendance · Insights
Scheduling · Studio      Patterns · Rules · Rooms · Objectives      (config assets only — no plans)
```

But note the deeper point of §4: the **Planning** section is only the *proactive doorway*. The dominant expression of planning is **woven into every Work surface** as the way an operator *resolves* pressure — it is not a place you go.

---

## 3. The Planning Object — the operator manipulates *reality*, not plans

The most important discovery of this iteration. Ask what the operator is actually manipulating — operationally, not technically. The candidates were: Plans · Reality · Intent · Operational Futures · Proposed Reality · Operational Change · Commit Candidates.

**The operator manipulates reality — in a safe, proposed form.** *"Can I make Thursday work?"* is pushing on reality and watching what happens. They are not building a document called a plan; they are **holding operational reality in their hands and trying a change.**

So the mental model is:

- **The object is Reality** — pulled into a **proposed** state the operator can safely push on.
- **The unit of manipulation is an Operational Change** (place Ethan Thursday; float a teacher; move a room) — the *diff* between current and proposed reality.
- **What you commit is the change.** Committing makes the proposed reality the current reality.
- **A "Plan" is not the operator's object.** It is the technical *envelope* of accumulated changes — real and useful for versioning, approval, audit, and replay, but **not what the operator thinks they are building.** Plans are the *record of what was changed*, not the thing being manipulated.

This demotes "Plan" from first-class-in-the-operator's-mind (where Iterations 1–2 put it) to a **back-of-house artifact**. The operator's foreground is **reality → proposed reality → committed reality**.

> **One line:** *Operators don't make plans. They change reality — safely first, then for real. The "plan" is just the receipt.*

---

## 4. Planning is woven into Work, not a destination

The second discovery. Because pressure arises *while operating*, planning is primarily **a capability woven into Work**, not a mode or a workspace you navigate to. This mirrors the one existing Alloy layer with exactly this character: **BOS is *"a woven layer, present in queues, drawers, configuration, and planning — never a destination operators go to."*** Planning is the same shape.

Planning surfaces two ways in Work:

1. **Woven resolution (dominant).** At any point of operational pressure — a queue row (*"Thursday over ratio"*), a Focus Panel, a roster cell, a forecast alert — the operator can **Resolve**: fork reality → propose a change → simulate → compare → commit, *in place*. Planning is the **resolution verb** on operational attention. The operator never "goes to Planning"; Planning comes to the problem.
2. **Proactive planning surface (secondary).** A **Planning** Work View for deliberate forward work that isn't tied to a single alert — place the term's unplaced children, model the fall, work the placement backlog. Still Work, still on live reality, just not reactive.

So "is Planning just another Work View?" — **partly.** It has a Work-View face (the proactive doorway), but it is *more* than a view: it is a **woven capability** and a **commit runtime**. A Work View is where you *see* work; Planning is how you *change reality* from anywhere you see it.

---

## 5. The Operational Planning Runtime (refined)

Composed of **Reality + Change + Simulation + Commit** — not of *Plans*.

```
   Current Reality
        │   (operating)
        ▼
   Operational Pressure          a problem surfaces: an attention item, a forecast
        │                        breach, an event (enrollment, absence, sick call)
        ▼
   Propose Change                fork reality into a PROPOSED reality; write-free
        │                        (one change, or several — the operator pushes on reality)
        ▼
   Simulate                      project the proposed reality through the SAME registered
        │                        Calculations that compute the real one (occupancy, ratio,
        │                        labor, revenue). Simulation is how you SEE proposed reality.
        ▼
   Compare                       proposed vs current; or several proposed futures vs each other
        │                        (this is what "Optimization" is — multi-future simulation)
        ▼
   Decide                        the operator chooses. Never the system.
        ▼
   Commit                        proposed reality becomes current reality — effective-dated
        │                        supersede, atomic, reversible, provenance-stamped
        ▼
   Operational Reality → Execution (facts flow through the existing pipeline unchanged)
```

Answering the "is X first-class?" challenges directly:

| Question | Answer |
|----------|--------|
| Are **Plans** first-class? | **No.** *Reality* is. A Plan is the change-record (back-of-house). |
| Is **Simulation** first-class? | **Yes.** It is the lens through which the operator sees a proposed reality. |
| Is **Optimization** first-class? | **Yes as a capability**, but it is *multi-future Simulation + comparison* — not a separate engine. |
| Is **Studio** required? | **No** — not for planning. Studio is config authoring only. |
| Is Planning a **mode**? | **No** — a woven capability + a proactive surface, both inside Work. |
| Is Planning a **workspace**? | **No** — it lives *inside* every operational workspace. |
| Is Planning a **runtime**? | **Yes** — a thin runtime (propose · simulate · compare · commit over reality) woven into Work, with per-domain plugins. |
| Is Planning just another **Work View**? | **Partly** — it has a Work-View doorway, but it is a woven capability and a commit runtime, which a view is not. |

---

## 6. Lifecycle — of the change, not the document

Because the object is a *change to reality*, the lifecycle is the change/commit lifecycle (the ratified vocabulary), carried by the proposed-reality envelope:

```
proposed reality (draft) → shared (proposed) → examined (reviewed) → cleared (approved)
   → COMMIT → current reality (committed) → [superseded / reversed by a later change]
```

- **Before Commit:** disposable, consequence-free, write-free. The operator can push on reality freely.
- **Commit** is the one-way door: the proposed reality is written as effective-dated L2 Intent (supersede-not-patch), atomic, provenance-stamped.
- **After Commit:** the change is history. Rollback is a *new* change that supersedes — never a delete. The sequence of committed changes on a room/child is the auditable ledger and is **replayable**.
- **The Plan artifact** persists as the envelope of the change(s): its version, its approvals, its provenance. It exists for audit and replay, not for the operator's daily cognition.

---

## 7. The calendar is a visualization, not the product

The calendar / Room × Day board is **one visualization of operational reality**, not the thing being planned. The operator plans by making **operational changes**; Room × Day is how the *occupancy/ratio projection* is *shown*. So:

- **Room × Day remains the correct *projection/visualization grain* for Scheduling** — it is where occupancy, ratio, staffing, and consumption converge for display.
- **It is not the planning abstraction.** The planning abstraction is **operational change against reality**, which is domain-neutral. Staffing visualizes as Staff × Day, Capacity as Room × Term — different *visualizations*, same planning object.
- Demote the board: it is the **Roster** surface (a view of reality) that planning can be *invoked from*, not a "planning board" the workspace is built around.

---

## 8. The universal pattern (what unifies Planning and Studio without merging them)

Iteration 2's real insight survives, corrected. There is one universal pattern — **propose → project → cross a door into the live runtime** — and it has **two distinct instances that must not be merged**:

| Instance | Domain of change | Where | Project step | The door |
|----------|------------------|-------|--------------|----------|
| **Planning** | live operational **reality** | **Work** (woven) | **Simulate** | **Commit** |
| **Authoring** | reusable configuration **assets** | **Studio** | **Preview** | **Publish** |

They are *siblings*, not parent-child. Iteration 2 wrongly nested Planning under Studio because both share this pattern; the correction is that **sharing a pattern is not sharing a home.** Reality-change lives where reality is operated (Work); asset-authoring lives where assets are designed (Studio).

---

## 9. Cross-domain validation

The model is only platform if it holds everywhere. It does — see [`planning-cross-domain-validation.md`](./planning-cross-domain-validation.md) for the full table. Summary: in every operational domain, an operator hits **pressure while operating**, **proposes a change to that domain's live reality**, **simulates via that domain's registered Calculations**, **compares**, **decides**, and **commits** — all **in Work**, none in Studio. Staffing (*"two teachers sick"*) is the purest case and is self-evidently Work, not a design studio.

---

## 10. What this supersedes

- **[`studio-platform.md`](./studio-platform.md)** — its "Planning ⊂ Studio" placement is **withdrawn**. Its valid residue: Studio is the design-time environment for **configuration assets**, and Authoring (Publish) is the *sibling* of Planning (Commit) under the universal pattern (§8).
- **[`operational-planning-platform.md`](./operational-planning-platform.md)** and **[`scheduling-reference-implementation.md`](./scheduling-reference-implementation.md)** — the Work/Studio placement is corrected to "Planning in Work"; the plane thesis, primitives, and plugin model stand.
- **[`operational-plan-and-commit.md`](./operational-plan-and-commit.md)** — the Plan is re-cast from the operator's primary object to the back-of-house change-envelope; Commit and the change lifecycle stand.

The thesis that survives all three iterations: **Operational Planning is not a new truth-flow layer and not a new product; it is a thin, woven runtime that lets operators change reality safely — propose, simulate, compare, commit — from anywhere they feel operational pressure, on every operational domain.**

---

## Cross-references

- [`planning-cross-domain-validation.md`](./planning-cross-domain-validation.md) — the model across Attendance/Staffing/Commercial/Billing/Capacity/Forecasting/Resource/OI.
- [`architecture-validation.md`](./architecture-validation.md) — Iteration-2 critique cycle (now itself critiqued here).
- [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) — the plane model that puts planning-exploration + commit in Work.
- [`../modules/ai-platform.md`](../modules/ai-platform.md) — BOS as the woven-layer precedent Planning follows.
