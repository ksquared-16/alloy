---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Proposed V1 public surface, readiness, dependencies and plan

**Canonical owner for: what Thread 7 proposes to build, in what order, and how it reaches staging.**
Classifications live in `16-external-resource-contract-matrix.md`; platform laws in
`17-cross-resource-platform-gaps.md`; open decisions in `19-thread-7-decision-register.md`.

Nothing here is implemented. Paths marked `PROPOSED` are shape, not commitment.

---

## 1. The V1 surface (Phase 14)

### Already callable — `IMPLEMENTED_EXTERNAL`

```text
POST /api/v1/oauth/token          token exchange
GET  /api/v1/context              the installation's own description
GET  /api/v1/locations            sites and units (rooms, operational groups, shared spaces)
GET  /api/v1/attendance-events    canonical append-only attendance facts        [slice 7.1]
```

Platform laws now implemented and shared by every collection: exact incremental synchronization
(`sync_token` / `since_token`, full-precision `updated_since`) from slice 7.2, and the external
write law (derived idempotency identity, `idempotency_conflict`, `authenticatedWrite` budget) from
slice 7.3.

### `PROPOSED_V1` — resources

```text
RESOURCE  Children
  collection read · single read · incremental synchronization · archive state
  owner: Records (customer_members where relationship = 'child')
  boundary: org, narrowed by current placement
  why: the subject of nearly every childcare integration

RESOURCE  Households
  collection read · single read · incremental synchronization
  owner: Records (customers)
  boundary: org
  why: siblings and financial responsibility both anchor here

RESOURCE  Relationships (guardians and responsible adults)
  collection read (by child or household) · incremental synchronization
  owner: Records (customer_member_contacts + role types)
  boundary: org, via household
  why: pickup authority and contact are operational facts, not decoration
  note: separate scope from Children — this is the PII-dense half

RESOURCE  Staff
  collection read · single read · incremental synchronization
  owner: Employment (Person + Employment composition; there is no Staff entity)
  boundary: org, narrowed by assignment
  why: ratio, roster, and who is on site

RESOURCE  Enrollment
  collection read · single read · incremental synchronization · archive state
  owner: Enrollment (child_enrollment_agreements)
  boundary: org, via placement
  why: is this child enrolled, where, from when

RESOURCE  Placements
  collection read · incremental synchronization · effective-dated supersession
  owner: Childcare Operational (child_placements)
  boundary: org, room unit under site
  why: which room, from when — the join between a child and the topology

PROJECTION  Schedule expectations
  dated query (not a synchronized collection — derived data has no updated_at)
  owner: Operational Expectations (derived, never persisted)
  boundary: org, via placement
  why: a partner cannot interpret attendance without knowing what was expected

RESOURCE  Attendance facts
  collection read · incremental synchronization (append-only)
  owner: Attendance (child_attendance_events, folded)
  boundary: org, room/site on the event
  why: reconciling what a partner submitted against what Alloy holds

PROJECTION  Attendance state
  dated/current query
  owner: Attendance (attendanceFold → CurrentPresenceState)
  boundary: org, site
  why: "who is here now" is a different question from "what happened"
```

### `PROPOSED_V1` — governed operations

```text
OPERATION  Submit attendance events
  governed intent · batch · idempotent · location-bound · canonical Attendance authority
  authority: ingestExternalAttendanceEvent → recordAttendanceEvent
  principal: ApplicationPrincipal → attendanceAuthorityAdapter → NonHumanProducerAuthority
  scope: attendance.write (exists)
  correlation: provider's externalChildId resolved through integration_resource_refs
  result: canonical attendance fact + inbox evidence + per-item disposition

OPERATION  Correct or reverse a submitted attendance event
  same route, expressed as correctsExternalEventId + correctionMode
  NOT a PATCH: a correction restates, a reversal voids, and both are new facts
```

### Change delivery

