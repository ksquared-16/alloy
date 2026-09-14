---
owner: platform
status: canonical
classification: PARTNER_READY
audience: Classroom Coach engineering, Alloy product and engineering
last_reviewed: 2026-09-14
verified_against: 66fa281e176d33a7a2e848cb1321a18dbcd2c1e2
supersedes: []
---

# Alloy ↔ Classroom Coach — Integration Readiness & Technical Discovery

**This is not an integration contract.** It is a readiness statement plus a
discovery request. It says precisely what Alloy provides today, what Alloy's
platform can support next, and what Alloy needs from Classroom Coach engineering
before any provider-specific work can be designed — let alone built.

> **Nothing in this document describes Classroom Coach behaviour.** Alloy holds
> no authoritative technical information about the Classroom Coach API, and this
> document does not guess at one. Where a row says PROVIDER_DEPENDENT it means
> exactly that: Alloy cannot answer it, and neither can inference.

## Evidence standard

Alloy will treat the following as sufficient to design against:

**Authoritative** — provider-issued API documentation; provider engineering
documentation; a provider OpenAPI or schema; observed behaviour of an
authenticated sandbox; written confirmation from provider engineering.

**Supporting** — provider product documentation; UI observation; existing
customer configuration; partner conversations without technical detail. Useful
for scoping. Not sufficient to fix a contract.

**Insufficient** — assumptions drawn from feature names; marketing material;
third-party claims; *the absence of public documentation*; behaviour inferred
from screenshots.

The third category matters most here. Classroom Coach having no public API
documentation is **not evidence that no API exists** — partner and private APIs
routinely go undocumented publicly. Every provider-side row below is therefore
`UNKNOWN`, not `UNSUPPORTED`.

---

## 1. What Alloy provides today

Each item below is implemented, promoted and certified. The full technical
contract is
[`../external/alloy-developer-platform-specification.md`](../external/alloy-developer-platform-specification.md).

- **Installation-scoped integration identity.** A registered Developer
  Application, installed into exactly one organization. The Installation is the
  tenant authority root; there is no caller-supplied organization identifier
  anywhere in the request path.
- **Credential and token authentication.** `client_id` / `client_secret`
  exchanged at `POST /api/v1/oauth/token` for an opaque bearer token with a
  900-second lifetime. Issue, rotate with overlap, and immediate revocation are
  productized operator flows.
- **Tenant- and resource-bound authorization.** Scopes say what an Installation
  may do; a resource boundary says what it may reach. Both are enforced
  server-side, the boundary inside SQL rather than by post-filtering.
- **Public API conventions.** One error envelope with a correlatable
  `request_id`; deterministic cursor pagination; durable, shared rate limiting
  with standard headers.
- **The Location resource and incremental synchronization.**
  `GET /api/v1/locations` returns sites and units within the boundary, with
  `updated_since` incremental sync.
- **An external correlation substrate.** Partner identifier ↔ Alloy identifier,
  recorded per Installation, with no duplicate identity truth. Internal today.
- **A generic external non-human authority architecture, internally.** Alloy's
  own attendance path already consumes resolved Developer Platform authority; the
  legacy bespoke external-trust path has been retired.

## 2. What Alloy does not expose or cannot verify

Stated plainly, because an integration plan built on any of these would be built
on nothing:

- **No public Attendance mutation endpoint.** The `attendance.write` scope exists
  and the internal adapter exists; there is no endpoint a partner can call.
- **No public child, staff, household, guardian, enrollment or schedule
  resource.**
- **No public webhook or event-delivery mechanism.** Alloy cannot push to a
  partner today, and has not ratified a design for it.
- **No public correlation-management API.**
- **No verified Classroom Coach adapter**, because there is no verified
  Classroom Coach contract to adapt to.
- **No verified Classroom Coach authentication or API model.**
- **No verified provider webhook, pagination, rate-limit or sandbox model.**
- **D-1 — direction — is unresolved.** Whether Classroom Coach is inbound to
  Alloy, outbound from Alloy, or both, is not established. It determines which
  side builds what, and no design should proceed past it.
- **Alloy is PARTNER_READY, not PUBLIC_READY.** Two open internal security
  prerequisites (SEC-0, SEC-0c) gate describing the platform as production-safe.
  Neither is reachable from `/api/v1`; both are named in the specification.

## 3. Proposed integration domains

**Every row below is PROPOSED — PENDING PROVIDER CONFIRMATION.** The "Alloy side"
column is verified. The "Classroom Coach side" column is unknown, and Alloy is not
assigning provider-side authority without evidence.

| Domain | Alloy side today | Classroom Coach side | What would unblock it |
| --- | --- | --- | --- |
| Locations / campuses | `GET /api/v1/locations`, incremental sync — **implemented** | UNKNOWN | Provider location model and identifiers |
| Classrooms / rooms | Exposed as units with `unit_role` — **implemented** | UNKNOWN | Whether CC models rooms, and how they map to units |
| Staff | Canonical in Alloy; **no public resource** | UNKNOWN | Direction (D-1), then a ratified public resource |
| Children | Canonical in Alloy; correlation substrate only | UNKNOWN | Provider identifier model; system-of-record decision |
| Guardians / households | Canonical in Alloy; **no public resource** | UNKNOWN | Direction, then a ratified public resource |
| Placement / schedule | Canonical in Alloy; **no public resource** | UNKNOWN | Provider schedule semantics |
| Attendance | Internal authority converged; **no public mutation** | UNKNOWN | Direction, then Alloy builds the governed mutation endpoint |
| Communications | Canonical in Alloy; **no public resource** | UNKNOWN | Direction and provider messaging model |

**System-of-record ownership is not assigned in this table on purpose.** For each
shared domain, exactly one side must own the fact and the other must hold a
correlation. Deciding that before the provider's model is known would be
guessing, and the guess would be expensive to unwind.

## 4. What Alloy would build, once evidence arrives

Sequenced so that each step is useful even if the next never happens. None of
this is committed work; it is the shape the platform already supports.

1. **Read-only Location sync** — available today, no Alloy work required. A
   partner can consume Alloy locations as soon as an administrator installs an
   application and issues a credential.
2. **Additional public read resources** (rooms as first-class, children, staff)
   — each needs a ratified public contract, a boundary-enforced SQL reader, and
   OpenAPI coverage. The pattern is established by Locations.
3. **Governed external mutation, starting with attendance ingestion** — the
   scope, the internal adapter and the authority model already exist; what is
   missing is the public endpoint, its idempotency contract, and the two open
   security prerequisites closing.
4. **Correlation management** — exposing the existing substrate so a partner can
   assert its own identifiers rather than relying on Alloy-side mapping.
5. **Event delivery / webhooks** — unratified. Would need a delivery guarantee
   model, retry semantics and a signing scheme before any design.
6. **A Classroom Coach adapter** — only after the discovery request in
   [`classroom-coach-technical-discovery-request.md`](./classroom-coach-technical-discovery-request.md)
   is answered with authoritative evidence.

## 5. What Alloy needs next

One thing, before anything else: **answers to the technical discovery request**.
It is a separate document precisely so it can be sent to Classroom Coach
engineering without the rest of this packet.

A response containing authoritative evidence for authentication, tenancy,
resources, identifiers, synchronization and sandbox access is enough to seed a
provider-specific implementation lane. A response containing only product
descriptions is not, and Alloy will say so rather than proceeding on it.
