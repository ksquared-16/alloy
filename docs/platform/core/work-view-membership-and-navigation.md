---
title: Work View membership and navigation
owner: platform
status: canonical
last_reviewed: 2026-10-20
supersedes: []
---

# Work View membership and navigation

**This document is the canonical owner of Work View membership, its evaluation, and the navigation
that resolves from it.** It was extracted from the verified-implemented sections of
[`../runtime/stage-work-view-queue-canonical-model.md`](../runtime/stage-work-view-queue-canonical-model.md),
which remains a planning and diagnosis record and is **not** the canonical authority for anything
stated here.

Every rule below was learned from a defect that shipped. They are stated as rules because each one,
when it was absent, produced a confident and navigable wrong answer.

Related owners, which this document does not restate:
Business Process and Stage — [`business-process-system.md`](business-process-system.md) ·
stage membership and outcomes — [`stage-membership-and-outcomes.md`](stage-membership-and-outcomes.md) ·
durable status — [`status-and-state-system.md`](status-and-state-system.md) ·
queue presentation — [`../operator/queue-system.md`](../operator/queue-system.md) ·
the record surface — [`../operator/canonical-interaction-model.md`](../operator/canonical-interaction-model.md) ·
grain rules — [`../operator/operational-grain-doctrine.md`](../operator/operational-grain-doctrine.md).

---

## 1. Process position and Work View membership are different questions

A **Stage** answers *where is this participant in the Process*. It is durable process position,
persisted in `stage_key`, and it is owned by Business Process doctrine.

A **Work View** answers *which configured operational cohort does this subject currently belong to*.

These come apart in ordinary configuration, so neither can be derived from the other.

> **Work Views are overlapping configured cohorts. A subject may belong to several at once, and
> stage position neither establishes nor limits that membership.**

A family at stage `waitlist` can be simultaneously in an **All** view and in a booking-predicated
**Tours** view, because Tours deliberately carries no stage predicate — a stage predicate there kept
waitlisted families out of the tours they had actually booked. No stage-to-view mapping can express
that, and one that tried would have to invent it.

The corollary matters as much: **stage alignment ranks destinations; it never establishes one.**
Ranking may reorder truthful destinations. It may never create one.

---

## 2. Membership is evaluated, never inferred

Membership resolves in one direction only:

```
subject
  → canonical operational row at the correct grain
  → configured Work View evaluation
  → fully-supported membership
  → access
  → operational availability
  → destination
```

It is never `stage → one guessed Work View`, and never `family Work Unit → child destination`.

**Any surface offering a Work View as a destination must consume the same membership truth the view
itself uses.** Two evaluators disagree about who is in a view; that disagreement is the defect class
this rule exists to prevent. The evaluation reuses the runtime's own lens machinery — row-grain
resolution, lens stage keys, child lens matching, and the shared predicate evaluator.

### Grain is a membership rule

> **A family-grain lens is not a place a child can be, so it is not a destination to offer.**

The row in a family lens is the case. Offering it for a child lands the operator on a family row and
presents it as the child. The consequence is deliberately symmetric: a household does not inherit its
children's lenses, and children do not inherit their household's. A union in either direction is a
fabrication.

**A declared Row Grain must hold at least one stage the view filters on (BP V2 D7).** Publication refuses a
view whose declared `row_grain_v1` matches none of its filtered stages (`work_view_grain_mismatch`). The
finding names the view and each incompatible stage with its grain. This is exactly the lens the runtime
refuses on every open (`grain_ambiguous`: "the declaration contradicts the lens"); that refusal is unchanged.

- **Stages are read with the runtime's reader** (`lensStageKeys`), and grain with `resolveStageGrain`.
- **Not refused:** an undeclared (legacy) view, since its grain is derived from its stages; a stage-independent
  view; and a stage whose grain cannot be resolved.
- **A view that also filters stages of the other grain** publishes with a warning (`work_view_grain_mixed`).
  The runtime serves it, and Firefly's published Decision view (Decision + Offer pending, family) has this shape.

---

## 3. One evaluator produces rows, counts, membership and eligibility

**The same projection produces the view's rows, its counts, its subject membership, and Focus Panel
eligibility.** One evaluator, one evaluated page. `computeOperationalProjection` is that evaluator and
is authoritative for the measured projection behaviour; membership consumers read it rather than
re-deriving predicates.

