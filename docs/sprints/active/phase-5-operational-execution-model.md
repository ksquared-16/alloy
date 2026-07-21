---
owner: engineering
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The Operational Execution Model

**A candidate constitution for how Alloy executes work.** Proposed for freeze. Once ratified, every future Alloy
product inherits this model unchanged.

**Sprint:** `alloy-phase-5-product-realization` · **Baseline:** `origin/staging @ 1217f5c93`
**Method:** discovery, grounded in code. Read-only. No redesign, no implementation. Enrollment is the proving
ground, never the destination — every clause is validated against non-childcare verticals in §7.

**Status note:** this document is `proposed`. It *describes* the model discovered in the running platform and
states it as constitution; **freezing it is a human act** (Kelly's), not a self-declaration. Where the running
code already obeys a clause, it is marked ✅ *realized*; where the clause is doctrine the code does not yet fully
honor, it is marked ◐ *pending realization* and pointed at the realization roadmap (companion doc
`phase-5-product-execution-model.md`).

---

## 1. The seven constitutional principles

Everything below is an expression of these seven. They are the frozen core.

1. **Execution is caused by Attention, expressed as Outcomes, realized as Consequences.** Nothing executes because
   of a clock, a route, or a render. The operator attends a subject, reports what happened, and the platform
   realizes the consequences. *(Runtime V1 constitutional decision: Attention is the only cause.)* ✅
2. **Configuration expresses the product; Platform executes it; the Vertical owns only its nouns and durable
   consequences.** These three tiers never trade jobs. ◐
3. **Configuration selects, places, and parameterizes capabilities — it never authors executable behavior.** New
   behavior is a platform act. This is what keeps configuration safe and the model industry-agnostic. ✅
4. **Movement is earned, never asserted.** A record advances only when an outcome references an *authored*
   transition. No raw destination, no status flip, moves a record. ◐ *(new path realized; legacy fallback pending)*
5. **The subject is carried, never inferred.** Every work item, action, and outcome names the subject it acts on.
   Execution never guesses grain. ◐ *(the one live correctness gap — the child-grain subject is dropped today)*
6. **Counts are settlement, never truth.** A number is a projection of rows; `count === rows.length` holds by
   construction, and a count never gates a commit. ◐
7. **One owner per responsibility.** A second owner of any responsibility is unconstitutional. ✅ *(the Runtime
   kernel's governing rule)*

---

## Deliverable 1 — The Operational Execution Model

A configured Business Process becomes a living operational product by flowing one **subject** down one chain. Each
layer has exactly one owner and one job.

```
   BUSINESS PROCESS   the journey's shape            owns: tracks, stages, splits, views
        │             CONFIG expresses · PLATFORM validates
        ▼
   STAGE              a position in the journey      owns: grain, work, outcomes, rules, transitions
        │             CONFIG expresses · RUNTIME resolves
        ▼
   CURRENT WORK       the work that exists here       owns: "what to do next, for whom"
        │             RUNTIME projects CONFIG's templates against the live subject
        ▼
   ACTIONS            the capabilities to advance it   owns: PLATFORM (behavior) · CONFIG (selection/placement)
        │             operator issues a COMMAND → ACTION RESULT
        ▼
   OUTCOMES           what the operator declares       owns: CONFIG authors the set · OPERATOR chooses one
        │             a business judgment, not a side effect
        ▼
   OUTCOME RULES      what a declared outcome causes    owns: CONFIG maps outcome → targets · RUNTIME executes
        ▼
   STAGE TRANSITION   earned, authored movement         owns: CONFIG authors the graph · RUNTIME walks it
        ▼
   QUEUE MEMBERSHIP   which population the subject joins owns: RUNTIME, by persisted effective stage
        ▼
   WORK VIEWS         the operator's perspective        owns: CONFIG authors the lens over membership
        ▼
   FOCUS PANEL        the committed execution surface    owns: RUNTIME commits CONFIG's published composition
        ▼
   OPERATIONAL        the durable facts the journey makes owns: PLATFORM pattern · VERTICAL materializes
   CONSEQUENCES
```

Per layer — **purpose · owner · responsibilities · runtime · configuration · operator experience**:

| Layer | Purpose | Owner | Runtime behavior | Configuration behavior | Operator experience |
|---|---|---|---|---|---|
| **Business Process** | define the journey's shape | Configuration (schema by Platform) | reads structure; never invents it | authors tracks, stages, splits, views | "this is how my business runs" |
| **Stage** | a position that owns its work and exits | Configuration | resolves the operating plan | authors grain, work templates, outcomes, rules, transitions | mostly invisible — felt as "where this record is" |
| **Current Work** | the work that exists here, for this subject | Runtime (projection) over Config (templates) | projects one item per template against live tasks; designates a primary | authors the templates | "what should I do next, and for whom" |
| **Actions** | capabilities to advance the work | Platform (behavior) · Config (selection/placement) · Process-Actions (availability) | executes the platform capability | selects/places/parameterizes capabilities | "the buttons that let me act" |
| **Outcomes** | the operator's declaration of what happened | Config authors the set · Operator chooses | records the declaration | authors possible outcomes per work | "what happened?" — reporting reality |
| **Outcome Rules** | translate a declaration into consequences | Config authors · Runtime executes | fires targets (transition / event / consequence) | maps outcome → targets | invisible — felt as "the record moved" |
| **Stage Transition** | authored, earned movement | Config (graph) · Runtime (walk) | moves the subject along an authored edge | authors outgoing transitions | "it advanced because I reported X" |
| **Queue Membership** | which population a subject belongs to | Runtime, by effective stage | resolves membership, persisted | (derived from stage + subject) | invisible — felt as "it's in the right list now" |
| **Work Views** | a perspective over the work | Configuration | binds a lens to membership | authors predicate + sort + layout | "my saved view from one angle" |
| **Focus Panel** | the committed execution surface | Runtime (commit) · Config (composition) | commits the published composition with the surface | authors the composition | "I land ready to work, not watching it load" |
| **Operational Consequences** | the durable facts a completed journey makes | Platform (pattern) · Vertical (nouns) | materializes durable facts, emits events | (the process's terminal design) | "the enrolled child is now real — placed, scheduled, billable" |

---

## Deliverable 2 — Current Work Doctrine

**What Current Work is.** Current Work is the operator's answer to a single question: *"For the subject I am
attending, what should I do next — and how do I report what happened?"* It is the **active, stage-derived unit of
operational work, bound to a named subject, carrying its own affordances (actions) and its own vocabulary of
results (outcomes).**

**The problem it solves.** Without it, an operator *drives a state machine* — choosing destinations, flipping
statuses, knowing which lever advances which record. Current Work inverts that: the operator **narrates reality**
("I reached the family," "the tour is done," "they declined") and the platform moves the record. *The operator
reports; the system operates.* This inversion is the product's core promise, and Current Work is where it lives.

**What it must contain** (constitutional — vertical-independent):
1. **The subject, named.** Whom this work concerns, explicitly — never ambiguous, never "two field names for three
   subjects."
2. **The work item(s)**, one per configured template, with exactly one **primary**.
3. **The available actions** — the primary that leads, the helpful ones that support.
4. **The possible outcomes** — the authored vocabulary of what the operator may declare here.
5. **The current state and progress** — planned / open / completed, and what remains.
6. **The context (Frame)** — *why* this work looks the way it does.

**How it is generated.** Projected from the **current stage's work templates**, hydrated against the live work
records for the subject. Configuration owns *which* work exists; Runtime owns *the instances* and the projection.

**How it evolves.** Every recorded outcome may complete the item, spawn the next work, or advance the stage; every
Attention move recomposes it for the newly-attended subject. It is never edited directly — it is a **projection
that changes because reality was reported.**

**When it is complete, and what completion means.** A work item completes when the operator records an outcome
flagged `completes_work`. **Completion is a declaration, not a side effect** — it means *"the operator has reported
the required reality of this work,"* not *"an action succeeded."* Completing the work may or may not advance the
stage; those are separate (an outcome rule decides). This distinction is constitutional: *you can complete work by
saying what happened even if you performed no action, and you can perform an action without completing the work.*

**What belongs inside vs outside:**
- **Inside:** the checklist, the primary action, the helpful actions, and outcome recording — the affordances to
  *do* the work and *declare* its result.
- **Outside:** stage movement (transitions are *offered* adjacent to the work, they are not the work); record-wide
  status editors; the detailed record drawer. These are reachable *from* Current Work but are not *of* it. The
  process instance is **never** operator-facing.

**How the operator should experience it.** As the one place that always knows what to do next, for whom, and lets
them say what happened — a surface that **advances by narration**, never a machine to be driven.

---

## Deliverable 3 — Action and Outcome Doctrine

### The canonical Action model

Seven concepts, one direction of authority. **Behavior flows down from Platform; expression flows up from
Configuration; they meet at a reference, never at an invention.**

| Concept | What it is | Owner |
|---|---|---|
| **Platform Capability** | an executable behavior with a bound **executor** (e.g. `admin_execute{definitionKey}`, `relationship_execute{relationshipKey}`) + required context | **Platform** (code) |
| **Configured Action** | a *reference* to a capability, parameterized, made available for a process | **Configuration** |
| **Action Placement** | where a configured action surfaces (work item primary/helpful, record header, rail) | **Configuration** |
| **Operator Command** | the operator invoking a placed action on a subject | **Operator** |
| **Action Result** | whether that invocation technically succeeded | **Runtime** |
| **Outcome** | the operator's declaration of the business result (see below) | **Operator**, from Config's set |
| **Business Process** | the journey that selects which capabilities live where | **Configuration** |

**The constitutional guarantee — configuration cannot invent behavior.** A configured action's `executor` is a
value in a **closed platform union** (`VERIFIED`: `CanonicalActionExecutor`). Configuration chooses a capability by
key, parameterizes it, and places it. It **cannot define a new executor**, because the executor set is code.
Therefore: *configuration expresses which capabilities a product uses and where; it can never author what a
capability does.* This is the single clause that makes actions both freely configurable and permanently safe.

**How actions stay industry-agnostic.** A capability is a **generic primitive parameterized by configuration**, not
a vertical verb. `send_form(template)`, `schedule_appointment(type)`, `create_record(shape)` are capabilities;
"schedule tour" and "send enrollment packet" are *configurations of them*. (Today the catalog is ~60% populated
with vertical-named capabilities — `schedule_tour` as a distinct key — which is realization debt, not a model
flaw: `send_form` and `quick_message` already prove the generic form.)

**Worked example — Tour (childcare) and Matter Intake (legal), same model:**

| | Childcare | Legal |
|---|---|---|
| Platform Capability | `schedule_appointment` (executor: create a booking) | `schedule_appointment` (same) |
| Configured Action | "Schedule Tour" (type=tour) | "Schedule Consultation" (type=consult) |
| Placement | helpful action on the `contact` work item | helpful action on the `intake` work item |
| Operator Command | operator books the visit | paralegal books the consult |
| Action Result | booking created | booking created |
| Outcome (declared) | "Tour scheduled" | "Consult scheduled" |
| Rule → target | stay in stage, spawn reminder | stay in stage, spawn conflict-check |

The capability, the executor, the placement mechanism, and the outcome grammar are **identical**; only the
configured *names and parameters* differ. That is the test passing.

### What an Outcome is — the disambiguation this sprint demands

The mission asks whether an Outcome is an operator decision, an action result, a process transition, a business
event, or an operational consequence. **They are five distinct concepts in a causal chain, and "Outcome" is exactly
one of them:**

> **An Outcome is the operator's *declaration* of a business-meaningful result** — a judgment reported from an
> authored vocabulary. It is *not* the action's technical result, *not* the transition, *not* the event, *not* the
> consequence. It is the **cause** the operator supplies; the others are effects.

Precisely:

```
Operator Command ──► Action Result        (did the tool work?)          UPSTREAM of the outcome, independent
                                            e.g. "message sent"
        │
        ▼
     OUTCOME          the operator's declared business result           THE PIVOT — a human judgment
                      e.g. "Reached family" / "Left message"            chosen from config's authored set
        │
        ▼ (Outcome Rules map outcome → targets)
        ├──► Stage Transition          an authored move             DOWNSTREAM effect
        ├──► Business Event            an emitted fact              DOWNSTREAM effect
        └──► Operational Consequence   a materialized durable fact  DOWNSTREAM effect
```

The independence is the point: the same action result ("message sent") can carry either outcome ("reached" or "left
message"), and the same outcome can be reached with or without an action. **The Outcome is where operator judgment
enters the machine** — the one place a human, not the system, decides what happened. Everything after it is
deterministic config-driven consequence; everything before it is tooling. This separation is what lets the operator
*narrate* rather than *operate*.

---

## Deliverable 4 — Grain and Work View Doctrine

### The canonical subject model

**A Business Process spans multiple subject grains through tracks.** A record enters at a **root grain** (the Case —
family / household / matter / patient / order) and may **fan into finer grains** at an authored **split** (child /
claim / party / line-item). Family, Child, Lead, Case, Household are not five parallel concepts — they are:
**Lead** = the entry state of a **Case**; **Case** = the root subject (= Household/Family in childcare); **Child** =
a finer subject the Case fans into at the decision split. The mechanism (`tracks` + `split_rules`) is generic; only
the *names* are vertical.

**The subject is carried, never inferred (Principle 5).** Every unit of execution — a work item, an action
invocation, an outcome recording — names the subject it acts on, at that subject's grain. The execution contract
carries an explicit **subject identity**, not merely "the case." This is constitutional because it is the only way
Current Work, Actions, and Outcomes execute correctly against a finer grain:

- **Current Work executes against grain:** a work item is bound to a subject; a child-grain work item names the
  child. *(Live gap: today the execution subject drops the finer-grain id, so finer-grain work cannot complete —
  the single most important realization item, `projectStageWorkRuntime.ts:156-164`.)*
- **Actions execute against grain:** a command names its subject before it runs; "which subject does this affect"
  is answered before execution, not after.
- **Outcomes execute against grain:** a declared outcome applies to the named subject; sibling subjects are
  unaffected.

**Grain is a property of the subject, not a parallel set of enums.** The running platform currently carries *three*
grain-like fields (Row Grain, Record-of-Attention, Journey Segment) that can and do diverge — this triplication is
realization debt, and the canonical model is **one carried subject identity whose grain and count-unit derive from
it.** (See Open Questions Q1.)

### The Work View doctrine

**A Work View is a perspective — a named lens over stage membership.** It is precisely **not** the other three
things it is often confused with:

- **not a Queue** — the queue is the physical population/lane; the Work View is the *question asked of it*;
- **not a Projection** — the projection is the single evaluator that produces rows/counts; the Work View is an
  *input* to it;
- **not a Composition** — composition is the Focus Panel's job; the Work View selects *which* subjects, not *how a
  subject is displayed*.

A Work View is **the operator's saved question** — predicate + sort + layout — over the subjects that stage
membership admits.

**How Work Views are created: hybrid.** The process template *generates* an initial set; operators *author* the
rest. Grain is *derived* from the stages a view scopes, not authored on the view. New views default to include-all
(a view is a lens, not a filter that silently narrows).

**Can one Work View contain multiple grains?** **Constitutionally, yes** — a question like *"All Leads"* is about
Cases regardless of how each later fans, and *"Everything needing my attention today"* spans grains by nature. A
Work View is a question, and questions are not grain-bound. The canonical model therefore requires **per-row grain
within a multi-grain view**, with counts that declare their unit.

*This is the sharpest gap between doctrine and code:* today the runtime assumes **exactly one grain per view/queue**
(`VERIFIED`) and tells the operator to split when grains differ. Config permits a predicate-only mixed view; the
runtime cannot yet aggregate different grains into one. Constitutionally the lens is multi-grain; realizing it is
roadmap work (companion doc, Wave 4). (See Open Questions Q2.)

**How operators should think about Work Views:** as *perspectives on their work*, not folders that contain it. A
record is not "in" a Work View; a Work View is one angle from which the operator looks at the records stage
membership already holds.

---

## Deliverable 4b — Focus Panel: the primary execution surface

The Focus Panel is where execution is *experienced*. It becomes the primary surface because it **commits atomically
with the operational surface** (Runtime V1) — the operator lands in a ready surface, not a loading machine.

- **Current Work appears** as the leading, committed summary — the first thing the operator sees is what to do next.
- **Actions appear** on the work item: the primary leads, helpful actions support; nothing the operator's process
  has disabled is offered.
- **Outcomes appear** as the completion affordance — the *"what happened?"* the operator answers to advance.
- **Context appears** as the Frame — *why am I here* — explicit enough that the panel's composition is legible.
- **Progression appears** as the recomposition that follows an outcome — the record moves, the queue updates, the
  next work surfaces, without a reload or a second reconciling action.

The Focus Panel is the operator's whole operational world for the attended subject: understand (Summary), act
(Work), and see history (Activity), re-led by the Frame — one universal panel, never a second composition product.

---

## Deliverable 5 — Configuration Boundary (the ownership map)

Every responsibility has exactly one owner. **Configuration expresses the product; Platform executes it.**

| Responsibility | Platform | Runtime | Configuration | Business Process | Vertical Package |
|---|---|---|---|---|---|
| The execution *pattern* (this document) | **owns** | — | — | — | — |
| The kernel lifecycle (Attention→Provisioning→Commit→Settlement) | **owns** | executes | — | — | — |
| The capability catalog + executors | **owns** | executes | *selects* | — | — |
| The outcome target-kind **grammar** | **owns** | executes | *composes* | — | — |
| Membership by persisted effective stage | **owns** | **executes** | — | (declares stage) | — |
| Count↔row parity; count-is-settlement | **owns** | **enforces** | — | — | — |
| The specific journey (stages, splits, tracks) | schema | reads | **owns (expresses)** | **is** | — |
| Work templates, actions selected, outcomes, rules, transitions | schema | resolves/executes | **owns (expresses)** | carries | — |
| Work Views (predicate+sort+layout) | schema | evaluates | **owns (expresses)** | carries | — |
| Published Focus Panel composition | schema | commits | **owns (expresses)** | carries | — |
| The domain's **nouns** (child, room, agreement, matter, claim) | — | — | — | — | **owns** |
| The domain's **durable consequences** (materialized facts) | pattern | invokes via subscription | — | terminal design | **owns** |

**The one line:** *Platform owns the pattern and the capabilities; Configuration expresses the product using them;
Runtime executes; the Vertical owns only its nouns and the durable facts a completed journey produces.* A
responsibility that appears in two columns is a constitutional defect. (Today three do — the grain vocabulary,
two outcome target-kinds, and the materialization import sit in the Platform column but carry Vertical meaning;
that is the realization debt, catalogued in the companion doc.)

---

## Deliverable 6 — Open Questions (surfaced, not resolved)

These are genuine uncertainties the model does not settle. They drive the next Product Architecture sprint.

- **Q1 · Is Journey Segment a real third axis, or should it collapse into subject grain?** The running platform
  carries three grain-like fields that diverge in the seed (`enrolling`: row-grain `child`, journey_segment
  `family`). Is "who the work is performed with" a distinct constitutional axis from "what the row represents," or
  an artifact to be unified into one carried subject identity? *The whole grain doctrine's cleanliness turns on this.*
- **Q2 · What is the canonical count model for a multi-grain Work View?** If "All Leads" spans grains, what does its
  count *count* — root subjects, or leaf subjects, or both, declared? How does `count === rows.length` hold when
  rows are heterogeneous? Multi-grain aggregation cannot be built until this is answered.
- **Q3 · Is "materialize durable facts" the only kind of Operational Consequence?** Offer, acceptance, and agreement
  (and their family-facing sends and signatures) don't fit "materialize on terminal outcome." Are they Consequences
  of a second kind, a distinct **external-party execution mode**, or Actions with special results? *The offer/accept
  gap in the journey report is really this question.*
- **Q4 · Do Queue Lanes survive the freeze, or dissolve into Work Views over membership?** Today lanes are the live
  single-grain binding beneath every Work View (`compat_queue_key`); the "lanes disappear" verdict is `proposed`.
  The execution model works either way — but "one owner per responsibility" wants a decision.
- **Q5 · How far may configuration parameterize a capability before it is "inventing behavior"?** `send_form(template)`
  is clearly configuration; a capability whose parameters include a branching rule set is arguably behavior. Where
  is the line, constitutionally? *This bounds how expressive configuration may safely become.*
- **Q6 · How does downward-only Attention compose across grains within one Work View?** If a view shows Cases and
  their child subjects together, and Attention is downward-only, what is the attention scope of a mixed-grain row —
  and can an operator attend a child directly from a Case-grain view without violating the scope rule?
- **Q7 · What owns the reconciliation of legitimately-different numbers across a screen?** Number provenance (source
  class, cohort, window) is a constitutional requirement of "count-is-settlement," but *which layer* carries the
  provenance descriptor — the projection, the Work View, or a new count-authority — is unsettled.

---

## 7. Industry Test — the model with Enrollment removed

Replace Enrollment with each vertical. The layers, owners, and chain are unchanged; only Configuration and the
Vertical Package differ. Where a clause would break, the vertical assumption is named (not solved).

| Layer | Healthcare (patient onboarding) | Legal (matter lifecycle) | Manufacturing (work order) | Professional Services (engagement) | Government (permit/licensing) |
|---|---|---|---|---|---|
| Business Process | intake → eligibility → care plan | intake → conflict → engagement → matter | order → plan → build → QA → ship | lead → proposal → SOW → delivery | application → review → inspection → issue |
| Root subject (Case) | patient episode | matter | work order | engagement | application |
| Finer grain (split) | per-condition / per-claim | per-party / per-claim | per-line-item / per-lot | per-deliverable | per-inspection / per-parcel |
| Current Work | "what to do next for this patient" | "…for this matter" | "…for this order" | "…for this engagement" | "…for this application" |
| Actions (capabilities) | `schedule_appointment`, `send_form`, `request_records` | `schedule_appointment`, `send_document`, `run_conflict_check` | `assign_station`, `record_measurement` | `send_proposal`, `log_time` | `schedule_inspection`, `issue_notice` |
| Outcome (declared) | "eligibility confirmed" | "engagement signed" | "QA passed" | "SOW accepted" | "inspection passed" |
| Transition / Consequence | care plan activated | matter opened; billing agreement | order released to floor | project opened | permit issued (durable fact) |
| **Verdict** | ✅ | ✅ | ✅ | ✅ | ✅ |

**The model survives every vertical.** No layer, owner, or principle needs to change — the chain, the capability/
configured-action separation, the outcome-as-declaration, the carried subject, the perspective-based Work View, and
the materialize-durable-facts consequence pattern all hold. **The only things that change are configuration and the
vertical package's nouns** — which is exactly what the constitution requires.

**The assumptions that would break it are already inventoried** (companion doc §Industry-agnostic test): closed
grain enums in platform types, two grain-named outcome kinds, the dropped finer-grain subject, and the
vertical-named capability catalog. Every one is *vocabulary or contract in the wrong tier* — none is a flaw in the
model. Pulling them down into Configuration and the Vertical Package is realization, not redesign.

---

**Discovery complete. This is the execution model proposed for freeze. No implementation begun. Awaiting review.**
