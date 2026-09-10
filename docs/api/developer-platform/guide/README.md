---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Alloy API — Getting Started

> ## ⚠ Partially implemented — read this before you build
>
> **Implemented and callable:** the application, installation and credential
> model; token exchange at `POST /api/v1/oauth/token`; bearer authentication;
> `GET /api/v1/context`; **`GET /api/v1/locations`** — the first canonical
> resource; the error envelope; rate limiting; request correlation.
> These are described by the governed contract at
> [`alloy-public-api.v1.json`](../../openapi/alloy-public-api.v1.json), whose
> coverage is enforced by a drift guard in both directions.
>
> **Contract only, NOT callable:** the remaining domain resources (children,
> people, enrollment, schedules), every governed operation, attendance
> ingestion, webhooks, and anything Classroom Coach. The sections below that
> describe them state the intended contract so you can design against it — they
> do not describe a live endpoint, and no credential can reach one.
>
> **Not yet safe to issue production credentials.** Three security prerequisites
> remain open; see
> [`../product/08-slice-b2-external-boundary.md`](../product/08-slice-b2-external-boundary.md).

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

V1 scopes:

| Scope | Grants |
|---|---|
| `context.read` | Read your own installation context |
| `locations.read` | Read locations |
| `children.read` | Read child records within your boundary |
| `attendance.read` | Read attendance facts |
| `attendance.write` | Record attendance facts |

Rules that will surprise you if you skip them:

- **An empty boundary denies everything.** It never means "all locations".
- **You can narrow, never widen.** Asking for a location outside your boundary
  returns nothing — it does not error and it does not return everything.
- **A scope is necessary, not sufficient.** Holding `attendance.write` does not
  bypass eligibility, service-day rules or immutability. Alloy's domain rules run
  regardless and have the final word. A `409` with blockers is a normal, expected
  response.

## Where to go next

- [Conventions](conventions.md) — resources vs operations, collections,
  idempotency, concurrency, errors, external IDs
- [Locations](locations.md) — the first canonical resource, **live**
- [Attendance example](attendance-example.md) — a full integration, contract only