**Phase differs from source.** Counts are emitted from the projection but belong to Settlement: they
are reported at the view's one Row Grain and **must never gate Operational Commit**. A supporting
count at another grain is a derived bucket, never a second declared grain.

Work Views and queues are **configuration and runtime constructs, not database tables**. A Work View
is authored product configuration; a queue is a materialized preview of it.

---

## 4. Two guards a destination needs that a count does not

**Fully-supported evaluation.** The predicate evaluator is deliberately fail-open — an unsupported
field or operator passes the row through under AND, because a count would rather over-include than
hide work from an operator. A **destination cannot inherit that generosity**: an unevaluated predicate
is not evidence of membership, and acting on it offers a view that does not contain the subject.
Callers that must prove membership read the membership record's `fullySupported` signal.

**Operational availability.** Membership and enterability are separate facts. A view whose answer
would be `no_truthful_primary_action` on arrival must not be offered as a normal destination, and must
not be silently rerouted to another view. That rule lives exactly once, in
`web/lib/runtime/provisioning/workViewDestinationOperability.ts`, and the provisioning answer itself
calls it — so a destination cannot be offered that the answer would refuse.

The rule is legitimately **grain-specific**: a family surface claiming operational status on identity
alone is not operational, while a child surface must stay enterable where the tenant configures no
child actions at all. Reading them as one rule hides Waitlist from a waitlisted child — the one
destination that is actually true.

---

## 5. Participant position owns participant navigation

A case's Work Unit answers at **family grain**. A child in that case can sit in a different stage
entirely, so the family answer cannot be right for both siblings, and one of them is sent to a queue
that does not contain them, where nothing composes.

> **Participant-specific navigation resolves from the participant's configured operational position.
> Family/case Work Unit context is a FALLBACK and must never overwrite a known participant Work View.**

Null is an answer: a stage with no stage-bound view falls back to the case's unit rather than inventing
a destination. A household or a parent owns no stage of its own and keeps its case's canonical context
— it must not inherit whichever child was enumerated first.

### Stage binding is by configured identity, never by label

A view holds a stage by configured key identity, never by label. Labels are operator-editable and
reorderable; resolving through them means a rename silently moves where a participant lands, and a
tenant that reuses a word resolves the wrong view.

> **Filterless Work Views are process-wide CATCH-ALLS and are not stage-bound lanes.**

A catch-all has its lane binding stripped, because binding one to a single stage's lane would make
"All" report that stage instead of everything. "Has a stage lane" and "is a catch-all" are therefore
mutually exclusive, and a catch-all can never satisfy a stage-specific lookup — which matters because
it is exactly the view a loose lookup falls into for *every* stage, making a broken participant-grain
resolution look like it worked.

### A Work View is certified by its terminal and its composition

> **Operational success requires an operational runtime terminal AND useful composition. A selected
> pill and a projected URL are not proof.**

Both move for a view whose answer is an ERROR terminal: the pill lights up, the address updates, and
nothing composes. A view the tenant's configuration cannot make operational must report its actual
terminal and reason rather than masquerading as successful navigation — and must be classified from the
runtime's own answer, not a hardcoded list, so repairing the configuration moves it into the
operational set with no test edit.

---

## 6. Row Grain and Record of Attention are constitutionally distinct

Row Grain is the **shape of a projected row**, owned by Stage. Record of Attention is **what the
operator is working on**. They are related, not equal — and the long-standing "three grain
vocabularies" problem dissolved once they stopped being forced onto one axis.

| Vocabulary | What it expresses | Axis |
|---|---|---|
| Stage grain (`family`, `child`, …) | Row Grain — the shape of a projected row | **Row Grain (canonical, Stage-owned)** |
| Work View count buckets (`family`, `child`) | count bucketing over Stage-owned grain | Row Grain (derived; must not re-declare) |
| Queue membership subject type (`case`, `child`, `candidate`) | record/attention identity + compatibility naming | **Record of Attention — not Row Grain** |

`case` is **not** a Row Grain: it is the Record-of-Truth identifier for the family enrollment case, and
occurs only where the row grain is `family`. `candidate` is an **attention identity on a child-grain
row**. Compatibility names are translated **at the membership boundary** into Stage-owned Row Grain and
are never compared to grain values directly. No universal enum is created; two concepts keep two
vocabularies joined by an explicit mapping.

