---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Core Resource decision resolution

**Canonical owner for: the resolved external contracts for People, Service state and Staff, and the
exact next implementation batch.** Open questions live in `19-thread-7-decision-register.md`; the
surface plan in `18-thread-7-v1-surface-and-plan.md`.

Everything below was measured against the live certification schema and the current source on
`2026-09-22`, not inferred from the discovery matrix. Where measurement contradicts an earlier
discovery claim, the measurement wins and the contradiction is stated rather than quietly corrected.

---

## 0. What measurement changed

Three discovery claims did not survive re-measurement. Each mattered.

| Discovery said | Measurement says | Consequence |
|---|---|---|
| `locations`, `customer_members`, `customers` have **no trigger** maintaining `updated_at` | All three **have** `set_updated_at` BEFORE UPDATE triggers, and have since the March baseline | The named blocker was never the real one |
| That missing trigger blocks incremental delivery | `updated_at` is NULL on ~99% of those rows — but for a different reason, and the read layer **already compensates** | D-08 shrinks to a much smaller repair |
| The gap is on the customer/child tables | The real gap is on six **person-side** tables that genuinely have no trigger | The repair moves to different tables entirely |

The mechanism, which discovery blurred: a `BEFORE UPDATE` trigger fires only on UPDATE. It does
nothing at INSERT. On tables whose `updated_at` column carries **no `DEFAULT now()`**, a row is
born NULL and stays NULL until something first updates it. That is why the NULL rate correlates
perfectly with the column default and not with the trigger:

| Table | `updated_at` default | `set_updated_at` trigger | NULL rate |
|---|---|---|---|
| `child_enrollment_agreements` | `now()` | yes | 0 / 17 |
| `child_placements` | `now()` | yes | 0 / 10 |
| `schedule_assignments` | `now()` | yes | 0 / 83 |
| `employments` | `now()` | yes | 0 / 1 |
| `locations` | — | yes | 9 / 10 |
| `customers` | — | yes | 1 207 / 1 216 |
| `customer_members` | — | yes | 1 506 / 1 519 |
| `person_child_relationships` | — | yes | 1 500 / 1 507 |
| `persons` | — | **no** | 1 849 / 1 851 |
| `customer_persons` | — | **no** | 1 805 / 1 805 |

---

## 1. D-08 — archive / lifecycle delivery — **RESOLVED, IMPLEMENTATION READY**

**Classification: ENGINEERING_CHOICE_WITH_ONE_CLEAR_FIT.** Not a Director decision. The repair
restores intended semantics that the newer tables already have; it creates no new domain truth.

### Why the NULL clock is already survivable

The external read layer does not sort on `updated_at`. It sorts on

```sql
COALESCE(l.updated_at, l.created_at) AS sort_key
```

established in `20260910210000_external_locations_read.sql` and carried into the `updated_since`
law in `20260911160000_external_locations_updated_since.sql`. That is why 7.1 and 7.2 certified
exact incremental sync over a `locations` table with 9 of 10 rows NULL: a row that has never been
updated is correctly represented by its creation time.

So the missing `DEFAULT now()` is **not a defect at the contract boundary**. It is untidy storage
that the sync law already normalises. No backfill is required, and a backfill to `now()` would be
actively harmful — it would restamp 1 500+ rows as changed today and make every partner's first
incremental pass redeliver the entire dataset.

### The gap that remains, stated exactly

`COALESCE(updated_at, created_at)` is correct for a row that has **never** been updated. It is
wrong the moment a row **is** updated on a table where nothing advances the clock. There, the
update lands, `updated_at` stays NULL, the coalesce falls back to `created_at` — a time in the
past — and a partner already synced beyond that point **never sees the change at all**.

That is the real D-08, and it is confined to six tables:

| Table | Role in the public surface | Lifecycle mutation that would be lost |
|---|---|---|
| `persons` | guardian and staff identity | `archived_at` set; name, email or phone corrected; `status_key` change |
| `customer_persons` | person ↔ household link | link added, re-pointed or deactivated |
| `customer_member_contacts` | contact points for a child | contact corrected or removed |
| `customer_member_contact_roles` | scoped contact roles | role granted or revoked |
| `person_relationships` | person ↔ person edges | relationship ended |
| `person_locations` | person ↔ site | site assignment changed |

