---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Integrating with Alloy

A guide for any engineering team building against the Alloy public API. It
assumes you know how to call an HTTP API and nothing about how Alloy is built.

Read this once end to end before you design your sync. Most of the expensive
mistakes in an integration are decisions made in the first hour.

---

## 1. Three kinds of thing

Everything in this API is one of three kinds, and keeping them apart is the
single most useful habit you can bring:

| | Question it answers | Shape |
| --- | --- | --- |
| **Resources** | What is true? | Collections you read and synchronize |
| **Operations** | What do you want Alloy to do? | Named submissions, not field edits |
| **Sync** | What changed? | Checkpoints you keep and hand back |

Alloy does not let you drive behaviour by assigning to a field. If changing
something would have a consequence — a record, a notification, an eligibility —
it is an operation with a name, not a `PATCH`.

---

## 2. How you are identified

Four things, in order. Each one narrows what the next can do.

```
Developer Application      who built the software
        │
        └── Installation   one organization's decision to run it
                │
                └── Credential      a client id and secret, rotatable
                        │
                        └── Access token     short-lived, sent per request
```

**Developer Application** — your software, registered once. It is not tied to
any customer.

**Installation** — one organization choosing to run your application. This is
where authority actually lives: the organization, the scopes granted, and the
locations you may reach are all properties of the Installation, not of your
application. The same application installed by two organizations has two
entirely separate authorities.

**Credential** — a client id and secret belonging to one Installation. Credentials
can be rotated or revoked without disturbing anything the Installation has
already done, including facts you have already submitted.

**Access token** — what you actually send. Short-lived, obtained by exchanging a
credential.

### Getting a token

```http
POST /api/v1/oauth/token
Content-Type: application/json

{ "grant_type": "client_credentials",
  "client_id": "...", "client_secret": "..." }
```

```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 900,
  "scope": "children.read attendance.write" }
```

Send it as `Authorization: Bearer <token>` on every other call. Cache it until
shortly before expiry; do not exchange a credential per request.

### Knowing what you hold

```http
GET /api/v1/context
```

Returns the organization you are bound to, the scopes you were granted and the
locations you may reach. It requires **no scope** beyond a valid token, and there
is no `context.read` to ask for: a caller that cannot discover what it holds
cannot diagnose why something else was refused, so this is inherent to holding a
credential rather than a permission an operator grants.
**Call this first when anything is unexpected.**

---

## 3. Authority: what you can reach, and why

Two independent limits apply to every request. Neither is anything you send.

### Tenant

A token resolves to exactly **one** organization. There is no `org_id` parameter
anywhere in this API, and no way to ask about another organization. This is not a
filter you could forget to apply — it is a property of the token.

### Resource boundary

An Installation is granted either the whole organization or a specific set of
locations. Everything you read is filtered to that boundary before any filter of
yours is considered.

Three consequences worth internalising:

- **An empty boundary denies everything.** It never means "all locations".
- **Your filters narrow; they never widen.** Asking for a location outside your
  boundary returns nothing. It does not error, and it does not return everything.
- **An identifier is not a key.** A valid Alloy identifier — or one of your own
  mapped identifiers — that points at something outside your boundary is refused.
  Possessing an id has never been the same as being entitled to it.

### Scopes

Scopes are matched **exactly**. No hierarchy, no prefixes, no wildcards.
`children.read` grants children and nothing adjacent; `relationships.read` does
not include contact details, which are their own scope; no read implies a write.

The clearest illustration: an Installation granted only `attendance.write` can
record that a child arrived and **cannot read back a single attendance record**.

Ask for the smallest set you need. Operators see these as plain-language
permissions when they install your application, and a request for data you do not
use is a request they may decline.

---

## 4. The resource graph

```
Location (site)
   └── Location (unit / room)

Household
   └── Child ──── Relationship ──── (an adult)
        │
        ├── Enrollment ──── Placement ──── Location
        │
        └── Schedule assignment ····▷ Schedule day (derived)

Staff ──── Location
```

Every arrow into a Location uses the identifiers from `GET /api/v1/locations`.
There is no second room model and no second site model anywhere in this API.

