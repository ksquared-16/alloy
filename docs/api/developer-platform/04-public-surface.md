---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 04 — The public surface (Phases H, I, J, K, L)

## H. Namespace — ratified

**Decision: the logical public namespace is `/api/v1/*`.**

Canonical documentation already promises exactly this path
(`docs/api/api-architecture.md:166`, `docs/api/README.md:12`), and honouring a
promise the docs already made costs nothing and avoids a second migration.

Rejected: `/public-api/v1/*` — a second API root with no benefit over a prefix.
Rejected **as a V1 requirement**: `api.<alloy-domain>/v1/*` — a host split is a
deployment decision, not a contract decision. The logical contract is ratified
here; fronting it at a dedicated host later changes no path and no client code.

Not reused: `/api/public/*`. That prefix already means *unauthenticated
participant and device token routes* (forms, kiosk). Overloading it would put a
credential-authenticated partner contract in the same tree as anonymous
token-bearer endpoints, and the two have opposite trust rules.

### Mechanical identifiability — enforced, not asserted

> **Law: public-contract routes must be mechanically identifiable, and internal
> routes must not inherit external compatibility promises.**

Enforced by a prebuild guard, alongside Alloy's existing route guards:

1. Every route under `web/app/api/v1/**` **must** declare a public contract
   descriptor (operation id, scopes, stability) or the build fails.
2. No route outside `web/app/api/v1/**` may declare one.
3. Every `/api/v1` route must appear in the public OpenAPI document; coverage is
   a gate, not a report.

Thread 3 found the internal estate has 14 of 613 routes in OpenAPI precisely
because coverage was advisory. The public surface starts with it mandatory —
that is the one place the internal platform's history is a direct instruction.

## I. Public resource law

A public canonical resource **must**: represent a real domain concept; have
stable identity; have exactly one canonical owner; be tenant scoped; distinguish
writable from derived fields; represent relationships deliberately; and carry
concurrency metadata where it is writable.

A public canonical resource **must not** be: a table projection; a ViewModel; a
Focus Panel payload; queue state; or a compatibility entity where a canonical one
exists.

Consequences, stated so they cannot be argued away later:

- **`contacts` is never a public resource.** The manifesto classifies it as
  migration debt (§VI). `persons` is the canonical concept.
- **Queue state is never truth.** It is presentation ordering.
- **No table is externalized.** A resource whose only definition is "the columns
  of table X" has failed the first test.

## J. V1 resource catalog — ratified

| Resource | Class | Why |
|---|---|---|
| `GET /v1/context` | **V1** | The installation describing itself: org, scopes, boundary. Makes every other call debuggable. |
| `GET /v1/locations`, `/v1/locations/{id}` | **V1** | The boundary dimension; a partner cannot use a location grant it cannot enumerate. |
| `GET /v1/children`, `/v1/children/{id}` | **V1** | The subject of the reference case. |
| `POST /v1/attendance/events` | **V1** | The reference mutation. |
| `GET /v1/attendance/events` | **V1** | Read-back for reconciliation; a write-only integration cannot self-verify. |
| persons, households, relationships | **LATER** | Thread 3 labelled this domain `UNSAFE_OR_AMBIGUOUS` — seven `persons` insert sites, no single authority. Externalizing it would publish the ambiguity. |
| enrollment cases and participations, agreements, placements | **LATER** | Status has a transactional RPC; placement and participation do not, and `applyChildParticipationEdit` writes in place past two dead guards. |
| schedules | **LATER** | Thread 3's worst-converged domain — nine write paths. |
| rooms / operational groups | **LATER** | Needed only when attendance moves become externally addressable. |
| work units, queues, configuration entities, layouts | **NOT_PUBLIC_RESOURCE** | Internal or presentation concerns. |
| `contacts`, legacy `messages` | **NOT_PUBLIC_RESOURCE** | Compatibility debt. |

