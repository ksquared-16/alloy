---
owner: product
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Operator Work Experience: Product Specification

**Mission:** `alloy-phase-5-product-realization` (slot 1) · **Baseline:** `origin/staging @ 2129149e9`
**Author's stance:** Product, not Engineering. This is the implementation-ready product specification for the Operator
Work experience. It describes **operator behavior**, not components or code. It composes the existing platform; it
invents nothing. Companion artifact: low-fidelity mockups (6 states) reusing the existing Focus Panel layout.

**Product Constitution (binding on this document):** Presentation Runtime, Focus Panel architecture, Business Process
Runtime, Current Work Runtime, Command Runtime, Household card, Children card, existing card system, and the existing
Action/Outcome runtimes are **authoritative and unchanged**. The Operator Work card is the **composition layer** that
brings them together. No new runtime, no new architectural concept, no duplicate work/readiness/status/command/action
model.

---

## Part 1 — Validate the Product Gaps (challenge, don't assume)

The assessment proposed five gaps (P1–P5). Product's job here is to reject anything that is merely unwritten code and
keep only what a *product decision* must resolve. Each is challenged below.

### G-A · The recomposition **contract** is undefined — RETAINED (workflow)
- *Assessment claim (P1):* "the card doesn't move when reality does."
- *Challenge:* "make it live" is already decided doctrine (Enrollment Report, done-condition 6) — so *that* half is an
  implementation artifact, not a product problem. But **what** recomposes, what stays stable, and what moves is **not**
  specified anywhere. That is a genuine product decision (Part 2 "Work completion" exists precisely to answer it).
- *Verdict:* **Genuine product problem.** The gap is not "wire it live" — it is "**define the recomposition contract.**"

