---
owner: platform
status: canonical
classification: PARTNER_READY
audience: external developers, integration partners, technical evaluators
last_reviewed: 2026-09-14
verified_against: 66fa281e176d33a7a2e848cb1321a18dbcd2c1e2
supersedes: []
---

# Alloy Developer Platform — Technical Specification

**Every endpoint, field, status code and limit in this document was read from the
implementation at `66fa281e1` and exercised over HTTP against a running server.**
Nothing here is aspirational. Where Alloy has ratified a design but not built it,
this document says so in the same sentence rather than in a footnote.

## Classification: PARTNER_READY, not PUBLIC_READY

This specification is accurate and safe to send to a named integration partner.
It is **not** classified PUBLIC_READY, and the reason is specific rather than
procedural.

Alloy's canonical external-boundary record
([`../product/08-slice-b2-external-boundary.md`](../product/08-slice-b2-external-boundary.md))
names three prerequisites before the platform may be *described as production-safe*.
One — durable shared rate limiting — is resolved and is documented below. Two
remain open, and both were verified still present at `66fa281e1`:

| Prerequisite | What it is | State at `66fa281e1` |
| --- | --- | --- |
| SEC-0 | `POST /api/leads/gutters` accepts unauthenticated cross-tenant writes | **Open** — the route exists and performs no authentication |
| SEC-0c | `POST /api/admin/workflows/[id]/run` prefers a body-supplied `org_id` into an engine with an unallowlisted dynamic table write | **Open** — the route exists |

**Neither is reachable from `/api/v1`.** An application principal holds no
session, and nothing in the external request path touches either route. The
read-only external contract below is independently certified and is not weakened
by them. But "public-ready" would assert a deployment posture Alloy does not yet
hold, and an unauthenticated cross-tenant write on the same deployment is a
posture problem regardless of which door it sits behind. When SEC-0 and SEC-0c
close, this document's classification is the only line that needs to change.

---

## 1. The model

```text
Developer Application     the registered external software
        ↓
Installation              where that software has been authorized — ONE organization
        ↓
Credential                long-lived client authentication for that Installation
        ↓
Application Principal     the non-human identity Alloy derives per request
        ↓
Scopes + Resource Boundary
        ↓
Public API (/api/v1)
        ↓
Alloy domain authority
        ↓
Canonical truth
```

**Developer Application** — the registered identity of a piece of software. It
exists independently of any customer, is owned by a publisher, and is not a
tenant object. Registration is platform-operated; there is deliberately no
self-service create route.

**Installation** — one Application's presence inside exactly one organization,
carrying what it may do and where. **The Installation, not a caller-supplied
organization identifier, establishes tenant authority.** An organization may
install a given Application once; a second attempt collides with a uniqueness
constraint rather than creating a second authority for the same software.

**Credential** — a `client_id` and `client_secret` belonging to one Installation.
The secret is shown exactly once, at issue, and is not recoverable afterwards.

**Application Principal** — the identity Alloy derives for an authenticated
external request. It is **not an Alloy user**: it holds no session, no role and
no person record, and it cannot reach any operator surface. It is resolved fresh
on every request rather than carried in the token.

**Scope** — what an Installation may *do*. **Resource Boundary** — what it may
*reach*. These are independent: an Installation may hold `locations.read` and
still see nothing, because its boundary is empty; another may be boundary-wide
and still be refused, because it lacks the scope. The two failures are
deliberately different answers — `403 forbidden_scope` versus an empty result —
so that a partner can tell "I am not allowed to ask" from "there is nothing here".

**External Resource Reference** — the correlation between a partner's identifier
and Alloy's canonical identifier, held per Installation. Your IDs remain yours,
Alloy's remain Alloy's, and correlating them creates no second copy of identity
truth. There is currently **no public API for managing correlations**.

---

## 2. The public surface, complete

Three endpoints exist. This is the entire public API at `66fa281e1`.

