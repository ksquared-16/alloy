---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# API documentation inventory and gap register — September 2026

**Discovery only.** This document does not design Alloy's public API and does not commit to any
external contract. It records what exists, so the API thread does not repeat this investigation.

Context: the Documentation + Developer Platform program intends to produce an external
technical/API specification for the **Classroom Coach** engineering team. This register is the
input to that work.

---

## 1. What `docs/api/**` is

22 markdown files. Before this audit none carried frontmatter, and `docs-lint` treated the whole
directory as generated — flagging 21 hand-authored files as defective generator output. The real
composition, now declared per file:

| Class | Files |
|---|---|
| `generated` | `api-index.md` (the only machine-produced file; `scripts/generate-api-inventory.mjs`) |
| `canonical` | `README.md`, `api-architecture.md`, `api-platform-governance.md`, `openapi-readiness.md`, `api-response-contract.md`, `internal-typescript-client.md`, `openapi/README.md`, and the nine per-domain reference docs |
| `proposed` | `api-data-access-performance.md` — describes a **target** contract (`/api/v1/**`, sync cursors, export jobs) that does not exist in code, and says so itself |
| `sprint` | `api-contract-migration-status.md` — a mutable execution tracker |
| `historical` | `api-platform-completion.md`, `api-documentation-audit.md`, `actions-execute-envelope-audit.md` |

Non-markdown: `docs/api/api-inventory.json` (generated) and
`docs/api/openapi/alloy-api.v0.yaml` (37.9 KB, hand-authored, OpenAPI 3.1.0,
`x-spec-status: internal-v0`).

Also relevant outside that directory: `docs/platform/governance/api-contracts.md` (canonical,
thin — the admin auth pattern and a surface map) and `docs/system/api-contracts.md`
(self-described "transitional"). **Ownership across these three locations is unstated.**

## 2. Implementation landmarks

**Route census: 613 `route.ts` files under `web/app/api`.**

| Group | Count | External-facing |
|---|---:|---|
| `admin/` | 571 | No — admin session only |
| `public/` | 24 | Yes — opaque link token or device |
| `webhooks/` + `stripe/` | 4 | Yes — provider signature |
| `action/`, `action-links/` | 5 | Yes — opaque token |
| other (`dev`, `verticals`, `leads`, `marketing`, …) | 9 | mixed |

**93% of the surface is session-gated operator tooling.** The genuine external surface is ~33
token- or signature-authenticated routes.

| Concern | State | Evidence |
|---|---|---|
| Authentication | **Cookie/session only.** No API key, OAuth, mTLS or bearer scheme for inbound third parties. The one header credential is a single global shared secret, `INTERNAL_CRON_TOKEN` | `web/lib/adminAuth.ts`, `web/lib/admin/getAdminContext.ts`, `web/lib/admin/cronAuth.ts`; `alloy-api.v0.yaml` declares one security scheme, `adminSession` (a cookie) |
| Authorization | Operator RBAC — Membership → Role → Capability → Scope; deny-by-default returns 404 | `web/lib/admin/authorityLayers.ts`, `web/lib/admin/accessScope.ts` |
| Tenant scope | Hand-written `org_id` filters on a **service-role client that bypasses RLS** (~442 of 456 routes at last measurement). Correct by convention, not by construction | `web/lib/supabaseAdmin.ts`, `web/lib/admin/assertRowOrg.ts` |
| Response envelope | Good and real: `{ ok, data, correlation_id }` / `{ ok, error, correlation_id }`, correlation id in body and header | `web/lib/api/apiResponse.ts`, `apiErrors.ts`, `correlationId.ts` |
| Envelope adoption | Partial — ~146 of 456 routes at last measurement; validation manual/schema/zod/none = 293/64/4/95 | `docs/api/api-documentation-audit.md` |
| Pagination | Typed in the generated schema, **emitted by no route**; no shared helper | `web/lib/api/generated/alloyApiTypes.ts` |
| Idempotency | Per-domain only; no `Idempotency-Key` convention. Best precedent is attendance, decided in one Postgres RPC | `web/lib/childcareOperational/attendance/attendanceService.ts` |
| Rate limiting | Two hand-rolled in-memory limiters (kiosk, tour-public). No platform or per-tenant quota | `.../kiosk/kioskRateLimit.ts`, `web/lib/tours/public/tourPublicHttp.ts` |
| Versioning | **None.** `/api/v1/` does not exist; `v1`/`v2` path segments are feature versions | spec `servers: url: /` |
| Inbound webhooks | 4, all provider-signature (Stripe, Resend, Twilio ×2) | `web/app/api/{stripe,webhooks}/**` |
| Outbound events | **None leave the system.** `emitEvent()` inserts a DB row; no dispatcher, registry, retry or signing | `web/lib/emitEvent.ts` |
| OpenAPI | Real spec, **14 of 613 routes (~2.3%)**, all `/api/admin/*`. Zero public, tokenized or webhook routes | `docs/api/openapi/alloy-api.v0.yaml` |
| TS client | Real, internal, same-origin cookie auth, one documented consumer | `web/lib/api/alloyApiClient.ts` |
| Tenant credential store | Exists, for **outbound** use: `org_provider_credential_*` Postgres functions, Vault-backed, opaque `vault:` references, one write-only ingress | `web/lib/communications/orgProviderCredential.ts`, `web/app/api/admin/communications/provider-connection/route.ts` |