A Work View **does not own durable process position** and **may not silently change Row Grain**. It
declares exactly one Row Grain; its rows and counts are that Row Grain.

### A Focus Panel's Record of Truth may be broader than the row

A child-grain queue row may open a composition whose Record of Truth is the family case, provided all
of the following hold. This is legitimate contextual composition, not a grain violation:

1. Record of Attention remains explicitly the selected child's enrollment context.
2. The active child is visible and unambiguous.
3. Context Frame remains the Work View the operator entered from.
4. Current Work resolves for that Record of Attention.
5. Child-scoped actions operate on the child or child relationship they claim to affect.
6. Broader family/case truth may provide context but may not erase the selected child scope.
7. Runtime never silently switches Business Process, Work View, Queue, or Context Frame.
8. A Record of Attention outside the active Work View reports `out_of_scope` — it does not redirect.
9. No active Work View reports `no_active_view`.
10. Membership holding reports `in_scope`.

Attention changes are **downward-only**. Runtime **may offer** a context switch; it **may never
perform one automatically**.

---

## 7. Row identity — four distinct things

Entering a Work View with a named subject involves four identities. Collapsing any two produces a
confident, navigable, wrong answer.

| Concept | What it is |
|---|---|
| **Work View** | the configured operational cohort the operator chose |
| **Work View row identity** | the evaluated row the runtime selects on |
| **Focus Panel host** | the record the panel composes against |
| **Operator subject** | what the operator searched for, focused inside a card |

For a family-grain lens the row identity and the host coincide, which is exactly why the distinction
stayed invisible until a child-grain lens shipped.

> **A family/case may host a child's Focus Panel without itself being the selected child-grain Work
> View member.**

**Row identity is grain-specific.** At child grain the row is the participation; at family grain it is
the case. The durable child is deliberately *not* the child-grain row identity: one child can hold two
participations across two leads, and those are two different rows. A destination must name which.

**Search must produce what a manual row click produces.** Manual selection is the authority, and the
field the membership guard matches on is the field any other doorway must resolve to. There is no
second selection contract.

> **Search destinations must retain the canonical operational member identity the Work View runtime
> needs.** Membership reduced to a boolean cannot be navigated: the row key must survive evaluation,
> not be reconstructed afterwards.

Consequently a destination is **not emitted** when the member identity is unresolvable. Membership can
be true while the way to reach it is unknown, and offering it then delivers the operator to a refusal.

---

## 8. Membership is not pagination

The published page is capped. Resolving a named subject against that page answers *"is this record in
the Work View?"* with *"is it in the first page of rows?"* — different questions, which disagree for
any lens larger than the cap. A truthful member sorted past the cap was refused as unavailable and was
unreachable by direct navigation.

> **Direct subject navigation must not depend on the member appearing on the first evaluated page.**

The complete membership is already in memory when the guard runs, so targeted resolution costs no
query, no larger page, and no prefetch. **The cap is not raised**: what the surface DISPLAYS and what
the lens CONTAINS remain separate facts, and only the selectability of a *named* member widens to the
truth.

### The guard stays fail-closed

None of the above weakens the refusal. An id naming no member of the lens still resolves to nothing and
is still refused, and **nothing is ever substituted**. Finding some related family row and silently
selecting it would hide a grain defect behind an operational banner and hand the operator a different
family — the most consequential form the fabrication defect can take. The correct repair is always to
send the right member, never to accept the wrong one.

---

## 9. The queue compatibility boundary

A queue is the materialization of a lens, not a second predicate system and not a tier. Today lanes
are still generated from stages rather than from Work Views, and a positional
`compat_queue_key` fallback still binds some views to lanes. **That convergence is not complete**, and
the diagnosis, gap analysis and sequencing for it remain in
[`../runtime/stage-work-view-queue-canonical-model.md`](../runtime/stage-work-view-queue-canonical-model.md).

Two consequences are current truth and belong here:

- **The queue does not own process position.** Stage does.
- **The queue does not own Work View membership independently of the operational projection.** Where a
  lane and the projection disagree, the projection is the membership authority and the lane is a
  presentation artifact.

The runtime authority declines to read a positionally-assigned lane binding as identity. Until lanes
are generated from the projection, treat any lane-derived count or membership as presentation, never as
membership truth.

---

---

## 10. Implementation seams

