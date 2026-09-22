---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Cross-resource platform gap register

**Canonical owner for: the external contracts that must be solved once for the whole platform.**
Domain classifications live in `16-external-resource-contract-matrix.md`.

Each gap below is stated as the **law** V1 should adopt, what exists today, and what must be built.
A law solved per-endpoint is a law that will differ per-endpoint.

---

## 5A — Archive / deletion semantics · **REPRESENTATION DECIDED · DELIVERY BLOCKED**

**Today.** The shipped Locations contract says it plainly: *"`updated_since` cannot tell you a
location was removed. A deleted row stops appearing"*, and the guide's remedy is a periodic full
bootstrap. Locations survives this because sites and rooms rarely disappear. **Children, placements
and enrollment do not survive it** — a child leaving is the single most important change a childcare
integration must observe, and it is exactly the change the current contract cannot express.

**Proposed law.** Every collection resource gains a lifecycle state in the resource itself, and rows
never vanish from `updated_since`:

| State | Meaning | Visible by default |
|---|---|---|
| `active` | current | yes |
| `archived` | no longer operationally current, still real (a child who left, a closed room) | no — `include_archived=true` returns it |
| `superseded` | replaced by another resource of the same type, which is named | no |
| `merged` | identity folded into another resource, which is named | no |

- A transition **bumps `updated_at`**, so an incremental consumer sees the state change as an
  ordinary page.
- Hard deletion is never an external event. If a row truly disappears, the contract has failed.
- Resources already effective-dated (placement, responsibility arrangement) express supersession
  through their own successor link; the collection state must agree with it rather than duplicate it.

**Must be built before:** Children, Enrollment, Placement, Relationships, Staff, Households.
**Not required for:** Attendance facts (append-only; a reversal tombstone is already the signal).

### Measured lifecycle taxonomy (slice 7.2A)

Every non-append-only candidate already carries canonical lifecycle truth. **No parallel deletion
ledger is needed** — the representation can be derived from what the domain already records.

| Resource | Lifecycle truth it already has | `updated_at` maintained by a trigger? |
|---|---|---|
| Locations | `is_active`, `status_key` | **No** — application-set only |
| Children (`customer_members`) | `is_active`, `status_key` | **No** |
| Households (`customers`) | `status_key` | **No** |
| Placements | `end_date`, `status` (effective-dated, supersede-by-row) | **Yes** |
| Enrollment agreements | `status`, `end_date` | **Yes** |
| Staff (`employments`) | `employment_status`, `end_date`, `supersedes_employment_id` | **Yes** |
| Attendance facts | none needed — append-only, correction/reversal are facts | n/a (no `updated_at`; `created_at` is total and immutable) |
| Relationships (`customer_member_contacts`) | unmeasured — no rows in the certification tenant | unknown |

### The blocker, named exactly

The representation half is decidable today. The **delivery** half is not, for three resources.

`locations`, `customer_members` and `customers` have **no `BEFORE UPDATE` trigger maintaining
`updated_at`** — the only trigger on `locations` is a hierarchy validator. In the certification
tenant, **9 of 10 sampled locations have `updated_at = NULL`**. The shipped
`list_external_locations` survives this by sorting and filtering on
`COALESCE(updated_at, created_at)`, so bootstrap and paging are sound — but a lifecycle change that
does not set `updated_at` **does not move the sort key**, and an incremental consumer never learns
it happened.

So the law cannot be certified for those resources until `updated_at` moves on lifecycle change.
The remedy is a trigger on each of the three tables. **Slice 7.2 deliberately did not add it**:
that is a change to shared domain tables used across the product, and the instruction for this
phase was explicit — *"Do not change these domains in this phase."*

**Disposition:** representation decided (below); delivery blocked on a bounded domain change that
belongs with the People slice that first needs it, or its own migration slice.


---

## 5B — Public idempotency · **RESOLVED (slice 7.3)**

**Today.** Attendance has replay identity internally — `(producer, provider_event_id)` namespaced,
with a payload fingerprint kept alongside to tell a replay from a contradiction that reused the same
id, and `duplicate` as a truthful answer that is never a stored state. **The platform has no
`Idempotency-Key` contract at all.**

**Proposed law.**

