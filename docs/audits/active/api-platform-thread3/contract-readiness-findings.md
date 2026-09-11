---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — contract readiness: authorization coverage, idempotency, errors, collections, versioning

Against promoted staging `4f21979e6bec`. Point-in-time discovery. Designs nothing.

---

## 1. Authorization coverage — the sharpest number in the thread

`web/scripts/routeCapabilities.declared.json` is a complete, CI-enforced, disk-discovered registry
of every exported HTTP handler at method grain. Measured directly:

| | Count |
|---|---:|
| Route files | 613 |
| Exported HTTP methods | **797** |
| `pending` — never reviewed for what capability they require | **714 (89.6%)** |
| `none` — reviewed, legitimately ungated | 49 |
| `declared` — requires a catalog capability | **34** |
| Distinct capabilities enforced platform-wide | **10** |
| Catalog keys certified **inert** | **35** |

The ten: `settings.users_roles` (9), `communications.send` (6), `fin.read` (5),
`settings.users_roles.read` (4), `documents.read` (3), `reports.read` (3), `attendance.record` (1),
`settings.read` (1), `settings.manage` (1), `health.view` (1).

`web/lib/admin/unenforcedPermissionKeys.json` calls the inert set *"a control that changes nothing
— 'revocation theatre'"*. It includes `ops.schedules.read/write`, `scheduling.read/write`,
`crm.opportunities.read/write` and `fin.read/write`.

**Why the backlog cannot be cleared mechanically**, in the table's own words: `requireAdminOrOps`
*"admits by ROLE, not by grant"*, so swapping in a capability **widens** admission for non-portal
principals while `portal AND capability` **narrows** it for orgs lacking the grant.

### An important correction to the brief's premise

The brief assumes no route registry exists. **It does** — the file above, CI-required via
`.github/workflows/web-prebuild-gates.yml`, ratcheted, with a three-state declaration model. It
registers the wrong *facet* (auth admission rather than response shape), but the enumeration,
discovery and ratchet machinery is already load-bearing. **Any Thread 4 option needing a route
registry can extend this one rather than build one.**

## 2. Tenant binding is refused by design — and that is the blocker

`web/lib/admin/resolveAdminAccessCore.ts:233` returns `null` when a principal holds membership in
more than one org:

> *"Ambiguous. There is no request org to consult, and any rule that resolves this — smallest UUID,
> portal rows first, most roles — is an authority decision made where no authority decision
> belongs. Refuse."*

That is correct engineering. It is also exactly why a partner credential serving several tenants
cannot exist today: **there is no way for a request to say which tenant it means.** The kiosk shows
the shape of the answer — org read off the credential row — for precisely one table.

## 3. Idempotency — nine patterns, and the strongest guard is opt-in

| Domain | Class |
|---|---|
| Attendance facts + corrections | `RETRY_SAFE_WITH_CALLER_KEY` |
| Charges / tuition | `RETRY_SAFE` |
| Payments / refunds | `RETRY_SAFE` |
| Provider webhooks (Stripe) | `RETRY_SAFE` |
| Subsidy claims / remittance | `RETRY_SAFE` / `_WITH_CALLER_KEY` |
| Processing commits · identity commits · scheduling · relationships · configuration | `CONDITIONALLY_RETRY_SAFE` |
| **Operational Commands** | **`UNSAFE_TO_RETRY`** |
| **Communications sends** | **`UNSAFE_TO_RETRY` under concurrency** |

Attendance is the only path that **suppresses the downstream side effect on replay**, and its own
comment names the failure it prevents — *"one real-world arrival bill or notify twice"*. Its key is
nevertheless **caller-supplied and optional**, and the backing index is partial on `IS NOT NULL`.

**Three verified defects:**

- **Communications claims idempotency against a constraint that does not exist.** `canonicalSend`
  selects on `metadata->>idempotency_key` and defers to "the unique constraint". The only unique
  index on `communication_messages` is partial `WHERE direction = 'inbound'` — outbound is
  explicitly excluded by the predicate. Two concurrent sends with the same key both read nothing,
  both claim, both enqueue. **The artifact is a message a family receives.**
- **A config command swallows its own unique violation** as a missing-migration branch, because the
  constraint name contains the substring the earlier branch tests for. The correctly-written
  duplicate handler is unreachable for exactly the case it was written for.
- **Identity-commit replay keys off the wrong column** — the correct `loadAttemptByIdempotencyKey`
  has zero callers.

**No transactions anywhere, by design** — `platformTransaction.ts` states Postgres transactions are
unavailable across the PostgREST client, so every boundary is a saga. Where both halves are
independently idempotent this holds; where they are not, a mid-sequence failure leaves partial
state with no compensation.

**Server-side optimistic concurrency exists in exactly one family** — 8 experimental, flag-gated
routes. Generic config writes are last-write-wins with no version column and no `If-Match`.

## 4. Error contracts — broad inconsistency

