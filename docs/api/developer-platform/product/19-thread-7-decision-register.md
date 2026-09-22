---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering, Director
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Decision register, Classroom Coach readiness, provider questions

**Canonical owner for: what a human still has to decide, and what we would need from a provider.**

---

## 1. Decision register (Phase 23)

Grouped by what each decision blocks. Evidence is from the implementation unless stated.

> **Updated 2026-09-22 — Core Resource decision resolution.** D-02, D-03, D-04, D-05, D-06, D-07,
> D-08 and D-11 are **resolved**; see `20-core-resource-decision-resolution.md` for the measured
> basis of each. Two of them reversed their discovery recommendation on evidence (D-05 and the
> mechanism behind D-08), and one safety hazard was found that no decision had named (pickup
> authority versus safeguarding restrictions). Only **DD-1** and **DD-2** remain open, both stated
> in §8 of that document. The rows below are kept as the historical question, not the answer.

### Blocks the first implementation slice

| ID | Question | Why it matters | Evidence | Options | Recommendation | Consequence | Owner |
|---|---|---|---|---|---|---|---|
| **D-01** | Is Attendance read the first slice? | It is the only proposed item with **no** platform-gap dependency, because append-only facts need no archive law | `child_attendance_events` append-only; `attendanceFold` handles correction/reversal | (a) Attendance read first (b) archive law first | **(a)** — it proves the read pattern and unblocks nothing else's decisions | Sets the template every later read copies | Director |
| ~~**D-08**~~ **RESOLVED** | What is the archive/delete law, and who makes `updated_at` move? | Representation is decidable from existing lifecycle truth. **Delivery is not**: `locations`, `customer_members` and `customers` have no trigger maintaining `updated_at`, and 9 of 10 sampled locations have it NULL | Measured in 7.2A; the only trigger on `locations` is a hierarchy validator | (a) add `BEFORE UPDATE` triggers to the three tables (b) have every writer set `updated_at` (c) a separate change feed | **(a)** — (b) is a rule nobody can enforce and (c) is the parallel ledger this law exists to avoid | A bounded migration on three shared domain tables. 7.2 deliberately did not make it: this phase was told not to change those domains | Director + domain |
| ~~D-09~~ | *Resolved in slice 7.3 — see Resolved below.* | | | | | | |

### Blocks later V1

| ID | Question | Why it matters | Evidence | Options | Recommendation | Consequence | Owner |
|---|---|---|---|---|---|---|---|
| ~~**D-02**~~ **RESOLVED — no public Person** | Is Person an external resource distinct from Child, Guardian and Staff? | Three proposed resources overlap one internal identity | `persons` is org-scoped identity; Child is `customer_members`; Staff is Person+Employment composition | (a) no public Person; expose Child/Guardian/Staff as distinct resources (b) a Person resource that the others reference | **(a)** for V1 — every use case names a role, and a bare Person resource would expose identity with no operational meaning | Determines whether Relationships embeds or references contact identity | Product + Director |
| ~~**D-03**~~ **RESOLVED — yes, thin anchor** | Does Household deserve a first-class resource? | It anchors siblings and financial responsibility | `customers` is a real row with a stable id; `readHouseholdScopes` exists | (a) yes (b) fold into Child as `household_id` only | **(a)** — siblings are a first-class integration concept | Adds one resource to 7.5 | Product |
| ~~**D-04**~~ **RESOLVED — Relationships resource** | How are guardians represented? | Duplicating a guardian onto Child creates a second model of one fact | `customer_member_contacts` + `_contact_roles` + relationship types | (a) Relationships resource (b) embedded array on Child (c) both | **(a)**, with a reference from Child | PII lands in one resource with its own scope | Product |
| ~~**D-05**~~ **RESOLVED — (c) both; discovery's (a) reversed** | Does the external schedule resource expose the committed assignment, the derived expectation view, or both? | They are different objects with different sync properties — the commitment is persisted and synchronizable, the expectation view is derived and is not | `schedule_assignments` is effective-dated and committed; `scheduleExpectationCore.ts` derives expectations from it plus configuration | (a) dated expectation projection only (b) committed assignments as a synced collection only (c) both | **(a) for V1** — a partner wants "which days is this child expected", and (b) can be added later without changing (a) | Determines whether Schedule joins `updated_since` at all | Domain + Director |
| ~~**D-06**~~ **RESOLVED — invisible, in every boundary mode** | What does a location-restricted installation see for a child with no current placement? | Every people resource needs a boundary rule, and this is the gap in it | Boundary is location-based; placement is the child↔location join | (a) invisible (b) visible to org-wide installations only (c) visible with reduced fields | **(a)** — fail closed, and document it | Affects Children, Enrollment, Relationships | Director (security) |
| ~~**D-07**~~ **RESOLVED — primary location must be in boundary** | How does the boundary apply to org-scoped employment? | Employment is organization-scoped; the boundary is location-scoped | `buildPersonEmploymentComposition` composes onto Person; primary location narrows | (a) staff visible if assigned to a location in the boundary (b) all staff to any installation | **(a)** | Determines the Staff query shape | Domain |
| **D-10** | What is the event/webhook threshold and envelope? | Five resources classify `EVENT_REQUIRED`; V1 is incomplete without delivery | `workflow_events` is not exposable; no public vocabulary exists | (a) build the platform in V1 (b) ship reads first, events as 7.8 (c) no events in V1 | **(b)** — reads are useful alone; events are a separate product surface with real delivery cost | Determines whether V1 is "complete" without push | Director |
| ~~**D-11**~~ **RESOLVED — three scopes** | Is `children.read` too coarse? | It would bundle identity, contact detail, guardians and placement under one grant | No precedent yet — only three scopes exist | (a) split identity vs contact/PII (b) one scope per resource | **(a)** — least privilege matters most where child and guardian data meet | Adds scopes in 7.5 | Director (security) |

