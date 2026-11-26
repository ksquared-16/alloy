---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 07 — Events, persistence, prerequisites, first slice

## Change events — ratified

The primary question requires that an application can "receive change events".
V1 answers it with **polling, not webhooks**, and the choice is evidence-driven.

Thread 3 established that Alloy's internal event substrate is genuinely strong —
`workflow_events` and `mutation_events` carry real facts, and the enrollment
status RPC writes its outbox row *inside* the transaction — but that **outbound
delivery does not exist**: no subscription model, no delivery attempts, no retry,
no signing, no dead-lettering.

| Option | V1 verdict |
|---|---|
| **Polling via `updated_since`** | **Ratified for V1.** The collection contract (§04 L) already provides it. Zero new delivery infrastructure, no retry semantics to get wrong, and the partner controls its own cadence. |
| **Webhooks** | **V1.1.** Requires a subscription model, signed payloads, an attempt log, exponential retry, replay protection and a dead-letter path — a delivery platform, not a feature. |

Building webhooks first would mean shipping a delivery system whose failure modes
(silent drops, infinite retries against a partner's outage, unsigned payloads)
are worse than a partner polling every minute. Polling is not a lesser answer for
the reference case: attendance ingestion is **inbound**, so V1's reference
integration needs no outbound delivery at all.

**When webhooks arrive they subscribe to the existing outbox**, not to a new
event truth. The architectural law forbids a second event truth system.

## Persistence model

Six new tables. Every one is platform-owned; none duplicates a domain concept.

```text
developer_applications
  id, name, publisher, ownership_mode, distribution_mode,
  environment, status, metadata, created_at, updated_at

app_installations
  id, application_id, org_id, status,
  granted_scopes[], location_boundary[],
  producer_key, configuration, installed_by, created_at, updated_at
  UNIQUE (application_id, org_id)

app_credentials
  id, installation_id, client_id, label,
  secret_hash, secret_hash_secondary, secondary_expires_at,
  status, expires_at, last_used_at, last_seen_ip_hash, created_at
  UNIQUE (client_id)

app_access_tokens
  id, credential_id, token_hash, scopes[], expires_at, revoked_at, created_at
  UNIQUE (token_hash)

integration_resource_refs        -- §04 K
app_request_audit                -- §06 S
```

Plus `app_idempotency_records` (§06 P) and `app_rate_limit_windows` (§06 T).

**Every table carries `org_id` or reaches it through `installation_id`, and every
policy on them must carry an `org_id` term.** Thread 3 found 40 tables with a
role-only, org-blind RLS policy. These tables must not become 41.

## Prerequisites — three P0s, before any credential is issued

These are **not** Developer Platform work and they are **not** optional.

| # | Prerequisite | Why it blocks |
|---|---|---|
| 1 | **A durable audit store** (Thread 3 P0-3) | A credential issued into a system that records nothing cannot be investigated after an incident. §06 S depends on it. |
| 2 | **SEC-0c — workflow-run tenancy** | A caller can already choose both tenant and table. Standing up an external front door while an internal one accepts a caller-chosen `org_id` is not defensible. The fix is small and the correct pattern is twelve lines away in `executeAdminAction.ts:1238`. |
| 3 | **SEC-0 — unauthenticated `contacts` write** | An unauthenticated cross-tenant write on the same deployment undermines every claim the platform makes about tenancy. Gated behind **D-3**: is the gutters vertical live? |

Recommended but not blocking: wire `invalidateAdminShellContextCache` (zero
production call sites, 120s TTL). External tokens are opaque and revoke instantly
(§02 D), so this does not block V1 — but internal and external authority
answering differently for two minutes is a latent incident.

## First implementation slice

**Goal: one partner authenticates and writes one attendance fact, end to end,
with durable audit — and nothing else.**

1. **Principal + persistence.** `developer_applications`, `app_installations`,
   `app_credentials`, `app_access_tokens`. Promote
   `NonHumanProducerAuthority` → `PlatformPrincipalAuthority` in
   `web/lib/platform/principal/`, with attendance keeping a thin adapter so its
   gate is untouched.
2. **Token endpoint.** `POST /api/v1/oauth/token`, client credentials, opaque
   15-minute tokens.
3. **The trust layer.** One middleware resolving token → credential →
   installation → principal, with org read from the row. Fails closed.
4. **`GET /v1/context`.** The smallest possible authenticated read. It proves
   the whole chain works before any domain is involved.
5. **Audit store.** `app_request_audit`, written for every request including
   failures.
6. **`POST /v1/attendance/events`.** The adapter, the allowlist of one, the
   idempotency layer, provenance assignment.
7. **`GET /v1/locations`, `/v1/children`, `/v1/attendance/events`.** Read-back and
   boundary enumeration.
8. **Rate limiting + public OpenAPI + the prebuild guard** (§04 H).

Steps 1–5 carry no domain risk at all: nothing in them can mutate operational
truth. The first mutation appears at step 6, behind a gate that has already been
proven by steps 3 and 4.

## What must be true before V1 is called complete

- A credential can be issued, rotated with overlap, and revoked — and revocation
  is effective on the **next request**.
- An installation can be suspended, and every outstanding token dies with it.
- A request naming another tenant's `org_id` is **rejected**, and there is a test
  that proves it.
- A request for a location outside the boundary returns nothing, not everything.
- A retried write creates one fact, and emits one event.
- Every request appears in the audit store, including the ones that failed.
- Public OpenAPI covers **100%** of `/api/v1`, enforced at build.

## Out of scope for Thread 4 and V1

No marketplace. No delegated human OAuth. No SDK. No developer portal. No
webhooks. No Classroom Coach-specific primitives — the partner is the reference
case that validates the generic platform, and any endpoint that would not exist
if the partner were someone else does not belong in V1.