Six endpoints. **V1 is deliberately not "all of Alloy".** Each `LATER` entry has
a named, evidenced blocker rather than a scheduling excuse — which means each has
a testable condition for promotion to V1.

## K. Identifier contract — ratified

**Decision: the public id of a resource is its internal UUID, published as an
opaque string.**

The contract documents these as opaque strings, **not** as UUIDs. Alloy therefore
keeps the freedom to change the format without breaking the documented type, and
partners get no licence to parse them.

Why not a separate public-id space: it is a second identity system for objects —
the same mistake the platform law forbids for principals — and it buys the
ability to re-point a public id at a different row, which nothing requires.
Alloy's UUIDs are `gen_random_uuid()` v4: non-sequential, non-enumerable, and
they leak no more than "this system uses UUIDs".

### External correlation — `integration_resource_refs`

Partners hold their own identifiers. Correlation is explicit and separate from
identity.

```text
integration_resource_refs
  id                 uuid
  installation_id    uuid   -- the namespace
  org_id             uuid   -- from the installation, denormalized for scoping
  resource_type      text   -- a DOMAIN concept: 'child', 'location'
  external_id        text   -- the partner's identifier
  alloy_resource_id  uuid
  status             text   -- active | orphaned | superseded
  created_at, updated_at

  UNIQUE (installation_id, resource_type, external_id)
  UNIQUE (installation_id, resource_type, alloy_resource_id)
```

Laws: installation and org scoped · unique within the source namespace · relink
is a controlled, audited transition to `superseded`, never an in-place
overwrite · supports upsert/replay correlation · survives uninstall as
`orphaned`.

> **An external id is an alias, never a person.** A reference row must never be
> read as evidence that a child, person or household exists. Creating identity
> from a correlation row is how an integration silently forks a person record.

### The existing `external_mappings` table is rejected

It exists in the schema and has **zero code usage** at this baseline. It is
unsuitable, structurally:

| Problem | Consequence |
|---|---|
| **No `org_id` column** | Not tenant scoped — disqualifying on its own |
| Keyed on `internal_table` + `internal_id` | Correlates to *physical tables*, the externalize-tables anti-pattern |
| Free-text `source` | No installation binding, so no revocation story and no namespace |

It is import-era legacy. V1 does not extend it, and does not silently leave it
looking like the platform's correlation model.

## L. Collection contract — ratified

One grammar, applied to every collection.

| Concern | V1 |
|---|---|
| Pagination | **Cursor.** Opaque `cursor`, returned as `next_cursor`. No offsets. |
| Default page size | 50 |
| Maximum page size | 200 |
| Sort | Deterministic **`(updated_at ASC, id ASC)`**. The `id` tiebreak is required — `updated_at` alone is not unique and a non-unique sort key silently skips or repeats rows across pages. |
| Cursor stability | A cursor encodes the sort tuple, not an offset, so inserts during pagination do not shift the window. |
| Filters | **Specific and named per resource.** No generic query language. |
| `updated_since` | Supported on every collection. The resync primitive. |
| Location filter | Supported; intersects with the boundary (§03), never widens it. |
| Archived / deleted | Excluded by default. Surfaced via an explicit `status` field with `include_archived=true` — **never by silent disappearance**, which is indistinguishable from a sync bug. |
| Expand / include | **Not in V1.** Relationships are referenced by id. |
| Sparse fieldsets | **Not in V1.** |
| Consistency | Read-your-writes is **not** guaranteed. |

### The resynchronization contract

A partner resyncs with `updated_since`, and the contract requires an **overlap
window**: re-request from a few minutes *before* the last observed `updated_at`,
and treat results as upserts keyed by resource id.

This is stated because the naive reading is wrong. `updated_at` is wall-clock and
assigned per statement, not transactionally ordered, so two rows written in one
logical operation can land either side of a cursor boundary. A partner that
resyncs from *exactly* its last watermark will eventually miss a row. Idempotent
upserts plus overlap make that safe; a promise of exactness would not be true.
