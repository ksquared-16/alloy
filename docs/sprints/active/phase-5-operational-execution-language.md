---
owner: engineering
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The Operational Execution Language

**The canonical language of execution — proposed for freeze.** Not more architecture: *conceptual precision.* Once
ratified, every future Alloy product inherits this vocabulary and these relationships unchanged.

**Sprint:** `alloy-phase-5-product-realization` · **Baseline:** `origin/staging @ 1217f5c93`
**Method:** conceptual synthesis over the discovered execution model, **aligned to the repository's existing
canonical glossary** (`docs/platform/governance/glossary.md`, `docs/product/reviews/lifecycle-of-record-of-attention.md`)
so this *refines* the established vocabulary rather than reinventing it. Read-only. No implementation.

**Alignment note.** Several terms are already canonical and are adopted verbatim: **Business Process**, **Stage**,
**Subject** (= Record of Attention), **Readiness** ("operational fitness for a transition"), **Context Frame /
Mission** (*why*), **Queue** ("preview list for a stage lens — not an authoritative store"). This document adopts
them and sharpens the concepts the sprint asks about — Outcome, Consequence, the four faces of Action, Attention as
cause, and the chain itself. One disambiguation the glossary already draws and this document keeps: **Current Work**
(record-scoped stage progression) is *not* **Work Items** (the cross-record execution platform).

---

## 0. The core question: when an operator performs work, what is actually happening?

In product concepts, one sentence:

> **An operator *attends* a Subject; the platform *commits* an operational surface for it; the Subject's current
> *Stage* presents its *Current Work*; the operator *commands* Capabilities as needed and *declares an Outcome*; the
> declared Outcome, through authored rules, produces *Consequences* — the Subject *transitions*, facts *materialize*,
> membership and views *recompose* — and the operator's *Attention* moves on.**

Two sentences carry the whole language, and they are the crown of it:

> **Attention is the only cause of the surface. Outcome is the only cause of operational change.**

Nothing the operator sees exists without Attention. Nothing about the business changes without an Outcome. Between
them, Actions are tooling; after them, Consequences are effects. Every concept below is a precise name for one part
of that sentence.

---

## Deliverable 1 — Canonical Operational Vocabulary

Each concept: **definition · purpose · owner · lifecycle · relationships · operator experience · runtime
responsibility · configuration responsibility.**

### Business Process
- **Definition:** the authored, operator-facing configurable **journey** a kind of work follows.
- **Purpose:** to express *how this business runs* as configuration, not code.
- **Owner:** Configuration (schema by Platform).
- **Lifecycle:** authored → published → versioned; never executed directly.
- **Relationships:** *contains* Stages; *spans* Subject grains via tracks; *is consumed by* the Runtime.
- **Operator experience:** mostly invisible; felt as "the way my work is organized."
- **Runtime:** reads structure; never invents it.
- **Configuration:** authors tracks, Stages, splits, Work Views.
- **Owns / does not own:** owns the *shape of the journey* and *which capabilities live where*. **Does not own**
  behavior (Platform), movement mechanics (Runtime), the Subject's truth (the record), or the durable consequences
  (the Vertical).

### Stage
- **Definition:** a **governed position** in the journey — simultaneously a *membership position* (which population
  the Subject belongs to) and a *governance boundary* (what work, what outcomes, and what exits are legitimate here).
- **Is it a state, an execution context, or a governance boundary?** **It is a governance boundary that defines an
  execution context — and it is not a state.** The Subject's *state* is its status; the Stage is the *context that
  governs the Subject* while it occupies that position. Refines the glossary ("step = membership + expected work")
  by naming the governance dimension: a Stage owns not just *what work* but *what is permitted*.
- **Owner:** Configuration.
- **Lifecycle:** authored as part of a Business Process; a Subject *enters*, *holds*, and *exits* it.
- **Relationships:** *belongs to* a Business Process; *owns* grain, Current Work templates, legitimate Outcomes,
  Outcome rules, and authored Transitions; *projects into* Queue Membership.