```text
INCREMENTAL_SYNC_SUFFICIENT  Locations · Households · Staff · Schedule projection
EVENT_REQUIRED               Children · Enrollment · Placements · Relationships · Attendance
```

Five resources classify `EVENT_REQUIRED`, so **V1 does require generic event delivery** — a
childcare partner cannot poll for "a child left" or "a room changed" at a useful latency, and the
archive law (5A) makes those observable but not timely.

### `LATER`

Charges, responsibility arrangements, balance projection, payments read, funding/subsidy — deferred
on evidence (no external projection designed; subsidy is nine tables of jurisdictional complexity),
not on partner relevance.

### `INTERNAL_ONLY`

Organizations as a collection · external payment submission · Communications · Business Process
internals · safeguarding · compensation · payment methods · `workflow_events`.

### `UNRESOLVED`

Person as an external resource distinct from Child, Guardian and Staff (**D-02**).

---

## 2. Implementation readiness matrix (Phase 15)

| Item | Readiness | Exact blocker |
|---|---|---|
| Attendance facts — read | **SHIPPED (7.1)** | — |
| Attendance state — projection | `READY_AFTER_PLATFORM_GAP` | Same read authority; projection itself exists |
| Attendance submit + correct | **SHIPPED (7.4)** | — |
| Placements | `READY_AFTER_PLATFORM_GAP` | 5A representation decided; `updated_at` IS trigger-maintained here, so delivery works — needs only the archive representation applied |
| Enrollment | `READY_AFTER_PLATFORM_GAP` | 5A representation; `updated_at` is trigger-maintained. Field allow-list must exclude pricing terms |
| Households | `DOMAIN_GAP` | `customers.updated_at` is not trigger-maintained, so a lifecycle change is not deliverable incrementally (D-08). Allow-list must exclude payment methods |
| Children | `DECISION_REQUIRED` + `DOMAIN_GAP` | D-02, D-06, D-11 — and `customer_members.updated_at` is not trigger-maintained (D-08) |
| Relationships | `DECISION_REQUIRED` | D-04 (representation), D-11 (PII scope granularity) |
| Staff | `DECISION_REQUIRED` | D-07 only — `employments.updated_at` IS trigger-maintained |
| Schedule projection | `DECISION_REQUIRED` | D-05 (dated projection vs resource); no `updated_at` to sync on |
| Events / webhooks | `DECISION_REQUIRED` | D-10 (threshold and envelope); no public event vocabulary exists |
| Charges / responsibility / balance | `LATER` | No external projection of "what is owed" designed (D-12) |
| Payments read | `LATER` | Follows charges |
| Payment submission | `SECURITY_BLOCKED` | Money is recognised from a provider-confirmed collection; an external submit asserts money moved |
| Funding / subsidy | `LATER` | Jurisdictional; no evidenced partner need |
| Communications | `LATER` (V1: INTERNAL_ONLY) | Consent, sender identity and deliverability are obligations Alloy cannot delegate (D-13) |
| Person as a resource | `DECISION_REQUIRED` | D-02 |

**Updated after the consistency repair (2026-09-22).** Partner documentation, the contract and the
exported package now agree on scopes (13 grantable), operation counts (19 = 1 + 11 + 7), the
authenticated-write rate policy, and the synchronization law. The counts are derived from runtime
in a test rather than written by hand. One documented claim was found false and corrected: reads
and writes have different limits but share one per-installation counter. Both canonical gates
passed. Thread 7 is **ready for final acceptance**, then staging reconciliation and promotion
authorization — see `25-consistency-repair-review-delta.md`.

Earlier: **Updated after the External Lifecycle batch (2026-09-22).** The V1 grant model is frozen at
eleven scopes and `context.read` is retired from it. Six governed service-state operations are
shipped and certified — start/end an enrollment, assign/move a placement, set/change a schedule —
bringing the public surface to **nineteen operations across fifteen paths**, still with no PUT,
PATCH or DELETE anywhere. Every resource is classified in
`23-external-lifecycle-matrix.md`; Children and Relationships are `DOMAIN_OPERATION_GAP`,
Locations and Households read-only by design, Staff ready but deliberately unshipped. The partner
package is regenerated and exportable with one command. Both canonical gates passed. Thread 7 is
**ready for promotion review** pending acceptance of `24-lifecycle-and-export-human-review.md`
and reconciliation with staging.

