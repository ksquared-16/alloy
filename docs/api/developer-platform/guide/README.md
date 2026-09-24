---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Alloy API — Getting Started

The Alloy Public API is a read-and-write HTTP contract over a childcare
operator's live operational data: sites and rooms, children and their households,
enrollments, placements, schedules and attendance. It is JSON over HTTPS, versioned
at `/api/v1`, and described by a governed OpenAPI 3.1 document.

## Start here

| | |
| --- | --- |
| **Base URL** | `https://<alloy-host>/api/v1` — Alloy issues your host with your credentials. One host per environment; sandbox first, production on request. The contract is identical in both. |
| **Authentication** | Exchange `client_id` + `client_secret` for a 15-minute opaque bearer token. No refresh tokens, no OAuth redirect flow. |
| **First call** | `GET /api/v1/context` — tells you which organization you are acting for, what you may do, and where. |
| **Reference** | [`alloy-public-api.v1.json`](../../openapi/alloy-public-api.v1.json) — OpenAPI 3.1, complete, and kept in step with the runtime by a drift guard in both directions. |
| **Surface** | 22 operations across 18 paths: 1 token exchange, 10 reads, 10 governed writes, and `GET /context`. |
| **Pagination & sync** | `next_cursor` within one pass, `sync_token` between passes, `updated_since` for reconciliation. |
| **Rate limits** | 30 token exchanges/min, 600 reads/min, 120 writes/min — reads and writes have independent budgets. |
| **Errors** | A single JSON envelope with `type`, `code`, `message` and `request_id` on every refusal. |

## Sixty-second quickstart

You need a `client_id` and `client_secret` from your Alloy contact.

```bash
# 1. Exchange credentials for a token (15 minutes).
TOKEN=$(curl -s -X POST https://<alloy-host>/api/v1/oauth/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"alloy_app_example","client_secret":"example-secret"}' \
  | jq -r .access_token)

# 2. Ask who you are. This never needs a scope.
curl -s https://<alloy-host>/api/v1/context -H "authorization: Bearer $TOKEN"

# 3. Read the sites you can reach.
curl -s "https://<alloy-host>/api/v1/locations?limit=50" -H "authorization: Bearer $TOKEN"

# 4. Page with the cursor; checkpoint with the sync token.
curl -s "https://<alloy-host>/api/v1/locations?limit=50&cursor=<next_cursor>" -H "authorization: Bearer $TOKEN"

# 5. Next time, resume from where you stopped.
curl -s "https://<alloy-host>/api/v1/locations?since_token=<sync_token>" -H "authorization: Bearer $TOKEN"
```

**If a collection comes back empty, that is usually authority, not absence.**
Read `GET /api/v1/context` and check the scope and the boundary: you see only
locations inside your boundary, and only children with an enrollment at one of
them.

## What is not here

No webhooks — polling with `sync_token` is the V1 posture and is sufficient for
every resource. No Communications or Financials contract. No self-service
correlation management. No endpoint in these guides is unimplemented: if it is
documented, it is callable.

## The model, in four words

```text
Application → Installation → Credential → /api/v1
```

| | What it is |
|---|---|
| **Application** | Your software. One stable identity, independent of any customer. |
| **Installation** | Your application's presence inside **one** Alloy organization, carrying what it may do and where. |
| **Credential** | A `client_id` and `client_secret` belonging to **one** installation. |
| **`/api/v1`** | The public contract. Everything else in Alloy is internal and unsupported. |

An application by itself can do nothing. Authority comes from an installation,
and every credential belongs to exactly one.

## Authentication

Exchange your credential for a short-lived access token, then send that token.

```bash
curl -X POST https://<alloy-host>/api/v1/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=$ALLOY_CLIENT_ID \
  -d client_secret=$ALLOY_CLIENT_SECRET
```

```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 900, "scope": "attendance.write children.read" }
```

```bash
curl https://<alloy-host>/api/v1/context \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Tokens last 15 minutes.** Request a new one when it expires; there are no
refresh tokens. Tokens are opaque — do not parse them, and do not depend on
their format.

**Your `client_secret` is shown exactly once, when it is created.** Alloy stores
only a hash and cannot show it to you again, or recover it for you. If it is
lost, rotate.

### Rotating without downtime

A credential can hold **two** valid secrets during a rotation: your existing one
and a new one, with the old set to expire at a stated time. Deploy the new
secret, confirm traffic is using it, then let the old lapse. Both work until
that deadline — after it, only the new one does.

## Tenancy — read this before designing anything

> **The installation determines organization authority.**

You never send an `org_id`. There is no parameter for it. Alloy resolves the
organization from your credential → installation, and a request that names a
different organization is **rejected**, not ignored.

Consequences worth designing around:

- One credential reaches **one** organization. Serving several customers means
  several installations and several credentials.
- You cannot read or write across organizations in one call. There is no
  cross-tenant endpoint.
- Nothing you send can widen your authority.

## Scopes and resource boundaries

Two independent things. Scopes say **what**; the boundary says **where**.

```text
scopes:   attendance.write, children.read
boundary: locations = [Downtown Campus, Riverside]
```

The thirteen grantable scopes:

| Scope | Grants |
|---|---|
| `locations.read` | Read authorized sites, rooms, and operational units |
| `children.read` | Read children with an enrollment at authorized locations (not one canceled before it began) |
| `households.read` | Read the household shell for visible children |
| `relationships.read` | Read visible child-adult relationships and effective pickup authority |
| `relationships.contact.read` | Read email and phone for adults already visible through relationships |
| `enrollment.read` | Read enrollment agreements and placements for visible children |
| `schedule.read` | Read committed schedules and dated schedule projections for visible children |
| `staff.read` | Read staff assigned to authorized locations |
| `staff.contact.read` | Read email and phone for staff already visible through staff access |
| `attendance.read` | Read attendance history for visible children |
| `enrollment.write` | Start, end and void enrollments; assign, move and cancel placements |
| `schedule.write` | Set, change and cancel schedule assignments |
| `attendance.write` | Submit attendance facts, including corrections and reversals |

`GET /api/v1/context` needs no scope. Every installation can read its own
context, because a caller that cannot discover what it holds cannot work out why
anything else was refused. There is no `context.read` to request.

Scopes match **exactly**. `children.read` does not imply
`children.contact.read`-style access to anything else, and no read implies a
write. An installation granted only `attendance.write` can record that a child
arrived and cannot read back a single attendance record.

Rules that will surprise you if you skip them:

- **An empty boundary denies everything.** It never means "all locations".
- **You can narrow, never widen.** Asking for a location outside your boundary
  returns nothing — it does not error and it does not return everything.
- **A scope is necessary, not sufficient.** Holding `attendance.write` does not
  bypass eligibility, service-day rules or immutability. Alloy's domain rules run
  regardless and have the final word. A `409` with blockers is a normal, expected
  response.

## Where to go next

- [Integrating with Alloy](integrating.md) — the whole integration in one read:
  identity, authority, the resource graph, synchronization, submission and limits
- [Conventions](conventions.md) — resources vs operations, collections,
  idempotency, concurrency, errors, external IDs
- [Locations](locations.md) — sites and rooms, and the vocabulary every other
  resource uses to name a place
- **API Reference** — every operation's parameters, fields, examples and errors
