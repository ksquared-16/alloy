---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Alloy API — Conventions

> ⚠ Describes the ratified V1 contract. Not yet implemented.

## Resources vs Operations

```text
GET  a resource     = canonical state
POST an operation   = governed mutation intent
```

Alloy does not let you drive a state machine by assigning to a column. Reads are
resources; meaningful changes are **operations** with names.

```http
POST /v1/attendance/events        ✅  an intent, with a name
PATCH /v1/attendance/{id}         ❌  does not exist, and will not
```

A `PATCH` exists only for bounded field corrections with no operational
consequence. If changing a field would change anything *else* — an event, a
notification, a balance, an eligibility — it is an operation.

**Attendance is append-only.** A correction is a new fact carrying lineage, not
an edit. This is enforced in Alloy's database for every caller including Alloy
itself, so no API could offer you an edit.

## Collections

Every collection shares one grammar.

```http
GET /v1/children?limit=50&cursor=<opaque>&updated_since=2026-09-01T00:00:00Z
```

| | |
|---|---|
| Pagination | Cursor. Pass `next_cursor` back as `cursor`. No offsets. |
| Page size | `limit`, default 50, maximum 200 |
| Sort | `updated_at` ascending, `id` as tiebreak — stable and deterministic |
| Filtering | Specific named filters per resource. No query language. |
| Archived | Excluded by default; use `include_archived=true` and read `status` |

**Deleted and archived records do not silently vanish** — they change `status`.
A record disappearing from a collection is a sync bug, not an archive.

### Resynchronizing

Use `updated_since`, and **overlap deliberately**: re-request from a few minutes
*before* your last observed `updated_at`, treating results as upserts keyed by
resource id.

This is not defensive padding. `updated_at` is wall-clock and assigned per
statement, not transactionally ordered, so two rows written in one logical
operation can land either side of an exact watermark. Resyncing from precisely
your last timestamp will eventually miss a row. Idempotent upserts plus overlap
make that safe.

## Idempotency

**Required on every mutation.** A `POST` without `Idempotency-Key` is rejected.

```http
POST /v1/attendance/events
Idempotency-Key: 3f9c1e77-2b40-4a8e-9f1a-5c2d8e6b7a01
```

| Situation | What happens |
|---|---|
| Same key, same payload | The original response is replayed, `Idempotency-Replayed: true`. No second fact, no second event. |
| Same key, different payload | `409 idempotency_conflict` |
| Two concurrent, same key | One succeeds; the other gets `409 idempotency_in_progress`. Retry. |
| Key reused after 30 days | Treated as new — records are retained 30 days |

Generate one key per real-world event, not per HTTP attempt. A retry of the same
arrival must carry the **same** key; a genuinely different arrival must carry a
different one.

## Concurrency

| Writing | Mechanism |
|---|---|
| A resource field (`PATCH`) | `ETag` / `If-Match`. Missing → `428`, stale → `412` |
| An operation | Semantic preconditions in the body → `409 command_precondition_failed` |

Do not use `updated_at` as a version token. It is not unique and not
transactionally ordered.

## Errors

```json
{
  "error": {
    "code": "attendance_site_out_of_scope",
    "type": "forbidden_resource",
    "message": "This installation is not registered for that location.",
    "request_id": "req_01J...",
    "details": { "location_id": "..." }
  }
}
```

Branch on `code`. `type` is a coarse class. **`message` is for humans and is not
a contract** — it may change.

| HTTP | `type` | Usually means |
|---|---|---|
| 401 | `unauthenticated` / `token_expired` | Get a new token |
| 403 | `forbidden_scope` | The installation lacks the scope |
| 403 | `forbidden_resource` | Outside your location boundary |
| 404 | `not_found` | Unknown, **or** outside your boundary |
| 400 | `invalid_request` | Schema or validation |
| 409 | `conflict` / `idempotency_conflict` | State or key conflict |
| 409 | `command_blocked` | A domain rule refused — read `details.blockers` |
| 412 / 428 | `stale_version` / `precondition_required` | Concurrency |
| 429 | `rate_limited` | Back off; see `Retry-After` |
| 5xx | `upstream_failure` / `unavailable` | Retry with backoff |

**`404` can mean "outside your boundary".** Alloy will not confirm that a
resource exists when you are not entitled to it.

**`409 command_blocked` is not a bug.** It is a domain rule speaking, and
`details.blockers` tells you which. Surface them to your users.

Always log `request_id`. It is the one identifier Alloy support can trace.

## Rate limits

Limits apply per credential, installation, organization, and operation category
(reads and writes are budgeted separately).

```http
RateLimit-Limit: 600
RateLimit-Remaining: 412
RateLimit-Reset: 30
```

These headers are on **every** response, not just `429`s — pace yourself before
you are throttled. On `429`, honour `Retry-After`.

## External IDs

You hold your own identifiers. Alloy correlates them without adopting them.

> **An external ID is an alias, never an identity.** A correlation reference is
> not evidence that a child, person or household exists, and Alloy will never
> create one from it.

- References are scoped to **your installation** — yours never collide with
  another integration's.
- One external ID maps to one Alloy resource, and one Alloy resource to one
  external ID, within your installation.
- Relinking is a controlled, audited transition, not an overwrite.
- If your installation is removed, references are retained and marked orphaned —
  so a reinstall can reconcile instead of silently duplicating.

Alloy resource ids are **opaque strings**. Do not parse them or assume a format.