| Method | Path | Operation | Scope required |
| --- | --- | --- | --- |
| POST | `/api/v1/oauth/token` | `issueAccessToken` | none (the only unauthenticated endpoint) |
| GET | `/api/v1/context` | `getContext` | none beyond a valid token |
| GET | `/api/v1/locations` | `listLocations` | `locations.read` |

There is **no public Attendance mutation endpoint**, no public child, staff,
household or webhook resource, and no public correlation API. Internal AdminV2
routes are not part of this contract and are not reachable with a bearer token.

The governed contract artifact is
[`alloy-public-api.v1.json`](../../openapi/alloy-public-api.v1.json) (OpenAPI
3.1.0, `info.version` 1.0.0). It contains exactly these three paths with exactly
these operation ids, and a drift guard enforces coverage in both directions.

---

## 3. Authentication

```text
Long-lived client credential
        ↓  POST /api/v1/oauth/token
Short-lived opaque bearer token   (15 minutes)
        ↓  Authorization: Bearer …
/api/v1 request
```

### Issuing a credential

An administrator issues a credential from **Organization → Integrations** on the
Installation. The response reveals the secret **once**. Store it in a secret
manager at that moment; Alloy stores only a hash and the last four characters, so
no one — including Alloy support — can recover it later. If it is lost, rotate.

### Token exchange

```bash
curl -X POST https://<alloy-host>/api/v1/oauth/token \
  -H 'content-type: application/json' \
  -d '{
        "grant_type": "client_credentials",
        "client_id": "alloy_ci_EXAMPLE1234567890",
        "client_secret": "alloy_cs_EXAMPLEdonotuse0000000000000000"
      }'
```

`application/x-www-form-urlencoded` is accepted with the same three fields.

```json
{
  "access_token": "alloy_at_EXAMPLEopaquevalue",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "context.read locations.read"
}
```

The response carries `Cache-Control: no-store`.

- **The token is opaque.** It is a random value with an `alloy_at_` prefix — not
  a JWT, and there is nothing in it to decode. The prefix exists so that a leaked
  token is greppable in a log or a commit.
- **It carries no authority of its own.** Scopes and boundary are re-read from
  the Installation on every request, so a change an administrator makes takes
  effect immediately rather than at the next token refresh.
- **Lifetime is 900 seconds.** `expires_in` is authoritative; do not hard-code it.
- `scope` reports what the Installation currently grants. It is informational.

Only `grant_type=client_credentials` is supported; anything else is
`400 unsupported_grant_type`.

### Using the token

```bash
curl https://<alloy-host>/api/v1/context \
  -H 'authorization: Bearer alloy_at_EXAMPLEopaquevalue'
```

`Authorization: Bearer <token>` is the only accepted form. A missing header, a
different scheme, an unknown token and an expired token all answer
`401 invalid_credential`.

### Rotation and revocation

- **Rotation** issues a new secret and states an overlap deadline, so a partner
  can deploy the new value before the old one stops working.
- **Revocation** is immediate. A revoked credential can no longer exchange for a
  token; tokens already minted are validated against live credential and
  installation state, so revocation is not deferred to token expiry.
- **A suspended Installation** stops serving. `/api/v1/context` names that case
  explicitly — `installation_suspended` or `installation_revoked`, HTTP 401 —
  because the caller has already proven possession of a valid token and learns
  nothing it could not confirm. Other endpoints answer the coarse
  `invalid_credential`.

Alloy never distinguishes "unknown client" from "wrong secret" on the wire. Both
are `401 invalid_credential`; the specific reason is recorded in the tenant's own
security audit.

---

## 4. Tenant and resource authority

> **Your token establishes your Installation, and therefore your Alloy tenant
> authority. You cannot select another organization by passing an identifier.**

The organization is read from the Installation row on every request. Passing
`org_id` or `organization_id` as a query parameter changes nothing — verified
directly: the same values come back either way.

**Boundary modes**

