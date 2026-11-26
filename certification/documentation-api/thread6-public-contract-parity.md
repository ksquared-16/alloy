# Thread 6 — public contract parity ledger and certification record

**Verified against staging `66fa281e176d33a7a2e848cb1321a18dbcd2c1e2`.**

Thread 5 lineage re-proved ancestral at this SHA: `3792e4be25e3`, `f1d8d1c0401f`,
`2378af6875a0`, `606aff6c5681` — all ancestors.

## Public surface manifest

Exhaustive. `find web/app/api/v1 -name route.ts` returns three files and no others.

| Method | Path | Operation id | Scope | Implemented | In OpenAPI | Certified live |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/oauth/token` | `issueAccessToken` | none | yes | yes | yes |
| GET | `/api/v1/context` | `getContext` | none beyond a valid token | yes | yes | yes |
| GET | `/api/v1/locations` | `listLocations` | `locations.read` | yes | yes | yes |

Zero documented-but-unimplemented endpoints. Zero implemented-but-undocumented
endpoints. No Attendance mutation path exists in the route tree, the OpenAPI
artifact, or the specification. No AdminV2 route appears in the public contract.

## Implementation-parity ledger

| Contract item | Designed | Implemented | Mounted | Certified | Externally documentable | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Developer Application | yes | yes | yes | yes | yes | `developer_applications`; registration authority V1 (PR #898) |
| Installation | yes | yes | yes | yes | yes | `app_installations`; Gate 2 created one through the wizard |
| Credential issue / rotate / revoke | yes | yes | yes | yes | yes | `applicationCredential.ts`; Gate 2 C3–C9 |
| One-time secret reveal | yes | yes | yes | yes | yes | Gate 2 C4/C5 |
| Application Principal | yes | yes | n/a | yes | yes | `resolveApplicationPrincipal.ts`; quickstart step 2 |
| Opaque access token, 900 s | yes | yes | n/a | yes | yes | `accessToken.ts` `ACCESS_TOKEN_TTL_SECONDS = 900`; quickstart step 1 |
| Token exchange | yes | yes | n/a | yes | yes | `/api/v1/oauth/token`; quickstart step 1 |
| Scope catalog (3 scopes) | yes | yes | n/a | yes | yes | `scopeCatalog.ts` |
| `attendance.write` without a public operation | yes | yes | n/a | yes | yes (as a stated absence) | `PUBLIC_OPERATIONS` has no attendance entry |
| Scope enforcement | yes | yes | n/a | yes | yes | `requireOperationScope`; quickstart 403 case |
| Resource boundary, SQL-enforced | yes | yes | n/a | yes | yes | `list_external_locations`; quickstart boundary case |
| No caller-controlled tenant selection | yes | yes | n/a | yes | yes | quickstart org_id-injection case |
| Collection grammar (cursor, limit 50/200) | yes | yes | n/a | yes | yes | `collection.ts`; quickstart paging case |
| Incremental sync (`updated_since`) | yes | yes | n/a | yes | yes | quickstart incremental case |
| Public Location fields (8, no timezone) | yes | yes | n/a | yes | yes | `toPublicLocation`; quickstart field-set assertion |
| Error envelope + `X-Request-Id` | yes | yes | n/a | yes | yes | `apiErrors.ts`; quickstart envelope case |
| Durable shared rate limiting | yes | yes | n/a | yes | yes | `consume_rate_limit` RPC; `RateLimit-*` headers observed |
| API Activity | yes | yes | yes | yes | partially — internal surface | `app_api_activity`; quickstart no-secret assertion |
| Durable security audit | yes | yes | yes | yes | no — internal | `app_security_audit` |
| `integration_resource_refs` correlation | yes | yes | n/a | yes | conceptually only | no public route exists |
| Installation health | yes | yes | yes | yes | operator-facing | Gate 2 G2-T3 |
| Organization → Integrations | yes | yes | yes | yes | operator-facing | Gate 2, 32/0/0 |
| Public mutation / idempotency | ratified | **no** | no | no | as future architecture only | no route exists |
| Public webhooks | **not ratified** | no | no | no | no | — |
| Classroom Coach adapter | — | no | no | no | no | PROVIDER_DEPENDENT |

## OpenAPI as executable contract

| Check | Result |
| --- | --- |
| Every documented public path present in OpenAPI | 3/3 |
| Every implemented public path present in OpenAPI | 3/3 |
| Operation ids match the route constants | `issueAccessToken`, `getContext`, `listLocations` |
| Auth scheme matches runtime | `bearerAuth` |
| Status sets match runtime | token 200/400/401/429/500; context 200/401/429/500; locations 200/400/401/403/429/500 |
| Location schema matches `toPublicLocation` | 8 fields, identical |
| Location `timezone` absent | yes — the only "timezone" string in the artifact is prose on `updated_since` |
| Attendance mutation absent | yes |
| AdminV2 absent | yes |
| Contract version | `1.0.0`, OpenAPI `3.1.0` |

**100% current public path coverage.**

## Live certification

`web/tests/platform/external/publicApiQuickstart.live.test.ts` — **15 scenarios,
15 passing**, executed over HTTP against the certification server on port 3018,
reading the certification database.

This suite is new in Thread 6 and closes a real gap: every prior external
certification called route handlers directly or read the OpenAPI artifact, so no
test had ever proved the contract **as served** — through a listener, with a real
`Authorization` header.

Covered: token exchange shape and headers; `unsupported_grant_type`; wrong secret
and unknown client indistinguishable; context shape and its exclusions; missing
and non-Bearer authorization; the Location field set; deterministic paging and
cursor resume; `invalid_cursor`; incremental sync and `invalid_updated_since`;
boundary enforcement and filter-cannot-widen; scope-versus-boundary separation;
absence of caller-controlled tenant selection; revoked-credential refusal; the
single error envelope with request-id correlation; API Activity recorded without
token or secret material.

Fixtures are created with the service role and removed in `afterAll`. The
application identity is created through the canonical registration authority, not
an INSERT. Installation creation through the product is Gate 2's certification and
is not re-proved here.

## Classification finding

Artifact A is **PARTNER_READY**, not PUBLIC_READY.

`docs/api/developer-platform/product/08-slice-b2-external-boundary.md` names three
prerequisites before the platform may be described as production-safe. Durable
shared rate limiting is **resolved**. Two remain open and were verified present at
`66fa281e1`:

- **SEC-0** — `web/app/api/leads/gutters/route.ts` exists and performs no
  authentication (no session, no key, no signature check in the file).
- **SEC-0c** — `web/app/api/admin/workflows/[id]/run/route.ts` exists.

Neither is reachable from `/api/v1`. The read-only external contract is certified
independently of them. The classification reflects deployment posture, not contract
quality, and is the single line that changes when they close.

## Regression

| Check | Result |
| --- | --- |
| `vac run typecheck` | rc=0 |
| `vac run typecheck:tests` | rc=0 |
| `tests/platform` | 57 files pass; the 4 pre-existing staging failures reproduce on a pristine checkout of `66fa281e1` and name components Thread 6 never touches |
| OpenAPI drift guard | pass |
| Prebuild guards (4) | pass |

## Carry-forward, unchanged

- Classroom Coach: provider authentication, tenancy, resources, identifiers,
  synchronization, webhooks and sandbox all **UNKNOWN**. D-1 unresolved. No
  adapter. Discovery request issued.
- `environment.execute_registered_reconciliation` still registered without a mode
  mapping or fulfil dispatch — Runtime/Vacilando lane.

## Sanitization repair (2026-09-15, human QA lane)

The Developer Platform human QA walkthrough introduced two gates this record's own
artifacts failed: DP-QA-52 (the specification must not expose unresolved security
findings or internal vulnerability identifiers) and DP-QA-69 (the partner packet
must not contain internal security identifiers, staging SHAs or PR numbers).

Both partner-facing artifacts named SEC-0 and SEC-0c, and the specification
additionally described **what is wrong with each route and which route it is** —
an accurate map of two live internal weaknesses, in a document written to be
handed to an external company. The classification rationale has been rewritten to
say what a partner needs (the contract is certified; outstanding items are
internal hardening on surfaces unrelated to `/api/v1`) without naming the
findings or the routes, and the staging SHA has been replaced with a document
version.

**The specific detail is not lost — it lives here**, in an internal record, which
is where it always belonged. The finding itself stands unchanged: SEC-0 and
SEC-0c are open, neither is reachable from `/api/v1`, and both gate PUBLIC_READY.
