---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — External resource contract matrix

**Canonical owner for: what Alloy's canonical domains are, and which of them should become public
external contracts.** Platform-wide laws live in `17-cross-resource-platform-gaps.md`; the proposed
surface and plan live in `18-thread-7-v1-surface-and-plan.md`; open decisions live in
`19-thread-7-decision-register.md`.

Every claim was read from the implementation on the Thread 7 lineage (`origin/staging` a78f1e3f7
merged with the accepted product-repair candidate). Where the Thread 3 inventory disagrees with the
code, the code wins and the correction is recorded.

---

## 1. Corrections to inherited assumptions

| Inherited claim | Current evidence | Correction |
|---|---|---|
| Rooms/classrooms need a `/rooms` resource | `locationResource.ts` publishes `type: site \| unit` with `unit_role: physical_space \| operational_group \| shared_space`; DB constraints `locations_unit_role_check` and `locations_unit_role_only_on_unit` | **Already external.** One resource model. Do not add `/rooms` |
| Attendance externalization is a domain build | `ingestExternalAttendance.ts`, `attendanceIngestAuthor.ts`, `attendanceAuthorityAdapter.ts`, `attendancePermissions.assertNonHumanCaptureAllowed`, `attendanceFold.ts` all present | **Domain is built.** Missing piece is an `/api/v1` seam, not Attendance infrastructure |
| `integration_resource_refs` is absent (Thread 3) | migration `20260911150000_integration_resource_refs.sql` + `lib/platform/external/integrationResourceRefs.ts` | **Exists**, with richer semantics than assumed (below) |
| Staff is an entity | `buildPersonEmploymentComposition.ts`: *"There is no Staff entity, no Staff drawer and no Staff view model"* | **Staff is Person + Employment composition** |
| Schedules are stored | `scheduleExpectationCore.ts` derives EXPECTATIONS; committed schedule authority is the effective-dated `schedule_assignments` | **Corrected.** Committed schedules ARE persisted. What is derived is the externally useful *dated expectation view*, which therefore has no `updated_at` of its own to synchronize on |
| Thread 3 inventory is current | It lists Installation, Credential and their UI as absent; all shipped in Thread 5 | **Stale.** Use for structure, verify for state |

### `integration_resource_refs`, precisely

| Question | Answer (measured) |
|---|---|
| Supported resource kinds | `child` (→ `customer_members`) and `location` only |
| Installation scoping | Scoped by `installation_id` **and** `org_id`; a mismatch resolves to nothing |
| Uniqueness (alias side) | `uq_resource_ref_external` — one active external id per (installation, resource_type) |
| Uniqueness (Alloy side) | `uq_resource_ref_child_target` / `_location_target` — one active alias per Alloy resource per installation |
| Relink | A deliberate transition: previous row becomes `disabled` (never deleted — a live mapping is part of how an authored fact came to name what it names) |
| Orphan/reinstall | `orphaned` status retained so a reinstall reconciles instead of silently duplicating |
| Resolution behaviour | Unmapped → `not_mapped`; two active rows → `ambiguous` **refused**, never "pick the first" |
| Public access today | **None.** No route reads or writes it |
| Legacy | `attendance_integration_mappings` is marked SUPERSEDED, read-only bridge, no dual write |

---

## 2. Canonical authority map (Phase 1)

