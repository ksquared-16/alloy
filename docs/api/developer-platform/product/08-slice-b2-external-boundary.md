---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 08 — Slice B.2: the external request boundary

**Implemented.** The first real external request path exists.

## Implementation paths

| Concern | Path |
|---|---|
| Tokens, limiter, activity | `supabase/migrations/20260910200000_external_request_boundary.sql` |
| Shared rate limiter | `web/lib/platform/external/rateLimit.ts` |
| Access tokens + verification | `web/lib/platform/principal/accessToken.ts` |
| External request context | `web/lib/platform/external/externalRequest.ts` |
| Error envelope | `web/lib/platform/external/apiErrors.ts` |
| Request correlation | `web/lib/platform/external/requestContext.ts` |
| API activity | `web/lib/platform/external/apiActivity.ts` |
| Token exchange | `web/app/api/v1/oauth/token/route.ts` |
| First read | `web/app/api/v1/context/route.ts` |
| Public contract | `docs/api/openapi/alloy-public-api.v1.json` |
| Drift guard | `web/tests/platform/external/openApiDriftGuard.test.ts` |
| Certification | `web/tests/platform/external/externalBoundaryCertification.test.ts` |

## Phase 1 — the three remaining prerequisites, precisely

| Prerequisite | Exact meaning | State | Token endpoint? | `GET /context`? | Future mutation? | B.2 |
|---|---|---|---|---|---|---|
| **Durable shared rate limiting** | A budget that holds across serverless instances | Was per-process only | **Required** | **Required** | Required | **Resolved** |
| **SEC-0c** | `POST /api/admin/workflows/[id]/run` passes a body-supplied `org_id` into an engine that prefers it, combined with an unallowlisted dynamic table write — caller chooses tenant *and* table | **Open** | No | No | **Yes** | Not B.2 |
| **SEC-0** | `POST /api/leads/gutters` — unauthenticated cross-tenant read/write on `contacts` | **Open**, gated on D-3 | No | No | **Yes** | Not B.2 |

**SEC-0c and SEC-0 are not read-only-boundary prerequisites, and this is stated
precisely rather than waved through.** Both are defects on *internal* surfaces —
one an admin route, one a public lead-intake route. Neither is reachable from
`/api/v1`: an application principal holds no session, and nothing in the external
path touches `workflowRun` or the gutters route.

What they *are*: prerequisites before Alloy exposes **mutations** externally, and
before the platform is described as production-safe. An unauthenticated
cross-tenant write on the same deployment is a posture problem regardless of
which door it is behind. They are not solved by B.1 deriving organization
authority structurally, and nothing in B.2 changes them.

## Access token model — and why it carries no authority

**Opaque, server-validated, 15 minutes, and it stores no snapshot of what it may
do.** The row records which credential and which installation minted it; scopes
and boundary are re-read from the installation on every verification.

This is the payoff of Thread 4's opaque-over-JWT decision. A token carrying its
own scopes is authority frozen at mint time, and revoking one needs a denylist —
which is a lookup, which is what an opaque token already is. Re-deriving makes
every revocation immediate **by construction** rather than by an invalidation
call somebody has to remember: Thread 3 found `invalidateAdminShellContextCache`
has zero production call sites and a 120-second TTL, and exporting that staleness
to partners would have been worse than keeping it internal.

The cost is honest — verification is four indexed point lookups. That is what
immediate revocation costs, and it was priced in when the mechanism was chosen.

### Revocation semantics — certified, not assumed

| Act | Effect on already-issued tokens |
|---|---|
| Credential **revoked** | Dead on the next request |
| Credential **rotated** | **Still valid.** Rotation changes what authenticates future *exchanges*; treating it as revocation would make every routine rotation an outage for in-flight callers |
| Installation **suspended** | Dead on the next request |
| Installation **revoked** | Dead on the next request |
| Application **disabled** | Dead on the next request |
| Scope or boundary **narrowed** | Applies on the next request; nothing stale to honour |

Each is a test.

## Rate limiter

Postgres-backed fixed window, incremented and decided in **one** statement
(`consume_rate_limit`), so two instances racing a bucket cannot both read "under
the limit". **Fails closed** — an unreachable limiter refuses, because a limiter
that admits everything when unavailable is no limiter at the moment one is needed.

Keys are hashes and never secrets: keying on a *guessed* secret would hand every
wrong guess a fresh budget, which is `kioskRateLimit`'s insight and the one worth
keeping.

Defaults are conservative and deliberately not per-application: 30/min on token
exchange (the guessable surface), 600/min on authenticated reads. Per-installation
quotas are a product decision that needs a negotiation to exist first.