Answering the seven questions as asked:

1. **Which lifecycle mutations escape observation?** Every UPDATE on those six tables — including
   `persons.archived_at`, which is how a person is retired. Archival is the mutation most likely
   to be silently lost, which is the worst possible one to lose.
2. **Is `updated_at` the canonical lifecycle clock?** Yes. Every other comparable table in the
   childcare operational set uses exactly this column with exactly this trigger. There is no
   competing clock.
3. **Would triggers restore intent or create new truth?** Restore. `set_updated_at` already
   exists and is applied to 11 of the 17 tables in scope. These six were missed, not excluded.
4. **Internal consumers depending on non-moving behaviour?** None found. 42 call sites order or
   filter on `updated_at`, none of them against these six tables, and none reads NULL as a signal.
   `lib/workspace/opportunityAttentionRules.ts` already falls back to `created_at` itself — the
   same coalesce, written by hand, which is evidence of the intent rather than against it.
5. **Backfill required?** **No** — and it should be refused. The coalesce already handles NULL
   truthfully. See above for why a `now()` backfill would be harmful.
6. **API or operator behaviour affected?** No public resource reads these tables today. Operator
   surfaces read fields, not the clock.
7. **Bounded infrastructure repair, or a deletion ledger?** Bounded repair. Archival is **soft on
   every table in scope** — `persons.archived_at`, `customers.status_key`,
   `customer_members.is_active` + `status_key`, `person_child_relationships.status`,
   `employments.employment_status`. Nothing is hard-deleted, so no deletion ledger is needed and
   none should be built.

### Proposed migration scope — exact, and not applied in this run

```sql
-- Six triggers. No new columns, no backfill, no data change, no ledger.
CREATE TRIGGER trg_persons_updated_at BEFORE UPDATE ON public.persons
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- … identically for:
--   customer_persons, customer_member_contacts, customer_member_contact_roles,
--   person_relationships, person_locations
```

Re-runnable by construction (`DROP TRIGGER IF EXISTS` first — a failed apply does not roll back
DDL). Adding `DEFAULT now()` to the untriggered columns is **optional tidiness, deliberately
excluded**: the coalesce makes it unobservable externally, and changing a default on
`customers`/`customer_members` is a wider blast radius than this repair needs.

---

## 2. People cluster — D-02, D-03, D-04, D-06, D-11

### The model that already exists

Measurement confirms the doctrine the instruction asks to preserve is **already implemented in the
schema**, not something the public contract must impose:

- **Identity belongs to canonical entities.** The child is `customer_members` (1 519 rows, its own
  `first_name`/`last_name`/`dob`). The household is `customers`. The adult is `persons`.
- **Relationships are edges.** `person_child_relationships` (1 507 rows) carries
  `(person_id, customer_member_id, customer_id, relationship_type, priority, status)`.
- **Household membership is not child authority.** The edge is person→child, never household→child.
- **One person may hold different authority for different children.** One edge row per pair, with
  `person_child_relationship_roles` hanging scoped roles off the edge — measured values `parent`
  and `authorized_pickup`. Authority is per-edge, exactly as required.

**The child is not a person.** Only 11 of 1 519 `customer_members` carry a `person_id`. Child
identity lives on `customer_members` and nowhere else, which is fortunate: `customer_members` is
trigger-maintained and `persons` is not.

### D-02 — is Person an external resource? — **RESOLVED: no.**

**Classification: ENGINEERING_CHOICE_WITH_ONE_CLEAR_FIT**, confirming the discovery recommendation
(a) on measured grounds rather than intuition.

There is no `/persons`. A bare person carries no operational meaning and publishing one would
create a second identity surface beside Child and Staff. Person identity reaches a partner only
**through a role**: as the subject of a relationship edge, or as the subject of an employment.
Both carry their own scope, so identity is never readable without a stated reason.

### D-03 — is Household first-class? — **RESOLVED: yes, as a thin anchor.**

