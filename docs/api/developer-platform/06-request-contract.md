---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 06 — Request contract (Phases P, Q, R, S, T)

## P. Idempotency — ratified

**`Idempotency-Key` is required on every public mutation.** A POST without one is
rejected `400 idempotency_key_required`. Optional idempotency is idempotency
nobody uses until after the incident.

| Concern | V1 |
|---|---|
| Header | `Idempotency-Key`, client-generated, ≤255 chars |
| Uniqueness scope | `(installation_id, operation, key)` |
| Retention | **30 days**, long enough to cover a partner's reconciliation cycle |
| Fingerprint | Hash of the canonicalized request body, **excluding** the key itself and any correlation id |
| Same key + same payload | **Replay** the stored response, with `Idempotency-Replayed: true` |
| Same key + different payload | **`409 idempotency_conflict`** — never silently serve the first result for a different request |
| Concurrent duplicates | First wins; the loser gets `409 idempotency_in_progress` and may retry |
| Audit | The replay is recorded; **domain events are not re-emitted** |

The fingerprint exclusions are copied deliberately from
`attendanceService.ts:31`, which excludes `correlation_id` and the key itself so
that *a genuine retry succeeds while a reused key with different content is
caught*. Including a per-request correlation id would make every retry look like
a conflict.

### Two layers, and the domain keeps the last word

> **The platform does not replace domain idempotency. It adds an HTTP replay
> layer above it and passes the key down.**

Attendance already owns `(org_id, idempotency_key)` as a partial unique index
plus a `payload_fingerprint`, and raises `attendance_idempotency_conflict`. The
adapter passes the caller's key through, and maps that domain error to
`409 idempotency_conflict`. Where a domain has no key of its own, only the
platform layer protects — and that is stated per operation rather than assumed.

**Replay must not re-fire effects.** Attendance's rule — *"a replay emits
nothing"*, because one real-world arrival must not bill or notify twice — is the
platform rule too.

### Stress tests

- **Attendance ingestion.** A partner's network retries mid-write. Same key, same
  payload → the original fact is returned, no second fact, no second event. This
  works today at the domain layer; the platform preserves rather than adds it.
- **Financial operations, conceptually.** `charge.post` is idempotent by refusal
  (posting an already-posted charge returns it and writes nothing) and payments
  anchor on the processor attempt. Any future financial public operation inherits
  those anchors; **the platform must never invent a money-side idempotency key of
  its own**, because the authoritative anchor is the one that describes a real
  event, not a request.

## Q. Concurrency — ratified

Different mechanisms for different intents, deliberately.

| Write type | Mechanism | Behaviour |
|---|---|---|
| **Resource `PATCH`** | **`ETag` / `If-Match`** | `GET` returns a strong `ETag`. `PATCH` without `If-Match` → `428 precondition_required`. Stale → `412 stale_version`. |
| **Command** | **Domain preconditions** | Semantic expectations (`expected_status`), surfaced as `409 command_precondition_failed`. |

Why not one mechanism: a representation hash is the right precondition for "the
record I read has not changed", and the wrong one for "withdraw this enrolment
only if it is still active" — an unrelated field edit would break the second
while leaving the intent perfectly valid.

**`updated_at` alone is rejected as a concurrency token.** It is not unique, it
is assigned per statement rather than per transaction, and two writes inside one
logical operation can share a value. It is a sync watermark (§04 L), not a
version.

## R. Error contract — ratified

```json
{
  "error": {
    "code": "attendance_site_out_of_scope",
    "type": "forbidden",
    "message": "This installation is not registered for that location.",
    "request_id": "req_01J...",
    "details": { "location_id": "..." }
  }
}
```

`code` is stable and machine-readable. `type` is a coarse class. `message` is for
humans and is **not** a contract. `request_id` appears on every response, success
or failure.