### G-B · One scheduling intent is split across two surfaces — RETAINED (composition)
- *Assessment claim (P2):* tour booking (modal) and stage movement are separate clicks.
- *Challenge:* is the modal itself the problem? No — the modal is a fine *input surface*. The problem is that the
  operator forms one intent ("schedule this tour") and the product makes them reconcile two outcomes ("booked" vs. "did
  the work advance?"). That reconciliation is a composition decision, not a modal redesign.
- *Verdict:* **Genuine product problem (composition).** Product must decide how a referenced surface's result returns
  to Operator Work as one continuous intent.

### G-C · There is no visible Mission / Frame ("why am I here") — RETAINED (hierarchy)
- *Assessment claim (P3):* the panel drops the operator into cards with no stated Frame.
- *Challenge:* do the `attention` and `current_mission` models already cover this? They exist as *data*, but no product
  decision states what the Frame **says**, where it **sits**, or that it is **offered, never self-changing**. That is
  product hierarchy work.
- *Verdict:* **Genuine product problem (hierarchy).**

### G-D · Child-grain work coordination & naming — RETAINED, narrowed (composition)
- *Assessment claim (P4):* child-grain work forces a drop to the drawer; the child isn't always named.
- *Challenge:* split the claim. The "executor errors because the subject isn't carried at grain" half is a pure
  **implementation artifact** (G1/R1 — Engineering wiring, product already decided). **Drop it from the product gap
  list.** What remains is genuinely product: *when a family has multiple children at different stages, what work belongs
  to Operator Work vs. the Children card, and how is the child named at the point of action?* That is a composition
  decision (Part 2 "Multi-child family" exists to answer it).
- *Verdict:* **Genuine product problem (composition)** — narrowed to coordination + naming. Executor wiring excluded.

### P5 · "Five parallel command paths" — REJECTED as a product gap (implementation artifact)
- *Assessment claim (P5):* the same command behaves differently by entry point.
- *Challenge:* the operator does not perceive "five code paths" — they perceive *commands*. Convergence onto one
  execution path is an **Engineering** concern, not a product decision. The only product-true residue is a **principle**
  — "a command means the same thing wherever it is launched" — which is not a gap to solve but a constraint to state.
- *Verdict:* **Rejected as a gap.** Folded into the spec as the command-presentation principle (Part 3, Command
  execution). Convergence lands in Engineering recommendations.

### Final product gaps
1. **G-A** — the recomposition contract is undefined *(workflow)*.
2. **G-B** — one scheduling intent split across two surfaces *(composition)*.
3. **G-C** — no visible Mission / Frame *(hierarchy)*.
4. **G-D** — child-grain work coordination & naming *(composition)*.

Four genuine product problems. One proposed gap rejected as an implementation artifact; one narrowed.

---

## Part 2 — Walk the Operator Experience

Not a card design. A walk of the operator. Enrollment is the proving ground; the family is the **Rivera household**.

### 2.1 Family-level work

Maria (the operator) opens the Rivera record from her queue.

- **Why am I here.** Before any card, one line of Frame reads the reason: *"New inquiry — the Riveras asked about
  fall enrollment 2 days ago and no one has reached out."* This is the Mission: offered by the runtime from the current
  stage's attention, never something Maria sets. It answers "why" before she scans anything.
- **What requires attention.** The Operator Work card is the largest thing on the surface. It states the **one active
  obligation**: *"Contact the Rivera family."* Not a list of everything — the single thing the stage asks of her now,
  with its checklist ("introduce the program, offer a tour") beneath it.
- **What should happen next.** The card offers the affordance that discharges the work — a primary command **Contact
  Family** — and, quieter, the outcomes that will close it once she has ("Reached — booked tour", "Left message",
  "Wrong number"). She reads the path without planning it.
- **How she completes work.** She clicks **Contact Family**, the message sends through the one Command Runtime, and she
  declares the outcome ("Left message"). She is not driving a state machine; she is **reporting what happened**.
- **What changes immediately.** The work item settles in place with its declared outcome and a timestamp; because "left
  message = contact attempted, stays in stage" is authored config, the stage does **not** move — and the card says so,
  calmly ("Attempted — try again after 24h"). The Timeline gains one line. The queue count settles. No reload. Nothing
  else on the surface flickers.

### 2.2 Multi-child family

The Riveras have **two children**: **Mia** (touring next week) and **Noah** (offer pending). Different work, different
readiness, different stages.

- **What Operator Work shows.** Because the family has split at the decision point, Operator Work no longer shows one
  family obligation — it shows **work scoped to a named child**, one item per child that has open work, each labeled with
  the child it concerns: *"Confirm Mia's tour"* and *"Extend Noah's offer."* The child is named **in the work**, at the
  point of action, every time.
- **Coordination with the Children card.** The Children card continues to **own Mia and Noah as people** — their names,
  ages, identity, per-child emergency contacts. Operator Work **references** them; it never restates identity. When Maria
  needs to check or fix *who Noah is*, the work item hands her off to the Children card (the existing coordination
  hand-off) rather than editing child data inside Operator Work.
- **What belongs where.** *Operator Work owns the verbs* (what to do for a child now, and the outcome that closes it).
  *The Children card owns the nouns* (who each child is). Readiness per child is shown **in the work item** as a state
  ("Mia: ready to confirm"; "Noah: blocked — agreement unsigned"), because readiness attaches to the obligation, not to
  the person.
- **What must never be duplicated.** Child identity, child roster, child emergency contacts — these stay solely in the
  Children card. Operator Work must never grow a second mini-roster. It names the child; it does not re-list children.

### 2.3 Blocked work

Maria tries to move Noah forward and cannot.

- **How the blocker is presented.** The Noah work item shows a **blocked** state in place — not an error, a **reason**:
  *"Can't extend offer — the enrollment agreement isn't signed."* The command that would advance it is visibly
  unavailable (the existing eligibility gate), and the single blocking factor is named.
- **What the operator should do.** The item offers the **resolving move**, not a dead end: *"Send agreement for
  signature"* (a command) or a hand-off to the owner of the missing fact.
- **How Household and Children support resolution.** The blocking factor **routes to its owner**: a missing family
  phone hands off to the **Household** card; an unsigned per-child agreement or missing child fact hands off to the
  **Children** card. Maria fixes the fact where it lives, and the work item's readiness updates — she never resolves a
  blocker *inside* Operator Work. Operator Work states the blocker and points; the owning card resolves it.

### 2.4 Multiple simultaneous work items

Mia's tour confirmation, Noah's offer, and a family document request are all open at once.

- **How priority is communicated.** Operator Work shows a **primary** item — the one the stage marks most urgent —
  visually dominant and first. The others are present but quieter, in priority order. There is exactly one "do this now."
- **Recommended vs. optional.** The card distinguishes the **required** work (the stage's obligation — must be
  discharged to progress) from **helpful** actions (offered, not required) using the authored action catalog's own
  `recommended | ready | context_dependent` grading. Maria reads "what I must do" apart from "what I could do" without
  guessing.

### 2.5 Work completion

Maria confirms Mia's tour: command succeeds, she declares "Tour confirmed."

- **What recomposes.** The completed item settles with its outcome; the **next** Current Work item for Mia surfaces in
  its place; Readiness for Mia updates; the Timeline gains the confirmation; the queue membership moves if the outcome's
  authored rule advances the stage. All on the **same action**, no reconciling click.
- **What stays stable.** The Focus Panel frame, the Household card, the Children card's identity, and every card not
  downstream of this outcome **do not move**. Stability is a feature — Maria's eyes stay where they were.
- **What moves.** Only what the outcome truly changed: the work item, the next obligation, readiness, timeline, queue.
- **What should feel alive.** The card **answering under her hand** — she reports reality and the surface becomes true,
  immediately, in exactly the places reality changed and nowhere else. That precision is the difference between a form
  and an operating system.

---

## Part 3 — The Operator Work Composition (frozen specification)

Behavior, not components. This is the specification Engineering realizes.

### Purpose
Answer, for the attended Subject, in one place: **"what should I do right now — why, with what, and what happens when
I do?"** — so the operator never assembles their work from multiple cards.

### Ownership
Operator Work **owns**: the active Current Work obligation(s) for the Subject, the affordances that discharge them, the
outcome vocabulary that closes them, the act of declaring an outcome, and its own state transition on completion.
It **owns nothing else**. Identity, scheduling truth, communications history, and timeline live in their own cards; it
references them.

### Information hierarchy (top to bottom)
1. **Frame / Mission** — one line: why the operator is here (offered by runtime, never self-set).
2. **Primary work** — the single most-urgent obligation, dominant, with its checklist.
3. **Its command(s)** — the primary affordance that discharges it, plus graded helpful actions.
4. **Its outcomes** — the authored vocabulary that closes it (revealed at completion).
5. **Secondary work** — other open items, quieter, in priority order, each child-named where child-grain.

### Coordination with Household
Operator Work **references** Household for contact identity and reaches it via the existing coordination hand-off when a
missing household fact blocks work. It never edits or restates household data. Household stays the sole owner.

### Coordination with Children
Operator Work names the child **in the work item** at every child-grain step and references the Children card for child
identity; it hands off to Children to view or fix who a child is. It never grows a child roster. Children stays the sole
owner of child identity, roster, and per-child emergency contacts.

### Command execution
Commands are presented in exactly two places, both routing through the **one** Command Runtime: the Adaptive Workspace
**header control band** (the full command set for the surface) and the work item's **primary action** (the single most
relevant one, inline). **Principle:** a command means the same thing wherever it is launched — presentation may differ,
behavior may not. Command input (e.g. the tour modal) may use an existing referenced surface; its result returns into
Operator Work as one continuous intent.