`customers` is a real row with a stable id, and 302 households have more than one child, so
siblings are the common case rather than an edge case. But the household row also carries
`stripe_customer_id`, `default_payment_method_id`, `payment_method_last4`, `payment_method_brand`
and `setup_intent_id`. The public Household is an explicit allow-list of four fields, and the
payment columns are structurally excluded — never selected, not merely omitted from a serializer.

### D-04 — how are guardians represented? — **RESOLVED: a first-class Relationships resource.**

Confirms discovery (a). The edge already exists with a stable id, its own status and its own
timestamps, so it synchronises on its own terms; embedding it on Child would duplicate one fact
into two collections with two clocks. Child carries a reference, not an array.

**Both, with one canonical identity**, in the precise sense the instruction asks: `/relationships`
is the canonical collection and the identity is the edge id. Child and Household link to it. No
embedded copy of a guardian ever appears anywhere else.

### D-06 — boundary for a child with no placement — **RESOLVED: invisible. Fail closed.**

Confirms discovery (a), and measurement shows the stakes are much higher than discovery knew:

**Only 17 of 1 519 children have an enrollment at all.** A child enters the boundary through
`child_enrollment_agreements.site_location_id` — the same site derivation Attendance already uses.
A child with no enrollment has no site, and is therefore outside every boundary.

Applied to `org_wide` installations this is the difference between exposing **1 519 children** and
exposing **17**. The instruction warns the platform must not accidentally become a bulk PII export;
measurement says that without this rule it would be one on its first day. So the rule is stronger
than "location-mode installations fail closed":

> **Enrollment is what makes a child externally visible — in every boundary mode, `org_wide`
> included.** The public API exposes children in service, never every child record ever created.

**Multi-site and multi-child, answered concretely.** No child currently holds enrollments at two
sites, but **one household already spans two sites today**. So the household case is live, not
hypothetical, and the rule is: a household is visible if *any* of its children is in boundary, and
its child links are then filtered to the in-boundary children only. A partner scoped to Site A
sees the household and the Site A sibling, and has no way to learn that a Site B sibling exists —
not the id, not the count. Household visibility never widens child visibility.

### D-11 — is `children.read` too coarse? — **RESOLVED: yes. Three scopes.**

Confirms discovery (a). The split follows the tables, which is what makes it enforceable rather
than a naming convention:

| Scope | Grants | Backed by |
|---|---|---|
| `children.read` | child identity and service linkage | `customer_members` allow-list |
| `children.contact.read` | contact points for a child | `customer_member_contacts` |
| `relationships.read` | guardian/parent edges and their roles | `person_child_relationships` + roles, and the `persons` identity each edge names |

`relationships.read` is the scope that exposes adult identity, and it is deliberately separate from
both child scopes: a partner doing occupancy analytics gets `children.read` and never learns a
parent's name.

### The pickup-authority hazard — the most important finding in this cluster

`person_child_relationship_roles.role_key = 'authorized_pickup'` says a person **may** collect a
child. `child_safeguarding_restrictions.operational_effect = 'may_not_pick_up'` says they **may
not**. These are different tables, and **two active restrictions exist in the data right now**,
with `restriction_kind` in `custody_restriction` and `protective_or_restraining_order`.

A `/relationships` read that published `authorized_pickup` from the roles table alone would tell a
partner that a person may collect a child **while a protective order says otherwise**. That is a
child-safety correctness defect, not a privacy one, and reading the restrictions table to fix it
would leak safeguarding — the thing the instruction most explicitly forbids.

**Resolution for V1: `authorized_pickup` is excluded from the public contract.** Relationships
publishes `relationship_type` and non-safety roles only. This is the one place where least
privilege and correctness point the same way, and shipping the field would be worse than omitting
it.

The safe design exists and is recorded for later: a server-computed `pickup_authorized` boolean
that applies restrictions internally and publishes only the effective answer, never the reason.
Whether to build it is a product question, not an engineering one — see §8.

### D-02/D-04/D-11 PII classification