- **Operator experience:** the primary lens — "where this record is, and what it needs here."
- **Runtime:** resolves the Stage's operating plan; enforces its governance (only its outcomes, only its exits).
- **Configuration:** authors the plan.

### Current Work  *(the centerpiece)*
- **Definition:** the active **operational obligation** the current Stage places on the operator **for the attended
  Subject** — the required work, its affordances (Actions), and its vocabulary of results (Outcomes).
- **Is it a task, a contract, a mission, or an execution plan?** **It is a contract, not a task.** A *task* is an
  instance/record; a *mission* is the Frame (the *why*); an *execution plan* is static. Current Work is the **Stage's
  discharge-able contract with the operator for one Subject**: it states what must be done and the terms
  (outcomes) by which it is discharged. It is generated, held open, and *discharged* — the language of a contract,
  not a checklist item.
- **Purpose:** to let the operator **narrate reality** instead of driving a state machine. *The operator reports;
  the system operates.*
- **Owner:** Runtime owns the projection; Configuration owns *which* work (the Stage's templates); it **belongs to
  Attention** (it exists for the attended Subject).
- **Lifecycle:** *generated* (projected from Stage templates against the live Subject) → *open* → *discharged* (by a
  declared Outcome) → possibly *re-issued* (next work spawned).
- **Relationships** (the ones the sprint asks for):
  - *with Actions* — Current Work **offers** Actions as the means to do the work; Actions serve it, they are not it.
  - *with Outcomes* — Current Work is **discharged by** an Outcome; the Outcome is the terms of completion.
  - *with Progress* — Current Work is **where** progress is made, but does not itself advance it (the Outcome does).
  - *with Completion* — **completion is the discharge of the contract by a declared Outcome** — a declaration, not
    an action side effect.
  - *with Attention* — Current Work **belongs to** Attention; it recomposes when Attention moves.
  - *with Readiness* — Readiness is a **precondition** on the Subject; Current Work may be *offered* while *not ready*
    (blocked), and Readiness names what is missing to discharge it.
- **Operator experience:** the one place that always says *what to do next, for whom, and how to report what happened.*
- **Runtime:** projects it; recomposes on Outcome and on Attention movement.
- **Configuration:** authors the Stage's work templates and their outcome vocabulary.

### Action — four distinct concepts, one ambiguous word
The word "Action" names four different things. The language must keep them apart.

| Concept | Definition | Owner |
|---|---|---|
| **Capability** | an executable *behavior* with a bound platform executor + required context | **Platform** (code) |
| **Configured Action** | a *reference* to a Capability — parameterized and placed for a Business Process | **Configuration** |
| **Operator Command** | the operator *invoking* a Configured Action on a Subject | **Operator** |
| **Action Result** | whether that invocation *technically succeeded* | **Runtime** |

- **Are they distinct?** **Yes — irreducibly.** A Capability is *what can be done* (platform); a Configured Action
  is *what this product chose to offer, and where* (configuration); a Command is *the operator doing it*; a Result
  is *whether the tool worked.* Collapsing any two is the category error that lets "configuration invent behavior."
- **The constitutional guarantee:** a Configured Action's executor is a value in a **closed platform union**;
  configuration *selects and parameterizes* a Capability but can never *author* one. Behavior is a Platform act.
- **Lifecycle:** Capability defined (platform) → selected/placed (config) → commanded (operator) → result (runtime).
- **Operator experience:** "the buttons that let me act" — the primary that leads, the helpful ones that support.

### Outcome
- **Definition:** the operator's **declaration of a business-meaningful result**, chosen from an authored vocabulary.
- **Is it judgment, declaration, process result, action completion, or transition trigger?** **It is exactly two of
  those, unified — operator *judgment* expressed as a business *declaration* — and none of the other three.** It is
  *not* the process result, *not* action completion, *not* a transition trigger: those are **Consequences the
  Outcome causes.** The Outcome is the **cause the operator supplies**; the rest are effects.
- **Why this precision matters:** the same Action Result ("message sent") can carry different Outcomes ("reached" vs
  "left message"), and an Outcome can be declared with no Action at all. **The Outcome is the one point where human
  judgment enters the machine.** Everything before it is tooling; everything after is deterministic consequence.
- **Owner:** Configuration authors the *possible* Outcomes; the **Operator** chooses the actual one.
- **Lifecycle:** authored (as a vocabulary) → declared (once, by the operator) → drives rules.
- **Operator experience:** *"what happened?"* — reporting reality.

### Consequence
- **Definition:** an **effect an Outcome causes** through authored rules — a Stage Transition, an emitted Business
  Event, a materialized Durable Fact, spawned next work, or an offered Attention move.
- **How it differs from Outcome:** the Outcome is the **declared cause** (a human judgment); the Consequence is the
  **realized effect** (a platform act). Outcome is upstream and singular; Consequences are downstream and plural.
- **What belongs:** stage movement, business events, materialized operational facts, spawned work, needs-attention
  overlays. **What does not:** the operator's declaration itself (that is the Outcome), and the Action Result (that
  is tooling, upstream of the Outcome).