### Outcomes
Completing work is an **outcome declaration** — the operator chooses a business-meaningful result from the authored
vocabulary; the Outcome Runtime turns that judgment into consequences via authored rules. A command's objective result
may **discharge** a `direct_action` item per config; `outcome_led` work always waits for a declared outcome. The
operator reports a result; they never assert a stage move.

### Recomposition (the contract — resolves G-A)
On a successful action, and **only** the parts reality changed:
- **Recompose:** the completed item (→ settled with its outcome), the next obligation, this Subject's readiness, the
  Timeline entry, and queue membership **if** the outcome's rule moves the stage.
- **Hold stable:** the Frame, Household, Children identity, and every card not downstream of the outcome.
- **Guarantee:** same action, no reconciling reload. If nothing downstream changed (e.g. "left message → no movement"),
  the item settles and the card says so; the surface does not churn.

### Empty state
When the Subject has no open work, Operator Work is **calm, not blank**: it states there is nothing to do now and names
**what the Subject is waiting on** ("Nothing to do — waiting on the family to confirm the tour, booked Tue"). It never
shows an empty void or a spinner.

### Complete state
When an obligation is discharged, the item **settles in place** with its declared outcome and timestamp (it does not
vanish) — a visible record of what just happened — while the next obligation takes primary position above it.

