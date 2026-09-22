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

## 5A — Archive / deletion semantics · **BLOCKING**

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

---

## 5B — Public idempotency · **BLOCKING FOR WRITES**

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

**Open:** whether the public key is supplied by the caller (`Idempotency-Key`) or derived from the
domain's own external event id. Attendance already has a natural key, which is an argument for
deriving it — but a generic operation may not. Recorded as **D-09**.

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

## 5E — Collection grammar · **SOLVED, ADOPT AS-IS**

`lib/platform/external/collection.ts` was written to be resource-agnostic: cursor pagination,
deterministic `(updated_at, id)` order, default 50, maximum 200, and the two rules that matter —
*a cursor is a position, not a permission* (org and boundary are applied inside the SQL, so a forged
cursor can move the window and never widen it), and the `id` tiebreak is not optional because
`updated_at` alone is not unique and rows would be silently skipped or repeated forever.

**Law for every new collection:** reuse this module. Additions needed:

- `include_archived` (from 5A), default false.
- Named filters that **narrow only** — a filter may never introduce a row the unfiltered query
  would not return.
- `external_id` filter where correlation exists (5D).
- **No offset pagination**, ever.
- **Schedules are the exception**: derived data has no `updated_at`, so the schedule projection is a
  dated query, not a synchronized collection.

---

## 5F — Error model · **NEARLY SUFFICIENT, TWO GAPS**

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
| **idempotency conflict** | **absent** — needs a distinct code so a client can tell it from a domain conflict |
| **precondition failure** | **absent** — only needed if 5C introduces preconditions |
| rate limit | `rate_limited` |
| internal | `internal_error` |

**Law:** out-of-boundary single reads answer `not_found`, never `forbidden_resource` — otherwise the
error itself discloses that a resource exists in another boundary.

---

## 5G — Rate limits · **INSUFFICIENT FOR WRITES**

Implemented policies are exactly two: `tokenExchange` 30/60s (keyed client_id + hashed IP, consumed
before verification) and `authenticatedRead` 600/60s (keyed installation). **There is no write
budget**, and the first governed operation needs one.

**Proposed law.** A third policy, `authenticatedWrite`, keyed by installation, deliberately lower
than reads; a batch counts as one request against the budget and N against a separate item ceiling,
so a day's sync is not punished as if it were N calls. Organization-level and operation-category
budgets are not needed at V1 volumes and should not be invented before evidence.

---

## Gap summary

| Gap | State | Blocks |
|---|---|---|
| 5A archive/delete | **must be designed and built** | every people/enrollment resource |
| 5B public idempotency | **must be designed and built** | every governed operation |
| 5C concurrency | law stated, nothing to build for V1 | nothing |
| 5D external correlation | table exists; needs read exposure + more kinds | correlation-aware reads |
| 5E collection grammar | solved; needs `include_archived` + filters | nothing |
| 5F error model | needs idempotency-conflict code | first operation |
| 5G rate limits | needs a write budget | first operation |
