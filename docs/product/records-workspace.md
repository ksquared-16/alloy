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

## The enrollment boundary — three layers, not one

| Layer | What it is | Owner |
| --- | --- | --- |
| Opportunity | an **optional** acquisition/enrolment episode, family-grain | opportunity domain |
| `process_instances` | the **governed child journey** | `createEnrollmentProcessInstance` |
| Agreement · Placement · Schedule | the **durable care relationship** | `applyChildEnrollmentMaterialization` |

These do not collapse into each other. A child can be in care with no journey running; a journey
can run about a child not yet in care; and both are possible with no Opportunity at all —
`child_enrollment_agreements.opportunity_id` is nullable precisely so durable truth outlives the
episode that produced it.

### Start Enrollment may run context-free

`enrollment.start` begins the journey for a child who already exists. It creates **no Opportunity**.
`process_instances.context_id` is nullable and its own column comment calls the context "generic,
optional" — an earlier slice mistook the helper's requirement for a platform rule and deferred this
action on that basis.

Context is resolved, never fabricated. A household episode counts as **live** only when a journey is
actually running inside it, and an inactive Work Unit disqualifies one outright. When no live
episode exists the journey runs context-free.

### Closed Opportunities are not reopened for siblings

A 2025 enrolment that completed stays completed. Attaching a 2026 sibling to it would reopen
finished history, put a settled family back into acquisition work views, and make the sibling's
journey a continuation of an enrolment that already ended. The sibling gets their own journey.

Uniqueness for context-free journeys comes from `ux_process_instances_open_context_free`, a partial
index covering only journeys that have **not** concluded — so a retry cannot open a second journey,
while re-enrollment a year later stays legal.

### Direct Enroll bypasses the journey, not the facts

`enrollment.direct` skips lead qualification, contact attempts, tour and stage progression. It does
not skip the information: site, start date, placement and a resolvable schedule are all required,
and a preflight refuses the write when any is missing.

That preflight exists because the materialization core is deliberately forgiving — absent placement
fields SKIP the placement and an unresolvable schedule degrades to a warning. Tolerable for a
journey that gathered facts over weeks; unacceptable for a one-shot command, where it would report
success while leaving a child no roster can see.

It writes **no `process_instances` row**. Recording a journey nobody ran, or stamping its stages
complete, would be inventing history. The absence of a journey *is* the truthful record of a direct
enrollment.