### Blocked state
When work cannot proceed, Operator Work shows a **reason, not an error**: the named blocking factor, the command that
would resolve it (or a hand-off to the fact's owner card), and the unavailable affordance shown as gated (not hidden).
Blocked is a state of the work item, never a dead end.

---

## Part 4 — Low-Fidelity Mockups

Delivered as the companion artifact (6 states): **Family work · Multi-child work · Blocked work · Command execution ·
Work completed · No current work.** Each reuses the existing Focus Panel two-column layout and the existing Household and
Children cards unchanged; only the Operator Work (Current Work) card evolves. The mockups exist to validate composition,
not pixels.

---

## Part 5 — Product Review (against the Constitution)

1. **Does it make the operator's work clearer?** Yes — one obligation at a time, named child, stated Frame, visible
   path; no assembly across cards.
2. **Does it reduce cognitive load?** Yes — one "do this now," required vs. helpful separated, blockers stated with the
   resolving move, stability everywhere reality didn't change.
3. **Does it reuse existing platform capabilities?** Yes, only — Current Work, Command, Outcome, Business Process,
   Presentation/Adaptive Workspace, Readiness, Experience Builder, Household, Children.
4. **Does it avoid duplicate concepts?** Yes — no second work/readiness/status/command/action model; child identity
   never duplicated; the only new datum contemplated is a provenance attribute, not a subsystem.
5. **Does it preserve the Focus Panel?** Yes — same layout, same cards, same published-composition model; only the
   Current Work card's behavior is realized.
6. **Does it feel like Alloy?** Yes — the operator narrates reality and the surface becomes true; assistive, one owner
   per concept, calm stability.
7. **Could Scheduling, Billing, Attendance, Staffing, Compliance, and future domains inherit this exact composition?**
   Yes — Operator Work composes over the generic `OperationalContext` + Stage Operating Plans. A new domain authors its
   stages/work/outcomes in config and inherits the identical Operator Work experience with no card change.

---

## Deliverables

### 1. Final product gaps
G-A recomposition contract *(workflow)* · G-B split scheduling intent *(composition)* · G-C missing Mission/Frame
*(hierarchy)* · G-D child-grain coordination & naming *(composition)*. P5 rejected as implementation artifact.

### 2. Operator journey
Part 2 — five walked scenarios (family, multi-child, blocked, simultaneous, completion), operator-POV.

### 3. Frozen Operator Work specification
Part 3 — purpose, ownership, hierarchy, Household/Children coordination, command execution, outcomes, the recomposition
contract, and empty/complete/blocked states, as behavior.

### 4. Low-fidelity mockups
Companion artifact — six states over the existing Focus Panel layout and existing cards.

### 5. Product rationale
Part 5 — passes all seven constitution questions; the experience subtracts surfaces and detours while adding no
concepts, and it generalizes to every operational domain by construction.

### 6. Risks
- **Recomposition precision (G-A).** A recompose that moves too much (whole-panel refresh) destroys the stability that
  makes it feel alive; too little and the card lies. The contract's "recompose only what changed, hold the rest" is the
  acceptance bar, not a nicety.
- **Child-grain naming depends on a carried subject (G-D).** The product promise "the child is always named" cannot be
  claimed until the subject is carried at the stage's declared grain (Engineering R1). Product must not ship the multi-
  child experience as "done" before that lands.
- **Frame becoming a status system (G-C).** If the Frame grows beyond one offered line into a second status/attention
  surface, it violates the constitution. It must compose existing `attention`/`current_mission` data and stay a line.
- **Scheduling composition ambiguity (G-B).** If the returned tour result doesn't recompose Operator Work, P2 reappears
  as a new seam. The referenced-surface result must flow through the same recomposition contract as any command.
- **Doctrine is `proposed`, not frozen.** This spec builds on a proposed constitution; ratification remains Kelly's act.

### 7. Engineering implementation recommendations
Composition/wiring only — no new architecture. In dependency order:
1. **Recomposition contract (G-A).** Re-apply the stage-work slice after invalidation and dispatch the existing
   `opportunity-updated` recompose event on send/report; scope the recompose to changed regions. (Reconciliation G2.)
2. **Carry the subject at declared grain (R1).** Thread the child id into the execution subject so child-grain outcomes
   complete in-panel; prerequisite for G-D. (Reconciliation G1.)
3. **Child-named work items (G-D).** Project one work item per child with the child named in the item; hand off to the
   Children card for identity.
4. **Frame line (G-C).** Realize Summary mode's Frame from existing `attention`/`current_mission` models; offered,
   never self-set.
5. **Scheduling intent return (G-B).** Route Schedule/Reschedule/Cancel through registered actions; return the tour
   modal's result through the recomposition contract so booking and progress read as one intent. (Cancel-Tour is the
   model pattern.)
6. **De-hardcode outcome mapping.** Replace hardcoded `sent_text`/status mapping with the authored contact-outcome
   mapping. (Reconciliation G5.)
7. **Converge command paths.** Route all command entry points through `runRegisteredAction` so the "same command, same
   meaning" principle holds. (Reconciliation G3 — Engineering only.)

No implementation begun. This specification is the Product Office's input to the remainder of Phase 5.
