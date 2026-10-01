---
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Effective-dated assignment doctrine

**Status:** Canonical (September 2026). Ratified Director decision; the cross-domain invariant owner
for effective-dated operational assignment truth.

This document owns **one law**, shared by every domain that records "this was true from this date
until that date". It exists because two domains — child Placement and Schedule Assignment — arrived at
the same temporal model independently, and were each about to document it separately. One law written
twice becomes two laws the moment one copy is edited.

**What it owns:** truth intervals, supersession, cancellation, the distinction between an operational
change and a correction, provenance, current-row semantics, planned/future semantics, events, and why
historical truth is not overwritten.

**What it does not own**, and must not absorb: the placement *candidate* lifecycle
([`placement-system.md`](placement-system.md)), staff employment semantics, RBAC and role
authority ([`../governance/roles-and-permissions.md`](../governance/roles-and-permissions.md)),
Business Process stage ([`business-process-system.md`](business-process-system.md)), and the governed
Status architecture ([`status-and-state-system.md`](status-and-state-system.md)). Those are
domain-owned and this document has no opinion about them.

---

## The law

**A change to a fact that defines an effective-dated assignment creates a successor record. It does
not mutate the current truth interval in place.**

The required pattern:

```
current row
  → close the prior truth interval (end date = day before the successor's start)
  → insert the successor row
  → link successor → prior via supersedes_*
  → derive successor state from its start date
  → emit the domain change event
```

## Which records this governs

A record is governed by this doctrine when it carries the full temporal primitive: an effective
`start_date`, a nullable `end_date`, a `supersedes_*` self-reference, a `source_key` provenance
column, and a CHECK-constrained lifecycle state.

Measured 2026-09-30, three tables carry exactly that shape:

| Table | Domain | Invariant owner |
|---|---|---|
| `child_placements` | Placement | `lib/childcareOperational/childPlacementService.ts` |
| `schedule_assignments` (child, agreement-scoped) | Scheduling | `lib/childcareOperational/scheduleAssignmentService.ts` |
| `schedule_assignments` (primary switch, child **and** staff) | Scheduling | `lib/operationalAssignments/setPrimaryOperationalAssignment.ts` |
| `employments` | Employment | `employment` domain services |

> **Corrected 2026-09-30.** This table previously named
> `lib/operationalAssignments/operationalAssignmentService.ts` as the `schedule_assignments` invariant
> owner. Measured, that service creates, promotes and deletes **proposed** assignments — rows that are
> not operational truth and are therefore outside this doctrine until promotion. The agreement-scoped
> child supersession lives in `scheduleAssignmentService.ts`, and the primary switch that spans child
> and staff subjects lives in `setPrimaryOperationalAssignment.ts`. Naming the wrong owner is not a
> cosmetic error in a doctrine whose whole purpose is that one law has one home.

## Who owns the transaction

Since 2026-09-30 the durable half of supersession is **one SQL function**,
`apply_participation_operational_change`, reached through a single TypeScript gateway
(`lib/childcareOperational/participationOperationalChange.ts`).

This is not a second temporal engine; it is the only one. It exists because the invariant needs a
property TypeScript cannot provide: a single operator edit can change placement **and** schedule truth
together, the canonical services are separate functions, and the Supabase client cannot open a shared
transaction. Two statements that must both happen or neither cannot be issued from the client.

It owns exactly four things and nothing else: atomic persistence, supersession linkage, truth-interval
integrity, and concurrency/retry protection. It decides no eligibility, performs no authorization,
chooses no room or pattern, and **emits no events**. The canonical services keep all of that, and emit
their domain event *after* the commit returns — never before, because a rolled-back transaction must
produce no event.

> **A date is not the primitive.** Many tables have dates. This doctrine applies only to records whose
> *identity* is a bounded interval of asserted truth. Do not force a record into this model because it
> has a `start_date` — a scheduled send, a due date and a created timestamp are none of them truth
> intervals, and pulling them in would make the law meaningless rather than broader.