| Field | Public in V1 | Scope required |
|---|---|---|
| child name, preferred name | yes | `children.read` |
| child date of birth | yes | `children.read` |
| child external id, alloy id | yes | `children.read` |
| household id, name, type | yes | `children.read` (link) / `households.read` (row) |
| guardian name | yes | `relationships.read` |
| relationship type, priority, status | yes | `relationships.read` |
| guardian email, phone | yes | `children.contact.read` |
| address | **no** — not modelled on these tables; defer rather than invent |
| emergency-contact designation | yes, as a role key | `relationships.read` |
| **pickup authority** | **no** — see the hazard above | — |
| medical / health (`person_health_facts`) | **never** | — |
| safeguarding (`child_safeguarding_*`) | **never** | — |
| financial responsibility, payment methods | **never in People**; deferred to 7.9 | — |

Health and safeguarding are **structurally excluded**: neither `customer_members` nor `persons`
carries a single health, medical, allergy or safeguarding column. They live in `person_health_facts`
and `child_safeguarding_*`, which no proposed resource joins. Exclusion is a property of the query
shape, not a discipline someone must remember.

---

## 3. D-05 — Enrollment / Placement / Schedule — **RESOLVED**

### The wording correction, made permanent

Discovery said schedules are "never persisted". That was too broad and is now corrected in place:

> **Committed schedule authority IS persisted and effective-dated.** `schedule_assignments` holds
> 83 rows with `start_date`, `end_date`, `status`, `supersedes_assignment_id` and a
> `schedule_pattern_id` naming the recurrence template. What is *derived* is the dated occurrence
> view, computed by `scheduleExpectationCore.ts` from those rows plus configuration.

### The three resources

All three carry `site_location_id` directly, a maintained `updated_at` with `DEFAULT now()` and
zero NULL rows, so all three join the Thread 7 sync law unchanged and none depends on D-08.

| | Enrollment | Placement | Schedule |
|---|---|---|---|
| Canonical owner | `child_enrollment_agreements` | `child_placements` | `schedule_assignments` |
| Identifier | row id | row id | row id |
| Effective dating | `start_date`/`end_date` | `start_date`/`end_date` | `start_date`/`end_date` |
| Supersession | — | `supersedes_placement_id` | `supersedes_assignment_id` |
| Lifecycle | `status` | `status` | `status` (`active`, `planned`) |
| Boundary | `site_location_id` | `site_location_id` | `site_location_id` |
| Sync clock | `updated_at`, 0 NULL | `updated_at`, 0 NULL | `updated_at`, 0 NULL |
| Correlation | `integration_resource_refs` kind `child` | same | same |
| Raw shape externally appropriate? | no — allow-list | no — allow-list | no — allow-list, **and a mandatory filter** |

**Fields excluded from the allow-lists:** `created_by`/`updated_by` (internal actor identity),
`metadata` (unbounded, uncontrolled), `opportunity_id`/`opportunity_customer_member_id` (pipeline
internals), `source_key`, `activation_policy_key`, `reason_key`.

### The Schedule boundary hazard

`schedule_assignments` is **polymorphic**: `subject_type` is `child` (82 rows) or `staff` (1 row),
with `subject_person_id` populated for staff and `customer_member_id` for children. A public child
schedule read that omits `subject_type = 'child'` publishes staff schedules to a partner holding
only a child scope.

The filter is therefore **part of the contract, not an implementation detail**, and belongs in the
SQL beside the boundary — the same rule `list_external_locations` follows, where authority is
applied inside the select so no unauthorized row is ever briefly in hand.

### A / B / C — **RESOLVED: (C) both, with the canonical/projection split stated**

Discovery recommended (a), projection only. That is now reversed, on evidence: (a) was chosen when
schedules were believed unpersisted. They are persisted, so the honest model is both — and naming
which is canonical is what prevents two answers to one question.

| | Purpose | Nature | Sync |
|---|---|---|---|
| `/schedule-assignments` | standing schedule intent — "what is this child's committed pattern?" | **canonical resource**, persisted, effective-dated | full Thread 7 sync law |
| `/schedule-days` | "who is expected on Tuesday?" | **projection**, derived per request from assignments + patterns + calendar | **no sync token — bounded date-range query only** |

The projection carries **no cursor, no `updated_since`, no `sync_token`**, because a derived view
has no change clock and pretending otherwise would be the one thing the exact-sync law forbids. It
is a windowed read: give a date range, get the expected days. A partner that wants change detection
subscribes to the canonical assignments instead.

