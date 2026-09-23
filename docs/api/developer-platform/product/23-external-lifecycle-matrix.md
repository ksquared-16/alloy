---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — External lifecycle capability matrix

**What the public API lets an external system change, and what it deliberately does not.**

Measured against the canonical services and the registered action catalogue on
`2026-09-22`. Where no canonical governed operation exists, this document says
`DOMAIN_OPERATION_GAP` and nothing is built — an ad-hoc public mutation path
invented to complete a matrix is worse than an honest hole in it.

---

## 0. The rule this batch was decided by

"Full CRUD" was read as **full external lifecycle capability**, not as
`POST/PUT/PATCH/DELETE` on every noun. Alloy's model is unchanged:

```
RESOURCES  = what is true
OPERATIONS = what the external system wants Alloy to do
SYNC       = what changed
```

A partner submits **`withdraw enrollment`**, never `PATCH status_key`. The
distinction is not stylistic: the canonical services enforce it. Placement and
Schedule literally export `assertNoOperationalPlacementPatch()` and
`assertNoOperationalScheduleAssignmentPatch()` — the domain refuses in-place
mutation of an effective-dated row, and supersession is the change mechanism.

---

## 1. Summary

| Resource | Create | Change | End | Delete | V1 disposition |
| --- | --- | --- | --- | --- | --- |
| Locations | — | — | — | `DELETE_FORBIDDEN` | **READ_ONLY_BY_DESIGN** |
| Children | canonical exists | canonical exists | `SOFT_ARCHIVE` | `DELETE_FORBIDDEN` | **READ_ONLY_IN_V1** (identity-resolution gap) |
| Households | `DOMAIN_OPERATION_GAP` | — | — | `DELETE_FORBIDDEN` | **READ_ONLY_BY_DESIGN** |
| Relationships | `DOMAIN_OPERATION_GAP` | `DOMAIN_OPERATION_GAP` | `DOMAIN_OPERATION_GAP` | `DELETE_FORBIDDEN` | **READ_ONLY_IN_V1** |
| Enrollment | ✅ shipped | — | ✅ shipped | `EFFECTIVE_END` | **LIFECYCLE_EXTERNALIZED** |
| Placements | ✅ shipped | ✅ shipped (supersede) | via enrollment end | `SUPERSEDE` | **LIFECYCLE_EXTERNALIZED** |
| Schedule assignments | ✅ shipped | ✅ shipped (supersede) | via enrollment end | `SUPERSEDE` | **LIFECYCLE_EXTERNALIZED** |
| Schedule days | — | — | — | n/a | **DERIVED_READ_ONLY** |
| Staff | canonical exists | partial | canonical exists | `EFFECTIVE_END` | **READY_NOT_EXTERNALIZED** |
| Attendance | ✅ shipped | correction fact | reversal fact | `DELETE_FORBIDDEN` | **FULL_LIFECYCLE_COMPLETE_BY_APPEND_ONLY_FACTS** |

---

## 2. Resource by resource

### 2.1 Locations — `READ_ONLY_BY_DESIGN`

| | |
| --- | --- |
| Canonical owner | Configuration / tenant administration |
| Create / change / archive intent | None externally |
| Canonical command | No general location create/update/archive service exists |
| Delete semantics | `DELETE_FORBIDDEN` |
| V1 disposition | **READ_ONLY_BY_DESIGN** |

Site and room topology is how an organization describes itself. It is configured
by the operator, and every other resource names a place using these identifiers —
so an integration creating a room would be changing the shared vocabulary that
placement, schedule and attendance all resolve against. There is no external
intent that requires it: a partner that needs a new room needs the operator to
create one.

Exposing `PATCH /locations` for CRUD completeness would be the clearest possible
example of endpoint symmetry defeating the product.

### 2.2 Children — `READ_ONLY_IN_V1`

| | |
| --- | --- |
| Canonical owner | `addChild` / household member authority; registered `child_add` action |
| Create intent | Exists canonically — creates a member **into an existing household** |
| Change intent | Safe profile fields via participation edit |
| End intent | `SOFT_ARCHIVE` (`is_active`, `status_key`) |
| Delete semantics | `DELETE_FORBIDDEN` |
| Required scope if built | `children.write` |
| V1 disposition | **READ_ONLY_IN_V1** |

Canonical creation authority exists, and it is deliberately not externalized in
V1 for two measured reasons.