| Mode | Meaning |
| --- | --- |
| `org_wide` | every location in the organization |
| `locations` | only the listed locations **and their descendants** |

An empty `locations` list therefore denies everything rather than permitting
everything — a half-provisioned Installation fails closed.

Boundary is applied **in SQL**, inside the same function that reads the data, not
by filtering afterwards in the route. A filter parameter can only narrow what the
boundary already allows: asking for an unauthorized `location_id` returns an
empty page, never a borrowed row.

---

## 5. Scopes

| Scope | What it permits | What it does not | Current `/api/v1` consumer |
| --- | --- | --- | --- |
| `context.read` | Read the calling Installation's own context | Anything about a person or the organization's configuration | `GET /api/v1/context` |
| `locations.read` | Read sites and units inside the boundary | Any write; any other resource | `GET /api/v1/locations` |
| `attendance.write` | Submit attendance events for children at authorized locations | — | **None. There is no public Attendance endpoint.** |

**`attendance.write` is vocabulary, not a callable operation.** The scope exists
because Alloy's internal attendance authority already consumes resolved Developer
Platform authority, and it maps to the internal permission `attendance.record`.
Granting it to an Installation today enables nothing externally. Do not design a
partner integration that assumes a public attendance write exists.

The catalog is deliberately small: it can grow compatibly, and it cannot shrink.

---

## 6. `GET /api/v1/context`

Use it to validate a token, to discover what an Installation may do, and as a
health check after an administrator changes access.

```json
{
  "application": { "id": "…", "slug": "your-application", "environment": "sandbox" },
  "installation": { "id": "…", "status": "active" },
  "organization": { "id": "…" },
  "scopes": ["context.read", "locations.read"],
  "resource_boundary": { "mode": "org_wide" }
}
```

With a restricted boundary, `resource_boundary` is
`{ "mode": "locations", "location_ids": ["…"] }`.

It returns nothing about any person, no internal permission keys, no roles, and
no credential or token material — verified by assertion, not by inspection.

---

## 7. `GET /api/v1/locations`

The first canonical resource. Sites and units only; address records and customer
or vendor premises are excluded in SQL, not by client-side filtering.

**Fields — the complete set:**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Alloy's canonical identifier |
| `type` | `site` \| `unit` | |
| `unit_role` | `physical_space` \| `operational_group` \| `shared_space` \| `null` | `null` means unknown, not a guessed value |
| `name` | string \| null | |
| `parent_id` | uuid \| null | immediate parent |
| `site_id` | uuid \| null | the site this row belongs to |
| `active` | boolean | |
| `updated_at` | timestamp | also the incremental-sync watermark |

**Timezone is not part of the public Location contract.** Internal location
records carry timezone information; it is deliberately not published here, and
this exclusion is certified.

**Parameters**

| Parameter | Behaviour |
| --- | --- |
| `limit` | default **50**, maximum **200**; a value above the maximum is clamped, not refused. Non-numeric or `< 1` → `400 invalid_limit` |
| `cursor` | opaque; pass back the `next_cursor` you received. Unparseable → `400 invalid_cursor` |
| `type` | `site` or `unit`. Anything else → `400 invalid_filter` |
| `parent_id` | uuid; malformed → `400 invalid_filter` |
| `location_id` | uuid; narrows to one location, and cannot exceed the boundary |
| `updated_since` | ISO-8601 **with offset or `Z`**. A bare local time is ambiguous and is refused (`400 invalid_updated_since`) rather than guessed. Matches rows **strictly after** the instant |

**Response**

```json
{ "data": [ { "id": "…", "type": "site", "…": "…" } ], "next_cursor": "…" }
```

`next_cursor` is `null` on the last page. Ordering is deterministic and stable
across pages: paging with `limit=2` twice returns the same rows, in the same
order, as one `limit=200` call.

### Incremental synchronization

