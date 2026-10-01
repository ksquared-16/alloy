---
title: Work View membership and navigation
owner: platform
status: canonical
last_reviewed: 2026-09-29
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
