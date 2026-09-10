---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 01 — Thread 4 implementation inventory (Slice A, Part 1)

Verified against `origin/staging` at `005c0da228e37c22388bafc14d91857c897feb43`.
**Repository reality, not documentation.** Every row was checked by inspecting
the tree, not by reading the specification.

## Headline

> **Thread 4 shipped a specification. It shipped no implementation, and that was
> deliberate.**

Thread 4's promoted commit `737d8aa8b` changed 11 files — 8 new specification
documents, 1 index line, 2 one-line terminology tightenings — and **no product
code**. It was certified, promoted and reported as specification-only.

So Part 1's premise ("inspect the exact Thread 4 implementation now on staging")
has an answer, and the answer is that there is none. This is **not** a deviation
from the certified architecture and therefore not a stop condition: nothing
differs from what was certified. What differs is the assumption that Slice A
would find a backend to productize.

## Verification performed

| Probe | Result |
|---|---|
| `web/app/api/v1/**` route files | **0** |
| `developer_applications` in migrations | **0** |
| `app_installations` in migrations | **0** |
| `app_credentials` in migrations | **0** |
| `app_access_tokens` in migrations | **0** |
| `integration_resource_refs` in migrations | **0** |
| `app_request_audit` in migrations | **0** |
| `app_idempotency_records` / `app_rate_limit_windows` | **0** |
| `web/lib/platform/principal/**` | **0** |
| `client_credentials` / `PlatformPrincipalAuthority` in `web/` | **0** |
| Public OpenAPI artifact | **none** — only the *internal* `alloy-api.v0.yaml` |

## The inventory

| Capability | Architecture | Schema | API | Operator UI | Developer UI | Docs | Production-ready | Gap |
|---|---|---|---|---|---|---|---|---|
| Developer Application | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Everything below the spec |
| Installation | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Everything below the spec |
| Credential (inbound) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Everything below the spec |
| Application Principal | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | Minter not built |
| External scopes | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Catalog + mapping table |
| Resource/location boundary | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| `integration_resource_refs` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| `/api/v1` namespace | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | No routes, no prebuild guard |
| Canonical resource adapters | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | — |
| Governed operation adapter | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | — |
| Attendance external ingestion | ✅ | **partial** | ❌ | n/a | n/a | ✅ | ❌ | `integration_api` channel exists; **no producer** |
| Public OpenAPI | ✅ | n/a | ❌ | n/a | ❌ | ✅ | ❌ | Artifact does not exist |
| Error contract | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | Internal envelope exists, public one does not |
| Collection/pagination | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | — |
| Idempotency | ✅ | **partial** | ❌ | n/a | n/a | ✅ | ❌ | Domain layer real (attendance); platform layer absent |
| Concurrency | ✅ | n/a | ❌ | n/a | n/a | ✅ | ❌ | — |
| Audit / provenance | ✅ | **❌ critical** | ❌ | ❌ | ❌ | ✅ | ❌ | `logAdminAudit` is still `console.log`; **no table** |
| Rate limiting | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Durable limiter absent |
| Security prerequisites | ✅ documented | — | — | — | — | ✅ | **❌ unmet** | All three still open |

**Legend:** ✅ exists · ❌ absent · partial = a domain-level piece exists that the
platform layer would build on.

## What *does* exist, and is worth not rebuilding

Three pieces of real prior art were found, and each changes a Slice B estimate:

1. **`NonHumanProducerAuthority` + `assertNonHumanCaptureAllowed`** — the
   non-human principal type and its three-axis gate. Thread 4 ratified minting
   into it; it is present and unchanged.
2. **`integration_api` provenance channel** — modeled, in the DB `CHECK`
   constraint, covered by tests, still with **no production producer**.
3. **`org_provider_credential_*`** (`web/lib/communications/orgProviderCredential.ts`)
   — an organization-owned, **Supabase Vault-backed** credential system whose
   database function owns tenancy, Vault access and its own audit trail, and
   whose API layer "deals in `hasCredential` booleans" so a secret can never be
   serialized back to a caller.

### The credential direction distinction — and it matters for Classroom Coach

| Direction | Meaning | Status |
|---|---|---|
| **Inbound** — partner authenticates **to** Alloy | Thread 4 `app_credentials`, `client_id`/`client_secret`, token exchange | **Does not exist** |
| **Outbound** — Alloy authenticates **to** a provider | `org_provider_credential_*`, Vault-backed | **Exists and is mature** |

Thread 4 designed the inbound half only, because its reference case was a
partner writing attendance *into* Alloy. **A Classroom Coach integration may well
need the outbound half** (Alloy calling Classroom Coach), and that half already
exists in a form Thread 4 never considered. Slice B must not rebuild it, and must
not assume Thread 4's credential model covers it — they solve different problems.

## Consequences for Slice A

- **No Developer Platform UI can be implemented.** There is no table to list, no
  installation to display, no credential to rotate. Part 9's allowance is
  explicitly scoped to "credential management **where backend authority already
  exists**", and it does not.
- **The API Activity / Health surface has no data source.** `logAdminAudit`
  writes to `console.log` and no `audit_log` table exists. Building the surface
  would mean building the audit store first — which is Thread 4 security
  prerequisite #1, not a UI task.
- **Credential issuance would be unsafe today** even if the UI existed. All three
  Thread 4 prerequisites remain unmet. This is a named stop condition for
  implementation, and it holds.

Slice A therefore delivers the **product specification, information architecture
and developer documentation**, and does not implement. That is reported as
`PARTIAL` rather than dressed up as complete.