| External concept | Canonical Alloy concept | Runtime/module owner | Persistence | Stable id | Org ownership | Location relationship | Existing read authority | Existing mutation authority | External adapter today |
|---|---|---|---|---|---|---|---|---|---|
| Context | Installation's own description | `app/api/v1/context` | derived | installation id | installation | boundary summary | **public** | n/a | **yes** |
| Location (site) | Location | `locationResource.ts` | `locations` | `locations.id` | `org_id` | is the boundary | `list_external_locations` | operator only | **yes** |
| Location (unit/room) | Location, `unit_role` | same | same | same | same | child of site | same | operator only | **yes** |
| Organization | Org | — | `orgs` | `orgs.id` | self | — | internal | internal | no |
| Person | Person identity | `lib/persons`, `lib/employment` | `persons` | `persons.id` | org-scoped | via membership/employment | internal composition | `findOrCreatePersonInOrg` | no |
| Child | Household member with `relationship = 'child'` | `lib/records/childMemberAuthority.ts` | `customer_members` | `customer_members.id` | via household | via placement | internal | `childMemberAuthority` (+2 unrouted bounded contexts) | **partly** — `integration_resource_refs.child` |
| Household | Customer | `lib/financials/.../readHouseholdScopes.ts`, records | `customers` | `customers.id` | `org_id` | none directly | internal | internal | no |
| Relationship / guardian | Member contacts + role types | `lib/records`, relationship runtime | `customer_member_contacts`, `customer_member_contact_roles`, `customer_member_relationship_types`, `customer_person_role_types` | row ids | via household | none | internal | relationship runtime | no |
| Staff | Person + Employment composition | `buildPersonEmploymentComposition.ts` | `employments`, `employment_positions` | `employments.id` | `org_id` | primary location narrows | internal composition | employment authority | no |
| Enrollment | Enrollment agreement | `enrollmentAgreementService`, `effectiveDateAuthority` | `child_enrollment_agreements` | agreement id | `org_id` | via placement | internal | operator/process | no |
| Placement | Child placement, effective-dated | `childPlacementService.ts` | `child_placements` | placement id | `org_id` | room unit under site | internal | supersede-by-new-row | no |
| Schedule | Derived expectation (L3) | `scheduleExpectationCore.ts`, `buildScheduleExpectations.ts` | **not persisted** | n/a | derived | derived | pure derivation | none (derived) | no |
| Attendance fact | Append-only attendance event | `attendanceService.ts`, `attendanceFold.ts` | `child_attendance_events` | event id | `org_id` | room/site on event | `childAttendanceReadModel` (per child), `fetchActualComplianceReadModel` (per site) | `recordAttendanceEvent`, `correctAttendanceEvent` | **ingestion built, no route** |
| Attendance state | Folded presence state | `attendanceFold.ts`, `childAttendanceReadModel.ts` | derived | n/a | derived | derived | pure projection | n/a | no |
| Charge / obligation | Charge | `childcareChargeService`, `chargeLifecycle`, `accountChargeLedger` | `charges`, `charge_line_items` | `charges.id` | `org_id` | none | `accountChargeLedger` | `charge.post`, `charge.reverse` | no |
| Responsibility arrangement | Who owes, effective-dated | `responsibility/arrangementService.ts` | `financial_responsibility_arrangements`, `_allocations`, `_shares` | arrangement id | `org_id` | none | `readAccountArrangement` | `billing.configure_responsibility`, `billing.resolve_responsibility`, `billing.reallocate_responsibility` | no |
| Balance | **Derived projection** | `accountChargeLedger.reconcileRows`/`pastDueFor` | derived | n/a | derived | none | one owner | n/a | no |
| Payment | Provider-confirmed collection | `payments/canonicalPosting.ts` | `payment_allocations`, `payment_collection_attempts`, `payment_provider_events` | payment id | `org_id` | none | `paymentApplicationView` | `payment.apply`, `payment.reverse_application` | no |
| Funding / subsidy | Subsidy programs, authorizations, claims | `financials/responsibility/expectedFundingService.ts` | `financial_subsidy_*` (9 tables), `financial_expected_funding` | row ids | `org_id` | none | internal | internal | no |
| Communications | Threads, messages, channels, delivery | `lib/communications` (180 files) | many | row ids | `org_id` | binding-scoped | internal | send/enqueue authority | no |
| Change feed | Domain facts | `emitEvent.ts` (`workflow_events`), domain event tables | `workflow_events` + per-domain | event id | `org_id` | varies | internal | internal | no |

