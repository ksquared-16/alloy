---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-17
supersedes: []
---

# Thread 7 — Public API resource expansion: discovery handoff

**This document does not design an API.** It records what Alloy already has, so that Thread 7 spends
its time deciding what to externalize rather than rediscovering the estate. Every claim below was
read from the implementation on `origin/staging` at `3d6351490`; where something was not verified,
it says so.

> **Read this first.** Three of the assumptions in the starting hypothesis are wrong, and each one
> changes the order of work:
>
> 1. **Rooms and operational groups are already externalized.** `GET /api/v1/locations` returns
>    `type: "unit"` with `unit_role` of `physical_space | operational_group | shared_space`. Slice
>    7A as written is largely done.
> 2. **External attendance ingestion is built end to end except for the route.** Producer authority,
>    provider mapping, an evidence inbox, replay identity and correction all exist and are already
>    wired to the Developer Platform principal. What is missing is a public endpoint, not a domain.
> 3. **People are not a `persons` table.** The canonical model is `customers` (household),
>    `customer_members` (the enrolled member), `customer_persons` and `persons` (identity). A
>    resource called "child" is a projection of that model, not a table.
>
> A fourth, about this document's own sources: **the Thread 3 inventory is stale.** It lists
> `integration_resource_refs` as absent when it has both a migration and a module, and it lists
> Installation, Credential and their UI as absent when all three shipped. Read it for structure,
> verify it for state — which is what this handoff did.

---

## 1. What exists today, by evidence

### The public surface

Exactly three operations, and the OpenAPI document is enforced against the running routes in both
directions by `openApiDriftGuard`:

```text
POST /api/v1/oauth/token
GET  /api/v1/context
GET  /api/v1/locations
```

`app/api/v1/` contains three directories — `oauth`, `context`, `locations` — and nothing else.

### The one external read authority

`public.list_external_locations` (`supabase/migrations/20260910210000_external_locations_read.sql`,
extended for `updated_since` in `20260911160000_external_locations_updated_since.sql`). It applies
the organization and the installation's location boundary **in SQL**, and it is reused by the admin
surface rather than reimplemented — `integrationsService` calls the same function the public API
calls. **This is the pattern every new read resource should follow**: the boundary belongs in one
place, and that place is not TypeScript.

No other `list_external_*` function exists. Every domain below therefore starts without a safe
external read authority, and that — not the shape of the resource — is the main cost of each slice.

### The governed-operation substrate

| Piece | Where | State |
|---|---|---|
| Operational Intent vocabulary | `lib/platform/commands/operationalIntent.ts` | 7 intents `current`, 5 `planned` |
| Action execution runtime | `lib/adminV2/actions/actionRegistry.ts`, `actionExecutor` | in use by the product |
| Application Principal | `lib/platform/principal/platformPrincipalTypes.ts` | built |
| Attendance authority adapter | `lib/platform/principal/attendanceAuthorityAdapter.ts` | built, one-way, grants nothing extra |
| External attendance ingestion | `lib/childcareOperational/attendance/integration/ingestExternalAttendance.ts` | built |
| Public idempotency layer | — | **absent**; attendance has its own, the platform has none |

Intents marked `current`: `create_lead`, `move_forward`, `update_status`, `schedule_tour`,
`confirm_tour`, `send_message`, `generate_document`. Marked `planned` (modeled, not implemented):
`enroll_child`, `assign_room`, `withdraw_child`, `generate_invoice`, `record_payment`.

**The five operations a partner is most likely to want are the five that are `planned`.** Thread 7
should treat "is there a registered command behind this?" as a real question per domain, not a
formality.

### The event substrate

`workflow_events` (`lib/emitEvent.ts`): `org_id`, `event_type`, `entity_type`, `entity_id`,
`occurred_at`, `payload`. It is an internal workflow trigger log, and its `payload` is whatever the
emitting code put there. **It cannot be exposed directly** — the payload has no contract, the event
vocabulary is internal, and subscribers would couple to Alloy's workflow implementation.

---

## 2. Domain classification matrix (Slice H)

Classifications: `V1_READ_RESOURCE` · `V1_GOVERNED_OPERATION` · `EVENT_REQUIRED` · `LATER` ·
`INTERNAL_ONLY`. A domain may carry more than one.