Earlier: **Updated after the Partner Readiness batch (2026-09-22).** The boundary
resolver now pages to exhaustion, so the latent 200-location ceiling is closed.
Partner documentation is converged on the surface that exists, a generic
integration guide exists, and the offline partner package is assembled and
guarded. Thread 7 is **ready for promotion review**, pending Director acceptance
of the two reviews in `22-partner-readiness-human-review.md` and reconciliation
with current staging. Nothing pushed, promoted or deployed.

Earlier: **Updated after the Core Resource Expansion implementation batch (2026-09-22).** Groups 0–3 all
certified: the six person-side triggers, People, Service state and Staff. The public surface is now
**thirteen operations across nine resources**, all reads except the one attendance write. Both
canonical gates — full `tsconfig.build.json` typecheck and production build — passed through the
broker. Nothing pushed, promoted or deployed. Human Review walkthrough:
`21-core-resource-human-review.md`.

Earlier context, kept for lineage: **Updated after slices 7.1–7.4, then again after the Core
Resource decision resolution (2026-09-22).** Attendance read shipped in 7.1 and Attendance submission in 7.4, which makes the
public surface writable for the first time. That left no `READY` item — the decision batch has
since cleared it. D-02/03/04/05/06/07/08/11 are resolved in
`20-core-resource-decision-resolution.md`, which promotes **Children, Households, Relationships,
Enrollment, Placement, Schedule and Staff** to implementation-ready as a single grouped batch, and
reduces D-08 to six `set_updated_at` triggers with no backfill. The `DOMAIN_GAP` recorded below for
the people resources was **mis-diagnosed** — the customer-side tables are trigger-maintained and the
read layer already coalesces a NULL clock to `created_at`; the real gap is on six person-side
tables. The original text is kept for lineage: measurement found that `customer_members` and `customers`
do not maintain `updated_at`, so they carry a `DOMAIN_GAP` that a decision alone cannot close.

---

## 3. Dependency graph (Phase 16)

```text
collection grammar (5E, exists)
        │
        ├─────────────► archive/delete law (5A)  ──┬──► Households
        │                                          ├──► Children ──► Relationships
        │                                          ├──► Enrollment
        │                                          ├──► Placements
        │                                          └──► Staff
        │
        ├─────────────► external correlation read (5D, table exists)
        │                                          └──► correlation-aware reads
        │
        └─────────────► Attendance READ  (needs only a boundary-scoped collection read)
                                    │
public idempotency (5B) ────────────┤
error: idempotency conflict (5F) ───┼──► Attendance OPERATIONS
write rate budget (5G) ─────────────┘

Children + Placements + Enrollment ──► Schedule projection (derived from all three)

all V1 resources ──► events/webhooks platform ──► EVENT_REQUIRED domains
every contract ──► OpenAPI ──► API Reference (already auto-renders) ──► guides
```

**Independently certifiable:**

- Attendance **read** — depends on no platform gap.
- The archive/delete law itself — a contract plus its application to the existing Locations
  resource.
- Public idempotency — provable with one operation.

**Not independently certifiable:** any people/enrollment resource before 5A; any operation before
5B/5F/5G; events before there are resources worth notifying about.

**Notable:** Attendance read is the *only* domain item with no platform dependency, because its
resource is append-only and therefore needs no archive law.

---

## 4. Thread 7 implementation plan (Phase 17)

Dependency-ordered. The preliminary 7A–7H sequence is **not** preserved: it opened with rooms
(already shipped) and placed Attendance late (the most ready domain).