## Three distinct concepts, and why conflating them loses data

### 1. Operational change

Something *became* different from a point in time onward. The prior row remains true for the period it
described. This is supersession.

`supersedeChildPlacement` is the reference implementation: it requires the successor to start strictly
**after** the prior row, and closes the prior row on the day before that start. The arithmetic makes a
zero-length prior interval impossible, so a superseded row always asserts a non-empty period during
which it was the truth. That is exactly right for *"the child was in Room A, then moved to Room B."*

### 2. Cancellation

A planned record **never became true at all**. Supersession cannot express this, precisely because it
guarantees the prior row asserted a non-empty interval — using it here would publish a period of care
that never happened, and a partner who already synchronised the row could not tell the two apart.

`canceled` is the canonical word. The row is **retained**, not deleted, so a consumer that already read
the id can still resolve it and see what became of it. It is excluded from the operational uniqueness
index, so cancelling frees the slot for a corrected row.

### 3. Correction

The stored record was **factually wrong** and never represented the intended real-world truth. This is
the only case where editing in place is defensible, and it is deliberately hard to reach.

A correction path must be **intentional, separately authorised, audited, reason-bearing, and
synchronisation-aware** — and it must be impossible to invoke merely because an ordinary edit form
exists. **A normal operator edit is not a correction by default.** As of 2026-09-30 **no correction
path is implemented**, because no current operator behaviour means *"the stored historical fact was
entered incorrectly"*. Route ordinary edits through supersession; do not build a general correction API
speculatively.

## Current-row semantics — and the one place the domains genuinely differ

All governed tables agree on what "in effect" *means*: the operational status set
`('planned','active','ending')`. Every reader, every uniqueness index and the assignment overlap
trigger name that same set, deliberately, so there is one definition rather than several that disagree.

They do **not** all enforce the same cardinality, and flattening that would be wrong:

| Subject | Mechanism | Effect |
|---|---|---|
| Placement (per agreement) | partial unique index `ux_child_placements_one_operational_per_agreement` | at most **one** operational row |
| Child primary assignment (per agreement) | partial unique index `ux_schedule_assignments_one_operational_primary_child` | at most **one** operational row |
| Staff primary assignment (per person) | overlap trigger `validate_schedule_assignments_primary_overlap` only | many operational rows, provided their date ranges **do not overlap** |
| Secondary assignments | neither | concurrent by design |

So a **staff member may hold a current primary assignment and a future-dated one simultaneously**,
because the two do not overlap. **A child may not** — the index forbids a second operational row per
agreement whether or not the dates overlap. The 2026-07 assignment foundation argued for overlap-only
uniqueness precisely so future primary changes stayed possible; 2026-10 then added the stricter child
index, and 2026-10-23 narrowed the trigger to closed rows so both halves use one definition of "in
effect". The asymmetry that remains is a real product difference, not an accident of migration order.

Two consequences worth stating, because both are easy to get wrong:

- **"Latest row" does not mean "active row."** The invariant constrains the *operational* set, not
  recency. Resolve the current row by the operational-state predicate, never by `ORDER BY created_at
  DESC LIMIT 1`.
- **For placements and child assignments, a future-dated change closes the present one immediately.**
  Superseding with a future start sets the prior row to `superseded` *now* and inserts a `planned`
  successor; the prior row does not stay `active` until the date arrives. So "where is this child
  today" is a question about **dates**, not status alone. For staff the future row simply coexists.

## Planned / future semantics

State is derived from the date, not chosen by the caller:

```
start_date > today  →  planned
otherwise           →  active
```

`planned` is inside the operational set. Where a single-operational index applies (placement, child
primary assignment) a future-dated change is therefore a *replacement scheduled ahead* rather than a
second concurrent row. Where only the overlap trigger applies (staff primary) it is a genuine second
row, legal because the intervals are disjoint.

## Provenance

`source_key` records **how** the row came to exist (`operator` by default). It is not an authority
check and confers no permission; it exists so that a later reader can tell an operator decision from an
import or a system materialisation.