- **Owner:** Configuration authors the *rules* (outcome → targets); Runtime *executes* them; the Vertical *owns* the
  durable-fact kind of consequence (materialization).
- **Operator experience:** invisible as a step; felt as "the record moved / the enrollment is now real."

### Attention
- **Definition:** the operator's **focus on a Subject** — the Record of Attention (glossary). In the Runtime it is
  the **kernel's only cause**.
- **Does Attention create execution, or merely focus?** **Both, but of *different things* — and this is the
  language's sharpest distinction.** Attention is the **only cause of the surface**: it commits the operational
  surface, provisions the Subject's Current Work, composes the Focus Panel. It is **not** a cause of operational
  *change*: attending a Subject changes *what the operator sees and can act on*, never *what is operationally true.*
  So — **Attention causes execution's *conditions* (the surface); Outcome causes execution's *effects* (the truth).**
- **Owner:** Runtime (K1 Attention).
- **Lifecycle:** the operator attends → the surface commits → Current Work belongs to that Attention → attention
  moves (downward-only) → the surface recomposes.
- **Operator experience:** "who I am working on right now"; movement feels like *attention*, not *loading*.

### Readiness
- **Definition (adopted from glossary):** a **Subject's operational fitness for a transition** — evaluated as a
  pre-move gate and to refresh Needs Attention afterward.
- **How it differs from the neighbors:**
  - *from Current Work* — Current Work is the *obligation*; Readiness is a *property of the Subject* (can this be
    discharged; what is missing). Work may be offered while not ready.
  - *from Stage* — the Stage is the *position*; Readiness is *orthogonal* to it — a Subject can be at a Stage and not
    ready to leave it.
  - *from Outcome* — an Outcome is a *declared result*; Readiness is a *precondition*, never a result.
- **Owner:** Runtime evaluates; Configuration authors the requirements/gates (Process Gates).
- **Operator experience:** *"Blocked — needs X"* — the honest statement of what stands between the Subject and its
  next move.

### Progress
- **Definition:** the **Subject's advance through the authored journey** — its position in the Business Process plus
  the discharge state of its Current Work.
- **What advances it?** **Outcomes advance progress — nothing else.** Not Actions (tooling), not Consequences
  (effects), not time. Actions *enable* the work; the Outcome *discharges* it and *earns* the movement; the
  Consequence *is* the movement. So the operator advances the business by **declaring what happened**, which is the
  product's whole thesis restated as a measure.
- **Owner:** the Business Process *defines the measure* (the Stages); the Outcome *advances it*; Runtime *records* it.
- **Operator experience:** "we're further along because I reported X."