| Domain | Classification | Canonical authority | Why |
|---|---|---|---|
| Context | **DONE** | `app/api/v1/context` | Already the calling installation's own description |
| Locations (sites) | **DONE** | `list_external_locations` | Shipped |
| Rooms / operational groups | **DONE** | same | `type: "unit"`, `unit_role` discriminator — already external |
| Organizations | `INTERNAL_ONLY` | `orgs` | An installation belongs to exactly one org; a collection would imply cross-tenant reach that does not exist |
| Persons | `V1_READ_RESOURCE` | `persons`, `customer_persons` | Needed to resolve who a contact is; identity model must be settled first |
| Children (members) | `V1_READ_RESOURCE` + `EVENT_REQUIRED` | `customer_members`, `lib/records` | The subject nearly every integration is about |
| Households | `V1_READ_RESOURCE` | `customers` | The billing and contact anchor; children hang off it |
| Relationships / guardians | `V1_READ_RESOURCE` | `customer_member_contacts`, `customer_member_relationship_types`, `customer_person_role_types` | Pickup authority and consent depend on it; **safeguarding fields must not ride along** |
| Staff | `V1_READ_RESOURCE` | `employments`, `employment_positions` | Needed for ratio and roster consumers |
| Enrollment | `V1_READ_RESOURCE` | `child_enrollment_agreements`, `enrollment_pricing_terms` | Service state a partner must reflect |
| Placement | `V1_READ_RESOURCE` | `child_placements` | Which room, from when — the join between child and topology |
| Schedules | `V1_READ_RESOURCE` | `childcare_schedule_rules`, `childcare_operating_windows` | Expected days; needed to interpret attendance |
| Attendance | `V1_READ_RESOURCE` + `V1_GOVERNED_OPERATION` + `EVENT_REQUIRED` | `child_attendance_events`; `ingestExternalAttendance` | **The ingestion half is built**; the read half and the route are not |
| Financial accounts / obligations | `LATER` | `financial_responsibility_arrangements`, `_allocations`, `_shares` | Real and rich, but the external question ("what does this family owe?") is a projection nobody has defined |
| Charges | `LATER` | `charges`, `charge_line_items` | Reads are plausible; external *creation* is not, and should not be assumed |
| Payments | `LATER` | `payment_allocations`, `payment_collection_attempts` | Money movement external systems submit is a much larger trust decision than a read |
| Funding / subsidy | `LATER` | `financial_subsidy_*` (9 tables) | Agency-facing, jurisdictional, and the least likely V1 partner need |
| Communications | `INTERNAL_ONLY` for V1 | `lib/communications` | `send_message` is a `current` intent, but outbound sending on a tenant's behalf is a deliverability and consent decision, not an API shape decision |
| Events / webhooks | `EVENT_REQUIRED`, platform work | `workflow_events` (not exposable) | Needs a public event vocabulary and delivery platform of its own |

### Where this disagrees with the starting hypothesis (Slice L)

| Hypothesis | Evidence | Verdict |
|---|---|---|
| 7A Rooms/operational groups | already returned by `GET /api/v1/locations` | **Remove from V1** |
| Attendance late (7D) | ingestion built and principal-wired; only a route missing | **Move earlier** |
| Financials in V1 | no external projection defined; 20+ tables | **Defer** — evidence does not support V1 |
| Persons + Children + Relationships as one slice | three different identity questions | **Split** — relationships carry safeguarding adjacency |

---

## 3. Resource authority questions (Slice I)

Answered where the implementation answers them; **open** where Thread 7 must decide. The fourteen
questions are asked of each candidate; the three below are worked in full as the pattern, and the
remainder carry the answers that are already known.

### Children (members)

1. **Concept exposed** — the enrolled member of a household, not a person record.
2. **Owner** — `customer_members`; `lib/records/childMemberEligibility.ts` already resolves a member
   for external ingestion and is the closest thing to an external read authority.
3. **Stable identifier** — `customer_members.id`. Already used as the correlation target by
   `ingestExternalAttendance`, so an external id for a child is not a new concept.