1. Full read: page with `limit` + `cursor` until `next_cursor` is `null`.
2. Record the highest `updated_at` you saw.
3. Next run: `GET /api/v1/locations?updated_since=<that timestamp>`.

`updated_since` **does not detect deletion.** A location that disappears from the
organization does not appear in an incremental page as a tombstone. Reconcile
with a periodic full read if your model requires removal.

---

## 8. Errors

Every refusal uses one envelope:

```json
{
  "error": {
    "code": "invalid_cursor",
    "type": "invalid_request",
    "message": "The cursor is not valid. Restart pagination without one.",
    "request_id": "…"
  }
}
```

`request_id` is also returned as the `X-Request-Id` header, and is the value to
quote in a support conversation. An optional `details` object appears only where
a refusal has structured detail.

| `type` | Status | Typical `code` |
| --- | --- | --- |
| `invalid_request` | 400 | `invalid_limit`, `invalid_cursor`, `invalid_filter`, `invalid_updated_since`, `unsupported_grant_type` |
| `unauthenticated` | 401 | `invalid_credential`, `installation_suspended`, `installation_revoked` |
| `forbidden_scope` | 403 | scope missing for the operation |
| `forbidden_resource` | 403 | reserved |
| `not_found` | 404 | reserved |
| `conflict` | 409 | reserved on the public API |
| `rate_limited` | 429 | `rate_limited` |
| `internal_error` | 500 | `internal_error` |

**On 409:** Alloy repaired one *administrative* operation — revoking or rotating
an already-inactive credential — from HTTP 500 to HTTP 409, because a business
rule refusing is not a server fault. That repair is on the **operator** API, not
on `/api/v1`. No public endpoint currently returns 409; the status is reserved.

---

## 9. Rate limiting

Durable and shared across server instances — a budget, not a per-process
approximation. Two policies:

| Surface | Limit | Window | Keyed on |
| --- | --- | --- | --- |
| Token exchange | 30 | 60 s | presented `client_id` + hashed caller address |
| Authenticated reads | 600 | 60 s | Installation |

The token budget is consumed **before** credential verification, so a
credential-stuffing run cannot get free database work. It is never keyed on the
secret: keying on the value being guessed would hand every wrong guess a fresh
budget.

Every response — success or refusal — carries `RateLimit-Limit`,
`RateLimit-Remaining` and `RateLimit-Reset` (seconds). A 429 additionally carries
`Retry-After`. Honour it; do not poll.

These numbers are the current implementation. Treat the headers as authoritative
and the table as indicative.

---

## 10. Mutations, idempotency, correlation

**The public domain API is read-only today** beyond token exchange. There is no
public mutation endpoint, so mutation idempotency and optimistic concurrency are
not currently exercised by anything a partner can call. Alloy has ratified
doctrine for governed external mutation; that is **future architecture, not
current capability**, and this document deliberately gives no examples against
endpoints that do not exist.

Correlation works like this:

```text
Partner's own identifier
        ↕   Installation-scoped correlation
Alloy's canonical identifier
```

Correlation is recorded per Installation, so two partners may hold different
identifiers for the same Alloy record without either becoming a second source of
truth. There is **no public self-service correlation API**; correlations are
established by Alloy-side integration code today.

---

## 11. Quickstart

1. An administrator opens **Organization → Integrations** and adds your
   Application, choosing capabilities and either org-wide or selected-location
   access. This creates the Installation.
2. The administrator issues a credential and copies the secret **once**.
3. Exchange it:
   `POST /api/v1/oauth/token` with `grant_type=client_credentials`.
4. Confirm who you are: `GET /api/v1/context`.
5. List what you may reach: `GET /api/v1/locations?limit=50`.
6. Page with `next_cursor` until it is `null`; record the highest `updated_at`.
7. Later: `GET /api/v1/locations?updated_since=<watermark>`.