Fixed window over token bucket: trivially correct under concurrency, and its one
weakness — up to double rate across a boundary — is stated rather than discovered.
`prune_rate_limit_windows` ships with the table, because unbounded growth is the
failure mode a database limiter has and an in-memory one does not.

## Phase 16 — threat review

| Threat | Assessment |
|---|---|
| **Token-exchange brute force** | Limited before verification, on shared state. Proven across 32 attempts. |
| **Token theft** | 15-minute blast radius, one installation, bounded by its grants; revocable immediately at five levels. |
| **Refresh abuse** | **No refresh tokens exist.** A compromised token cannot be extended; re-authentication requires the long-lived secret, which is where the tight budget is. |
| **Credential revocation** | Kills live tokens on the next request — verified. |
| **Installation suspension / application disable** | Both kill live tokens on the next request — verified. |
| **Scope escalation** | Exchange accepts no requested scope. There is no narrowing parameter, so there is nothing to invert. |
| **Boundary escalation** | Boundary is read from the installation; caller ids, headers and query parameters are ignored — verified with `org_id`, `organization_id`, `installation_id`, `application_id`, `location_id` and two spoofed headers at once. |
| **Token leakage** | Never stored plaintext; absent from activity rows, audit rows and errors — asserted by test. `Cache-Control: no-store` on both token and context responses. `alloy_at_` prefix aids secret scanning. |
| **Request replay** | Read-only requests are **not** replay-protected, deliberately: replaying a `GET` returns the same bounded context and changes nothing. Replay protection for mutations is idempotency, which belongs to the slice that adds one. Stated so it is not mistaken for an oversight. |
| **Rate-limit bypass** | Shared state defeats per-instance evasion. Different tokens for one installation share the installation bucket. Malformed credentials are limited *before* verification. |
| **Human identity confusion** | Unchanged from B.1: the principal has no user, role or person field. |

### Residual, stated

Activity and audit writes remain best-effort and swallowed — an observability
outage must not refuse partner traffic. The security audit makes the opposite
trade for the events an investigation needs.

## Deviations from Thread 4 / B.1

**None to the trust model.** Two mechanical choices worth recording:

1. **The public spec is JSON, not YAML.** OpenAPI 3.1 is valid in either, no YAML
   parser is a dependency of this repository, and the drift guard parses the
   artifact with `JSON.parse` and no new package. Phase 12 asked for the smallest
   robust mechanism.
2. **B.1's credential lookup changed shape** — one `.or(...)` became two `.eq(...)`
   lookups. Same indexes, same semantics, and the second only runs during a
   rotation overlap. The reason is that `checkUnauthenticatedSideEffects`
   recognises `.eq("<credential column>", …)` as sender authentication and cannot
   read an `or()` string, so the token route would have been recorded as
   authenticating nobody. The guard should be able to see what is true.

`secret_hash` and `secret_hash_secondary` were added to that guard's
`CREDENTIAL_COLUMNS`, and `resolveApplicationPrincipal` /
`resolveAccessTokenPrincipal` to `NON_HUMAN_PRINCIPAL_RESOLVERS` in the
service-client guard. Both are security-review additions and both are the same
class as the entries already there.

## Generic platform gaps discovered

| # | Gap |
|---|---|
| G-8 | **The Thread 3 estate classifier had no vocabulary for a public route.** `/api/v1` routes classified as `UNCLASSIFIED_NO_AUTH` because the inventory's auth detector knew no external principal. Fixed by teaching the detector and adding `EXTERNAL_PUBLIC_V1`; left unfixed it would have published the false claim that the public API authenticates nobody. |
| G-9 | **Per-installation rate quotas are not configurable.** Platform defaults only. Fine for one partner; a product decision before many. |
| G-10 | **No token introspection or listing.** An operator cannot see or kill one live token; the levers are credential and installation. Adequate now, thin for an incident. |

## Remaining blockers before the first domain API

1. **SEC-0c** and **SEC-0** — required before any external mutation.
2. **Idempotency layer** — specified in Thread 4 §06, unbuilt. Required before the first `POST` that changes domain state.
3. **Scope catalog and mapping table** — the five external scopes are enforced but not yet mapped to internal permission keys.
4. **Resource read authority** — `requireResource` exists; no domain query consumes it yet.

## Recommended Slice B.3

1. `GET /api/v1/locations` — the first **domain** read. Locations because the boundary is expressed in them, so it exercises `requireResource` and `narrowLocations` against real rows.
2. The external scope → internal permission mapping table.
3. Extend the public spec and let the drift guard prove the new endpoint both ways.
4. Then, and only then, `GET /api/v1/children`.

Not in B.3: mutations, attendance, webhooks, UI, Classroom Coach. **D-1 remains
unanswered** and still gates which domain is the right first read — locations is
defensible under any answer, which is why it is first.
