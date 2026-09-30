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
| `schedule_assignments` | Scheduling (child **and** staff) | `lib/operationalAssignments/operationalAssignmentService.ts` |
| `employments` | Employment | `employment` domain services |

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

## Current-row semantics

Each governed table enforces *at most one operational row per subject* through a partial unique index.
For placements:

```sql
ux_child_placements_one_operational_per_agreement
  ON child_placements (org_id, enrollment_agreement_id)
  WHERE status = ANY (ARRAY['planned','active','ending'])
```

Two consequences worth stating, because both are easy to get wrong:

- **"Latest row" does not mean "active row."** The invariant constrains the *operational* set, not
  recency. Resolve the current row by the operational-state predicate, never by `ORDER BY created_at
  DESC LIMIT 1`.
- **A future-dated change closes the present one immediately.** Superseding with a start date in the
  future sets the prior row to `superseded` *now* and inserts a `planned` successor. The prior row does
  not stay `active` until the date arrives. So "where is this child today" is a question about **dates**,
  not about status alone — `planned` and `superseded` both coexist with today being inside neither.

## Planned / future semantics

State is derived from the date, not chosen by the caller:

```
start_date > today  →  planned
otherwise           →  active
```

Because `planned` is inside the operational set, a subject cannot hold an active row and a planned row
at the same time. A future-dated change is therefore a *replacement scheduled ahead*, not a second
concurrent assignment.

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

## Known implementation debt — this doctrine is not yet enforced everywhere

**Measured on staging `f2e538751`, 2026-09-30.** Recorded here rather than in a planning document,
because a canonical law with a known live exception must say so where the law is read.

`lib/childcareOperational/applyChildParticipationEdit.ts`, reached by the mounted operator routes
`/api/admin/child-participation` and `/api/admin/scheduling`, writes durable operational truth **in
place** once a participation has materialised:

- `child_placements` — `program_category_id`, `room_location_id`, `start_date`
- `schedule_assignments` — assignment terms
- and it emits **no** change event, where supersession does

Its pre-materialisation branch is not affected: before an operational agreement exists the same edit
merges into `process_instances.metadata`, which is draft desire rather than asserted truth, and is
correctly editable in place.

Two further facts about the gap:

- `assertNoOperationalPlacementPatch()` in `childPlacementService.ts` is a **no-op with zero call
  sites**. The public contract at `app/api/v1/placements/move/route.ts` states that in-place mutation
  "is refused for every caller, Alloy's own surfaces included" — that sentence is currently **not true
  of the implementation**.
- Converging the bypass requires resolving an atomicity question first, and it is a real one. A single
  operator edit can change placement *and* schedule truth together; the canonical commands are separate
  TypeScript services with no shared transaction; Supabase's client cannot open one; and
  `supersedeChildPlacement` is **not retry-idempotent** — a retry would find its own successor and
  supersede that, chaining spurious rows. So all-or-nothing needs one server-side transaction, which
  means the temporal engine has to exist in SQL — and duplicating it there would create the second
  engine this doctrine exists to prevent.

**That decision is open**: either the durable temporal engine moves into SQL with the TypeScript
services becoming thin callers, or a combined edit is split into two explicitly separate operator
intents so atomicity is unnecessary by construction. Until it is taken, the bypass stands and is
documented here.

---

## Related

- [`placement-system.md`](placement-system.md) — placement candidates and the placement domain
- [`business-process-system.md`](business-process-system.md) — stage and lifecycle, distinct from assignment truth
- [`status-and-state-system.md`](status-and-state-system.md) — governed Status; note that
  `child_placements.status` and `placement_candidates.status` are **outside** it, being CHECK
  constraints rather than `status_definitions` domains