| Condition | HTTP | `type` |
|---|---|---|
| Missing/invalid credential | 401 | `unauthenticated` |
| Expired token | 401 | `token_expired` |
| Scope not granted | 403 | `forbidden_scope` |
| Outside resource boundary | 403 | `forbidden_resource` |
| Unknown or out-of-boundary resource | 404 | `not_found` |
| Schema/validation failure | 400 | `invalid_request` |
| State conflict | 409 | `conflict` |
| Stale `If-Match` | 412 | `stale_version` |
| Missing `If-Match` | 428 | `precondition_required` |
| Idempotency mismatch | 409 | `idempotency_conflict` |
| Domain refusal (blockers) | 409 | `command_blocked` |
| Rate limited | 429 | `rate_limited` |
| Provider/downstream failure | 502 | `upstream_failure` |
| Temporary unavailability | 503 | `unavailable` |

### Two laws

1. **Never expose** stack traces, SQL text, internal exception class names, table
   or column names, or raw driver errors. An unmapped internal failure becomes
   `500 internal_error` with a `request_id` and nothing else.
2. **Preserve domain blockers.** Registered actions already return structured
   `{code, message}` blockers. They are the most useful thing a partner receives
   and they survive into `details.blockers` unflattened.

**Out-of-boundary reads return `404`, not `403`.** Distinguishing them tells an
unauthorized caller that a resource exists — the same reasoning that makes
`kioskDeviceAuthority`'s refusals deliberately coarse. Boundary violations on a
*named* write target may return `403`, because the caller already named it.

## S. Request identity and audit — ratified

Every public request resolves a context, before any handler runs:

```text
request_id            application_id        installation_id
organization_id       credential_id         delegated_actor_id (nullable)
origin                provenance            operation
resource / subject    started_at            completed_at
result                scopes_used           boundary_applied
```

| Field group | Persisted | Transient |
|---|---|---|
| Identity, operation, result, timing | **Durable** | — |
| Security events (auth failure, scope denial, revoked credential use) | **Durable** | — |
| Full request/response bodies | Never | — |
| Debug detail | — | Logs only, short retention |

### This requires a durable audit store, which does not exist

Thread 3 established that `logAdminAudit` is a `console.log` with 57 call sites
and no table behind it, and that the authorization domain writes **no audit of
any kind**.

> **A credential must not be issued into a system that cannot record what it
> did.** The public audit store is a prerequisite of the first credential, not a
> follow-on.

The context must reach downstream domain authority **without domain code
re-authenticating the caller**. Domains receive a resolved principal; they never
parse a token, and they never see the credential.

## T. Rate limits — ratified

**Four dimensions**, evaluated together, most specific first:

| Dimension | Purpose |
|---|---|
| **Credential** | Contains one leaked or looping key |
| **Installation** | The tenant-facing budget a partner is sold |
| **Organization** | Protects a tenant from the sum of its integrations |
| **Operation category** | `read` and `write` budgeted separately; a bulk resync must not exhaust the ingestion budget |

### The kiosk limiter is not reused, and the reason is stated in its own header

`kioskRateLimit.ts` is per-process and in-memory, with an honest caveat: *"on
serverless this is per-instance, not global… a distributed limiter is a platform
capability."*

**For a public API that caveat is disqualifying.** Alloy runs serverless, so a
per-instance limiter multiplies the real budget by the instance count — an
unknowable number that rises exactly when load rises. V1 therefore requires a
**shared, durable counter** (Postgres-backed fixed-window with a monotonic
counter per window key). This is the "platform capability" the kiosk author
correctly declined to build inside a feature.

What *is* reused is its keying insight: **key the window on the thing doing the
work, not on the thing being presented.** A budget keyed on a guessable secret
gives every wrong guess a fresh allowance.

### Response contract

```http
429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 600
RateLimit-Remaining: 0
RateLimit-Reset: 30
```

`RateLimit-*` headers appear on **every** response, not only on 429s, so a
partner can pace itself before being throttled.

**Burst:** a fixed window with a short period (60s) is ratified over a token
bucket for V1 — it is trivially correct under concurrency, and its one weakness
(a double-rate burst across a window boundary) is acceptable at these volumes and
is *stated* rather than discovered.

**Observability:** every throttle emits a durable security-audit row (§S) keyed
by credential and installation. A partner being silently throttled with no record
is indistinguishable from an outage.