This split serves both stated integration needs without optimising for any particular provider: a
system holding standing intent syncs assignments; a system asking "who is expected today" queries
days.

---

## 4. D-07 — Staff — **RESOLVED: `/staff` as an external projection**

**Verified against source.** There is no independent staff identity. `employments` carries
`person_id` and composes onto `persons`. Staff is Person ⋈ Employment, exactly as discovery found.

`/staff` is allowed, and is an **external projection over canonical authority, not a new domain
owner**. It creates no table, no id space and no second identity system: the external id is the
employment id, and the person is reached through it.

| Question | Measured answer |
|---|---|
| Person identity owner | `persons` |
| Employment authority | `employments` (trigger-maintained, `DEFAULT now()`, 0 NULL) |
| Organization relationship | `employments.org_id` |
| Site assignment | `employments.primary_location_id`. `person_locations` exists but holds **0 rows** and has no trigger — it is not the authority today |
| Lifecycle | `employment_status` ∈ `pending_start`, `active`, `ending`, `ended`, `canceled` |
| Effective dates | `start_date`, `end_date`, plus `supersedes_employment_id` |
| Correlation | `external_employee_id`, `badge_number` |
| Sync clock | `employments.updated_at` — **but see the caveat** |

**Field decisions:**

| Field | Public | Scope |
|---|---|---|
| employment id (the external identifier) | yes | `staff.read` |
| person id | yes | `staff.read` |
| external employee id, badge number | yes | `staff.read` |
| name | yes | `staff.read` |
| employment status, type | yes | `staff.read` |
| assigned site | yes | `staff.read` |
| role / job title (`employment_positions`) | yes | `staff.read` |
| email, phone | **stronger scope** — `staff.contact.read` | |
| compensation, pay rate | **never** | — |
| payroll, private HR, safeguarding | **never** | — |

Compensation is **structurally separate** in `employment_compensation_terms` (`pay_basis`,
`rate_amount`, `rate_unit`, `rate_currency`). The projection never joins it, so exposure is not
possible through this resource rather than merely forbidden.

**The D-08 caveat that makes Staff a two-part resource.** `employments.updated_at` is maintained,
so employment *state* synchronises correctly. But a staff member's **name** lives on `persons`,
which has no trigger. Renaming a person today advances nothing, and a partner would hold a stale
name indefinitely. So `/staff` is sync-correct for employment and **not** sync-correct for identity
until the D-08 trigger repair lands. That dependency is real and is why Staff ships in the same
batch as the repair, not before it.

**Boundary.** Staff is visible when `primary_location_id` falls inside the installation boundary —
confirming discovery (a). Organization-scoped employment does not mean organization-wide
visibility. A staff member with no primary location is invisible, the same fail-closed rule the
children use.

---

## 5. Cross-resource consistency

The proposed set composes without duplicating truth:

```
Household (customers)
  └─ children[]  → Child (customer_members)         [filtered to in-boundary children]
       ├─ relationships[] → Relationship (person_child_relationships) → person identity
       ├─ enrollments[]   → Enrollment (child_enrollment_agreements)
       │     └─ placements[] → Placement (child_placements)
       └─ schedule_assignments[] → Schedule (schedule_assignments, subject_type='child')
              └─ /schedule-days  (derived projection, no sync token)

Person ─(employments)→ Staff (external projection; employment id is the identity)

Location (locations) ─ type: site | unit   [unchanged; already shipped]
```

- **No duplicated identity.** One id per concept. Child identity only on `customer_members`;
  adult identity only reachable through an edge or an employment.
- **No duplicated location truth.** Every resource reaches a site through
  `list_external_locations` via `resolveBoundarySites`, which is literally the same query
  `GET /api/v1/locations` answers. Authority can never exceed it, by construction.
- **No fake household authority.** The household is an anchor, never a grant.
- **No duplicated schedule truth.** One canonical resource, one explicitly derived projection.
- **Compatible lifecycle.** Every resource is soft-archived and exposes its own status.
- **One pagination rule.** The Thread 7 grammar — `(sort_key, id)` cursor, default 50 / max 200,
  `updated_since`, `sync_token` — everywhere except `/schedule-days`, which is a windowed
  projection and says so in its own contract.

