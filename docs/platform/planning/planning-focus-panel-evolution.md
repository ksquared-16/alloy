---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Planning Focus Panel evolution & cross-workspace experience

**Status:** Proposed — companion to [`operational-planning-platform.md`](./operational-planning-platform.md). Defines how the Focus Panel evolves for planning, and the reusable cross-workspace planning behavior.

---

## 1. The evolution: every operational workspace gains a planning card

The Focus Panel is *"one Focus Panel, composed differently for different operational subjects"* ([`focus-panel-architecture-vocabulary.md`](../operator/focus-panel-architecture-vocabulary.md)). Its cards are typed by **archetype** (action/status/summary/profile/collection/metric/timeline/launcher), placed by **published composition**, and each card owns exactly one operational question (`web/lib/adminV2/runtime/focusPanel/focusPanelCardModel.ts`).

**Discovery: Planning adds one new reusable card archetype-instance — the *planning card* — to the platform card library, and every operational workspace can host it.** It is the Focus Panel's answer to "what should we commit about this subject?"

### 1.1 The planning card follows the `billing_preview` template

There is already a **read-only preview card** in the library: `billing_preview` (Status/Context archetype, evidence under `focusPanel/billingPreview/`). It is the exact template a planning card follows — a card that projects consequences without writing. The planning card is `billing_preview`'s generalization: *any* projected planning state, not just billing.

The library even has a reserved slot for this: the in-editor catalog carries a `KPI / Metric` placeholder with `cardKey: null` — *"Bind an Operational Intelligence metric — next phase"* (`focusPanelCardCatalog.ts`). The planning card is that next phase for projected planning state.

### 1.2 What the Scheduling planning card answers

A `planning` card on a **child** subject (in the Enrollment/Scheduling Focus Panel):

| Card slot | Content |
|-----------|---------|
| **Title (question)** | "What is this child's plan?" |
| **Insight (meaning-first line)** | "Scheduled Room B · Mon–Thu · within ratio · $980/mo" |
| **Status chip** | `Planned` / `Needs plan` / `Conflict` (tone: pine / gold / ember) |
| **Body (payload)** | room · pattern · projected occupancy/ratio impact · commercial · risks |
| **Primary action** | "Open planning board" / "Optimize placement" / "Commit plan" |
| **Next actions** | resolve enrollment gap · adjust days · compare options |

On a **room** subject, the same archetype answers "What is this room's plan for the week?" — projected fill, ratio cliffs, pending commits. Grain-parameterized, one card type — the same discipline as every other platform card (*"one composition engine… added as primitives, not screens"*, per the operational-expansion audit).

### 1.3 Read-only first, write-capable next

Per the frozen focus-panel direction and the "edit substrate" gap noted in the runtime review, the planning card ships **read-only first** (project + link to the board), then becomes **write-capable** (draft deltas, commit) once the Focus Panel edit substrate lands. This is the same maturation path `billing_preview` is on — *no fake saves* until the substrate is real.

---

## 2. Workspace ↔ Focus Panel symmetry

The relationship the sprint calls "Workspace ↔ Focus Panel symmetry" is expressed in Alloy as **same grammar, one level down** (`focus-panel-product-model.md`): the panel has Modes (Summary/Work/Activity), and a card inside Work carries its own Summary→Focus grammar.

**Planning inherits this symmetry exactly:**

| Level | Summary answers | Work answers |
|-------|-----------------|--------------|
| **Scheduling Workspace** | "What needs planning across the site?" (Overview) | "Plan the Room × Day board" (Planning Board) |
| **Planning card** (in a subject's Focus Panel) | "What is this subject's plan?" | "Optimize / adjust / commit this subject's plan" |

The workspace plans **across** subjects (site-wide board); the Focus Panel card plans **one** subject (this child, this room). Same loop (`propose→simulate→optimize→commit`), two altitudes. The card's "Open planning board" action zooms out to the workspace with the subject in context; the board's row zooms into the card — *zoom-in, not page-swap* (the frozen continuity law).

---

## 3. Cross-workspace planning (the reusable behavior)

Planning converges domains, so the operator must move between Planning, Enrollment, Attendance, Commercial, Billing, Staffing, and Intelligence **without losing the plan**. The discovery is a reusable behavior, not a Scheduling feature.

### 3.1 The decision ladder

When planning hits a cross-domain block (*"cannot schedule child → enrollment incomplete"*), resolve at the **lowest rung that keeps context**:

1. **Focus Panel card handoff** (cheapest) — the existing cross-card coordination model (`focusPanelCoordinationModel.ts`, `requestFocus` + depth/Back) hands off to the owning card *in the same panel*. "Enrollment incomplete" → focus the Enrollment card, resolve, return. **Default rung.**
2. **Embedded work surface** — for heavier resolution, the Focus Panel's Activity mode composes the owning workspace inline (`OpportunityFocusPanelEmbeddedWorkspace.tsx`) — resolve enrollment in an embedded surface, plan intact.
3. **Cross-workspace navigation** (most expensive) — only when the operator genuinely needs the other workspace's full surface; the plan is preserved as `proposed` and reattached on return. (Route-level cross-workspace nav from cards does not exist today — this is a named platform gap.)
4. **Create operational work** — if resolution can't happen now, the block becomes a work item (attention) routed to the right queue; the plan waits in `proposed`.
5. **Recommend optimization / launch BOS** — offer an option that avoids the block entirely (a room that needs no enrollment fix), or ask BOS to propose one.

### 3.2 The invariant

> **A Plan in `proposed` standing survives every cross-workspace excursion.** Planning never dead-ends into "go fix this elsewhere and start over." Context preservation is the platform's job, not the operator's.

This is the reusable **cross-workspace planning** primitive: a `proposed` Plan is a durable, portable context that any workspace can be entered from and returned to.

---

## 4. The universal Focus Panel evolution

Generalizing beyond Scheduling: **every operational workspace's Focus Panel gains a planning card for its domain** — an Attendance planning card ("what coverage does tomorrow need?"), a Staffing planning card ("who covers this gap?"), a Commercial planning card ("what does this rate change project?"). All are the same archetype, parameterized by grain and projection set — the Focus Panel's expression of the Planning Runtime.

This is the answer to *"Determine whether this becomes the universal Focus Panel evolution"*: **yes — the planning card is a new platform card type, not a Scheduling widget.**

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime.
- [`scheduling-reference-implementation.md`](./scheduling-reference-implementation.md) — the Scheduling workspace the card zooms to/from.
- [`../operator/focus-panel-card-library.md`](../operator/focus-panel-card-library.md) — the card contract the planning card fills out.
- [`../product/reviews/focus-panel-product-model.md`](../product/reviews/focus-panel-product-model.md) — Modes-not-layers, Context Frame, same-grammar-one-level-down.