## Events

Supersession emits a domain change event. This is not decoration: a partner that has already
synchronised an assignment learns about the change through that event and nothing else.

**An in-place write that skips the event is worse than a write that fails** — the failure is visible,
the silent divergence is not. Integration-visible mutation semantics must be identical regardless of
which Alloy surface initiated the change.

---

## Enforcement — measured, and where it stops

**Measured 2026-09-30 after the Operations temporal convergence.** A canonical law must say where it is
and is not enforced, in the place the law is read.

### Closed

`lib/childcareOperational/applyChildParticipationEdit.ts`, reached by the mounted operator routes
`/api/admin/child-participation` and `/api/admin/scheduling`, used to write durable operational truth
**in place** once a participation had materialised — `child_placements` (program, room, start date) and
`schedule_assignments` (terms) — and emitted **no** change event. That bypass is gone. Both halves now
route through the canonical services, whose persistence is one
`apply_participation_operational_change` transaction, and whose events fire after the commit. When a
single edit touches both, it is one transaction rather than two calls that can half-succeed.

Its pre-materialisation branch is unchanged and correct: before an operational agreement exists the
same edit merges into `process_instances.metadata`, which is draft desire rather than asserted truth.

`assertNoOperationalPlacementPatch()` and `assertNoOperationalScheduleAssignmentPatch()` are **deleted**.
Both always threw and neither had a single call site, while the public contract at
`app/api/v1/placements/move/route.ts` cited the placement one as the reason in-place mutation "is
refused for every caller, Alloy's own surfaces included" — a sentence that was not true of the
implementation for as long as the bypass existed. A guard nobody calls is worse than no guard: it reads
as protection in review, and it makes the absence of real enforcement harder to notice.

The invariant now has one owner and one enforcer:

- **owner:** no in-place path exists. Every change to a defining fact resolves to one transaction that
  closes the prior interval and inserts a successor.
- **enforcer:** `web/tests/access/participationTemporalWriterCensus.test.ts` classifies every production
  writer of the two tables and fails on an unclassified one, mounted routes included. Routes may read
  those tables; they may not write them.

Proven behaviourally, not by inspection: `participationOperationalChange.live.test.ts` (11 scenarios,
the database primitive) and `participationWiringApplication.live.test.ts` (10 scenarios, the wiring —
rollback of a half-written combined change, retry replay, stale-row conflict, and events read back from
`workflow_events` rather than spied on).

### Open, and deliberately not closed here

**A cross-site move is not represented.** Post-materialisation, `location_id` updates
`child_enrollment_agreements.site_location_id` and does **not** supersede the placement, so the
placement keeps its original site. This predates the convergence; the previous in-place block did not
carry site either.

It was left open rather than quietly routed. The primitive cannot express it — a supersession carries
the prior row's site forward, because `validate_child_placements_consistency` pins placement site to the
agreement — and moving a child between **sites** is a different operator intent from moving them
between rooms: different capacity, different staffing, plausibly a different agreement. Inventing a
representation for it inside a room-change field would be guessing at a product decision. It is
recorded as product work.

**No correction path exists, still deliberately.** As of 2026-09-30 no current operator behaviour means
*"the stored historical fact was entered incorrectly"*. Ordinary edits are operational changes and
supersede. A correction path must be intentional, separately authorised, audited, reason-bearing and
synchronisation-aware, and must be impossible to reach merely because an edit form exists. Do not build
one speculatively, and do not use "it might be a correction" as an escape hatch from supersession.

## Related

- [`placement-system.md`](placement-system.md) — placement candidates and the placement domain
- [`business-process-system.md`](business-process-system.md) — stage and lifecycle, distinct from assignment truth
- [`status-and-state-system.md`](status-and-state-system.md) — governed Status; note that
  `child_placements.status` and `placement_candidates.status` are **outside** it, being CHECK
  constraints rather than `status_definitions` domains