| Case | Behaviour |
|---|---|
| Which operations require a key | Every governed operation that creates or asserts a fact. Reads never |
| Same key, same payload | Return the original result, `applied` → `duplicate`, no second effect |
| Same key, different payload | `409 conflict` with an idempotency-conflict code. Never "last write wins" |
| Concurrent same key | One wins; the other waits for the outcome and returns it. Never two effects |
| Retention | At least the provider's plausible retry horizon — propose 7 days, decided with the first operation |
| Response headers | Echo the key; state whether the response was replayed |
| Storage owner | The platform, not the domain. Attendance's internal identity stays; it must not become the public scheme |

**D-09 is resolved by existing doctrine, not by a new choice.** Alloy already has one idempotency
mechanism, applied consistently and independently four times:

| Where | Key | Shape |
|---|---|---|
| Attendance ingestion | `` `${producerKey}:${externalEventId}` `` | actor + the caller's own fact id |
| Payments | `payments.idempotency_key` derived from the collection, enforced twice (key + unique index) | *"Derived, stable, and never a delivery id"* |
| Parent intent | `parent_link:<link>:away:<from>:<to>:<reason>` | semantic composite |
| Tours | derived per send | semantic composite |

Every one is **derived from the meaning of the fact**, never a caller-supplied opaque token. So the
public law follows the doctrine rather than inventing a second mechanism:

1. A public operation derives its idempotency identity from the caller's own external identity for
   the fact, namespaced by the installation's `producer_key` — which already survives credential
   rotation.
2. An `Idempotency-Key` header is accepted **only** where an operation has no natural fact identity.
   No proposed V1 operation lacks one, so V1 needs no header.
3. A 4xx validation failure does **not** consume an identity: nothing was recorded, so nothing is
   being replayed.
4. The first terminal response is what a replay returns.

**No generic idempotency store was built, on purpose.** The mechanism already exists in the domains
that write, and a new primitive whose only consumer is a speculative future operation is how a
platform acquires two answers to one question.

---

## 5C — Concurrency / preconditions · **NOT BLOCKING FOR V1**

- **Append-only facts (Attendance):** version preconditions make no sense. A correction names the
  event it corrects; that *is* the precondition.
