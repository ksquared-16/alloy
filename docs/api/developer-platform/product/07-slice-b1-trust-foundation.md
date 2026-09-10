---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 07 — Slice B.1: the external trust foundation

**Implemented.** This is the first Thread 5 slice that ships code.

## What now exists

| Concern | Implementation path |
|---|---|
| Persistence | `supabase/migrations/20260910190000_developer_platform_trust_foundation.sql` |
| Principal types | `web/lib/platform/principal/platformPrincipalTypes.ts` |
| Credential issue / rotate / revoke | `web/lib/platform/principal/applicationCredential.ts` |
| Credential verification → principal | `web/lib/platform/principal/resolveApplicationPrincipal.ts` |
| Scope + boundary evaluation | `web/lib/platform/principal/principalAuthorization.ts` |
| Durable security audit | `web/lib/platform/principal/securityAudit.ts` |
| Certification | `web/tests/platform/principal/externalTrustCertification.test.ts` (27 tests) |

Four tables: `developer_applications`, `app_installations`, `app_credentials`,
`app_security_audit`.

## Phase 1 — security prerequisite reconciliation

| Requirement | Before this slice | Risk if absent | Needed to issue a credential? | Needed for `/api/v1`? | Resolved here |
|---|---|---|---|---|---|
| External credential storage | none | — | Yes | Yes | **Yes** |
| Hashing / verification | none | Plaintext or timeable compare | Yes | Yes | **Yes** — SHA-256, selected on |
| Rotation | none | Rotation means downtime, so nobody rotates | No | No | **Yes** — bounded overlap |
| Revocation | none | A leaked secret is permanent | Yes | Yes | **Yes** — immediate |
| Durable audit | `logAdminAudit` = `console.log`, no table | A credential cannot be investigated | **Yes** | Yes | **Yes** — `app_security_audit` |
| Org scope derivation | none | Caller-chosen tenancy | Yes | Yes | **Yes** — read from installation |
| Service-role boundary | universal | — | No | Yes | Unchanged; documented |
| RLS posture | 40 org-blind policies (Thread 3) | Latent cross-tenant read | No | Yes | **Yes** — new tables org-scoped or deny-all |
| Rate limiting | in-memory, per-process | Per-instance budget on serverless | No | **Yes** | **No** — B.2+ |
| Request identity propagation | none | — | No | Yes | Partial — principal exists, no gateway |
| PII in logs | — | Disclosure | Yes | Yes | **Yes** — allowlisted metadata |
| SEC-0c | open | Caller chooses tenant **and** table | No (different surface) | **Yes** | **No** — separate repair |
| SEC-0 | open, gated on D-3 | Unauthenticated cross-tenant write | No | **Yes** | **No** — separate repair |

### On `org_provider_credential_*`

Inspected as Phase 1 requires. It is **Vault-backed, organization-owned, and
solves the opposite trust direction**: a credential *Alloy* presents to a
provider. This slice's credential is one an external application presents *to
Alloy*.

**Not reused, and not conflated.** What was taken from it is a posture, not code:
its API layer deals in `hasCredential` booleans so a secret cannot be serialized
back to a caller, and the same rule is enforced here by column-level `GRANT`
that omits both hash columns.

The reusable *shape* came instead from `attendance_kiosk_devices`
(`20260910120000`) — the same problem for a lobby tablet, solved days earlier:
hashed secret selected on rather than compared, org read from the row, producer
identity stable across rotation, coarse refusals. This slice is the second
instance of a reviewed pattern rather than a new one.

## Phase 12 — threat review

| Threat | Assessment | Residual |
|---|---|---|
| **Credential theft** | A stolen secret reaches exactly one installation: one organization, its granted scopes, its location boundary. It cannot enumerate tenants, cannot widen scope, and is not a user. | Bounded by grant. Revocation is immediate. |
| **Credential enumeration** | `client_id` is public and useless alone — the lookup is by secret digest. The secret is 256 bits. `secret_last_four` is four characters of a value an attacker must still produce in full. | Not viable |
| **Timing attack** | No per-byte comparison exists in the process. The digest is an equality selector on a unique index; a caller learns "a row matched" or "none did". | Closed |
| **Cross-tenant escalation** | The resolver has **no organization parameter**. Tested with an extra `orgId`/`org_id` on the input object: ignored. | Closed — structurally |
| **Scope escalation** | Scopes are read from the installation row. No caller input reaches them. Exact-match only, so no prefix or wildcard grant. | Closed |
| **Resource escape** | A caller-named location is intersected against the boundary; asking for an unheld location yields nothing. Empty boundary denies. | Closed |
| **Revocation lag** | No cache. Revocation is effective on the **next** resolution, proven by test. | Closed — and deliberately unlike the 120s `adminShellContextCache` |
| **Secret leakage** | Never stored, never returned after issuance, both hash columns ungrantable to `authenticated`, audit metadata allowlisted, `alloy_sk_` prefix aids secret scanning. | Closed for known paths |
| **Human identity confusion** | The principal has no `userId`, `role`, `personId` or `permissionKeys`, is branded `kind: "application"`, and a test asserts those keys are absent. | Closed |

### Two residual risks, stated rather than closed

1. **Audit writes are best-effort and swallowed.** An audit outage loses records
   rather than refusing authentications. That is the right trade for
   authentication success and the wrong one for administrative acts; issuance and
   revocation return a result their caller is expected to check, and the eventual
   admin surface must check it.
2. **No rate limiting on the authentication path.** Not reachable yet — no HTTP
   surface exists — but it is a prerequisite of the first `/api/v1` route, not of
   this slice.

## Deviations from Thread 4

One, and it is a refinement rather than a redesign.

**`boundary_mode` was added.** Thread 4 §03 G specified locations with "empty
denies everything". Slice B.1 Phase 7 additionally requires an *org-wide*
installation to be expressible. With a single array those two states collide:
empty would have to mean both "nothing" and "everything". An explicit mode makes
both expressible and keeps the dangerous default failing closed.

Nothing else in the frozen model changed. `app_access_tokens` was deliberately
**not** built: token exchange is an `/api/v1` endpoint, and this slice does not
create one.

## What is still required before the first `/api/v1` request

| # | Prerequisite | Owner |
|---|---|---|
| 1 | **Durable rate limiting** — shared, not per-process | Developer Platform |
| 2 | **SEC-0c** — workflow-run tenancy | Separate repair |
| 3 | **SEC-0** — unauthenticated `contacts` write, gated on D-3 | Separate repair |
| 4 | Token exchange endpoint + `app_access_tokens` | B.2 |
| 5 | Public OpenAPI artifact + prebuild guard | B.2 |
| 6 | Request/activity logging distinct from this security audit | B.2 |

**Items 2 and 3 are not Developer Platform work and do not become safe because
this slice landed.** Thread 4 named them prerequisites of the first credential;
this slice makes credentials *possible*, not *safe to issue in production*.

## Recommended Slice B.2

1. `app_access_tokens` + `POST /api/v1/oauth/token` — the exchange this slice
   deliberately omitted.
2. Durable shared rate limiter, on the token endpoint first.
3. `GET /api/v1/context` — the first principal-consuming route, and one that
   cannot mutate anything.
4. Public OpenAPI artifact and the prebuild guard that keeps coverage total.
5. Per-request activity logging, kept separate from `app_security_audit`.

Not in B.2: resource endpoints, attendance ingestion, any UI, Classroom Coach.

**D-1 remains unanswered** and still gates whether attendance is the right first
domain. It does not gate B.2 — every item above is required under any answer.