### (Supporting, adopted) Subject · Frame/Mission · Queue · Work View · Focus Panel · Durable Fact
- **Subject** — who/what the operator is working on (Record of Attention); carried explicitly through execution.
- **Context Frame / Mission** — *why* the operator is here; decides what leads; **offered, never self-changing.**
- **Queue** — the preview list for a Stage lens; a *view of* membership, not a store.
- **Work View** — a **perspective**: a named lens (predicate + sort + layout) over Stage membership; not a queue,
  not the projection, not a composition.
- **Focus Panel** — the committed **execution surface** for the attended Subject; where Current Work, Actions,
  Outcomes, context (Frame), and progression are experienced as one.
- **Durable Fact** — the operational truth a completed journey materializes (agreement / placement / permit / matter);
  owned by the Vertical; consumed downstream (attendance, billing) — never the process instance.

---

## Deliverable 2 — Operational Execution Language (the constitutional relationships)

The concepts relate by **six laws**. These are the grammar.

1. **Attention scopes; it does not mutate.** Attention selects the Subject and commits its surface. It never changes
   operational truth. *(Cause of the surface, not of the truth.)*
2. **A Stage governs; it does not act.** A Stage defines what work exists, what outcomes are legitimate, and what
   exits are authored. It permits; it never performs.
3. **Current Work belongs to a Subject and is discharged by an Outcome.** It is offered by the Stage, bound to the
   attended Subject, and completed only by a declaration — never by an action's success.
4. **A Capability is invoked by a Command and answered by a Result; the Result is not the Outcome.** Tooling and
   judgment are separate. Configuration may choose *which* capabilities, never *what* they do.
5. **An Outcome is declared once and causes Consequences through authored rules.** The operator supplies the cause;
   the platform realizes the effects (transition, event, materialization). Judgment in, consequences out.
6. **Movement is earned and authored; membership and views are derived.** A Subject advances only by an Outcome that
   references an authored Transition; Queue Membership follows from the resulting Stage; Work Views are perspectives
   over that membership. Nothing downstream is a second author of position.

**The two causes, stated as law:** *Attention is the sole cause of what the operator sees; Outcome is the sole cause
of what becomes true.* Every other concept is either an input to one of these (Capability, Command, Readiness) or a
consequence of one of them (Surface, Transition, Membership, Work View, Durable Fact).

---

## Deliverable 3 — The Refined Execution Chain

The previously-assumed chain was **linear** (`Business Process → Stage → Current Work → … → Consequences`). That is
wrong in one structural way: it flattens two different things — a **containment hierarchy** (what holds what) and an
**execution cycle** (what causes what). The correct model is a **hierarchy that a cycle runs inside.**

**The containment hierarchy** (authoring/structure — top owns bottom):
```
Business Process  ⊃  Stage  ⊃  Current Work  ⊃  { Actions, Outcomes }
```

**The execution cycle** (runtime/causation — a loop, opened by Attention, pivoted by Outcome):
```
        ┌──────────────────────────── Attention (selects Subject) ◄─────────────────┐
        ▼                                                                            │
   Surface commits ──► Current Work presented ──► Operator Command ──► Action Result │
        (for the Subject's current Stage)                │                           │
                                                         ▼                           │
                                             ══► OUTCOME declared ══  (the pivot)     │
                                                         │                           │
                                                         ▼                           │
                                    Consequences realized via authored rules:        │
                                    Transition · Event · Durable Fact · Next Work     │
                                                         │                           │
                                                         ▼                           │
                                    Membership recomposes ──► Work Views recompose ──┘
```

- **Attention opens the loop** (the only cause of the surface).
- **Outcome is the pivot** (the only cause of change) — everything left of it is tooling, everything right is
  consequence.
- **The loop closes** by recomposing membership and views, returning the operator to Attention on the next Subject.
- **Readiness** is a gate *across* the Command→Outcome span (fitness to discharge). **Progress** is the *measure of
  the loop's advance* through the hierarchy. **The Frame** is the *why* that leads each turn of the loop. These three
  are cross-cutting — which is precisely why the old linear chain could not place them.