**Known latent debt:** `resolveBoundarySites` calls `list_external_locations` with `p_limit: 200`
and does not page. The largest org here holds 10 locations, so it does not bite today, but an org
above 200 locations would silently truncate its own boundary. Recorded, not fixed in this run.

---

## 6. Event-requirement reassessment

Discovery classified five resources `EVENT_REQUIRED` **before the exact sync law existed**. With
`updated_since` + `sync_token` certified in 7.2, and with D-08's repair making the person-side
clock trustworthy, that classification is re-evaluated rather than inherited:

| Resource | Was | Now | Why |
|---|---|---|---|
| Children | EVENT_REQUIRED | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1** | `customer_members` is trigger-maintained; coalesce handles NULL |
| Households | EVENT_REQUIRED | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1** | same |
| Relationships | EVENT_REQUIRED | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1** | edge table is trigger-maintained |
| Enrollment | EVENT_REQUIRED | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1** | `DEFAULT now()` + trigger, 0 NULL |
| Placement | EVENT_REQUIRED | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1** | same |
| Schedule (assignments) | — | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1** | same |
| Schedule (days projection) | — | **N/A** | derived; no clock by design |
| Staff | — | **INCREMENTAL_SYNC_SUFFICIENT_FOR_V1**, *after* the D-08 repair | employment syncs; identity does not until the trigger lands |

**No resource in the Core Resource Expansion requires events.** Polling with `updated_since` is
sufficient for V1 across the entire proposed surface. Generic webhooks should therefore **not** be
built earlier than necessary; 7.8 stays where it is. The honest limit of polling — latency, and no
push for time-critical safety signals — is a product argument for events, not a correctness one,
and it does not gate this batch.

---

## 7. Proposed next batch — THREAD 7 CORE RESOURCE EXPANSION

Grouped by shared infrastructure, not endpoint count. Each group is independently certifiable and
one failure does not falsify the others.

**Group 0 — lifecycle clock repair (prerequisite for Group 3 identity only)**
Six `set_updated_at` triggers. No backfill, no new columns, no ledger. Ships first because it is
the only migration in the batch and the only item another group depends on.

**Group 1 — People reads** — `/children`, `/households`, `/relationships`
Shared: the child→enrollment-site boundary derivation, the three-scope split, the PII allow-list.
New scopes: `children.read`, `children.contact.read`, `relationships.read`, `households.read`.

**Group 2 — Service state reads** — `/enrollments`, `/placements`, `/schedule-assignments`, `/schedule-days`
Shared: `site_location_id` boundary applied in SQL, effective dating, supersession.
New scopes: `enrollment.read`, `schedule.read`.
Carries the mandatory `subject_type = 'child'` filter as a contract term.

**Group 3 — Staff** — `/staff`
Depends on Group 0 for identity sync correctness.
New scopes: `staff.read`, `staff.contact.read`.

Every resource independently carries: its own public contract, scope, boundary rule, live tests,
OpenAPI parity (enforced by the existing drift guard), documentation parity, and its own
certification status.

**Deliberately excluded from this batch:** events/webhooks (§6 — not required), financials,
portal convergence, any provider-specific work, and `authorized_pickup` (§2).

---

## 8. Director decisions that genuinely remain

Only two. Everything else in this document was determined by existing platform law or had one
clear engineering fit, and is resolved above rather than returned.

**DD-1 — Pickup authority.** Should Alloy publish an effective `pickup_authorized` answer that
applies safeguarding restrictions server-side without revealing them? Excluded from V1 either way.
This is a genuine product decision because it determines whether kiosk-style pickup verification is
possible through the public API at all, and because it is the one place where a partner-visible
field is derived from safeguarding data. *(Materially different contracts: publish an effective
boolean, or never publish pickup authority externally.)*

**DD-2 — Household scope shape.** `households.read` is proposed as its own scope. The alternative
is folding the household into `children.read` as a link plus a name, with no standalone collection.
Both are defensible: a separate scope is stricter, a folded one is simpler for the common
sibling-lookup case. *(Materially different contracts: a fourth people scope, or three.)*

Neither blocks starting the batch — Group 2 and Group 0 are unaffected, and Group 1 can begin with
`/children` and `/relationships` while DD-2 settles.