Named so the doctrine above is checkable, not to make the symbol list the doctrine:

| Concern | Seam |
|---|---|
| The one evaluator | `web/lib/lifecycle/operationalProjection.ts` |
| Membership record + `fullySupported` | `web/lib/lifecycle/operationalProjection.ts` |
| Work View totals from the same evaluator | `web/lib/queues/aggregateWorkViewTotals.ts` |
| Row-grain resolution for a lens | `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts` |
| Child-grain lens matching | `web/lib/runtime/provisioning/childGrainMembership.ts`, `childGrainScope.ts` |
| Destination operability | `web/lib/runtime/provisioning/workViewDestinationOperability.ts` |
| Targeted member beyond the page cap | `web/lib/runtime/provisioning/targetedWorkViewMember.ts` |
| Participant-position navigation | `web/lib/workUnits/hostWorkUnitResolver.ts` |
| Catch-all binding normalization | `web/lib/lifecycle/workViewsConfigV1.ts` |
| Domain-projection cohort (§ 11) | `web/lib/businessProcesses/projections/domainProjectionRegistry.ts` |
| Projection rows / counts branches (§ 11) | `workUnitProvisioningAnswer.ts` (`terminal: "projection"`), `web/lib/queues/evaluateWorkViewTotalsForGroup.ts` |

---

## 11. Domain-projection Work Views (BP V2 Slice 2)

A Work View on a `domain_projection` process (`process_model_v1`) does not evaluate a lifecycle
population. Its membership is a **registered domain projection**, named by the view's `projection_key`
and dispatched on the process's declared domain. Everything in §§ 1–9 about stages, lenses and grains
describes staged lifecycles; for a projection view the following is the contract.

- **One cohort.** `loadDomainProjectionCohort` is the only membership reader. The totals evaluator
  (pill and tile counts, the seed) and the provisioning answer (rows) both call it; `total` is the length
  of the same deduplicated, authorized, canonically ordered cohort the page is sliced from, or **null**
  when the domain read was bounded (`truncated`). Never the page length, never a guess.
- **The row is the record; the source is context.** Each row names an existing durable record — child
  (`customer_members`), person (`persons`) or household (`customers`) — as `<grain>:<id>`, one row per
  subject. The domain fact that put it there (a `schedule_assignments` row, a `charges` row) is carried as
  `domain_projection.source` and never becomes what opens.
- **A distinct terminal.** The answer is `terminal: "projection"`, so every `operational`-keyed consumer
  (opportunity drawer warming, stage work, primary actions) skips it by construction. Selecting a row opens
  the existing `DurableRecordSurface` inside the existing Focus Panel boundary; no default subject is
  committed and nothing opportunity-shaped is prepared for a projection row.
- **Opening the record (BP V2 Slice 4).** The projection's domain decides HOW the existing
  `DurableRecordSurface` opens (`durableRecordEntryFor`); nothing else is composed. Assignments open in the
  surface's existing `contextual` presentation on the record's **Assignment** context — the existing
  Scheduling card is the primary object, the record's own views and in-place contexts stay one click away.
  Billing keeps the `full` record. The entry carries, read-only:
  - the row's **site** (`context_site_id` on the record route) — honoured only inside the actor's scope and
    only where the subject holds a live assignment, or (child) an operational agreement still to be placed,
    at that site; otherwise ignored, never invented. A Schedule Gaps child therefore opens on an Assignment
    context that says "Not yet assigned" at the agreement's site;
  - the row's **source** as a focus request — the card resolves it against its OWN fresh projection, by id
    only (`resolveSchedulingFocus`): a current, proposed or upcoming assignment opens its detail; a source
    that has moved on is said ("has changed since the list was read"), never swapped for another row; an
    agreement source opens no assignment;
  - the **origin** line ("Assignments · Ending soon — Ends Oct 29 · in 9 days").
  **Billing (BP V2 Slice 6)** keeps the `full` household record and asks the existing Financials card to
  LEAD it (`leadCard: "financials"`) — a household has no record contexts, so the contextual presentation
  would render nothing. The record route verifies the row's source against the household
  (`resolveHouseholdFinancialFocus`: exists in the org, belongs to THIS household through its billable
  source, actor holds `fin.read`; otherwise only a status, so nothing leaks) and the card starts there
  (`financialsLeadStart`): a charge opens the card's existing Charge Details (`openCharge`); an unrecorded
  collection opens its Payment surface with that attempt marked (`openCollection`, Financials' lifecycle
  words — never a payment); anything stale or foreign shows the account at rest with one sentence. The
  household grid stays below. Closing the card's surfaces dispatches the same convergence refresh.
  The entry is pinned for the life of the open record. Actions are the card's existing registered
  `assignment.*` commands; a confirmed write (the card fires only after the canonical writer succeeded and
  it re-read) dispatches the existing Work Unit convergence event with no opportunity id, so rows and counts
  re-read. Process-scoped card ORDER for a durable record is not configurable yet: the published Focus Panel
  summary is addressed to opportunities only.
