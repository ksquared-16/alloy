# Alloy OpenAPI (internal v0)

This folder holds Alloy's **internal** OpenAPI specification.

- [`alloy-api.v0.yaml`](alloy-api.v0.yaml) — the OpenAPI 3.1 spec for the normalized,
  gate-passing API surface.

A typed internal TypeScript client is **generated from this spec** — see
[`../internal-typescript-client.md`](../internal-typescript-client.md)
(`web/lib/api/generated/alloyApiTypes.ts` + the hand-written `web/lib/api/alloyApiClient.ts`).

## What this is — and is not

- **This is internal `v0`.** It exists as a contract artifact for **humans, Cursor/agents,
  tests, and future SDK generation** — so we all build against Alloy consistently.
- **It is intentionally incomplete.** It documents *only* route families that have passed the
  [OpenAPI readiness gate](../openapi-readiness.md). Most of Alloy's ~461 routes are **not**
  here yet, by design.
- **It is not public API documentation.** There is no public developer portal, no stability
  promise to external consumers, and no `/api/v1` surface yet. The internal routes remain
  unversioned-but-governed (see [`../api-architecture.md`](../api-architecture.md) §6).
- **Routes are added only after they pass the gate** — normalized envelope, stable error
  codes, correlation id, active consumers migrated, contract tests, docs, and org-scoping
  sanity. The gate and the per-family checklist live in [`../openapi-readiness.md`](../openapi-readiness.md).

## What v0 covers today

| Family | Routes |
|--------|--------|
| **Actions** | `GET /api/admin/actions/inventory`, `POST /api/admin/actions/preflight`, `POST /api/admin/actions/execute` |
| **Analytics Metrics** | `GET`/`POST /api/admin/analytics/metrics`, `GET`/`PATCH /api/admin/analytics/metrics/{id}`, `POST …/{id}/copy`, `POST …/{id}/preview`, `POST …/{id}/snapshot`, `GET …/{id}/trend` |
| **Entity Read** | `GET /api/admin/entity/{type}/{id}` |
| **Reference Data** | `GET`/`POST /api/admin/customer-person-role-types`, `PATCH`/`DELETE …/{id}`; `GET`/`POST /api/admin/person-relationship-type-settings`, `PATCH`/`DELETE …/{id}` |

Explicitly **excluded** from v0: unnormalized routes, public/tokenized routes,
internal/debug/bootstrap routes, legacy drawer-only flows, experimental agent routes,
un-normalized sibling analytics routes, and broad CRUD families not yet migrated.

## Contract shape

Every response uses Alloy's standard envelope:

```jsonc
// success
{ "ok": true, "data": { /* ... */ }, "correlation_id": "…" }
// failure
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "…", "details": null }, "correlation_id": "…" }
```

Shared components defined in the spec: `ApiSuccess`, `ApiFailure`, `ApiError`, `CorrelationId`,
`PageInfo`, `FreshnessClass`, `SyncMetadata`, `ActionExecuteRequest`, `ActionExecuteResponse`,
`MetricDefinition`, `EntityRecord`, `ReferenceDataItem` (plus request/result helpers). Each
operation declares its **freshness class** and **SLO class** in its description, per
[`../api-data-access-performance.md`](../api-data-access-performance.md).

> `PageInfo` / `SyncMetadata` are defined as shared components for forward use. The current v0
> list/reference routes are small bounded **archived/static** config catalogs and do not yet
> emit pagination; new or large list families will adopt them (data-access doctrine §3, §5).

## Validate

```bash
node scripts/validate-openapi.mjs
```

Lightweight structural check (YAML parses, `openapi` version sane, every operation has
responses + a unique `operationId`, all local `$ref`s resolve). It uses the `js-yaml` already
present under `web/node_modules`, so it adds no new dependency.

## Future path

1. **OpenAPI v0** (this file) for gate-passing families. ✅ done
2. **Generated internal TypeScript client** from v0 — typed methods used first by Alloy's own
   code and agents. ✅ done — see [`../internal-typescript-client.md`](../internal-typescript-client.md)
3. **Typed request/response contracts** shared with tests (compile-time envelope enforcement).
4. **Integration tests** exercising the generated client against real handlers.
5. **Mock server** derived from the spec for offline/agent development.
6. **Future public SDK** + `/api/v1` — only after a dedicated public-contract review.

See [`../api-architecture.md`](../api-architecture.md) §9 for the SDK/typed-client direction.