```bash
TOKEN=$(curl -s -X POST https://<alloy-host>/api/v1/oauth/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"alloy_ci_EXAMPLE","client_secret":"alloy_cs_EXAMPLE"}' \
  | jq -r .access_token)

curl -s https://<alloy-host>/api/v1/context -H "authorization: Bearer $TOKEN"
curl -s "https://<alloy-host>/api/v1/locations?limit=50" -H "authorization: Bearer $TOKEN"
```

Identifiers and secrets above are fictitious.

---

## 12. Capability matrix

| Capability | Maturity |
| --- | --- |
| OAuth-style token exchange | **IMPLEMENTED_EXTERNAL** |
| Installation context | **IMPLEMENTED_EXTERNAL** |
| Location read | **IMPLEMENTED_EXTERNAL** |
| Incremental Location sync (`updated_since`) | **IMPLEMENTED_EXTERNAL** |
| Durable rate limiting | **IMPLEMENTED_EXTERNAL** |
| External resource correlation | **IMPLEMENTED_INTERNAL_FOUNDATION** — substrate exists, no public API |
| Application principal → domain authority | **IMPLEMENTED_INTERNAL_FOUNDATION** |
| Public Attendance ingestion | **RATIFIED_NOT_IMPLEMENTED** — scope and internal adapter exist; no endpoint |
| Governed external mutation / idempotency | **RATIFIED_NOT_IMPLEMENTED** |
| Public child / staff / household resources | **FUTURE_UNRATIFIED** |
| Public webhooks / event delivery | **FUTURE_UNRATIFIED** |
| Correlation management API | **FUTURE_UNRATIFIED** |
| SSO / deep linking | **FUTURE_UNRATIFIED** |
| Classroom Coach adapter | **PROVIDER_DEPENDENT** |

---

## 13. Domain readiness

Four independent dimensions. A domain can be fully authoritative inside Alloy and
still have no public contract — that is the normal state today, and collapsing
these columns is how an integration plan acquires endpoints that do not exist.

| Domain | Canonical Alloy authority | Developer Platform authority support | Implemented `/api/v1` | Partner readiness |
| --- | --- | --- | --- | --- |
| Organization / install context | COMPLETE | COMPLETE | **IMPLEMENTED** | Ready |
| Locations (sites, units) | COMPLETE | COMPLETE | **IMPLEMENTED** | Ready |
| Rooms / operational groups | COMPLETE | COMPLETE (as `unit_role`) | **IMPLEMENTED** (within Locations) | Ready |
| Attendance | COMPLETE | COMPLETE (internal adapter) | **NOT IMPLEMENTED** | Provider-dependent |
| People / staff | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| Children | COMPLETE | Correlation substrate only | NOT IMPLEMENTED | Not ready |
| Households / guardians | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| Relationships | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| Enrollment / placement | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| Schedules | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| Communications | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| Financials | COMPLETE | Not extended externally | NOT IMPLEMENTED | Not ready |
| External correlation | COMPLETE | COMPLETE | NOT IMPLEMENTED (no public API) | Internal only |
| Events / webhooks | — | Not ratified | NOT IMPLEMENTED | Not ready |
| SSO / deep linking | — | Not ratified | NOT IMPLEMENTED | Not ready |

---

## 14. How this document was verified

Read from the implementation at `66fa281e1`, then executed over HTTP against a
running server by
`web/tests/platform/external/publicApiQuickstart.live.test.ts` — **15 scenarios,
all passing**: token exchange and its refusals, context shape and its exclusions,
the Location field set, deterministic paging and cursor resume, incremental sync
including the ambiguous-timestamp refusal, boundary enforcement and the
filter-cannot-widen rule, scope-versus-boundary separation, the absence of
caller-controlled tenant selection, revoked-credential behaviour, the single
error envelope with request-id correlation, and API Activity recording without
token or secret material.

The parity ledger and certification record for this specification are in
[`certification/documentation-api/thread6-public-contract-parity.md`](../../../../certification/documentation-api/thread6-public-contract-parity.md).