| Ask | Endpoint |
| --- | --- |
| Where are the sites and rooms? | `GET /api/v1/locations` |
| Who is in service? | `GET /api/v1/children` |
| Which family do they belong to? | `GET /api/v1/households` |
| Who are their adults? | `GET /api/v1/relationships` |
| Are they enrolled, where, from when? | `GET /api/v1/enrollments` |
| Which room are they in? | `GET /api/v1/placements` |
| What is their standing schedule? | `GET /api/v1/schedule-assignments` |
| Who is expected on a given day? | `GET /api/v1/schedule-days` |
| Who works here? | `GET /api/v1/staff` |
| What attendance has been recorded? | `GET /api/v1/attendance-events` |
| Record that something happened | `POST /api/v1/attendance-events` |

**Enrollment is what makes a child visible**, not membership of the
organization. A child with no enrollment at a site you can reach does not appear
— in any boundary mode. Expect fewer children than the organization has records
for; if one you expect is missing, check enrollment before reporting a defect.

**A household is an anchor, not a grant.** `GET /api/v1/households` returns the
household because one of its children is already visible to you. It never reveals
a sibling enrolled somewhere you cannot reach: not their name, not their id, not
a count. To list the children of a household that you may see, ask
`GET /api/v1/children?household_id=…` — that answer is filtered to your
authority, which is the point of asking it that way.

**Relationships are edges, not flags.** The same adult can be a parent to one
child and an emergency contact to another, so the relationship carries its own
identity rather than collapsing into booleans on either end.

---

## 5. Your identifiers

You almost certainly have your own id for a child or a room. Alloy records the
mapping between your identifier and its own, **per Installation**.

- Where a resource exposes `external_id`, it is **yours**, and only yours.
  Another partner's identifier for the same child is never visible to you, and
  yours is never visible to them.
- You can filter by your own identifier — for example
  `GET /api/v1/children?external_id=...`.
- Referencing something you have not mapped does not guess. On submission it
  returns `pending_mapping`, which is a normal state to handle rather than a
  failure to retry blindly.

Mappings are established with Alloy during onboarding; there is no self-service
correlation API today.

---

## 6. Reading a collection

Every persisted collection in this API shares one grammar. Implement it once.

| Parameter | Purpose |
| --- | --- |
| `limit` | Page size. Default 50, maximum 200 — clamped, not refused. |
| `cursor` | Position **within** one pass. Pass back `next_cursor`. |
| `since_token` | Position **between** passes. Pass back `sync_token`. |
| `updated_since` | Everything changed strictly after an instant (ISO-8601, with offset or `Z`). |

Every response looks like:

```json
{ "data": [ ... ], "next_cursor": "...", "sync_token": "..." }
```

### Bootstrap

1. Call with `limit`, no position.
2. Follow `next_cursor` until it comes back `null`.
3. Keep the `sync_token` from the last page you **fully processed**.

### Continue

4. Call again with `since_token=<the token you kept>`.
5. Page through that pass as before, keeping the new token at the end.

**Prefer `since_token` to `updated_since`.** Both resume, but a token names a
single row, so two records sharing a timestamp cannot be skipped or repeated.
Use `updated_since` when you are reconciling against a moment you chose rather
than a position Alloy gave you.

Keep the token only after you have durably processed the page. A token is a
promise that you are finished with everything before it.

A cursor is a **position, never a permission**. It cannot widen authority, and
presenting one obtained under a different Installation does nothing useful.

---

## 7. Lifecycle: how things end

Alloy does not delete records out from under you, and there are no tombstones.
Endings are **observable changes on the record itself**:

| Resource | How it ends |
| --- | --- |
| Child | `status` becomes `inactive` |
| Enrollment | `end_date` is set |
| Placement | `end_date` is set, or a newer placement supersedes it |
| Schedule assignment | `end_date` is set, or a newer assignment supersedes it |
| Relationship | `status` changes |
| Staff | `employment_status` becomes `ended` |

Because these are ordinary changes, incremental synchronization delivers them
like any other. If your model requires certainty that something has been removed
rather than ended, do a periodic full read — that is the only mechanism that
proves absence.

**Corrections arrive as new records.** A corrected placement is a new row naming
the one it replaces. A copy you already stored is never silently wrong; you are
told.

---

## 8. Derived projections

Most resources are stored. One is not.

`GET /api/v1/schedule-days?from=…&to=…` answers "who is expected on Tuesday" by
**generating** rows from committed schedule assignments. Those rows have no
identity and no change history, so the endpoint returns **no cursor and no sync
token**, and requires a date window of at most 92 days.