### Does not block implementation

| ID | Question | Recommendation |
|---|---|---|
| **D-12** | What is the external projection of "what is owed"? | Defer with Financials. Charge + responsibility split + balance view is the natural shape; nobody has designed it |
| **D-13** | Does Communications ever become external? | Not in V1. Revisit only if an integration itself causes messages and needs delivery state |
| **D-14** | Does Attendance read need a new `attendance.read` scope? | Probably yes — `attendance.write` must not imply read. Decide in 7.1 |
| **D-15** | Which `integration_resource_refs` kinds are added, and when? | Add a kind with the resource that needs it; `child` and `location` cover V1's first operation |

### Resolved during discovery

| ID | Question | Resolution |
|---|---|---|
| R-01 | Separate `/rooms` resource? | **No.** Locations already publishes `type: unit` with `unit_role` |
| R-02 | Does Attendance need domain work before externalization? | **No.** Ingestion, authority, mapping, replay identity, provenance and corrections all exist; the gap is the route |
| R-03 | Does external correlation infrastructure exist? | **Yes** — `integration_resource_refs`, with relink, orphan and ambiguity semantics already decided |
| R-04 | Is Staff an entity? | **No.** Person + Employment composition; the code says so explicitly |
| R-05 | Is Balance a resource? | **No.** A projection with one owner (`accountChargeLedger`) |
| R-06 | Is external payment submission appropriate? | **No.** Money is recognised from a provider-confirmed collection |
| R-07 | Is the collection grammar reusable? | **Yes** — written resource-agnostic from the start |
| R-08 (D-14) | Does the Attendance read need its own scope? | **Yes — `attendance.read`, shipped in 7.1.** The catalog forbids hierarchy by construction, so a write grant cannot satisfy a read |
| R-09 (D-09) | Who originates the public idempotency identity? | **Derived from the fact, not supplied by the caller.** Alloy already does this four times independently — attendance ingestion (`producerKey:externalEventId`), payments (*"Derived, stable, and never a delivery id"*), parent intent, tours. The public law follows the doctrine; an `Idempotency-Key` header is the fallback for an operation with no natural fact identity, and no proposed V1 operation lacks one. **This corrects the discovery recommendation of "header wins"**, which was a guess made before the four precedents were measured |
| R-10 | Does V1 need a generic idempotency store? | **No.** The mechanism exists in the domains that write. A primitive whose only consumer is a speculative future operation is how a platform acquires two answers to one question |
| R-11 (part of D-05) | Are schedules persisted? | **Partly — the earlier statement was too broad.** Committed schedule authority IS persisted and effective-dated (`schedule_assignments`). What is derived is the dated *expectation* view, which is the externally useful one and which therefore has no `updated_at` to synchronize on |

---

## 2. Classroom Coach readiness threshold (Phase 21)

Judged on what **Alloy** needs to present a coherent childcare operational model — not on
assumptions about the provider.

| Alloy contract | Needed before the conversation? | Reason |
|---|---|---|
| Locations / units | **Yes — already shipped** | Sites and rooms are the frame every other concept hangs on |
| Children | **Yes** | Without it a provider cannot map its central record |
| Relationships / guardians | **Yes** | Pickup authority is operationally load-bearing in childcare |
| Enrollment / placement | **Yes** | "Where is this child, and from when" is the operational join |
| Schedules | **Yes** | Attendance is uninterpretable without expectation |
| Attendance read + submit | **Yes** | The most likely bidirectional surface |
| Staff | **Desirable, not required** | Useful for ratio; the integration conversation stands without it |
| Financials | **No** | Generic platform roadmap; outside a likely operations integration and not designed |
| Events/webhooks | **No, if the posture is stated** | A partner can design against polling and adopt events later — provided the package says so plainly |

**Threshold: after slice 7.6.** At that point a provider can map every operational concept to a real
Alloy contract and design their sync without guessing. Sending earlier means sending a specification
whose people model is still a proposal.

**Would the proposed plan meet it?** Yes — 7.1 through 7.6 produce exactly the contracts above.
Staff (7.7) and events (7.8) can follow the conversation rather than precede it.

### Revision — 2026-09-22, after the Core Resource decision resolution

