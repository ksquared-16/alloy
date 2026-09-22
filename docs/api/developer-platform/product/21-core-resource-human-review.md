---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Core Resource Expansion: Human Review walkthrough

**One review of one resource graph**, not eight endpoint reviews. Everything below is inspectable
in a running Alloy at:

> **Organization → Integrations → Developer documentation → API Reference**

The reference now renders all thirteen public operations in one page, in dependency order, so the
graph can be read top to bottom. Screenshots are filed as evidence under
`playwright/evidence/thread7-core-resources/`; they are evidence, not the review.

---

## 1. Resource naming

| Route | Reads as | Why not the alternative |
|---|---|---|
| `/children` | children in service | not `/members` — the domain word means something else to an operator |
| `/households` | the family grouping siblings | not `/customers` — a partner is not integrating against billing |
| `/relationships` | adult ↔ child edges | not `/guardians` — guardian is one relationship type, not the resource |
| `/enrollments` | the agreement | distinct from placement and schedule, deliberately |
| `/placements` | which room, from when | |
| `/schedule-assignments` | the standing commitment | the canonical schedule resource |
| `/schedule-days` | who is expected on a date | named as a projection, and shaped like one |
| `/staff` | person + employment, composed | not `/employments` — nobody asks "show me employments" |

**What to check:** that each name says what an integrator would call the thing, and that
`/schedule-assignments` versus `/schedule-days` is obvious without reading the body.

## 2. Conceptual relationships

```
Household ──< Child ──< Relationship ──> (adult identity)
                │
                ├──< Enrollment ──< Placement ──> Location (site) / Location (unit)
                └──< Schedule assignment ──▷ Schedule day (derived)

Person ──< Staff (employment) ──> Location (site)
```

Every arrow into a Location is the same Location resource already shipped. There is no second room
vocabulary, no second site id, and no duplicated identity anywhere in the graph.

**What to check:** that a partner can get from a child to a room without learning a new identifier
system, and that nothing appears twice under two names.

## 3. PII boundaries

Four grades, and the split follows the tables rather than a naming convention:

| Grade | Scope | Reaches |
|---|---|---|
| child identity | `children.read` | name, date of birth, household link, lifecycle |
| family grouping | `households.read` | household name and type — **no member list** |
| adult identity | `relationships.read` | who the adults are, and effective pickup |
| contact points | `relationships.contact.read`, `staff.contact.read` | email and phone — **never implied** by the base read |

Health, allergy, medical and safeguarding data is not withheld by a serializer — it is not present
in the tables these resources read, and the authorities behind them join nothing that holds it.
Compensation and payroll are excluded the same way for Staff, and billing for Households.

**What to check:** that a partner doing occupancy analytics can hold `children.read` alone and
never learn a parent's name or a phone number.

## 4. Household and child scope

This is the one most worth a careful look, because the intuitive design is wrong.

- A **child** is visible only through **enrollment** at a site inside the boundary. Organization
  membership is never enough, *including for organization-wide installations*.
- A **household** is visible because one of its children already is. It grants nothing further.

The certification tenant makes both concrete: 17 of 1,519 children hold an enrollment, so the
intuitive "all children in the org" rule would publish 1,519 records to serve a need for 17. And
one household has nine children at Riverside and one at Lakeside — a Riverside integration sees the
household, sees the nine, and cannot discover that the tenth exists.

**What to check:** that the reference says this plainly enough that an integrator who sees fewer
children than expected looks at enrollment rather than filing a bug.

## 5. Effective pickup authority

`pickup_authorized` is computed at read time, not stored, and it is the only field in the API
derived from data that is itself never published.

True requires **all three**: collection authority granted, nothing currently withdrawing it, and
the child inside the boundary. Everything else is false — including the case where a restriction
names its subject only in free text, because we cannot prove it does not name this person.

No reason is returned in any form. The raw `authorized_pickup` role is never published, precisely
because publishing it could contradict the computed answer.

**What to check:** that the documentation tells an integrator not to infer a reason and not to
treat `false` as a data error — and that this reads as a product decision rather than a limitation.

## 6. Enrollment vs Placement vs Schedule

Three commitments, three resources, because they change independently:

- a child can move room without their enrollment changing;
- a child can change schedule without moving room;
- an enrollment can end while both are still recorded.

Placement corrections arrive as a **new row** naming the one it replaces, so a partner who already
synchronised the old row is told rather than left silently wrong.

**What to check:** that the reference explains which one to synchronise for which question, so an
integrator does not sync all three by default.

## 7. Staff composition

Alloy has no staff record. `/staff` presents person ⋈ employment as one resource: `id` is the
employment, `person_id` is the human, and someone employed twice appears twice with one
`person_id`. No new identity, no new id space, no new domain owner.

Visibility follows the **assignment**, not the organization: employment is org-scoped, but a staff
member appears only when their primary location is inside the boundary, and one with no location
never appears.

**What to check:** that this reads as a convenience projection and could not be mistaken for a new
system of record.

## 8. Collection and sync consistency

Every persisted collection uses the same grammar already certified in 7.1/7.2 — `limit`, `cursor`,
`since_token`, `updated_since`, `(sort_key, id)` ordering, default 50 and maximum 200. Nothing was
forked per resource.

`/schedule-days` is the deliberate exception and announces itself: it returns **no cursor and no
sync token**, requires a bounded date window, and names its source in `derived_from`. A generated
row has no change clock, and publishing a watermark that could not be honoured would break the one
law the whole surface rests on.

**What to check:** that the exception is legible as a decision, not an omission.

## 9. Examples

Each operation carries request parameters, a response schema with per-field descriptions, and the
error cases a partner will actually hit (401, 403, 429, and 400 on the projection). The narrative
worth reading in full is on `/children` (why a child is visible), `/relationships` (what
`pickup_authorized` means) and `/schedule-days` (why it is not synchronisable).

## 10. Absence of implementation leakage

Scanned and clean across the whole rendered reference: no database table names, no function names,
no migration identifiers, no repository paths, no admin transport, no certification or commit
language. The partner-facing text speaks in integration terms throughout — "an enrollment places
them at a site", not the name of the table that records it.

**What to check:** spot-read any two operations and confirm nothing reads like it was written for
an Alloy engineer.

---

## Certification status at review time

| Group | Status |
|---|---|
| Group 0 — lifecycle clock repair | **CERTIFIED** |
| Group 1 — People | **CERTIFIED** |
| Group 2 — Service state | **CERTIFIED** |
| Group 3 — Staff | **CERTIFIED** |

397 tests green across 22 files, including 90 live specs over a real listener. Six prebuild guards
green. Canonical `tsconfig.build.json` typecheck **passed** and the production build **passed**,
both through the validation broker rather than substituted.

Nothing has been pushed, promoted or deployed.