Do not try to synchronize it. If you need change detection, synchronize
`/api/v1/schedule-assignments` — the canonical, stored commitment — and
re-project the window yourself. Every generated day names its source assignment
so you can.

The same window over the same committed schedules always returns the same days
in the same order.

---

## 9. Submitting facts

There is exactly one write: `POST /api/v1/attendance-events`.

It is a **governed submission**, not a CRUD write. You assert that something
happened; Alloy decides whether it may be recorded. There is no `PUT`, no
`PATCH` and no `DELETE` anywhere on this API.

### A batch is not a transaction

Send up to 200 events. Each receives its **own** outcome, and the call returns
`200` even when some items were refused:

| Outcome | What to do |
| --- | --- |
| `accepted` | Nothing. It is recorded. |
| `replayed` | Nothing. This exact event was already recorded — your retry worked. |
| `conflict` | You sent this event identifier before with different content. Investigate; do not retry unchanged. |
| `pending_mapping` | A referenced child or location is not mapped. Resolve the mapping, then resubmit. |
| `rejected` | The item was not valid. Fix it. |

### Retrying is safe

You do not send an idempotency key. Replay identity is derived from **your own
event identifier**, scoped to your Installation.

**If a submission times out, retry it unchanged.** You cannot create a duplicate
by retrying, and you do not need to reconcile first. Two callers submitting the
same event at the same moment converge on one record. Because the identity is
yours and scoped to you, you can never collide with another partner.

### Corrections and reversals

Attendance is append-only. A mistake is fixed by recording a **correction** or a
**reversal** that supersedes the earlier fact — never by editing or removing it.

To compute current truth, fold the history in order and let later facts supersede
earlier ones. This is why your mirror can always be reconciled: nothing you
received has silently ceased to exist.

---

## 9a. Reads, writes, and lifecycle operations

Before you design a write, understand what Alloy offers and what it deliberately
does not.

### What a permission means

- **`.read`** — permission to read that canonical resource. Nothing else.
- **`.write`** — permission to invoke specific **named operations** on that
  resource. It is not permission to read, and it is not a generic mutation right.
- **No read implies a write, and no write implies a read.** An integration
  granted `enrollment.write` can start and end enrollments and cannot read a
  single one.

### There is no CRUD contract

The public API has **no `PUT`, no `PATCH` and no `DELETE`** on any resource, and
none is planned. Creation, change and ending happen through named operations that
express intent:

| You want to | You call |
| --- | --- |
| Enroll a child | `POST /api/v1/enrollments` |
| End an enrollment | `POST /api/v1/enrollments/end` |
| Assign a room | `POST /api/v1/placements` |
| Move a room | `POST /api/v1/placements/move` |
| Set a schedule | `POST /api/v1/schedule-assignments` |
| Change a schedule | `POST /api/v1/schedule-assignments/change` |
| Record attendance | `POST /api/v1/attendance-events` |

You never send `status_key` or an end date as a field edit. `POST .../end` is one
intent with three possible canonical outcomes — cancel, mark ending, close — and
Alloy chooses between them from the record's current state. That is deliberate:
deciding wrongly which one applies would leave a child enrolled.

### Why some resources have no write at all

Not an oversight, and not a roadmap gap in most cases:

| Resource | Why |
| --- | --- |
| **Locations** | Site and room topology is how an organization describes itself, and every other resource names a place using it. An operator configures it. |
| **Children** | Creating a child asserts a new human being. Nothing in a create call distinguishes "new child" from "child you already have, spelled differently", and the cost of guessing wrong is a duplicate person. Identity-resolved intake is the right shape, and it does not exist yet. |
| **Households** | A household is an account carrying financial responsibility this API does not expose at all. |
| **Relationships** | A genuine gap rather than a decision. If it is built, pickup authority will remain a derived answer — an operation may grant the underlying role, never write the effective flag. |
| **Staff** | Canonical authority exists; externalizing it is a separate decision, because onboarding a person is adjacent to compensation and eligibility authorities this API excludes. |
| **Schedule days** | Derived. Changing a day means changing the assignment it came from. |

### How things end — and why `DELETE` is missing

**No resource on this API supports physical deletion.** This is a complete
lifecycle, not a missing feature. Do not wait for `DELETE` endpoints.