| | Count | of 613 |
|---|---:|---:|
| Use the canonical `apiOk`/`apiError` envelope | **15** | 2.4% |
| Hand-build `NextResponse.json` | 557 | 90.9% |
| Emit a bare `{ error: … }` | 474 | 77.3% |
| Emit a correlation id | **15** | 2.4% |
| Use the helper written to prevent raw error leakage | **0** | 0% |

**Eleven** live shared error shapes; the code field has three names and two casings. This is not
"several families" — a families verdict requires a client to be able to pick a parser per surface,
and it cannot.

**The decisive finding: the OpenAPI spec is wrong about all 20 of its own operations.** It declares
401 and 403 as the standard failure envelope with a required correlation-id header. The
implementation returns a bare `{ error: "Unauthorized" }` — no `ok`, no code, no correlation id, no
header — and a route comment states this is deliberate. `npm run api:check` does not catch it
because **the contract suite mocks the auth gate to always succeed.**

**And `api:check` is in zero GitHub workflow files.** Verified. Meanwhile
`api-platform-governance.md` and `openapi-readiness.md` both list that CI row as ✅ Complete. A
local command nobody is obliged to run is not a gate.

Good news worth keeping: 401 vs 403 discipline is centralized and correct, and the kiosk family
gets uniform denial exactly right.

## 5. Collections — no reusable contract exists

`PageInfo`, `SyncMetadata` and `FreshnessClass` are defined in the spec, generated into the typed
client, and **`$ref`'d by zero operations** — three orphan schemas. Emission across all routes:
`page_info` 0 · `has_more` 0 · `next_cursor` 1 · `hasMore` 3 (one file).

**~81 distinct top-level response key names.** One cursor route, nine offset routes, ~310 with no
pagination inputs at all. Twenty routes accept a `limit` with no way to request page 2 — several
returning an exact `total`, telling the caller about rows it cannot reach.

Caller-controlled sort: **1 of ~350**. Tiebreakers: **2 code paths** — so offset routes ordered by
a non-unique timestamp both skip and duplicate rows under concurrent insert.

**Soft delete does not exist**: `deleted_at` appears in **zero** migrations and zero routes.
`updated_at` is not a reliable sync watermark — 187 tables have the column, 108 have a trigger
maintaining it.

Search is `ilike '%term%'` everywhere, with inconsistent input sanitization between two routes over
similar data.

## 6. Versioning — nothing prevents a breaking change

- **URL versions: 0 of 613.** The `/v0|v1|v2/` segments that exist are feature names or a dev-bug
  rewrite, not API versions.
- **Payload versions: in persistence, absent from transport.** `schema_version` appears in 144
  files under `web/` and **0** under `web/app/api`.
- **Command versions: none.** Key aliasing exists and covers the *key*, never the *shape*; the
  payload is `Record<string, unknown>`.
- **Event versions: none**, and `event_type` is open free-text with no CHECK — the platform cannot
  enumerate its own event types statically.
- **Deprecated routes: none.** Zero `sunset` occurrences; the tracker's sunset list contains no
  routes.

> **What currently prevents an internal route change from breaking an external consumer?**
>
> **Nothing does, because there is no stable external contract.** What protects the platform today
> is whole-program coupling: routes and callers ship in one deployment, and the typed client has
> **one** production consumer against **863** raw `fetch("/api/…")` call sites. The platform is safe
> from external breakage the way a monolith is — by having no external surface.

**One constraint is genuinely forcing, and it removes an option rather than choosing one:** a
versioned surface cannot be a *rename* of the existing routes. The capability manifest is keyed by
file path and method and is a required CI gate, so moving 613 routes under a version segment is 613
manifest rewrites in one unreviewable diff. A versioned surface must be **additive**.

## 7. Rate limits and abuse

Two in-memory, per-process limiters (kiosk, tour-public). Two 429 producers. No global limiter, no
`maxDuration` on any route, no WAF. `Retry-After` appears in two files, both kiosk. HTTP 429 from a
route: **0**. The `RATE_LIMITED` code exists and is referenced by zero routes — so a caller cannot
distinguish "retry" from "never".

Single-request amplification, not merely repetition: a parameterless `GET
/api/admin/childcare-attendance` serializes the org's entire attendance history with no limit,
range or date cap; the financial statements balance-sheet branch scans full-history GL with no lower
bound and feeds every id into an unbounded `IN`; `form-deliver` loops caller-supplied person ids
straight into provider sends with **no roster or membership check**.

## 8. Observability — what a tenant developer could see today: nothing

`logAdminAudit` is `console.log`, called by 44 files; there is no general audit table. Command audit
is declared on all 27 definitions and emitted by 2, best-effort, outside the mutation's transaction.
Kiosk `last_seen_at` / `last_used_at` columns exist and are never written; a kiosk denial reason is
computed and discarded.

The strongest audit trail in the codebase is `payment_provider_events`, and it is a provider
receipt rather than an Alloy action log.

There is no API request log, no application-identity attribution, and no developer-facing
diagnostics — so the question *"what did this integration call, when, as whom, and what
happened?"* has no answer for anyone outside the server logs.