**Identity resolution belongs upstream.** An external producer that POSTs a child
body has asserted a new human being. Nothing in a create call distinguishes "this
is a new child" from "this is a child you already have, spelled differently" —
and the consequence of getting it wrong is a duplicate person record, which is
expensive and sometimes unsafe to merge afterwards. The correct external intent
is a governed intake that resolves identity, not a create.

**A created child would be invisible anyway.** Public visibility requires an
enrollment at a site inside the boundary. Creating a child produces a record no
public read returns, so the operation would appear to do nothing.

`DOMAIN_OPERATION_GAP` for the external intent: *"submit a child for
identity-resolved intake"*. The underlying create exists; the resolving wrapper
does not.

### 2.3 Households — `READ_ONLY_BY_DESIGN`

| | |
| --- | --- |
| Canonical owner | Customer/account authority |
| Create intent | `DOMAIN_OPERATION_GAP` — no general household-creation service |
| Delete semantics | `DELETE_FORBIDDEN` |
| V1 disposition | **READ_ONLY_BY_DESIGN** |

A household is an account. It carries financial responsibility and payment
instruments that this API does not expose at all, so external creation would mean
an integration establishing a billing relationship as a side effect of a roster
sync. The public household is a thin anchor precisely because it is not the
partner's concern.

### 2.4 Relationships — `READ_ONLY_IN_V1`, `DOMAIN_OPERATION_GAP`

| | |
| --- | --- |
| Canonical owner | `person_child_relationships` + scoped roles |
| Create / change / end intent | Only an AdminV2 focus-panel mutation exists — transport-coupled, not a domain service |
| Delete semantics | `DELETE_FORBIDDEN` (relationships end by status) |
| V1 disposition | **READ_ONLY_IN_V1** |

This is a genuine gap rather than a policy decision, and it is the one most worth
closing next: linking a guardian is a legitimate external intent.

**If it is built, two constraints are not negotiable.** `pickup_authorized` must
remain a derived answer — an operation may grant the underlying role, never write
the effective flag, so that safeguarding restrictions continue to override it.
And no external operation may read, create or alter a safeguarding restriction.

### 2.5 Enrollment — `LIFECYCLE_EXTERNALIZED` ✅

| | |
| --- | --- |
| Canonical owner | `enrollmentAgreementService` |
| Create intent | `createChildEnrollmentAgreement` → **`POST /api/v1/enrollments`** |
| End intent | `cancelAgreementBeforeStart`, `markAgreementEnding`, `markAgreementEnded` → **`POST /api/v1/enrollments/{id}/end`** |
| Change intent | None externally — an agreement's terms are not a partner's to edit |
| Delete semantics | `EFFECTIVE_END` |
| Scope | `enrollment.write` |
| Boundary | `site_location_id` must be inside the boundary; the child must be reachable |
| Idempotency | **Domain-native**: an operational agreement already existing for (child, site) converges rather than creating a second |
| Convergence | `GET /api/v1/enrollments` |

### 2.6 Placements — `LIFECYCLE_EXTERNALIZED` ✅

| | |
| --- | --- |
| Canonical owner | `childPlacementService` |
| Create intent | `createInitialChildPlacement` → **`POST /api/v1/placements`** |
| Change intent | `supersedeChildPlacement` → **`POST /api/v1/placements/move`** |
| Delete semantics | `SUPERSEDE` — history is never rewritten |
| Scope | `enrollment.write` |
| Idempotency | Domain-native: the current operational placement is read before acting |
| Convergence | `GET /api/v1/placements` |

The domain exports `assertNoOperationalPlacementPatch()`. There is no version of
this resource that accepts a field edit.

### 2.7 Schedule assignments — `LIFECYCLE_EXTERNALIZED` ✅

| | |
| --- | --- |
| Canonical owner | `scheduleAssignmentService` |
| Create intent | `createInitialScheduleAssignment` → **`POST /api/v1/schedule-assignments`** |
| Change intent | `supersedeScheduleAssignment` → **`POST /api/v1/schedule-assignments/change`** |
| Delete semantics | `SUPERSEDE` |
| Scope | `schedule.write` |
| Convergence | `GET /api/v1/schedule-assignments` |

### 2.8 Schedule days — `DERIVED_READ_ONLY`

Generated from committed assignments. **No operation mutates a generated day**,
and none ever should: the day is a view of the commitment, so changing a day
means changing the assignment it came from.