**Competing internal representations found (do not resolve by serialization convenience):**

- **Child** has one *operator* authority (`childMemberAuthority`) but two other bounded contexts
  still create members — public form intake apply, and the frozen Processing commit. Read-only
  externalization is unaffected; an external *create* would inherit the fragmentation.
- **Attendance legacy producers**: `attendance_integration_mappings` superseded by
  `integration_resource_refs`, retained read-only. External correlation must use the new table only.

---

## 3. The contract matrix (Phase 2)

Classifications: `V1_READ_RESOURCE` · `V1_GOVERNED_OPERATION` · `EVENT_REQUIRED` ·
`INCREMENTAL_SYNC_SUFFICIENT` · `LATER` · `INTERNAL_ONLY` · `UNRESOLVED`.

| External concept | Canonical concept | Owner | Stable id | External use case | V1 read | V1 operation | Event | Sync | Tenant boundary | Location boundary | Existing read authority | Existing mutation authority | External adapter | External ID need | Archive/delete | Main blocker | Proposed V1 disposition | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Context | installation description | platform | installation id | "what am I allowed to do" | **IMPLEMENTED** | n/a | no | n/a | installation | reports boundary | yes | n/a | yes | no | n/a | none | keep | High |
| Locations (sites + units) | Location | Location | `locations.id` | topology every integration needs | **IMPLEMENTED** | no | INCREMENTAL_SYNC_SUFFICIENT | yes | org | is the boundary | yes | operator only | yes | alias supported | **gap — no disappearance signal** | archive law | keep + fix archive | High |
| Organizations | Org | — | `orgs.id` | — | INTERNAL_ONLY | INTERNAL_ONLY | no | n/a | self | n/a | internal | internal | no | no | n/a | an installation has exactly one org; a collection implies cross-tenant reach that does not exist | context already answers it | High |
| Children | `customer_members` where relationship = child | Records | `customer_members.id` | the subject of nearly every integration | **V1_READ_RESOURCE** | no | **EVENT_REQUIRED** | needs archive law | org via household | via placement | none external | `childMemberAuthority` | alias exists | **required** | **must express withdrawal** | no external read authority; no field allow-list; archive law | build read resource | High |
| Persons | `persons` | Identity | `persons.id` | resolving adults behind relationships | **UNRESOLVED** | no | desirable | yes | org | via employment/membership | none external | find-or-create | no | required if exposed | same as children | is Person externally distinct from Child and Guardian, or a shared identity? | decide before building | Medium |
| Households | `customers` | Records/Financials | `customers.id` | grouping siblings; billing anchor | **V1_READ_RESOURCE** | no | desirable | yes | org | none | `readHouseholdScopes` (financial) | internal | no | required | needed | field allow-list; `customer_payment_methods` must never ride along | build read resource | Medium |
| Relationships / guardians | member contacts + role types | Records | row ids | pickup authority, consent, contact | **V1_READ_RESOURCE** | no | **EVENT_REQUIRED** | yes | org via household | none | none external | relationship runtime | no | required | needed | PII granularity; safeguarding adjacency | build, with its own scope | Medium |
| Staff | Person + Employment | Employment | `employments.id` | ratio, roster, who is on site | **V1_READ_RESOURCE** | no | desirable | yes | org | primary location narrows | composition module | employment authority | no | required | needed | boundary semantics for org-scoped employment | build read resource | Medium |
| Enrollment | enrollment agreement | Enrollment | agreement id | "is this child enrolled, where, when" | **V1_READ_RESOURCE** | no | **EVENT_REQUIRED** | yes | org | via placement | internal | operator/process | no | required | **must express withdrawal** | no external projection; Business Process internals must stay hidden | build read resource | Medium |
| Placement | `child_placements`, effective-dated | Childcare Operational | placement id | which room, from when | **V1_READ_RESOURCE** | no | **EVENT_REQUIRED** | yes | org | room unit under site | `childPlacementService` | supersede-by-row | no | required | supersede is already modelled | external effective-dating shape | build read resource | High |
| Schedules (expectation view) | derived expectation over committed `schedule_assignments` | Operational Expectations | none for the view; `schedule_assignments.id` underneath | expected days, to interpret attendance | **V1_READ_RESOURCE (as dated projection)** | no | INCREMENTAL_SYNC_SUFFICIENT | **no — the VIEW is derived and has no `updated_at`; the committed assignment underneath does** | org | via placement | pure derivation | n/a | no | no | n/a | **derived data has no change timestamp**; sync model must be date-window, not `updated_since` | expose as a dated projection, not a synced collection | High |
| Attendance facts | `child_attendance_events` | Attendance | event id | reconciling presence | **V1_READ_RESOURCE** | — | **EVENT_REQUIRED** | append-only, sync natural | org | room/site on event | per-child + per-site only | `recordAttendanceEvent` | ingestion built | alias exists | reversal = tombstone, already modelled | no org+boundary collection read | build read resource | High |
| Attendance state | folded presence | Attendance | n/a | "who is here now" | **V1_READ_RESOURCE (projection)** | — | EVENT_REQUIRED | derived | org | site | `attendanceFold` | n/a | no | no | n/a | projection is per-child today | expose as a projection | High |
| Attendance submission | governed event | Attendance | n/a | partner authors presence | — | **V1_GOVERNED_OPERATION** | n/a | n/a | installation | `allowedSiteLocationIds` | n/a | `ingestExternalAttendanceEvent` | **built** | **required** | correction + reversal built | route + public idempotency contract | **first operation** | High |
| Attendance correction | governed correction | Attendance | n/a | partner corrects its own fact | — | **V1_GOVERNED_OPERATION** | n/a | n/a | installation | same | n/a | `correctAttendanceEvent`, `correctionMode` | built | required | built | same route | **with submission** | High |
| Charges / obligations | `charges` | Financials | `charges.id` | what a family owes | **LATER** | no | desirable | yes | org | none | `accountChargeLedger` | `charge.post`/`reverse` | no | required | reversal modelled | no external projection; responsibility split is the real question | Later | Medium |
| Balance | derived | Financials | n/a | amount outstanding | **LATER (derived view)** | n/a | no | derived | org | none | one owner exists | n/a | no | no | n/a | must be a view on charges, never a stored resource | Later | High |
| Payments | provider-confirmed collection | Financials | payment id | reconciliation | **LATER** | **INTERNAL_ONLY for submission** | desirable | yes | org | none | `paymentApplicationView` | `payment.apply` | no | required | reversal modelled | money is recognised from a **provider-confirmed** event; an external submit would invent money | read Later, submit never (V1) | High |
| Funding / subsidy | `financial_subsidy_*` | Financials | row ids | agency reconciliation | **LATER** | no | no | yes | org | none | internal | internal | no | required | unclear | jurisdictional; 9 tables; no partner demand evidenced | Later | Medium |
| Communications | threads/messages/channels | Communications | row ids | messaging families | **INTERNAL_ONLY (V1)** | INTERNAL_ONLY | no | n/a | org | binding-scoped | internal | send authority | no | n/a | n/a | consent, sender identity and deliverability are Alloy's obligations, not a partner's | exclude from V1 | High |
| Events / webhooks | change delivery | platform (none yet) | n/a | reacting to change | n/a | n/a | **EVENT_REQUIRED by 5 resources** | n/a | installation | per subscription | `workflow_events` (not exposable) | n/a | no | n/a | n/a | no public event vocabulary, no delivery platform | platform slice | High |

