# Alloy API Response Contract

**Status:** Phase 2 (Contract Normalization) — foundation established, representative slice migrated.
**OpenAPI:** Deferred to Phase 3. Eligibility + the readiness gate are defined in [`openapi-readiness.md`](openapi-readiness.md).

This document defines the standard Alloy API response envelope, the helpers that
produce it, the error-code and correlation-id conventions, and the current
migration status. It is the source of truth for new and migrated routes.

Related: [`README.md`](./README.md) · [`api-documentation-audit.md`](./api-documentation-audit.md) · [`api-index.md`](./api-index.md)

---

## 1. Standard envelope

```ts
type ApiSuccess<T> = {
  ok: true;
  data: T;
  correlation_id?: string;
};

type ApiFailure = {
  ok: false;
  error: {
    code: string;       // stable, machine-readable (SCREAMING_SNAKE_CASE)
    message: string;    // human-facing; may change, do not branch on it
    details?: unknown;  // optional structured context (e.g. zod issues)
  };
  correlation_id?: string;
};
```

Preferred shapes:

```jsonc
// success
{ "ok": true, "data": { /* ... */ }, "correlation_id": "…" }

// failure
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Record not found" }, "correlation_id": "…" }
```

**Clients should branch on `ok` and `error.code`, never on `message` or HTTP body text.**

---

## 2. Helpers

Server utilities live under [`web/lib/api/`](../../web/lib/api):

| File | Exports |
| --- | --- |
| `apiResponse.ts` | `apiOk(data, init?)`, `apiError(code, message, status?, details?, init?)`, `apiZodError(error, init?)`, types `ApiSuccess`/`ApiFailure`/`ApiResponseBody` |
| `apiErrors.ts` | `API_ERROR_CODES`, `DEFAULT_STATUS_BY_CODE`, `defaultStatusForCode`, `sanitizeErrorDetails`, `safeErrorMessage`, `toValidationDetails` |
| `correlationId.ts` | `CORRELATION_ID_HEADER`, `generateCorrelationId`, `readIncomingCorrelationId`, `resolveCorrelationId` |

Guarantees enforced by the helpers:

- **Never a bare string body.** Responses are always JSON objects.
- **Correlation id always present** (see §4).
- **No stack-trace / secret leakage.** `details` is sanitized: an `Error` collapses
  to `{ message }`; callers must not place secrets in `details`.
- **Consistent status.** Failure status defaults from the error code unless overridden.

Usage:

```ts
import { apiOk, apiError, apiZodError } from "@/lib/api/apiResponse";

// success
return apiOk({ items }, { request });

// explicit failure
return apiError("BAD_REQUEST", "Only opportunity preflight is supported in v1", undefined, undefined, { request });

// zod / schema failure
const parsed = Schema.safeParse(raw);
if (!parsed.success) return apiZodError(parsed.error, { request });
```

---

## 3. Error code convention

Codes are stable SCREAMING_SNAKE_CASE strings. Baseline codes and their default
HTTP status:

| Code | Status | Use |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed/invalid request not covered by schema validation |
| `VALIDATION_ERROR` | 400 | Schema/zod validation failure (`apiZodError`) |
| `UNAUTHORIZED` | 401 | Missing/invalid auth |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | Resource not found / not readable in scope |
| `CONFLICT` | 409 | State conflict |
| `RATE_LIMITED` | 429 | Throttled |
| `NOT_IMPLEMENTED` | 501 | Endpoint not implemented |
| `INTERNAL` | 500 | Unexpected server error |

Routes may introduce additional domain-specific codes; reuse the baseline where it fits.
`VALIDATION_ERROR` maps to **400** (not 422) to match the existing codebase convention.

---

## 4. Correlation id convention

- Header name: `x-correlation-id`.
- Helper-produced responses **always** include a correlation id, in both the JSON
  body (`correlation_id`) and the `x-correlation-id` response header.
- Resolution precedence: explicit value → incoming request `x-correlation-id`
  header → freshly generated id.
- The contract type marks `correlation_id` optional only so non-helper (legacy)
  responses remain valid. The documented rule for migrated routes is **"present"**.

---

## 5. Migration status