## 3. Classroom Coach

Repository-wide case-insensitive search returns **two hits, both the same string literal in one
test file**: `producerKey: "classroom-coach-prod"` in
`web/tests/childcareOperational/attendance/attendanceProvenance.test.ts`. Zero hits in `docs/`,
zero in application code. **No partner model, no spec, no integration exists.**

One genuine landmark: `integration_api` is an accepted attendance provenance channel with a rule
table entry requiring a `producerKey`
(`web/lib/childcareOperational/attendance/attendanceProvenance.ts`). **No route ever passes it.**
The data model has a slot for a partner; the auth layer, the route and the credential store do
not.

## 4. Gap register

Priorities are for the API thread's sequencing, not commitments.

### P0 — a partner integration cannot exist until these are decided

| # | Gap | Category |
|---|---|---|
| 1 | **No inbound machine credential of any kind.** Nothing can be issued to a partner. The nearest precedents are the Vault-backed `org_provider_credential_*` pattern (outbound) and the kiosk `producerKey` device authority | authentication absent |
| 2 | **No public/external contract.** 571/613 routes are session-gated admin; the docs say public API is out of scope, honestly and repeatedly | public/external contract absent |
| 3 | **No versioning.** No `/api/v1`, no deprecation or sunset policy | versioning doctrine absent |
| 4 | **No outbound event delivery.** A partner cannot be notified of anything | event/webhook contract absent |
| 5 | **Classroom Coach requirements are entirely unvalidated** — direction (inbound writes vs outbound notification vs both), volume, data scope | assumptions requiring validation |
| 6 | **`integration_api` is a designed-but-unbuilt seam** — accepted channel, no caller, one passing doc mention | undocumented implementation |

### P1 — needed for a trustworthy specification

| # | Gap | Category |
|---|---|---|
| 7 | Envelope adoption partial (~146/456); ~95 routes had no input validation. A partner hitting a non-migrated route gets an undocumented shape | internal-only contract |
| 8 | Pagination typed but emitted by nothing; no shared helper | pagination contract absent |
| 9 | Idempotency per-domain, no platform contract or header convention | idempotency contract absent |
| 10 | OpenAPI covers 2.3% of routes and **none** of the external surface | reference generation absent |
| 11 | Tenant isolation rests on hand-written filters over an RLS-bypassing client — the guarantee a partner contract must rest on is not a testable invariant | tenant scope unclear |
| 12 | Rate limiting in-memory and domain-specific; no per-tenant or per-credential quota | undocumented implementation |
| 13 | No partner onboarding: no credential issuance, sandbox tenant, error-code reference, or changelog | developer onboarding absent |

### P2 — cleanup the API thread will otherwise inherit

| # | Gap | Category |
|---|---|---|
| 14 | ~33 external-facing routes (`public/`, `action/`, `action-links/`, `webhooks/`) have no contract doc and are absent from OpenAPI. **This is the real current external surface** | public/external contract absent |
| 15 | No notion of a *partner principal* — the authorization grammar is operator RBAC only | authorization unclear |
| 16 | Three parallel API contract locations with unstated precedence | documented but stale |
| 17 | Payments are Stripe-shaped despite "provider" naming; only communications has a true multi-provider adapter seam | undocumented implementation |
| 18 | Phase-status headers disagree within `docs/api/`: two files still say OpenAPI is "deferred" while two declare Phase 3 finalized and the spec shipped | documented but stale |

## 5. Corrected during this audit

- `docs/platform/governance/api-contracts.md` named `/api/book-v2/*` — **zero route files match**.
  Corrected to `/api/public/tour-booking/[token]/*` and `/api/public/booking-config`. The
  attendance kiosk and the Stripe webhook were missing from its tables entirely. Handler count
  456 → 613. (`docs/api/internal-system-api.md` still repeats the `book-v2` name in prose.)
- `docs/api/api-index.md` regenerated: 524 → 613 routes.
- All 22 files given frontmatter; the lint's generated-directory assumption removed.
- `../../../api/` path-depth bugs fixed in `api-contracts.md` and `foundation/architecture.md`.

## 6. The honest summary

Alloy has a **good internal API platform** — clean envelope, enforced correlation ids, a real
OpenAPI spec, generated types, a typed client, and a CI gate (`npm run api:check`). That work
should be built on, not redone.

It is **internal by construction**, and its own documentation says so consistently. The three
things an external specification needs — an inbound credential, a versioned external surface,
and outbound event delivery — each score zero in the codebase. None of that is a defect; it is
scope. But it means the API thread begins with product and architecture decisions, not with
documentation.