**So the constitutional chain Alloy should inherit is:** a **Business Process ⊃ Stage ⊃ Current Work** hierarchy,
executed by an **Attention → Current Work → Command/Result → Outcome → Consequence → recompose → Attention** cycle,
with Readiness gating, Progress measuring, and the Frame leading.

---

## Deliverable — Evaluation of the prior Operational Execution Model

Per the mandate: evaluate, do not change.

| Concept / element from the prior model | Verdict | Reason |
|---|---|---|
| The seven principles | **Remain** | They are the frozen core; this language is their vocabulary. |
| Capability / Configured Action separation | **Remain** | Constitutionally exact and industry-proven. |
| Outcome as declaration | **Remain, refined** | Correct; sharpened here as "operator judgment *as* business declaration," distinct from Result and Consequence. |
| Subject carried, not inferred | **Remain** | The load-bearing correctness law. |
| The **linear chain** | **Refine** | Split into containment hierarchy + execution cycle (Deliverable 3). It was not wrong in content, only in shape. |
| "Action" as one layer | **Split** | Into Capability / Configured Action / Operator Command / Action Result — four concepts, one word. |
| The three grain fields (Row Grain / Record-of-Attention / Journey Segment) | **Merge (candidate)** | Toward one carried Subject with derived count-unit; *Journey Segment* is the rename/merge candidate (Open Q). |
| "Outcome Rules" | **Rename (candidate)** | To **Consequence Rules** — they author consequences, not outcomes. (Naming only; behavior unchanged.) |
| "Operator decision" + "business declaration" (as separate ideas) | **Merge** | They are one concept: the Outcome. |
| "Queue Lane" vs "Work View" | **Refine / decide** | Work View = perspective; Queue = membership preview. Whether Lanes survive as a distinct noun is an Open Q. |
| Attention as "the only cause" | **Refine** | True *of the surface*; not of operational change. The language now states **two causes**. |

Nothing above is changed here — this is the evaluation the next sprint acts on.

---

## Deliverable 4 — Open Questions (concepts still needing a Product decision)

Only concepts that remain genuinely unsettled. Do not solve.

- **OQ1 · Is Journey Segment a distinct concept, or a facet of Subject grain?** The vocabulary carries three
  grain-like ideas that diverge in practice. Are there truly two axes (what a row *represents* vs whom work is
  *performed with*), or one carried Subject? *The cleanliness of the Grain vocabulary depends on this.*
- **OQ2 · Is "Outcome Rules" or "Consequence Rules" the canonical name?** A naming decision with doctrine weight:
  the concept authors *consequences*, but the trigger is the *outcome*. Which noun leads?
- **OQ3 · Does "Queue Lane" survive as a concept, or dissolve into "Work View over Membership"?** One-owner-per-
  responsibility wants a ruling; the language works either way.
- **OQ4 · Is there a concept above "Consequence" for *external-party* effects?** Offer, acceptance, and signature
  (a family/patient/client acting, not the operator) do not fit "materialize on terminal outcome." Are these a
  second *kind* of Consequence, or a distinct concept ("External Commitment")? *The journey's offer/accept gap is
  this question in disguise.*
- **OQ5 · Is "Readiness" one concept or two?** The glossary defines it as fitness-*for-a-transition* (a gate). But
  the operator also experiences readiness as *"is this work actionable at all."* Are pre-transition gating and
  work-actionability the same concept, or siblings?
- **OQ6 · Does "Progress" need a first-class noun, or is it always derived?** Today progress is *derived* (position
  + discharge state). Should Alloy name a Progress concept operators can reason about directly, or must it always be
  a projection of Stage + Current Work?
- **OQ7 · What is the canonical name for the operator's whole act?** The language describes *attend → command →
  declare → recompose*. Does that loop deserve a single named concept ("an Operation"? "a Turn"?) that operators and
  configuration can both refer to — or is naming the loop itself an over-reach?

---

**Discovery complete. This is the language of execution, proposed for freeze. No implementation begun. Awaiting
review — the goal is to freeze this vocabulary before Engineering begins realizing it.**