### 2.9 Staff — `READY_NOT_EXTERNALIZED`

| | |
| --- | --- |
| Canonical owner | `employmentService` — `createEmployment`, `endEmployment`; registered `staff_add` and `employment_end` actions |
| Create intent | Exists canonically |
| Change intent | Partial — role, title and site assignment have no single safe canonical change command |
| End intent | `endEmployment` (`EFFECTIVE_END`) |
| Delete semantics | `DELETE_FORBIDDEN` |
| Scope if built | `staff.write` |

Authority exists and is clean. It is **not** externalized in this batch — a
deliberate scoping decision rather than a gap, stated plainly so it is not
mistaken for one. Onboarding a person is an HR act adjacent to compensation,
tax and eligibility authorities that this API excludes entirely, and the change
half is incomplete. The safe increment is `end employment` alone; that is
recommended as the next bounded batch rather than smuggled into this one.

### 2.10 Attendance — `FULL_LIFECYCLE_COMPLETE_BY_APPEND_ONLY_FACTS` ✅

| | |
| --- | --- |
| Create | submit a fact |
| Change | submit a **correction** that supersedes it |
| End | submit a **reversal** |
| Delete | `DELETE_FORBIDDEN` — refused by the database for every caller, Alloy included |

Confirmed complete. There is nothing to add: an append-only ledger with
correction and reversal expresses the entire lifecycle, and an `UPDATE` or
`DELETE` would remove the property that makes a partner's mirror reconcilable.

---

## 3. Write scopes

Two, not six. Scopes govern **capability**, and must not mirror endpoint count.

| Scope | Grants | Does not grant |
| --- | --- | --- |
| `enrollment.write` | Start an enrollment; end an enrollment; assign a placement; move a placement | Reading anything; creating children or households; schedules; staff |
| `schedule.write` | Set a committed schedule; change it by supersession | Reading anything; mutating a generated schedule day; enrollment or placement |

**Why enrollment and placement share one permission.** They are one operator
concept — *"manage where this child is enrolled and which room they are in"* —
and a placement cannot exist without an agreement to hang from. An operator
asked to grant them separately would be choosing between two halves of a single
capability, which is not a real choice.

**Why create, change and end share one permission.** An integration that may
start an enrollment but not end one produces records nobody can close. The
meaningful boundary is the resource, not the verb.

**No read is implied.** `enrollment.write` does not let a partner read a single
enrollment; that is `enrollment.read`, granted separately. This follows the
`attendance.write` precedent exactly.

**PII mutation requires no stronger permission because none is possible.** None
of these operations accepts contact detail, health, safeguarding or financial
information. There is no field to protect.

---

## 4. Delete policy, published

| Resource | Policy |
| --- | --- |
| Locations | `DELETE_FORBIDDEN` |
| Children | `SOFT_ARCHIVE` |
| Households | `DELETE_FORBIDDEN` |
| Relationships | `DELETE_FORBIDDEN` (end by status) |
| Enrollment | `EFFECTIVE_END` |
| Placements | `SUPERSEDE` |
| Schedule assignments | `SUPERSEDE` |
| Staff | `EFFECTIVE_END` |
| Attendance | `DELETE_FORBIDDEN` (`REVERSAL`) |

**No resource on this API supports physical deletion.** That is a complete
lifecycle, not a missing feature, and the partner documentation says so — an
integrator must not conclude that absent `DELETE` endpoints are an oversight
Alloy will fix.

---

## 5. Operations stopped

| Intent | Status | Why |
| --- | --- | --- |
| Create a household | `DOMAIN_OPERATION_GAP` | No general household-creation service; households carry financial authority this API excludes |
| Link a guardian / add a relationship | `DOMAIN_OPERATION_GAP` | Only a transport-coupled focus-panel mutation exists |
| Grant or revoke pickup | `DOMAIN_OPERATION_GAP` | Depends on the above; must never write the derived flag |
| Create a child | `DOMAIN_OPERATION_GAP` (resolving intake) | The create exists; identity resolution does not, and a raw create makes duplicate humans |
| Create or change a location | `READ_ONLY_BY_DESIGN` | Not a gap — a decision |
| Change staff role or site | Incomplete canonical authority | No single safe change command |

None of these was built. Each would have required inventing a public mutation
path with no canonical owner, which is the one thing this batch was told not to
do.