| Slice | Objective | Depends on | Migrations | Scopes | OpenAPI | Docs | Certification | Human Review | Next slice may assume |
|---|---|---|---|---|---|---|---|---|---|
| ~~7.1 Attendance read~~ | **Shipped.** `GET /api/v1/attendance-events`, scope `attendance.read` | — | no | `attendance.read` added | +1 operation | reference auto-renders | 23 live specs | done | a second resource copies the read pattern |
| **7.2 (partial)** | **Exact sync law shipped**; archive representation decided, delivery blocked on D-08 | 7.1 | the D-08 trigger migration, when authorized | none | `sync_token` + `since_token` on every collection | sync procedure documented | 23 + 16 live specs across both collections | no | every collection resumes exactly |
| **7.3** | **Shipped as law.** D-09 resolved from doctrine; `idempotency_conflict` + `authenticatedWrite` added; **no store built — none needed** | none | **no** | none | error + budget documented | — | 6 contract specs | no | any governed operation |
| ~~7.4 Attendance operations~~ | **Shipped.** `POST /api/v1/attendance-events`, scope `attendance.write`; batch, per-item outcomes, replay-safe | 7.1, 7.3 | no | `attendance.write` bound to the new operation | +1 operation | reference auto-renders | 23 live + 16 contract specs | **yes** — first external write | partners author facts; a second write copies this pattern |
| ~~7.5 People reads~~ | **Shipped.** `/children`, `/households`, `/relationships` with effective `pickup_authorized`. Households → Children → Relationships | 7.2, **D-08 trigger repair** | **yes — 6 triggers, no backfill** | `children.read`, `children.contact.read`, `relationships.read`, `households.read` | +4 operations | people model guide | boundary, PII allow-list, archive | **yes** — PII surface | enrollment can reference children |
| ~~7.6 Service state~~ | **Shipped.** `/enrollments`, `/placements`, `/schedule-assignments`, and `/schedule-days` as a declared projection. Enrollment, Placement, canonical Schedule assignments **+ a derived day projection** | 7.2 only — **not** 7.5 | no | `enrollment.read`, `schedule.read` | +4 operations | enrollment guide | effective-dating, supersession, **`subject_type='child'` filter** | no | attendance can be interpreted against expectation |
| ~~7.7 Staff~~ | **Shipped.** `/staff` as a composed projection over person and employment. Person ⋈ Employment as an external projection | 7.2, **D-08 trigger repair for identity sync** | no | `staff.read`, `staff.contact.read` | +2 operations | short guide | boundary via primary location | no | ratio/roster consumers |
| **7.8 Events / webhooks** | Public event vocabulary + delivery | 7.5, 7.6, D-10 | yes | subscription management | event catalog | events guide | delivery, retry, replay, signature | **yes** — new product surface | `EVENT_REQUIRED` domains satisfied |
| **7.9 Financials** | Charges + responsibility + balance view | 7.2, D-12 | possibly | new read scopes | +3 operations | financial model guide | responsibility split correctness | **yes** | later payment reads |
| **7.10 Portal convergence** | Capability language, guides, examples | continuous | no | none | n/a | ongoing | parity gates | at product boundaries | the package in §6 |

---

## 5. Promotion economy (Phase 18)

**Default: certify locally, preserve the candidate, batch promotion at product boundaries.**

| Slice | Local/mounted sufficient? | Deployed evidence genuinely required? |
|---|---|---|
| 7.1 Attendance read | **yes** — live HTTP against the mounted server exercises the real boundary | no |
| 7.2 Archive law | **yes** | no |
| 7.3 Idempotency | **yes** for semantics | **yes eventually** — concurrent same-key behaviour under a real serverless runtime with more than one instance is not observable on a single local server |
| 7.4 Attendance operations | mounted for behaviour | **yes** — a partner integration test needs a reachable origin |
| 7.5 People reads | **yes** | no |
| 7.6 Service state | **yes** | no |
| 7.7 Staff | **yes** | no |
| 7.8 Events/webhooks | no — delivery, retry and signature verification need a reachable endpoint | **yes** |
| 7.9 Financials | **yes** | no |

