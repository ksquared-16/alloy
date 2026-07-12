# API Platform — Foundation Completion (Closeout)

**Status:** ✅ **Internal API Platform foundation complete.** This is the final closeout record for
the API Platform foundation sprints. After this, API Platform foundation work is **paused** and
focus returns to operational products (Attendance, Scheduling, Billing, Processing, Parent
Experience, Staff Experience). Future API work is **expansion**, not foundation.

**Closeout baseline:** staging `80c4d046` — `chore: finalize API platform`.

---

## Summary

- The **internal** API Platform foundation is complete and **self-governing**.
- This is **not** public developer platform completion. There is no public `/api/v1`, no published
  SDK, and no developer portal — those are deliberate future expansion steps.
- This **is** internal platform completion: the contract, doctrine, generated artifacts, tests, and
  CI exist and protect each other.
- Everything beyond this point — more normalized families, broader OpenAPI, more migrated
  consumers, public surfaces — is **expansion**, not foundational work.

> Alloy now has an internal API Platform. APIs are the boundary. OpenAPI, generated types, the
> generated client, contract tests, and governance protect the boundary. We pause API Platform
> foundation work here.

---

## What exists

### Doctrine

| Doctrine | Document |
|----------|----------|
| API architecture (principles, taxonomy, error doctrine, versioning, OpenAPI doctrine, SDK direction) | [`api-architecture.md`](api-architecture.md) |
| Response contract (envelope + helpers + error/correlation conventions) | [`api-response-contract.md`](api-response-contract.md) |
| Data access / freshness / performance (freshness classes, pagination, sync, caching, SLOs) | [`api-data-access-performance.md`](api-data-access-performance.md) |
| Platform governance (Definition of Done, admission, lifecycle, CI, maturity) | [`api-platform-governance.md`](api-platform-governance.md) |
| OpenAPI readiness gate (+ Platform Complete vs Expansion) | [`openapi-readiness.md`](openapi-readiness.md) |
| Migration tracker (live per-route status, active consumers, sunset list) | [`api-contract-migration-status.md`](api-contract-migration-status.md) |

### Implementation

| Capability | Location |
|------------|----------|
| Response helpers (`apiOk`) | `web/lib/api/apiResponse.ts` |
| Error helpers (`apiError`, `apiZodError`) | `web/lib/api/apiResponse.ts`, `web/lib/api/apiErrors.ts` |
| Correlation id helpers | `web/lib/api/correlationId.ts` |
| Entity-read unwrap helper | `web/lib/api/unwrapEntityRecord.ts` |
| Normalized route families | Actions, Analytics Metrics, Entity Read, Customer Person Role Types, Person Relationship Type Settings |
| OpenAPI v0 spec | `docs/api/openapi/alloy-api.v0.yaml` |
| Generated TypeScript types | `web/lib/api/generated/alloyApiTypes.ts` (via `scripts/generate-openapi-types.mjs`) |
| Internal API client (`createAlloyApiClient`, `AlloyApiError`) | `web/lib/api/alloyApiClient.ts` |

### Quality / Guardrails

| Guardrail | Location |
|-----------|----------|
| OpenAPI validation | `scripts/validate-openapi.mjs` |
| OpenAPI contract tests (spec ↔ routes ↔ families ↔ client, orphan detection) | `web/tests/api/openapiContract.test.ts` |
| Generated-type determinism + freshness | enforced in `api:check` (in-process render compare) |
| Typed-client tests | `web/tests/api/alloyApiClient.test.ts` |
| API envelope contract tests | `web/tests/api/contractRoutes.test.ts` |
| First consumer migration (proof) | `web/.../customer-person-roles/CustomerPersonRolesClient.tsx` + `web/tests/api/customerPersonRolesClientMigration.test.ts` |
| **Platform check command** | `cd web && npm run api:check` → `scripts/api-platform-check.mjs` |

---

## Normalized / OpenAPI v0 route families

The spec documents **only** these gate-passing families (everything else is excluded by design):

| Family | Routes |
|--------|--------|
| **Actions** | `GET /api/admin/actions/inventory`, `POST /api/admin/actions/preflight`, `POST /api/admin/actions/execute` |
| **Analytics Metrics** | `GET`/`POST /api/admin/analytics/metrics`, `GET`/`PATCH /api/admin/analytics/metrics/{id}`, `POST …/{id}/copy`, `POST …/{id}/preview`, `POST …/{id}/snapshot`, `GET …/{id}/trend` |
| **Entity Read** | `GET /api/admin/entity/{type}/{id}` |
| **Customer Person Role Types** | `GET`/`POST /api/admin/customer-person-role-types`, `PATCH`/`DELETE …/{id}` |
| **Person Relationship Type Settings** | `GET`/`POST /api/admin/person-relationship-type-settings`, `PATCH`/`DELETE …/{id}` |

---

## What remains — expansion (NOT foundational gaps)

These are explicitly **not** gaps that would prevent calling the foundation complete. They are
additions that ride on the finished foundation and resume when capabilities need exposure:

- Normalize **additional route families** (e.g. the broader `{ <plural> }` list-route bucket,
  sibling analytics routes).
- **Broaden OpenAPI** to newly normalized families (each must clear the readiness gate + DoD).
- **Migrate more consumers** to the generated client (gradual, opt-in).
- **Enforce the org-scoping guard in CI** (currently advisory — promotion is an expansion step).
- **Public SDK** (packaged, versioned, externally supported).
- **Developer portal** (public documentation surface).
- **Public `/api/v1`** (separate versioned surface after a public-contract review).
- **Async export APIs** (long-running/exportable datasets).
- **Webhook / event-stream public surface** (outbound events for external consumers).
- **API dashboard** (operational visibility for the platform itself).

See [`openapi-readiness.md`](openapi-readiness.md) §0 for the Platform Complete vs Expansion model.

---

## Why we pause here

- **The API foundation is now coherent.** Contract, doctrine, OpenAPI, generated types, generated
  client, contract tests, and a single CI command (`npm run api:check`) form a closed,
  self-protecting loop. Drift is hard to introduce accidentally.
- **Further API work has diminishing returns until more operational capabilities exist.**
  Normalizing additional routes or broadening the spec adds little value without new product
  capabilities behind them to expose.
- **Operational products should now be built on this pattern.** Attendance, Scheduling, Billing,
  Processing, Parent Experience, and Staff Experience should be designed as **platform capabilities
  first** (canonical entities → canonical API → generated client → consumers), then surfaced through
  UI. See [`../platform/foundation/capability-model-doctrine.md`](../platform/foundation/capability-model-doctrine.md).
- **API work resumes as expansion** when a new capability needs a stable, typed boundary — applying
  the readiness gate and the Definition of Done, not re-litigating the foundation.

---

## Related

- [`README.md`](README.md) — API documentation index
- [`api-platform-governance.md`](api-platform-governance.md) — operating contract + lifecycle + CI
- [`openapi-readiness.md`](openapi-readiness.md) — readiness gate + Platform Complete vs Expansion
- [`internal-typescript-client.md`](internal-typescript-client.md) — the generated client
- [`../platform/foundation/capability-model-doctrine.md`](../platform/foundation/capability-model-doctrine.md) — capability model (API-first)
