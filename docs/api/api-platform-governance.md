# Alloy API Platform Governance

**Status:** Phase 3 finalized — the internal API Platform is **complete and self-governing**.

This document is the **operating contract** for the API platform. It defines what "done" means for
API work, what a route must satisfy to enter OpenAPI and the generated client, how the platform
defends itself in CI, and the lifecycle every API moves through. It is doctrine: when reality and
this document diverge, either fix the route or amend this document deliberately — do not let them
drift silently.

Read alongside:

- [`api-architecture.md`](api-architecture.md) — governing architecture (principles, taxonomy,
  error doctrine, versioning, OpenAPI doctrine, SDK direction).
- [`api-response-contract.md`](api-response-contract.md) — the envelope + helpers.
- [`api-data-access-performance.md`](api-data-access-performance.md) — freshness, pagination, sync,
  caching, performance SLOs.
- [`openapi-readiness.md`](openapi-readiness.md) — the gate + **Platform Complete vs Expansion**.
- [`internal-typescript-client.md`](internal-typescript-client.md) — the generated client.
- [`api-contract-migration-status.md`](api-contract-migration-status.md) — live per-route tracker.

---

## 1. Definition of Done for a new (or newly normalized) API

A route family is **Done** only when **all** of these hold. This is the bar for both new routes and
routes being normalized onto the contract.

1. **Auth + org scope.** Resolves an authenticated admin context before touching data; every tenant
   query filters `org_id`; department/site-restricted callers are denied by default (`404`/`403`,
   never foreign data). No service-role client in browser code.
2. **Normalized envelope.** Every response — success **and every error exit** — uses `apiOk` /
   `apiError` / `apiZodError` (or a thin wrapper). No bare records, no `{ <plural>: [...] }` top
   level, no bare-string error bodies.
3. **Stable error codes.** Failures use SCREAMING_SNAKE_CASE codes with HTTP status preserved.
   Consumers branch on `ok` + `error.code`, never on `message`.
4. **Correlation id.** Present on the body (`correlation_id`) and the `x-correlation-id` response
   header.
5. **Consumers unwrap in lockstep.** Every active consumer reads `json.data.*` (or a shared unwrap
   helper / the typed client). No active surface depends on a legacy shape.
6. **Contract tests.** Success + bad-request + forbidden + not-found envelopes proven in
   `web/tests/api/contractRoutes.test.ts` (or a sibling), plus a representative consumer unwrap.
7. **Docs updated.** Marked **Full** in [`api-contract-migration-status.md`](api-contract-migration-status.md)
   and reflected in [`api-response-contract.md`](api-response-contract.md).
8. **`npm run api:check` passes** (see §8).

A route that does not meet **all** of the above is not eligible for OpenAPI or the generated client.

---

## 2. OpenAPI admission requirements

Beyond the Definition of Done, a family enters `docs/api/openapi/alloy-api.v0.yaml` only when:

- It belongs to an **allowed family** (the contract suite enforces the allow-list). Internal,
  debug, bootstrap, experimental, public/tokenized, and legacy/sunset routes are **excluded**.
- Each operation declares: `operationId` (unique), `tags`, a request schema where it accepts a body,
  response schemas, the normalized **success envelope** (`ApiSuccess` + `CorrelationId`), normalized
  **failure envelopes** (`ApiFailure`), and the `x-correlation-id` response header on success.
- The spec passes `node scripts/validate-openapi.mjs` and the contract suite
  (`web/tests/api/openapiContract.test.ts`).

The full per-family checklist lives in [`openapi-readiness.md`](openapi-readiness.md) §6.

---

## 3. Response contract requirements

- Success: `{ ok: true, data: <payload>, correlation_id }`.
- Failure: `{ ok: false, error: { code, message, details? }, correlation_id }`.
- Produced only via the shared helpers in `web/lib/api/` — handlers do not hand-build envelopes.
- Lists return a **named** payload key (`{ items }`, `{ metrics }`, …) inside `data`, never a bare
  top-level array.

## 4. Correlation id requirements

- Every normalized response carries `correlation_id` in the body and `x-correlation-id` in headers.
- The generated client surfaces it on `AlloyApiError.correlationId` for failures and forwards a
  caller-supplied id when configured.
- Correlation id is a **trace aid**, not auth or idempotency state.

## 5. Pagination requirements

- List endpoints that can grow unbounded use the **cursor-first** `page_info`
  (`next_cursor` / `has_more` / `limit`) defined in
  [`api-data-access-performance.md`](api-data-access-performance.md) §3, exposed via the shared
  `PageInfo` schema.
- Small **bounded archived/static** catalogs (e.g. the current reference-data families) may omit
  pagination; new or large families must adopt it before admission.
- No offset-only pagination for large or hot datasets; no "fetch everything in a loop" client
  patterns (data-access anti-patterns §10).

## 6. Freshness requirements

- Every read operation declares a **freshness class** (real-time / near-real-time / batch-tolerant /
  archived) in its OpenAPI description, per the `FreshnessClass` model.
- Caching and revalidation must be consistent with the declared class; a route may not advertise a
  freshness it does not honor.

## 7. Versioning expectations

- Internal routes are **unversioned-but-governed**: changes are additive and contract-tested; the
  envelope and correlation-id guarantees are stable.
- **Breaking** a normalized contract requires either a deliberate, documented migration (additive
  field → consumer migration → removal) or a new versioned surface — never a silent shape change.
- A public `/api/v1` is a **separate, versioned** surface introduced only after a public-contract
  review (architecture §6). Internal normalization is not a public promise.