- **Opening a record is passive; authoring is explicit (BP V2 D8).** Entering any record shows the cards and
  their authoritative state, and starts no authoring workflow and no write. This covers a Work View row, a
  deep link, a refresh, a closed/lost Enrollment family, and a subject with no current work.
  - **Entry.** The Scheduling card opens a single subject directly ("one subject is not a decision"), and
    its work surface enters on the subject's assignments: the list, or "No assignments yet" with
    "+ Add Assignment".
  - **Authoring.** The Create Assignment editor opens only from an explicit request: "+ Add Assignment"
    (`beginCreateAssignment`), Edit, or a type pick. An assignment focus source still opens that
    assignment's detail.
  - **Cancel and record changes.** Cancel returns to the list. Selecting another record never carries an
    open editor onto it.
  - **What was wrong before D8.** The surface used to enter in `create` whenever the subject had no
    assignment. So any one-child family without one opened straight into the editor, without a click.
  - **Proof:** `web/tests/businessProcesses/schedulingCardPassiveEntry.test.tsx`.
- **The Scheduling card prices inside a case only when the record has one (BP V2 D6).** The card reads an
  opportunity's financial configuration (`/api/admin/financial-config/opportunity/<id>`) to price a child's
  assignment. That id comes from `resolveSchedulingCaseOpportunityId`, using relationships the context already
  carries:
  - staff: none;
  - an opportunity subject: itself;
  - a child carrying its family binding (`child.family_opportunity_id`): that family;
  - a durable child hosted by a case: `operationalHost.opportunityId`;
  - **otherwise none, and then no request is made.** A subject's own id is never sent as an opportunity id.
    `AssignmentTuitionCard` already applied that rule to the same route.
  - **What was wrong before D6.** The card used the mutation resolver, which ends `return subjectId`. A durable
    child opened from an Assignments view therefore requested `financial-config/opportunity/<customer_members.id>`
    and got 404 (`qar_58463703cedd`).
  - **Proof:** `web/tests/businessProcesses/schedulingCaseOpportunityIdentity.test.tsx`.
- **Scope.** Rows and counts are read under the request's access scope (site restrictions enforced;
  `fin.read` for Billing) **intersected with the `/workspace` site selection** (BP V2 Slice 3). The
  selection is part of the answer's identity (`workspace_site_id` on the provisioning-answer URL) and of the
  totals request, so rows and counts always read the same sites; a selection outside the actor's sites
  yields nothing, never more. A site change re-prepares a projection view. Lifecycle (Enrollment) answers
  ignore the selection, as before.
- **Grain and facts.** Assignments views count PEOPLE (one row per child or staff person); the assignments
  behind them are counted separately (`factTotal`) and never called people. "In effect" is always decided
  by `resolveAssignmentLifecycleState` against the org-local business date — never by stored status or
  "latest row" (see `effective-dated-assignment-doctrine.md` § cardinality for child vs staff primaries).
- **Why a row is there.** Each row carries a source-backed reason ("Ends Oct 29 · in 9 days", "Primary
  change starts Oct 30", "No committed schedule") and the source's site, room, type and dates. Nothing is
  persisted to produce it.
- **Refusals are explicit.** `projection_unsupported` (configuration), `projection_forbidden`
  (authorization), `projection_unavailable` (read failed or no scope): an error terminal that keeps the
  lens set; counts are UNKNOWN. A projection view never returns Enrollment records and never a zero it did
  not count.
- **Host.** One work unit per projection department, written idempotently after publish, with an empty
  `queue_definition`; it is the canonical location (`base_queue_key: "projection"`) and no lane reader can
  load it as an opportunity lane.