4. **Suitable as-is?** — **No.** The row carries operational and safeguarding-adjacent fields.
5. **Canonical fields** — id, display name, household, active service state, placement reference.
6. **Derived / internal** — safeguarding screenings and restrictions (`child_safeguarding_*`),
   internal tags, workflow state. **These must be excluded by allow-list, never by omission.**
7. **Org scope** — `org_id` on the household.
8. **Location scope** — via current placement; a child with no placement is outside every
   restricted boundary, and that case must be decided explicitly rather than defaulted.
9. **Relationships** — household, placement, enrollment, guardians.
10. **Collection semantics** — the shipped envelope: `limit`/`cursor`, `updated_since` with a
    required offset, strictly-after, **no deletion detection** (a known gap of the Locations
    contract that will bite harder here).
11. **Incremental sync** — required.
12. **Archive/delete** — externally meaningful (a child leaves), and the current contract has no way
    to express it. **This is the single biggest open contract question in the handoff.**
13. **Safe existing read authority** — none.
14. **What prevents externalization today** — no external read function, no agreed field allow-list,
    no withdrawal semantics.

### Attendance

1. **Concept** — a canonical attendance fact about a child on a service day.
2. **Owner** — `child_attendance_events`; `lib/childcareOperational/attendance/attendanceService.ts`
   owns writes; provenance vocabulary in `attendanceProvenance.ts`.
3. **Identifier** — the event id; external correlation is `(producer, provider_event_id)`.
4. **Suitable as-is?** — closer than any other domain, because an external representation was
   already designed for ingestion.
5. **Canonical fields** — child, site, kind, occurred-at, provenance, correction lineage.
6. **Derived / internal** — the ingestion inbox (`attendance_integration_events`) is *evidence of
   processing, not truth*, and the code says so explicitly. It must never be the public resource.
7/8. **Scope** — org, plus site boundary resolved by `attendanceAuthorityAdapter`.
9. **Relationships** — child, site, producer.
10/11. **Collections** — required, with incremental sync.
12. **Corrections** — `correctAttendanceEvent` exists; the public contract must expose correction
    rather than mutation.
13. **Safe existing authority** — **yes, for writes.** `ingestExternalAttendance` is the boundary
    and `attendanceAuthorityAdapter` is the authority bridge.
14. **What prevents externalization** — a public route, a public idempotency layer, and the read
    projection. Not the domain.

### Locations — the shipped example, for calibration

Already answered by the implementation: `list_external_locations` applies the boundary, eight public
fields, no address, no timezone, `updated_since` with required offset, no deletion detection.
**Thread 7 should fix deletion detection as a platform concern before adding resources that need it
more.**

### The remainder, in brief

| Resource | Identifier | Safe read authority | Principal blocker |
|---|---|---|---|
| Persons | `persons.id` | none | identity model spans `persons`/`customer_persons`; external meaning unsettled |
| Households | `customers.id` | none | field allow-list; payment methods must be excluded |
| Relationships | contact + role type rows | none | safeguarding adjacency; consent semantics |
| Staff | `employments.id` | none | employment is organization-scoped, location narrows it — boundary question is real |
| Enrollment | `child_enrollment_agreements.id` | none | pricing terms are commercially sensitive |
| Placement | `child_placements.id` | none | effective-dating semantics must be externally expressible |
| Schedules | `childcare_schedule_rules.id` | none | rules are a *pattern*, not a list of days; external consumers want days |

---

## 4. Operation authority questions (Slice J)

`Resources = what is true. Operations = what you want Alloy to do.` Applied per domain:

| Intent an external system needs | Existing Alloy authority | Registered command? | Adapter safe today? | Verdict |
|---|---|---|---|---|
| Submit an attendance fact | `ingestExternalAttendance` → `recordAttendanceEvent` | yes, domain-level | **yes** — `attendanceAuthorityAdapter` | **V1 governed operation** |
| Correct an attendance fact | `correctAttendanceEvent` | yes | yes | **V1 governed operation** |
| Enroll a child | `enroll_child` | **`planned` only** | no | needs the command first |
| Assign a room | `assign_room` | **`planned` only** | no | needs the command first |
| Withdraw a child | `withdraw_child` | **`planned` only** | no | needs the command first |
| Generate an invoice | `generate_invoice` | **`planned` only** | no | out of V1 |
| Record a payment | `record_payment` | **`planned` only** | no | out of V1 — money in is a trust decision, not an endpoint |
| Send a message | `send_message` | `current` | not assessed | deliberately **not** V1 |