---

## 8. CI: how the platform defends itself

A single command runs the full guard chain (static — no server/DB/network):

```bash
cd web && npm run api:check          # -> node scripts/api-platform-check.mjs
```

It executes and **fails** on any of:

1. **OpenAPI validation** — spec parses + is structurally sane (`scripts/validate-openapi.mjs`).
2. **Generated types freshness** — committed `web/lib/api/generated/alloyApiTypes.ts` matches a
   fresh in-process render of the spec (fails on **stale** types).
3. **Determinism** — two renders of the spec are byte-identical.
4. **OpenAPI contract tests** — `openapiContract.test.ts`: spec ↔ routes ↔ families ↔ client,
   including **orphan-operation** detection (every operation maps to exactly one client method and
   vice versa).
5. **API envelope tests** — `contractRoutes.test.ts`: normalized routes emit the standard envelope.
6. **Typed client tests** — unwrap/error behavior + the first-consumer migration proof.

Regenerate types after any spec change with `cd web && npm run api:generate-types`.

> CI is intentionally a **local/command-level** gate (no GitHub Actions in this sprint). Wiring it
> into a pipeline is an expansion step, not foundational work.

---

## 9. Legacy / sunset policy

- **Legacy drawer-only flows** (`AdminEntityDrawerLegacy.tsx` and inline call sites) mount only
  under the emergency kill switch. They receive **mechanical envelope-read alignment only** so
  rollback keeps working against normalized routes — they are **not** modernization targets and are
  **never** added to OpenAPI. When the kill switch is retired, **delete** them rather than spec them.
- **Sunset** routes are documented in [`api-contract-migration-status.md`](api-contract-migration-status.md)
  and excluded from the spec and the client.
- No new consumer may be built against a legacy/sunset shape.

## 10. Public API admission policy

A route becomes part of a **public** developer API only after a dedicated review covering: stable
external contract, field-level exposure allow-listing, authentication/authorization model, rate
limiting, versioning (`/api/v1`), and deprecation policy. Internal normalization and OpenAPI v0
membership are **prerequisites**, not the decision. Until then, the surface is **internal**.

## 11. Performance expectations

- Operations respect the **SLO class** declared in their OpenAPI description and the SLO targets in
  [`api-data-access-performance.md`](api-data-access-performance.md) §8.
- Reads prefer composed/payload-first responses over chatty round-trips; bulk access avoids
  per-entity loops; hot reads are cache-aware per their freshness class.
- Runtime-sensitive drawer/queue/reveal paths additionally obey the AdminV2 runtime performance
  doctrine — API normalization must not weaken payload readiness or reveal gates.

## 12. Typed client expectations

- The generated client (`web/lib/api/alloyApiClient.ts` + generated `alloyApiTypes.ts`) is the
  **preferred** way to call normalized families in new code and tests.
- It must expose **exactly** the v0 operation families — no legacy endpoints — and stay in a strict
  1:1 mapping with spec operations (enforced by the contract suite's orphan checks).
- Types are **generated, never hand-edited**; regenerate from the spec. The runtime wrapper is
  hand-written and lives outside `generated/`.
- Consumer migration to the client is **gradual and opt-in**; existing helpers remain valid until a
  consumer is intentionally migrated.

---

## 13. The API lifecycle

Every API moves through this pipeline. The platform's job is to make each arrow cheap and each gate
hard to bypass.

```
Proposal
   ↓        (intent + surface taxonomy + auth/scope model)
Implementation
   ↓        (route handler under web/app/api/**, server-validated)
Normalization
   ↓        (Definition of Done §1 — envelope, codes, correlation id, consumers)
Contract Tests
   ↓        (contractRoutes.test.ts + readiness gate §6)
OpenAPI
   ↓        (admission §2 — gate-passing families only)
Generated Client
   ↓        (types regenerated; client method added; orphan checks pass)
Consumer Adoption
   ↓        (gradual migration of active consumers to the typed client)
Public API (optional)
            (separate versioned /api/v1 after a public-contract review §10)
```

- **Proposal → Implementation → Normalization** is product/feature work governed by the DoD.
- **Contract Tests → OpenAPI → Generated Client** is platform admission, guarded by
  `npm run api:check`.
- **Consumer Adoption** is incremental and never blocks admission.
- **Public API** is optional and explicitly downstream of everything else.

---

## 14. Platform maturity snapshot (Phase 3 finalization)

| Capability | Status | Where |
|------------|--------|-------|
| Inventory | ✅ Complete | `api-index.md` (generated) |
| Doctrine | ✅ Complete | `api-architecture.md`, `api-data-access-performance.md`, this doc |
| Response contract | ✅ Complete | `api-response-contract.md`, `web/lib/api/` |
| OpenAPI | ✅ v0 complete (gate-passing families) | `openapi/alloy-api.v0.yaml` |
| Generated client | ✅ Complete | `web/lib/api/alloyApiClient.ts` + generated types |
| Consumer adoption | ✅ Proven (1 consumer); ongoing by design | Person Roles settings |
| Contract testing | ✅ Complete | `web/tests/api/openapiContract.test.ts` (+ envelope/client) |
| Governance | ✅ Complete | this document + `openapi-readiness.md` |
| CI | ✅ Complete (local command) | `npm run api:check` |

**Foundationally complete.** Everything further — more normalized families, more spec coverage,
more migrated consumers, SDKs, public portal — is **expansion** (see `openapi-readiness.md` §0).