> Phase 2 intentionally migrates a small, representative slice — not all 456 routes.
> The goal is to prove the contract across action execution, preflight, list/read,
> validation failure, and not-found / forbidden / bad-request — without breaking UI.
>
> **Live tracker (priority order + legacy/sunset surfaces):**
> [`api-contract-migration-status.md`](api-contract-migration-status.md).

| Route | Method | Migration | Notes |
| --- | --- | --- | --- |
| `/api/admin/actions/preflight` | POST | **Full** | New zod body schema → `apiZodError`; success via `apiOk`. No client consumers. |
| `/api/admin/actions/inventory` | GET | **Full** | `apiOk({ items })`; 3 client consumers updated in lockstep. |
| `/api/admin/analytics/metrics` (+ `/[id]`, `copy`, `preview`, `snapshot`, `trend`) | GET, POST, PATCH | **Full** | Analytics family normalized. `apiOk`/`apiError`; validation via `metricValidationError`. Active builder/settings consumers (`MetricBuilderPanel`, `MetricSetupFlow`, `fetchMetricPlatform`, `fetchMetricRender`) unwrap the envelope. See [`api-contract-migration-status.md`](api-contract-migration-status.md). |
| `/api/admin/entity/[type]/[id]` | GET | **Full** | Phase 2D: success = `apiOk({ entity })` for every entity type + `{ _create: true }`; opportunity surfaces wrap identically and keep `X-Alloy-*` perf headers; all errors via `apiError` (status codes preserved). Active consumers unwrap `json.data.entity` (shared `unwrapEntityRecord`). See [`api-contract-migration-status.md`](api-contract-migration-status.md). |
| `/api/admin/actions/execute` | POST | **Full** | Phase 2B: success is canonical `data` only (legacy top-level mirror dropped); all failures use `apiError`. Action-blocked failures carry preflight context under `error.details` with the stable `ACTION_BLOCKED` code. All 15 consumers updated in lockstep. See `actions-execute-envelope-audit.md`. |

### Why some routes are partial

- **entity GET** is now **fully** migrated (Phase 2D): success wraps the unchanged
  record in `data.entity`. The envelope is an outer wrapper only — consumers unwrap
  before feeding drawer readiness predicates / snapshot caches, so composed-payload
  reveal gates are unchanged. The high-throughput `full` opportunity surface builds the
  envelope JSON string directly to keep serialization single-pass.

### Action-blocked failures (`ACTION_BLOCKED`)

`POST /api/admin/actions/execute` returns the stable code `ACTION_BLOCKED` when an
action is rejected by unmet completion/preflight requirements. The rich context the
UI needs to render a blocked-action panel travels under `error.details`:

```jsonc
{
  "ok": false,
  "error": {
    "code": "ACTION_BLOCKED",
    "message": "Add a classroom before approving enrollment.",
    "details": {
      "completion_requirements": { /* RequirementValidationResult */ },
      "effective_requirements": { /* EffectiveRequirementsResult */ },
      "action_preflight": { /* ActionPreflightUiPayload */ },
      "blockers": [ /* runtime blocker codes */ ]
    }
  },
  "correlation_id": "…"
}
```

Other execute failures derive their code from the preserved HTTP status
(`BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `INTERNAL`, …).
- **analytics POST/PATCH** share builder-panel consumers with the non-migrated
  `[id]` route; migrating one side alone would break the shared consumer.

---

## 6. Org-scoping guard (spike)

`scripts/auditOrgScopingGuard.mjs` is a **heuristic** warning tool that flags
routes using a service-role client against known tenant tables without a visible
org-scope signal. It is advisory (does not fail CI); the Phase 2 contract test only
enforces that the migrated subset is clean. See the script header for limitations.

```bash
node scripts/auditOrgScopingGuard.mjs          # report
node scripts/auditOrgScopingGuard.mjs --json   # machine-readable
```

---

## 7. Tests

```bash
cd web && npm run test -- tests/api/apiResponse.test.ts \
  tests/api/contractRoutes.test.ts \
  tests/api/orgScopingGuard.test.ts
```

- `apiResponse.test.ts` — helper behavior (envelopes, status, correlation id, no leakage).
- `contractRoutes.test.ts` — migrated routes return `ok:true`/`ok:false` envelopes, no bare-string error, stable validation code, correlation id.
- `orgScopingGuard.test.ts` — migrated subset is not flagged; global warnings are advisory.