**Cross-cutting requirements that do not exist yet and block every write:**

- **Public idempotency.** Attendance has replay identity `(producer, provider_event_id)`; the
  platform has no general idempotency-key contract. A second writable domain must not invent a
  second scheme.
- **Provenance.** `app_installations.producer_key` already survives credential rotation, which is
  the right primitive and should be the only one.
- **External correlation.** `integration_resource_refs` **is implemented** — migration
  `20260911150000_integration_resource_refs.sql` and `lib/platform/external/integrationResourceRefs.ts`,
  which resolves "your id → our resource" with no create-on-miss path by construction. The Thread 3
  inventory still lists it as absent; **it is not**. Every write domain should use it rather than
  inventing correlation.
- **Correction/reversal.** Attendance models correction explicitly. Any new write domain must state
  its reversal semantics before it ships, not after.

**Explicitly not externally writable**, and this should be recorded as a decision rather than
rediscovered: safeguarding records, access/permission grants, financial journal entries, subsidy
claims, and anything in the configuration estate.

---

## 5. Event requirements (Slice K)

| Resource | Polling sufficient? | Classification |
|---|---|---|
| Locations | yes — low change rate, `updated_since` works | polling sufficient |
| Children | no — a partner needs to know about a new or withdrawn child promptly | **event required** |
| Placement | no — room moves drive a partner's own roster | **event required** |
| Enrollment | desirable | event desirable |
| Attendance | no — the round trip (partner writes, Alloy corrects) needs notification | **event required** |
| Staff | desirable | event desirable |
| Financials | not assessed | — |

**Substrate.** `workflow_events` is the strongest internal fact stream, and it is not exposable:
internal event vocabulary, uncontracted `payload`, and workflow coupling. A public event platform
needs its own vocabulary mapped *from* internal facts, delivery with retry and replay, a signing
scheme, and subscription management per installation. **That is a platform slice, not a domain
slice**, and its cost should not be hidden inside a resource slice.

---

## 6. Recommended sequence (Slice M)

Reordered from the starting hypothesis on the evidence above. Every slice ends at
`design → implementation → automated certification → mounted Human Review → explicit promotion
authorization`.

| Slice | Content | Why here |
|---|---|---|
| **7A — Platform contract gaps** | deletion/withdrawal semantics, public idempotency | Both are needed by every later slice; doing them inside a domain slice buries them. External correlation is **already built** and needs only adoption |
| **7B — Attendance** | read contract + governed ingestion/correction route | The most complete domain; it is a route and a projection, not a build |
| **7C — People** | Households → Children → Relationships, in that order | Children need a household; relationships need both, and carry safeguarding adjacency |
| **7D — Service state** | Enrollment + Placement + Schedule | Depends on People; Placement joins to topology already external |
| **7E — Staff** | Staff resource and assignments | Independent; can run in parallel with 7D |
| **7F — Events / webhooks** | public vocabulary + delivery platform | Needs a real resource estate to be worth building |
| **7G — Financials** | accounts/obligations, charges, payments, funding | Largest, least evidenced, highest trust cost |
| **7H — Portal convergence** | expanded reference, guides, capability matrix | Continuous, but a final pass once the estate is real |

**Rooms/operational groups appear nowhere** — they are already shipped.

---

## 7. What Thread 7 must decide before writing code

1. **Withdrawal and deletion.** The shipped collection contract cannot express "this no longer
   exists". Children and placements make that unavoidable.
2. **The external identity of a child.** Member, person, or a new external identity — and whether
   partners may supply their own correlation id.
3. **Whether reads are projections or tables.** The recommendation is projections with an allow-list
   per resource, enforced in SQL like `list_external_locations`, because omission has already been
   demonstrated to be the wrong safety mechanism.
4. **Whether V1 writes beyond Attendance are in scope at all.** Five of the six candidate write
   intents are `planned`, not `current`. Externalizing them means building the internal command
   first, which is a different kind of work than exposing one.
