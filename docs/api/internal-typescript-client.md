# Internal TypeScript API Client (v0)

Alloy ships a small **internal** TypeScript client generated from the OpenAPI v0 spec
([`openapi/alloy-api.v0.yaml`](openapi/alloy-api.v0.yaml)). Its job is to stop hand-writing
`fetch` + envelope-unwrap + error-handling logic for the normalized API families.

> **Status:** part of the **complete** internal API Platform foundation
> ([`api-platform-completion.md`](api-platform-completion.md)). This client is the **preferred path
> for new normalized consumers**; broadening it to more families is expansion work.

> **Internal, partial, gradual.** This is **not** a public SDK and not a published package. The
> spec is **v0** and intentionally incomplete — only route families that pass the
> [OpenAPI readiness gate](openapi-readiness.md) are available. App migration to the client is
> **gradual and opt-in**; existing call sites are not being mass-rewritten. A public SDK and a
> `/api/v1` surface come later, after a dedicated public-contract review
> ([`api-architecture.md`](api-architecture.md) §6, §9).

## Files

| File | Role | Edited by hand? |
|------|------|-----------------|
| `web/lib/api/generated/alloyApiTypes.ts` | Generated TS types for the v0 component schemas (`ActionExecuteRequest`, `ActionExecuteResponse`, `MetricDefinition`, `EntityRecord`, `ReferenceDataItem`, …). | **No** — regenerated. |
| `web/lib/api/alloyApiClient.ts` | Thin hand-written runtime wrapper (`createAlloyApiClient`, `AlloyApiError`) + re-exports of the generated types. | Yes. |
| `scripts/generate-openapi-types.mjs` | Generator: parses the spec and emits `alloyApiTypes.ts`. | Yes. |
| `web/tests/api/alloyApiClient.test.ts` | Contract tests against a mocked `fetch`. | Yes. |

> **Why the client is not under `generated/`.** The `generated/` directory holds only
> machine-emitted output (overwritten on every regen). The runtime wrapper is hand-maintained, so
> it lives one level up at `web/lib/api/alloyApiClient.ts` to avoid being clobbered.

## Generation path

Deliberately **dependency-light**: no `openapi-typescript` or other codegen dependency was added.
The generator reuses the `js-yaml` already present under `web/node_modules` (same approach as
`scripts/validate-openapi.mjs`) and emits types for `components.schemas`. It handles exactly the
schema features the v0 spec uses — `$ref`, `allOf`, `enum`, `const`, type arrays (incl. `null`),
objects with `properties`/`required`/`additionalProperties`, arrays, and primitives. It is **not**
a general-purpose OpenAPI codegen; if the spec grows to need richer features, revisit
`openapi-typescript`.

Regenerate after any change to the spec:

```bash
node scripts/generate-openapi-types.mjs
```

The output is deterministic, so a clean working tree after regen means types match the spec.

## Usage

```ts
import { createAlloyApiClient, AlloyApiError } from "@/lib/api/alloyApiClient";

const api = createAlloyApiClient({ baseUrl: "" }); // "" = same-origin (browser default)

// Actions
const inventory = await api.actions.inventory({ surface: "drawer" });
const preflight = await api.actions.preflight({ action_key, entity_type, entity_id });
const result = await api.actions.execute({ action_key, entity_type, entity_id, payload });

// Analytics Metrics
const { items } = await api.metrics.list();
const metric = await api.metrics.get(id);
const created = await api.metrics.create(input);
const updated = await api.metrics.update(id, patch);

// Entity read
const entity = await api.entity.get("persons", personId);

// Reference data
const roleTypes = await api.referenceData.customerPersonRoleTypes.list();
```

### Behavior contract

- **Unwraps the success envelope.** Methods return the relevant `data` payload (e.g.
  `metrics.get` returns `data.item`, `entity.get` returns `data.entity`, `actions.inventory`
  returns `data.items`). Callers receive the same record shapes the route already produced.
- **Throws `AlloyApiError` on failure.** Any `{ ok: false }` body or non-2xx response throws,
  preserving the stable `error.code`, the HTTP `status`, sanitized `details`, and the
  `correlationId`. HTTP status is **not** hidden.
- **Preserves correlation id.** Read from the body (`correlation_id`) with the
  `x-correlation-id` response header as fallback; available on `AlloyApiError.correlationId`. An
  optional client-level `correlationId` is sent as a request header.
- **Injectable `fetch`.** `createAlloyApiClient({ fetch })` accepts a stub for tests; defaults to
  global `fetch`.
- **No legacy endpoints.** Only gate-passing v0 routes are exposed. `referenceData.*.remove()`
  exists for completeness but the API returns `405 NOT_IMPLEMENTED` (deactivate via
  `update(id, { is_active: false })`).

## Error handling

```ts
try {
  await api.actions.execute({ action_key, entity_type, entity_id });
} catch (err) {
  if (err instanceof AlloyApiError) {
    // err.code, err.status, err.details, err.correlationId
  }
}
```

## Tests

`web/tests/api/alloyApiClient.test.ts` proves: generated types compile (typed assignments),
success unwrap per family, typed failure throw, correlation id on errors, and request shaping —
all against a mocked `fetch` (no network, no DB).

```bash
cd web && npx vitest run tests/api/alloyApiClient.test.ts
```

## First app consumer migration

The first active consumer migrated to the generated internal client is
**`web/app/legacy-admin/system/customer-person-roles/CustomerPersonRolesClient.tsx`** (the Person
Roles settings surface), chosen because it is active, non-legacy, low-throughput, and sits on the
already-normalized `customer-person-role-types` reference-data family.

What changed:

- `fetch(...)` + manual `res.json()` / `data.items` / `data.item` unwrap → typed calls:
  - list: `api.referenceData.customerPersonRoleTypes.list<CustomerPersonRoleType>(showAll ? { all: "true" } : undefined)`
  - create: `api.referenceData.customerPersonRoleTypes.create({ key, label, … })`
  - update: `api.referenceData.customerPersonRoleTypes.update(id, { … })`
- Error handling now flows through `AlloyApiError`. **UI behavior is preserved**: the list error
  banner still shows the server message, and the create modal still maps a `409` to the inline
  field error (falling back to `"Key already exists."`). Loading/saving states are unchanged.
- The consumer keeps its richer domain row type via the client's optional generic
  (`list<CustomerPersonRoleType>()`); the default contract type remains `ReferenceDataItem`, so the
  v0 surface is unchanged.

Proof tests: `web/tests/api/customerPersonRolesClientMigration.test.ts` exercise the exact
no-arg-client path the component uses against a stubbed global `fetch` — success unwrap into typed
rows, the `showAll` query toggle, a normalized failure throwing `AlloyApiError` (stable message +
preserved `correlationId`), the `409` → inline-error mapping, and a `@ts-expect-error` proving an
invalid create payload fails the TypeScript compile (verified in the tsc program, not just at
runtime).

## Migration posture

This client is the **preferred** way to call normalized v0 routes in **new** code and tests, and is
now **proven in one active consumer** (above). Remaining consumers stay as-is until intentionally
migrated; the helpers they already use (`unwrapEntityRecord`, `apiOk`/`apiError`, etc.) remain
valid. As more families pass the gate and join the spec, regenerate the types and extend the
client.

## Related

- [`openapi/README.md`](openapi/README.md) — the v0 spec and what it covers.
- [`openapi-readiness.md`](openapi-readiness.md) — the gate a family must pass before it's added.
- [`api-architecture.md`](api-architecture.md) — §9 SDK / typed-client direction.
- [`api-response-contract.md`](api-response-contract.md) — the envelope the client unwraps.