- **Effective-dated records (placement, responsibility):** the domain already refuses incoherent
  overlaps in the database. A semantic precondition ("supersede the arrangement effective on this
  date") is the right external shape, not `If-Match`.
- **Mutable resources:** none proposed for V1 writes.

**Law:** do not impose resource versioning on facts. Introduce `ETag`/`If-Match` only when a V1
operation mutates a mutable resource in place — which no proposed V1 operation does.

---

## 5D — External resource correlation · **PARTLY SOLVED**

**Today.** `integration_resource_refs` is implemented and richer than the Thread 3 inventory claims:
resource kinds `child` and `location`; scoped by installation **and** org; one active external id per
(installation, kind); one active alias per Alloy resource per installation; `active | disabled |
orphaned`, where disabled preserves the mapping that was live when a fact was authored and orphaned
survives an uninstall so a reinstall reconciles rather than duplicates; unmapped fails closed and
ambiguous is refused rather than guessed. **There is no public access to any of it.**

**Answers to the V1 questions.**

| Question | Answer |
|---|---|
| Does V1 need alias CRUD endpoints? | **No.** A dedicated alias API is a second integration surface to learn |
| Then how is an alias authored? | **In the operation that uses it.** Attendance submission already carries `externalChildId`; resolution happens there |
| Which side authors it? | The partner supplies its id; Alloy binds it to a resource the installation may already reach. Alloy never creates a resource from an alias |
| Relink | Deliberate transition: old row `disabled`, new row `active`. The uniqueness indexes enforce it |
| Uninstall / reinstall | `orphaned`, retained, reconciled on reinstall |
| One external id → many Alloy resources? | **No**, within an installation — refused as ambiguous |
| One Alloy resource → many aliases? | **Not within an installation.** Across installations, yes — aliases are installation-scoped |

**Extension needed for V1 reads:** an external consumer should be able to *see* the alias on a
resource it reads, and to look a resource up by its own id. Proposal: an optional `external_id`
field on resources the installation has mapped, and an `external_id=` filter on those collections.
No new table, no alias CRUD. Kinds must extend beyond `child`/`location` as resources are added.

---

## 5E — Collection grammar · **SOLVED AND EXTENDED (slice 7.2)**

`lib/platform/external/collection.ts` was written to be resource-agnostic: cursor pagination,
deterministic `(updated_at, id)` order, default 50, maximum 200, and the two rules that matter —
*a cursor is a position, not a permission* (org and boundary are applied inside the SQL, so a forged
cursor can move the window and never widen it), and the `id` tiebreak is not optional because
`updated_at` alone is not unique and rows would be silently skipped or repeated forever.

**Law for every new collection:** reuse this module. Additions needed:

- **`sync_token` (added).** Every page returns the exact position of its last row, including the
  last page — the page a consumer most needs to remember and the one `next_cursor` deliberately
  leaves null. `since_token` resumes from it. A cursor and a sync token are the same thing at two
  timescales, so the platform resolves both to one position rather than growing two comparison paths.
- **`updated_since` is now exact (fixed).** It was re-serialized through a JavaScript `Date`
  (milliseconds) while Postgres stores microseconds, so a watermark moved *backwards* and the
  boundary row was redelivered. Measured in 7.1, removed in 7.2: the validated string is passed
  through unchanged. Attendance's documented at-least-once caveat is withdrawn.
- `include_archived` (from 5A), default false.
- Named filters that **narrow only** — a filter may never introduce a row the unfiltered query
  would not return.
- `external_id` filter where correlation exists (5D).
- **No offset pagination**, ever.
- **Schedules are the exception**: derived data has no `updated_at`, so the schedule projection is a
  dated query, not a synchronized collection.

---

## 5F — Error model · **ONE GAP CLOSED (slice 7.3), ONE DEFERRED**

Implemented: `invalid_request` 400, `unauthenticated` 401, `forbidden_scope` 403,
`forbidden_resource` 403, `not_found` 404, `conflict` 409, `rate_limited` 429, `internal_error` 500,
with request correlation preserved.

| Required case | Covered? |
|---|---|
| validation | `invalid_request` |
| unauthenticated | `unauthenticated` |
| forbidden scope | `forbidden_scope` |
| forbidden resource | `forbidden_resource` |
| not found | `not_found` |
| conflict | `conflict` |
| **idempotency conflict** | **added in slice 7.3** — `idempotency_conflict`, 409, distinct from `conflict` so a client knows which fix applies |
| **precondition failure** | **absent** — only needed if 5C introduces preconditions |
| rate limit | `rate_limited` |
| internal | `internal_error` |

**Law:** out-of-boundary single reads answer `not_found`, never `forbidden_resource` — otherwise the
error itself discloses that a resource exists in another boundary.

---

## 5G — Rate limits · **RESOLVED (slice 7.3)**

Implemented policies are exactly two: `tokenExchange` 30/60s (keyed client_id + hashed IP, consumed
before verification) and `authenticatedRead` 600/60s (keyed installation). **There is no write
budget**, and the first governed operation needs one.

**Implemented.** `authenticatedWrite` — 120 per 60s, keyed by installation, one request per batch.
Tighter than reads (600) and looser than token exchange (30); that ordering is the policy and is
pinned by test. It is deliberately not tighter: every public operation derives a durable idempotency
identity, so a client retrying a timeout replays rather than duplicates, and punishing that retry
would push clients toward resubmitting with a fresh identity — the one behaviour the idempotency
contract exists to prevent. Organization-level and per-application quotas remain uninvented until
there is a negotiation to model.

---

## Gap summary

| Gap | State | Blocks |
|---|---|---|
| 5A archive/delete | representation decided; **delivery blocked** on `updated_at` maintenance for locations/customer_members/customers | every people/enrollment resource |
| 5B public idempotency | **resolved by doctrine** (7.3); no store built, none needed | nothing |
| 5C concurrency | law stated, nothing to build for V1 | nothing |
| 5D external correlation | table exists; needs read exposure + more kinds | correlation-aware reads |
| 5E collection grammar | **solved and exact** (7.2): `sync_token`, `since_token`, full-precision watermark | nothing |
| 5F error model | **`idempotency_conflict` added** (7.3); precondition type still unneeded | nothing |
| 5G rate limits | **`authenticatedWrite` added** (7.3) | nothing |
