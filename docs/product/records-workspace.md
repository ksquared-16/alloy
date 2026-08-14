---
owner: product
status: canonical
last_reviewed: 2026-08-14
supersedes: []
---

# Records — the durable Staff and Children workspace

Records is where a person or a child is **managed as a record**, whether or not any queue is
currently working them. It is not a queue, not a lifecycle surface, and not an enrollment funnel.

## Why it exists

An active Work Unit says where a subject is **worked**. It does not say whether the subject
**exists**. Before Records, a staff member had no household and no case and therefore no
representable attention target at all — `/organization/staff` wrote `?personId=` into an href
nothing read, so clicking a staff member reloaded the list. That was not a wiring slip; there was
no destination to write.

`/organization/staff` now converges onto Records → Staff. One product, not two directories.

## Durable record attention

Attention resolves the **subject** first and the operational host second. Staff and Child rows
open through the same one adapter every record gesture uses: the caller states durable intent and
names the aspect it means; the adapter owns household resolution, Work Unit keys, addresses and
composition.

Intent is **stated, never inferred**. `false` is a legitimate answer on the operational side, so an
inferred intent would fail silently — the exact defect class the adapter exists to prevent.

### The child subject is the member row

`customer_members.id` is the durable Child subject. **Never `person_id`.**

`customer_members.person_id` is nullable and stays that way. In the certification tenant all ~1500
seeded children have a null person, so a surface keyed on the person would show an empty Children
section while 1500 children existed. A child with no person, no case and no process is a complete
record, not a partial one.

## Cohorts are read projections

A cohort is a **question asked of the server**, not a lifecycle stage and not a client-side filter
over whatever page happened to load.

Records V1 shipped the wrong way round: it loaded the first 500 children and applied the cohort
predicate in the browser, so an Enrolled child alphabetically beyond the page silently vanished
from the Enrolled cohort. The surface said "nobody is enrolled" when the truth was "we only looked
at 500 of them" — and the defect *worsened* as a tenant grew, hiding on small tenants and appearing
on exactly the ones that needed it.

The order is fixed:

```
org/access scope → site scope → cohort predicate → search → ordering → pagination
```

Pagination may change which page you SEE. It may never change who QUALIFIES. The total reported
beside a cohort is the cohort's true total, never the page length; cohorts whose total is not known
show **no** count rather than an inaccurate one, because an inaccurate count looks authoritative.

Staff cohorts are predicates over the tenant's **configured** positions — "Lead Teachers" exists
because the tenant configured a Lead Teacher position, not because the platform knows the phrase.

## Child record creation

**Add Child establishes or links canonical Child/member truth. It does not imply Enrollment.**

These are three different intents and three different commands:

| Command | Establishes |
| --- | --- |
| Add Child (`child.add`) | the canonical Child record, in a household |
| Start Enrollment | process participation |
| Create Lead (`create_lead`) | acquisition entry for a new prospect family |

A Child may exist in Records with no Opportunity, no enrollment process, no Work Unit and
`person_id = NULL`. None of those are fabricated to make Add Child work.

### Operator identity ambiguity cannot resolve silently

`resolvePersonCandidates` is the shared gate for person and child subjects — the same six-band
classifier, with one rule on top: **a match is never resolved silently**. There is no `matched`
decision to return; every non-empty answer is a question for the operator. `weak` and `conflicted`
count as matches deliberately, because auto-linking on a weak signal corrupts identity and
auto-creating past one duplicates a human. Both failures are worse than one extra decision.

Two children named "Emma Chen" with no date of birth are genuinely indistinguishable. The path this
replaced matched org-wide on name with `ilike`, took the first row, and returned it. The operator
now sees both and chooses, or creates new with an explicit reason.

The household is **picked**, never inferred from a name match.

### One write authority

Operator child/member creation converges on **`createHouseholdChildMember`**
(`web/lib/records/childMemberAuthority.ts`). Every operator-facing placement routes through it:

```
operator placements → createHouseholdChildMember → customer_members
```

It owns the row shape and active-membership de-duplication. It deliberately does **not** own
identity — resolution is a placement concern and the placements genuinely differ (Records gates on
operator choice; Create Lead resolves from intake facts; the drawer from the inquiry). It accepts
`personId: null` as an ordinary answer rather than a gap.

Two writers remain outside it **by decision**, not oversight:

- **public form intake apply** — ingestion/review semantics, no operator present
- **frozen Processing Identity commit** — the canonical identity-publication context, which owns
  its own transactional envelope

`web/tests/records/childMemberWriteAuthority.test.ts` reads the source and fails when a new
operator-facing insert site appears. It compares the **set** of sites, never the count.

## Process boundary — Start Enrollment from Records is deferred

Records does not offer Start Enrollment. The current Enrollment creation authority
(`createEnrollmentProcessInstance`) requires an **Opportunity** as its process context, so offering
it from a durable Child record would mean creating an Opportunity there — which is Create Lead, and
exactly the boundary this product holds.

This is a recorded deferral with a named cause. The resolution is not designed here.