**The threshold moves EARLIER, and acquires one caveat it did not have before.**

Earlier, because the proposed Core Resource Expansion batch delivers the whole people, service-state
and staff family together rather than as three sequential slices. On completion of that one batch,
every row in the table above reads *shipped* — Staff included, which the table only ever rated
*desirable*. There is no longer a 7.5 → 7.6 → 7.7 sequence to wait through.

The caveat is load-bearing and must be stated in the package rather than discovered by a reader:

> **Pickup authority is not exposed in V1.** The table above says pickup authority is
> "operationally load-bearing in childcare", and that remains true. It is withheld because
> `authorized_pickup` lives on the relationship roles while `may_not_pick_up` lives on
> safeguarding restrictions — two active ones exist today — so publishing the role alone would
> assert that someone may collect a child while a protective order says otherwise. Alloy will
> publish guardian relationships, not collection authority, until **DD-1** is decided.

**Consequence for the offline technical package:** it can be prepared one batch after Attendance
operations instead of three slices later, and it must say plainly (a) that sync is polling-based by
design with events deferred, and (b) that pickup verification is out of scope for V1. A package
that implies either capability would be wrong in the direction that matters most.

**What still requires provider-specific information** is unchanged and unaffected by these
decisions: the provider's own record identifiers, its sync cadence and direction, and whether it
expects push delivery. None of that is an Alloy contract question.

---

## 3. Classroom Coach mapping worksheet (Phase 13)

Provider-neutral. The Alloy side is populated from implementation; the provider side is **not
guessed**.

| Alloy concept | Alloy external contract | Provider concept | Direction | Authority | Provider evidence required |
|---|---|---|---|---|---|
| Site | `GET /api/v1/locations` (`type=site`) — **implemented** | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Location | Does the provider model centers, and with what id? |
| Room / operational group | same, `type=unit` + `unit_role` — **implemented** | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Location | Rooms vs groups vs both? Stable ids? |
| Child | `PROPOSED_V1` Children | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Records | Provider's child identity and whether it can store an Alloy id |
| Guardian / responsible adult | `PROPOSED_V1` Relationships | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Records | Does the provider model pickup authority? |
| Staff | `PROPOSED_V1` Staff | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Employment | Does the provider need staff, or only children? |
| Enrollment | `PROPOSED_V1` Enrollment | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Enrollment | Does the provider gate on enrollment state? |
| Placement | `PROPOSED_V1` Placements | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Childcare Operational | How does the provider represent room assignment over time? |
| Schedule | `PROPOSED_V1` schedule projection | UNKNOWN — PROVIDER EVIDENCE REQUIRED | Alloy → provider | Operational Expectations | Does the provider hold expected days? |
| Attendance fact | `PROPOSED_V1` Attendance read | UNKNOWN — PROVIDER EVIDENCE REQUIRED | both | Attendance | Does the provider expose events, and with what stable id? |
| Attendance submission | `PROPOSED_V1` submit/correct | UNKNOWN — PROVIDER EVIDENCE REQUIRED | provider → Alloy | Attendance | Check-in/out semantics, timezone, corrections, replay ids |
| External correlation | `integration_resource_refs` (internal today) | UNKNOWN — PROVIDER EVIDENCE REQUIRED | both | Platform | Can the provider store an Alloy id per record? |
| Communications | not external in V1 | n/a | n/a | Communications | none |

**Nothing in this table asserts that Classroom Coach supports anything.** Every provider column is
explicitly unknown.

---

## 4. Provider discovery questions

1. What is your stable identifier for a child, and can you store an Alloy identifier alongside it?
2. Do you model centers and rooms separately, and what are their identifiers?
3. Do you emit attendance events, and does each carry a stable id that survives replay?
4. What are your check-in/check-out semantics — timestamps, timezone, and who recorded them?
5. How do you represent a correction to an event you already sent?
6. Do you need enrollment or placement state, or only attendance?
7. Do you need guardian/pickup authority?
8. Do you need staff records?
9. Can you consume a polling/incremental synchronization model, or do you require push delivery?
10. What happens in your system when a child leaves — is the record archived, deleted, or retained?

---

## 5. What was verified, and what remains assumed

**Verified from implementation this run:** Location topology and `unit_role`; attendance read
projections, fold/correction/reversal semantics, ingestion contract, dispositions, producer
authority and the principal adapter; `integration_resource_refs` kinds, scoping, uniqueness,
relink, orphan and ambiguity behaviour; child membership authority and eligibility; household and
relationship tables; employment composition and the absence of a Staff entity; placement effective
dating; schedule derivation; financial command set, responsibility arrangements, balance ownership
and provider-confirmed payment posting; communications module scale; event table inventory;
collection grammar, error types, rate limit policies and the public scope catalog.

**Assumed, not verified:** that no partner has stated a Financials requirement (absence of evidence);
that 7 days is a reasonable idempotency retention (proposal, to be decided with 7.3); that a write
rate budget lower than reads is correct (proposal). Each is flagged where it appears.