**Batching rules.**

- Batch 7.1 + 7.2 + 7.3 into one promotion: read pattern, archive law and idempotency store are
  mutually compatible and none is useful alone.
- **Do not batch migrations blindly** — 7.3 (idempotency store) and 7.8 (subscriptions) each add
  tables; promote each with the code that reads them.
- Never let an uncertified change ride a certified candidate: each slice gets its own certified
  commit, and a batch is a merge of certified commits, never a mixed working tree.
- A slice ending is not a reason to promote. A **product boundary** — something an operator or a
  partner can now do — is.

---

## 6. Developer portal convergence (Phase 19)

The accepted direction is preserved: **Overview → Guides → API Reference**, with the reference
derived from governed OpenAPI.

**What already scales.** `openApiReference.ts` renders any operation the document declares —
method, path, auth, `x-required-scope`, parameters with real bounds, responses, and examples
synthesized from the schemas. Adding a resource to the OpenAPI document makes it appear with no page
written. The embedding generator carries governed Markdown into the bundle and a prebuild guard
refuses drift.

**What needs bounded generalization (not in this run).**

1. **Grouping.** The reference renders a flat list; at ~20 operations it needs grouping by resource,
   driven by OpenAPI `tags` (already present in the document).
2. **Schema rendering.** Only request/response *examples* render today. A resource catalog needs
   field tables — name, type, nullability, description — from `components.schemas`.
3. **Capability language.** The landing derives the operation list from OpenAPI, so it self-updates.
   The prose blocks ("Public resource expansion — next phase") are hand-written and must be revised
   as each slice lands; the truth register in doc 16 is the source.
4. **Guides.** Add a conceptual guide only where a developer needs more than endpoint mechanics:
   facts vs state, the people model, effective-dating, idempotency.

**Law that must not be lost:** never publish an example claiming an endpoint exists before OpenAPI
and runtime parity exist. The drift guard enforces the document against the routes; the portal
follows the document. That ordering is why the portal got ahead of runtime once, and why it cannot
again.

---

## 7. Offline partner package design (Phase 20)

**Contents and the canonical source that generates each section** — so the package is assembled, not
authored twice.

| § | Section | Generated from |
|---|---|---|
| 1 | Platform overview | Documentation landing prose (accepted direction) |
| 2 | Trust model | `02-identity-installation-credential.md` (internal) → partner-safe restatement already in the external specification §1 |
| 3 | Authentication | External specification §3 + governed OpenAPI `securitySchemes` |
| 4 | Tenant/resource authority | External specification §4; boundary behaviour from `list_external_*` |
| 5 | Resource catalog | **Governed OpenAPI** `paths` + `components.schemas` |
| 6 | Operations catalog | Governed OpenAPI, operations with `x-required-scope` |
| 7 | Schemas | Governed OpenAPI `components.schemas` |
| 8 | Synchronization | Conventions guide + the archive law (5A) once implemented |
| 9 | Idempotency and concurrency | The 5B contract once implemented — **implemented law only** |
| 10 | Errors and rate limits | `apiErrors.ts` types + `RATE_LIMIT_POLICY` |
| 11 | External IDs | The 5D public contract once implemented |
| 12 | Events/webhooks | Implemented behaviour, or an explicit "not yet available" posture |
| 13 | Classroom Coach mapping worksheet | `19-thread-7-decision-register.md` §3, Alloy side populated |
| 14 | Provider discovery questions | `19…` §4 |
| 15 | Current limitations | Truth register in doc 16 |
| — | Attachments | Governed OpenAPI JSON. **No internal certification evidence** |

**Rule:** every section above is either generated from a governed artifact or restated from the
external specification, which is itself implementation-backed. Nothing in the package is authored
only in the package — that is how a second specification starts.

**Unlocked by:** slice 7.6 (see `19…` §2 for the threshold argument).