| Resource | How it ends |
| --- | --- |
| Children | archived — `status` becomes `inactive` |
| Relationships | ended by status |
| Enrollment | effective end — `end_date` is set, or it is cancelled before it starts |
| Placements | **superseded** — a new placement names the one it replaces |
| Schedule assignments | **superseded** |
| Staff | effective end |
| Attendance | **reversed** — a reversal fact supersedes the original |
| Locations, Households | not deletable through this API |

Supersession is why your mirror stays correct: the record you already stored is
never rewritten or removed, so you learn about the change through ordinary
incremental synchronization instead of diverging silently.

### Answering the five questions for any resource

For anything on this API you can determine, without asking Alloy:

1. **Can I create it?** — is there a `POST` for it in the reference?
2. **Can I change it?** — is there a named change operation (`/move`,
   `/change`), or a correction fact?
3. **How do I end it?** — the table above.
4. **Can I delete it?** — no.
5. **What permission do I need?** — the `x-required-scope` on the operation.

---

## 10. Errors, limits, and what "no" means

Every error has the same shape: a machine-readable `code`, a `type`, a
human-readable `message`, and the request id.

| Status | Meaning | What to do |
| --- | --- | --- |
| `400` | The request was malformed — a bad cursor, filter or window | Fix the request. Do not retry unchanged. |
| `401` | Token missing, expired or invalid | Exchange your credential again. |
| `403` | You do not hold the required scope | Ask the operator for it. Retrying will not help. |
| `429` | Rate limit exceeded | Wait for `RateLimit-Reset`, then retry. |
| `5xx` | Alloy failed | Retry with backoff. Submissions are safe to retry. |

Reads and writes have separate rate budgets, and every response carries
`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. Use them rather
than guessing.

**An empty page is not an error.** It usually means the boundary, the scope or
enrollment — check `GET /api/v1/context` first.

Include the request id from a failing response when you contact Alloy. It
identifies the exact call.

---

## 11. Privacy: what you will not be given

Alloy's public API is deliberately narrow about people, and these are not gaps to
be filled later by asking:

- **No health, allergy, medical, dietary or safeguarding information**, under any
  scope, on any endpoint.
- **Pickup authority is an answer without a reason.** Where exposed,
  `pickup_authorized` is computed by Alloy at read time: `true` only when
  authority has been granted, nothing currently withdraws it, and the child is
  inside your boundary. Anything else is `false`, and it fails closed. No
  endpoint says why. Do not infer a reason, and do not treat `false` as a data
  error — it is the answer.
- **Contact details are a separate, stronger grant** than knowing who someone is.
- **Household visibility grants nothing about siblings** outside your boundary.
- **Communications and financial data are not part of this API.**

Design for least privilege. It is also the easiest integration to get approved.

---

## 12. Synchronization posture, and current limits

**Alloy V1 is polling and checkpoint based.** There are no webhooks and no push
delivery. Every resource here converges through `since_token`, and none requires
events to be correct. What polling costs you is latency, not accuracy — pick an
interval that matches how fresh your product actually needs to be.

Known limits, stated so you can plan around them:

1. No webhooks or push delivery.
2. No deletion tombstones — reconcile with a periodic full read if you need
   certainty about removal.
3. `/schedule-days` cannot be synchronized and is capped at a 92-day window.
4. Pickup authority carries no reason.
5. No health or safeguarding data, at all.
6. Communications is not exposed.
7. Financials is not exposed.
8. Correlation mappings are set up with Alloy, not self-service.
9. A child with no enrollment is not visible, in any boundary mode.
10. Four attendance event kinds may be submitted: `check_in`, `check_out`,
    `absence`, `room_transfer`.

---

## 13. A sensible first integration

1. Exchange a credential; cache the token.
2. `GET /api/v1/context` — confirm the organization, scopes and boundary.
3. Bootstrap `GET /api/v1/locations`; store sites and rooms. Keep the token.
4. Bootstrap `GET /api/v1/children`; map each to your own records.
5. Add `GET /api/v1/relationships` if you need guardians or pickup.
6. Add `GET /api/v1/enrollments` and `/placements` for who is where.
7. Add `/schedule-assignments` if you need standing intent; query
   `/schedule-days` when you need a specific day.
8. Bootstrap `GET /api/v1/attendance-events` if you mirror history.
9. Switch every collection to `since_token` and poll.
10. If you author attendance, submit in batches and handle the five outcomes.

Do steps 1–3 before designing anything else. They tell you what this particular
Installation can actually see, which is usually less than the contract allows and
is the only number that matters for your design.