---

## 4. Domain deep dives

### 4.1 Attendance (Phase 6)

**Read authority — what exists.** `child_attendance_events` is append-only.
`attendanceFold.ts` folds it into effective facts: a correction supersedes its target via
`corrects_event_id`, **a reversal is a tombstone that voids its target and contributes nothing**,
and a non-superseded original or correction is effective. `childAttendanceReadModel.ts` projects one
child's facts plus expectations into `CurrentPresenceState` (`present | checked_out | absent |
no_record`), variance against expected, absence-reason classification and whereabouts.
`fetchActualComplianceReadModel.ts` is DB-backed and **site-scoped** (`siteLocationId`).

**Write authority — what exists.** `ingestExternalAttendanceEvent` takes a
`NormalizedExternalAttendanceEvent` — the provider's own `externalEventId` (the dedupe key),
`externalChildId`, optional site/room ids, `physicalEventAt` vs `providerRecordedAt`,
`correctsExternalEventId` and `correctionMode: correction | reversal`, and `raw` kept as evidence
and **never consulted for authority**. Dispositions are `applied | duplicate | unmapped |
conflicted | rejected`, the same vocabulary `payment_provider_events` uses. The author must be
proven by the caller: ingestion no longer accepts a credential, because Attendance owning an
authority the Developer Platform also owned was G-14. `attendanceAuthorityAdapter.ts` converts an
`ApplicationPrincipal` into a `NonHumanProducerAuthority` one-way and grants nothing extra;
`assertNonHumanCaptureAllowed` denies an unregistered producer, a producer without
`ATTENDANCE_RECORD_PERMISSION_KEY`, and any site outside `allowedSiteLocationIds` (empty denies
everything).

**Missing external seams — exactly three.**

1. **No `/api/v1` route** for either direction. `app/api/v1/` contains `oauth`, `context`,
   `locations` and nothing else.
2. **No org+boundary-scoped collection read.** Both projections are per-child or per-site; nothing
   plays the role `list_external_locations` plays for topology.
3. **No public idempotency contract.** Attendance has replay identity internally; the platform has
   no `Idempotency-Key` law, and a second writable domain must not invent a second scheme.

**Recommended shape.** Expose **both** facts and state — they answer different questions and both
projections already exist. Submission should accept a **batch** (a provider's device syncs a day,
not an event), with per-item disposition echoing the internal vocabulary. Corrections should be
expressed as submission with `corrects` + mode, not as `PATCH`.

### 4.2 People (Phase 7)

- **Child is not Person.** A child is `customer_members` with `relationship = 'child'`, and
  `childMemberEligibility.ts` exists precisely because a foreign key proves a row exists and not
  that it is a child — an external producer mapping its id to an adult household member would
  otherwise author "a child was present" from an adult's movement. **Child stays a distinct
  external resource.**
- **Household deserves a resource.** It is the anchor for siblings and for financial responsibility,
  and `customers` is one row with a stable id. Its adjacent `customer_payment_methods` must be
  excluded by allow-list.
- **Guardians are relationships, not fields on Child.** `customer_member_contacts` +
  `customer_member_contact_roles` carry role and contact; duplicating a guardian onto Child would
  create a second model of the same fact.
- **Person is UNRESOLVED.** It is real (`persons`, org-scoped, matched email-then-phone) but its
  external meaning overlaps Guardian and Staff. Decide before building — see D-02.
- **Staff is a composition**, not an entity. External Staff = Person fields + current employment
  (capacity, where, since when), with `source_key`, `supersedes_employment_id` and audit columns
  deliberately absent — the composition module already draws that line.
- **Visibility.** A restricted installation should see people **through the boundary**: children via
  current placement, staff via assignment. A child with no placement is outside every restricted
  boundary, which must be an explicit decision rather than a default (D-06).
- **PII.** Contact details, safeguarding (`child_safeguarding_*`) and payment methods are the three
  things that must never ride along on a general read.

### 4.3 Enrollment / Placement / Schedule (Phase 8)

Canonical dates are already distinguished and must not be collapsed: **Requested Start** (family
preference), **Enrollment Date** (paperwork completion fact), **Start Date** (effective date of the
first committed operational assignment).

- **Enrollment agreement** is the record of service commitment.
- **Placement** (`child_placements`) is effective-dated with supersede semantics — a change closes
  the prior row the day before the successor starts. That is already the right external shape.
- **Schedule: the distinction that the first draft of this document flattened.** Committed schedule
  authority is persisted and effective-dated (`schedule_assignments`); it is not derived. What IS
  derived is the *expectation* view — "which days is this child expected on, between these dates" —
  computed by `scheduleExpectationCore.ts` from committed truth plus configuration, and never stored
  as system-of-record. The externally useful resource is that dated expectation view, and because it
  is derived it carries no `updated_at` and cannot join `updated_since` synchronization. Expose it as
  a **dated projection**; if a partner later needs change notification on the underlying commitment,
  that is a read of `schedule_assignments`, which is synchronizable.
- **Business Process internals stay hidden.** Stage keys, work views and process state are Alloy's
  workflow machinery; the external contract communicates enrolled/where/when, not how Alloy got
  there.

### 4.4 Financials (Phase 10)

Evaluated on platform value, not on Classroom Coach relevance.

- **Charge vs Obligation.** A charge *is* the obligation at charge grain. The account-grain question
  — who is responsible — is a **responsibility arrangement**: effective-dated, never edited,
  superseded by closing the predecessor, with the database refusing overlapping active windows.
  `billing.resolve_responsibility` then divides one eligible obligation under the arrangement in
  force. Any external model that flattens these into "charge has a payer" loses the distinction.
- **Balance is a projection, not a resource.** `accountChargeLedger` is explicitly the one owner of
  `reconcileRows` and `pastDueFor`, created because the arithmetic had an owner and its input did
  not. Externalizing balance as a stored resource would recreate exactly the two-answers problem it
  was built to end.
- **Payments are provider-confirmed.** `canonicalPosting.ts` recognises a provider-confirmed
  collection as canonical money **at most once**, comparing what the provider says it took.
  External payment *submission* in V1 would mean an API caller asserting money moved.
  **INTERNAL_ONLY for V1.**
- **Reversals exist** for both charges and payment applications — the external contract would be
  reversal, never delete.
- **Maturity.** Commands are registered and real: `charge.post`, `charge.reverse`,
  `billing.adjust_account`, `billing.reverse_adjustment`, `payment.apply`,
  `payment.reverse_application`, `billing.configure_responsibility`,
  `billing.resolve_responsibility`, `billing.reallocate_responsibility`. The gap is not maturity —
  it is that **no external projection of "what is owed" has been designed**, and subsidy adds nine
  tables of jurisdictional complexity.

**Verdict:** Financials is deferred on *evidence*, not on Classroom Coach. Charges + responsibility
+ balance is the natural first financial slice when it comes, and payment submission should stay
internal until there is a reason stronger than symmetry.

### 4.5 Communications (Phase 11)

Alloy owns sender identity, channel bindings, consent and deliverability. A public send operation
would let a partner emit messages under the organization's identity while Alloy retains the
reputation and consent obligations, and inbound exposure carries family message content.
`send_message` is a `current` operational intent, so the *capability* is mature — the objection is
not maturity, it is that externalizing it moves an obligation Alloy cannot delegate.

**Communications is INTERNAL_ONLY for V1.** Delivery *state* for messages an integration itself
caused is the only plausible later exception, and no V1 integration causes messages.

### 4.6 Events (Phase 12)

`workflow_events` is the strongest general internal stream — `org_id`, `event_type`, `entity_type`,
`entity_id`, `occurred_at`, `payload` — and it is **not exposable**: the event vocabulary is
internal, the payload is uncontracted, and subscribers would couple to Alloy's workflow
implementation. `mutation_events` is access history. Domain streams (`child_attendance_events`,
`communication_delivery_events`, `payment_provider_events`, `staff_presence_events`) are real but
per-domain.

A public event platform therefore needs its own vocabulary mapped **from** domain facts, plus
envelope, installation scoping, sequence/replay, signatures, retry, dead-letter, endpoint lifecycle,
retention, and bootstrap-plus-events convergence. **That is a platform slice, and its cost must not
be hidden inside a resource slice.**

---

## 5. Security and privacy review of the proposed surface (Phase 22)

| Concern | Finding | Required action |
|---|---|---|
| Tenant isolation | Boundary applied **in SQL** by `list_external_locations`; cursor carries no authority | Every new read resource must follow the same shape — no TypeScript-side filtering |
| Location boundary | Real for Locations and Attendance (`allowedSiteLocationIds`) | People/Enrollment need an explicit rule; a child with no placement is the hard case (D-06) |
| Child data | `child_safeguarding_screenings`, `child_safeguarding_restrictions` adjacent to Child | **Never external.** Enforce by allow-list, not omission |
| Guardian/contact PII | Contact details are the point of the resource and also the sensitive part | Separate scope from `children.read`; see below |
| Staff data | Compensation (`employment_compensation_terms`) adjacent to employment | Excluded by allow-list; composition module already excludes audit/source fields |
| Financial data | Payment methods adjacent to household | Excluded by allow-list |
| Scope granularity | **`children.read` is too coarse** — it would bundle identity, contacts, guardians and placement | Split: identity vs contact/guardian detail. Recorded as D-11 |
| Single-resource bypass | A `GET /{id}` that omits the boundary would widen authority the collection narrows | Law: single reads apply the identical predicate; `not_found` rather than `forbidden` for out-of-boundary ids |
| Error disclosure | Distinguishing "exists but forbidden" from "does not exist" leaks existence | Out-of-boundary must answer `not_found` |
| Filter widening | A filter is a narrowing device only | Law: filters may never introduce rows the unfiltered query would not return |
| External-ID leakage | Aliases are installation-scoped | Never return another installation's alias |
| Audit | `app_security_audit` exists for the trust boundary | Governed operations must write audit evidence, as attendance ingestion already does |

---

## 6. Documentation / implementation truth register (Phase 24)

| Concept | State |
|---|---|
| Token exchange, Context, Locations (sites + units) | `IMPLEMENTED_EXTERNAL` |
| Developer Application, Installation, Credential lifecycle, Application Principal, scopes, boundaries, API Activity, rate limiting, audit, public OpenAPI, collection grammar | `IMPLEMENTED_EXTERNAL` (platform) |
| External attendance ingestion (producer authority, mapping, inbox, replay identity, provenance, corrections) | `IMPLEMENTED_INTERNAL_FOUNDATION` |
| `integration_resource_refs` (child, location) | `IMPLEMENTED_INTERNAL_FOUNDATION` — no public contract |
| Attendance read projections (per child, per site) | `IMPLEMENTED_INTERNAL_FOUNDATION` |
| Children, Households, Relationships, Staff, Enrollment, Placement, Schedule projection | `PROPOSED_V1` |
| Attendance public read + governed submission/correction | `PROPOSED_V1` |
| Exact incremental sync (`sync_token`, full-precision `updated_since`) | `IMPLEMENTED_EXTERNAL` — slice 7.2, on Locations and Attendance |
| Public write law: idempotency doctrine, `idempotency_conflict` error, `authenticatedWrite` budget | `IMPLEMENTED_EXTERNAL` — slice 7.3 (law and primitives; no mutation endpoint yet) |
| Archive/delete law | `RATIFIED_NOT_IMPLEMENTED` — representation decided; delivery blocked on `updated_at` maintenance (see gap register 5A) |
| Events / webhooks | `PROPOSED_V1` platform slice — nothing implemented |
| Charges, responsibility, balance, payments read, funding/subsidy | `LATER` |
| External payment submission | `INTERNAL_ONLY` |
| Communications | `INTERNAL_ONLY` (V1) |
| Person as a distinct external resource | `UNRESOLVED` |
| Classroom Coach's own capabilities | `PROVIDER_DEPENDENT` |
