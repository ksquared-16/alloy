# Alloy API Platform Architecture

**Status:** Doctrine (June 2026). This is the governing architecture document for **all**
Alloy API work. It defines what the API layer *is*, the surface taxonomy, the response and
error contract, auth/org-scoping rules, versioning, consumer expectations, the OpenAPI gate,
the SDK direction, and the governance that keeps it coherent.

> **Doc roles.** This file is **doctrine** (the rules). The companions are operational:
> [`api-response-contract.md`](api-response-contract.md) is the **contract spec** (envelope +
> helpers), [`api-contract-migration-status.md`](api-contract-migration-status.md) is the
> **progress tracker**, [`openapi-readiness.md`](openapi-readiness.md) is the **eligibility
> gate**, [`api-data-access-performance.md`](api-data-access-performance.md) is the **data-access
> & performance doctrine** (pagination, sync, freshness, caching, SLOs), and
> [`api-index.md`](api-index.md) is the **generated inventory**. When this doc and
> a companion disagree, this doc states the intent and the companion is corrected to match.

---

## Thesis

**Alloy APIs are not implementation details. They are the platform boundary.**

Every surface — workspace, configuration, BOS, workflows, analytics, future SDKs,
integrations, and public developer tools — speaks through stable HTTP contracts. The API
layer exists to support: one source of truth, consistent internal development, safer AI /
code-agent work, future OpenAPI, future SDKs, and a future public developer platform.

The order is deliberate: **internal consistency before public exposure.** A spec or SDK is
only as trustworthy as the contract underneath it.

---

## 1. API principles

1. **APIs are the platform contract.** Admin/config/runtime writes go through server-validated
   HTTP route handlers under `web/app/api/**`. No direct database writes from the browser, no
   service-role client in client code, no raw SQL path from the UI.
2. **One contract philosophy for all callers.** UI, agents, automations, and future
   integrations share the same envelope, error doctrine, and auth model. An AI agent calling a
   route gets the same contract a human-driven UI does.
3. **Database tables are not the public contract.** Schema is an implementation detail behind
   the route. Consumers bind to documented request/response shapes, never to table columns.
   Tables may be refactored as long as the contract holds.
4. **Server routes own the hard parts.** Auth, org scoping, validation, side effects, and audit
   are the route handler's responsibility — not the caller's, not the client's.
5. **Service-role access must never mean unscoped access.** The service-role Supabase client
   bypasses RLS; therefore every tenant query filters `org_id` and every cross-entity read
   asserts org membership. Privilege at the DB layer is paired with explicit scoping at the
   handler layer.
6. **Internal consistency comes before public exposure.** Normalize, test, and migrate
   consumers first. OpenAPI, SDKs, and a public developer platform are downstream of a
   consistent internal surface.

---

## 2. API surface taxonomy

Every route belongs to exactly one class. The class sets expectations for callers, stability,
auth, docs, and OpenAPI eligibility.

| Class | Path signal (typical) | Who may call | Stability | Auth model | Docs expectation | OpenAPI |
|-------|----------------------|--------------|-----------|------------|------------------|---------|
| **Public / tokenized** | `/api/public/**`, token in path/header | Unauthenticated external callers holding a capability token (form/booking links) | High once published; treat as external contract | Capability token + per-token scope; no admin session | Full, external-facing; explicit field exposure | **Only after a dedicated public-contract review** |
| **Admin API** | `/api/admin/**` | Authenticated admin/ops users (and agents acting as them) within an org | Governed; normalized families are stable | `getAdminContextCached` + `getAdminAccessContextCached` (+ `requireAdminOrOps` for mutations) | Curated domain doc + inventory row | **Yes, once it passes the readiness gate** |
| **Internal platform API** | bootstrap, diagnostics, internal jobs | Platform itself / operators / scheduled jobs | Internal; may change without notice | Internal guard / service context; often no external surface | Inventory + intent note; not a caller contract | **No** |
| **Experimental API** | agent/BOS commit routes, flag-gated previews | Feature-flagged internal callers only | Explicitly unstable | Capability gate (e.g. Config/Layout Assist generate permission) | Marked experimental; behavior may move | **No** until promoted out of experimental |
| **Webhook API** | provider inbound (`/webhooks/**`, provider callbacks) | External providers (comms, payments, etc.) | Bound by the provider's contract | **Provider signature verification**, not Alloy session auth | Document the provider + verification + idempotency | **No** (inbound, not a callable Alloy contract) |
| **Legacy / sunset API** | old `/admin` drawer flows, `agent/v0\|v1\|v2`, aliases | Whatever still imports them | Frozen; **sunset candidates** | Whatever they shipped with | Recorded as sunset in the tracker | **No** — never spec a sunset surface |

Rules of the taxonomy:

- A route's class is part of its identity. New routes **declare** their class (see §10).
- **Legacy/sunset** routes get *mechanical* alignment only when an active path forces it (e.g.
  kill-switch rollback) — never modernization. When the dependency is retired, delete them.
- A route may not be simultaneously "public" and "admin"; tokenized external access is its own
  class with its own review.

---

## 3. Standard response contract

The canonical envelope (full spec in [`api-response-contract.md`](api-response-contract.md)):

```ts
// success
{ ok: true, data, correlation_id }
// failure
{ ok: false, error: { code: string, message: string, details?: unknown }, correlation_id }
```

Produced by the shared helpers in [`web/lib/api/`](../../web/lib/api):

| Helper | Module | Responsibility |
|--------|--------|----------------|
| `apiOk(data, init?)` | `apiResponse.ts` | Success envelope; attaches `data` + correlation id. |
| `apiError(code, message, status?, details?, init?)` | `apiResponse.ts` | Failure envelope; status defaults from code; sanitizes `details`. |
| `apiZodError(error, init?)` | `apiResponse.ts` | Schema/validation failure → `VALIDATION_ERROR` with zod issues in `details`. |
| correlation id | `correlationId.ts` | `CORRELATION_ID_HEADER` (`x-correlation-id`); resolve precedence explicit → incoming → generated. |

**Doctrine:** new and normalized routes **must** emit via these helpers. Hand-built
`NextResponse.json` bodies are permitted only on un-migrated legacy routes (and the one
documented single-pass `full`-surface envelope string in `opportunityEntityRecord.ts`, which
still emits the exact envelope shape).

---

## 4. Error doctrine

- **Stable error codes.** SCREAMING_SNAKE_CASE, machine-readable, the thing clients branch on.
  Baseline: `BAD_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `CONFLICT`, `RATE_LIMITED`, `NOT_IMPLEMENTED`, `INTERNAL`. Domain codes (e.g. `ACTION_BLOCKED`)
  are allowed when the baseline doesn't fit.
- **Human-readable messages.** `message` is for humans and may change — **never branch on it.**
- **Sanitized details.** `details` carries structured context (e.g. zod issues, blocked-action
  requirements). An `Error` collapses to `{ message }`; callers must not place secrets there.
- **No stack traces** cross the boundary.
- **No bare strings.** Responses are always JSON objects — never `NextResponse.json("Not found")`.
- **No mixed `{ error: string }`** on normalized routes. Errors are always the `error` object.
- **Status code preservation.** Normalizing a route changes the *body shape*, never its HTTP
  status semantics. A 404 stays 404, a 405 stays 405.
- **Correlation id always included** for normalized routes — in both the body (`correlation_id`)
  and the `x-correlation-id` header.

---

## 5. Auth and org-scoping doctrine

- **Route gates first.** Every tenant route resolves an authenticated context *before* touching
  data and returns 401/403 otherwise.
- **Admin context.** `getAdminContextCached` establishes user + `org_id` + portal eligibility;
  `getAdminAccessContextCached` layers permission keys + department/site scope. Mutations
  frequently add `requireAdminOrOps`. Newer routes may use a single-pass `loadAdminRouteGate`.
- **Public / org context.** Public surfaces resolve a *minimal* org context appropriate to the
  capability — never an admin session — and expose only what the capability allows.
- **Tokenized access.** Capability tokens scope to a specific resource/action (form token,
  booking link). The token *is* the authorization; it does not borrow an admin session.
- **Provider signature verification.** Inbound webhooks authenticate by verifying the provider's
  signature (not Alloy auth) and must be idempotent.
- **Service-role risk.** `createAdminClient` bypasses RLS, so **org isolation is handler
  responsibility.** Every tenant `.from(...)` filters `org_id`.
- **FK-chain assertions.** Org-less primary tables (e.g. `discount_redemptions`, catalog tables)
  assert org membership through a foreign-key chain to an org-scoped row, or via vertical/industry
  scoping — documented per type.
- **Deny by default.** Department/site-restricted callers get empty lists or `404` on
  out-of-scope single records — never another tenant's or department's data.
- **Future org-scoping guard.** `scripts/auditOrgScopingGuard.mjs` is today an **advisory**
  heuristic flagging service-role routes that touch tenant tables without a visible org-scope
  signal. Direction: triage the warning list, then promote it toward a **CI gate** so the
  surface's scoping claims are enforced, not merely asserted.

---

## 6. Versioning strategy

- **Current internal API is unversioned but governed.** `/api/admin/**` has no version segment;
  it is governed by this doctrine, the migration tracker, and contract tests rather than by a URL
  version. This is deliberate while consumers and the platform ship together.
- **OpenAPI starts at `v0`.** The first spec is `v0` and covers only gate-passing families
  (§8). `v0` signals "stable enough for internal typed clients," not "frozen public contract."
- **Public/developer API becomes `/api/v1/...`.** When Alloy exposes an external developer
  surface, it lives under an explicit version segment with its own lifecycle, decoupled from
  internal route paths.
- **Breaking changes require a version bump or a compatibility window.** For a versioned/public
  contract, breaking changes mean a new version or a documented dual-serving window. For internal
  routes, a breaking change must migrate consumers in the same change (coordinated migration).
- **Legacy aliases are sunset candidates, not modernization targets.** Re-export aliases (e.g.
  `v2/*` → non-`v2`) exist for compatibility; converge callers and remove one path rather than
  evolving both.

---

## 7. Consumer doctrine

- **Unwrap the standard envelope.** Normalized-route consumers read `json.data.*` on success and
  branch on `!res.ok || json.ok === false` then `json.error.code` / `json.error.message` on
  failure.
- **Use shared helpers where available.** Prefer a shared unwrap (e.g. `unwrapEntityRecord`) over
  re-implementing extraction at each call site, so the record/shape stays identical downstream.
- **No hand-parsing mixed error shapes** for normalized routes. Do not read both `json.error`
  (string) and `json.error.message` "just in case" once a route is migrated.
- **Legacy tolerance only during migration.** An envelope-tolerant shim
  (`json.data?.x ?? json.x`) is acceptable **only** as a documented transition (e.g. a writer
  shared with a not-yet-migrated sibling) and must be listed in the migration tracker.
- **Active runtime first, legacy surfaces last.** Migrate active workspace/runtime consumers in
  lockstep with the route; touch legacy/sunset consumers only for mechanical survival
  (kill-switch rollback), never to modernize them.

---

## 8. OpenAPI doctrine

OpenAPI is generated **only** for route families that pass the readiness gate
([`openapi-readiness.md`](openapi-readiness.md) is canonical). The gate, in brief:

1. Normalized envelope (`apiOk` / `apiError` / `apiZodError`).
2. Stable error codes; status preserved.
3. Correlation id present.
4. Active consumers migrated in lockstep.
5. Contract tests in `web/tests/api/`.
6. Docs updated (tracker + contract spec).
7. Org-scoping sanity (not flagged, or flags triaged).

**OpenAPI v0 eligible today:**

- Actions (`execute`, `preflight`, `inventory`)
- Analytics Metrics (`metrics` + `[id]` + `copy`/`preview`/`snapshot`/`trend`)
- Entity Read (`entity/[type]/[id]`)
- Normalized reference-data config families (`customer-person-role-types`,
  `person-relationship-type-settings`, each incl. `/[id]`)

**Explicitly excluded:**

- internal / debug / bootstrap routes
- legacy drawer-only flows
- mixed-envelope CRUD (the remaining `{ <plural> }` / bare-record routes)
- public / tokenized routes until a separate public-contract review
- experimental agent routes

---

## 9. SDK and typed-client direction

The path from contract to client, each step gated on the previous:

1. **OpenAPI v0** for the gate-passing families (§8). _Done — the spec exists at
   [`openapi/alloy-api.v0.yaml`](openapi/alloy-api.v0.yaml); see [`openapi/README.md`](openapi/README.md)._
2. **Generated internal TypeScript client** from `v0` — typed methods over the normalized
   surface, used first by Alloy's own code and agents. _Done — generated types
   (`web/lib/api/generated/alloyApiTypes.ts`) + a thin hand-written wrapper
   (`web/lib/api/alloyApiClient.ts`); see
   [`internal-typescript-client.md`](internal-typescript-client.md)._
3. **Typed request/response contracts** shared between client and tests so the envelope is
   enforced at compile time, not by convention.
4. **Integration tests** that exercise the generated client against real handlers.
5. **Mock server** derived from the spec for offline/agent development and consumer tests.
6. **Future public SDK** only after a public-contract review (§2 public class, §6 `/api/v1`),
   packaged and versioned independently of internal routes.

---

## 10. Governance

- **Every new route declares its stability/class** (§2: public, admin, internal, experimental,
  webhook, legacy) in its doc/inventory entry.
- **Every normalized route uses the shared helpers** — no hand-built envelopes on migrated
  routes.
- **Every OpenAPI route passes the readiness gate** — no exceptions, no "spec it and fix later."
- **The platform self-checks in CI** — `cd web && npm run api:check` runs OpenAPI validation,
  generated-types freshness + determinism, the OpenAPI contract suite (incl. orphan detection),
  envelope tests, and typed-client tests. See [`api-platform-governance.md`](api-platform-governance.md) §8.
- **`api-index.md` remains the inventory** (generated; regenerate only from a clean tree).
- **`api-contract-migration-status.md` remains the progress tracker** (priority order, migrated
  routes, active consumers, sunset list).
- **This document is doctrine.** Behavior-changing API work should be consistent with it; when
  reality and doctrine diverge, either fix the route or amend this doc deliberately — don't let
  them drift silently.

---

## Related

- [`README.md`](README.md) — API documentation index + invariants
- [`api-data-access-performance.md`](api-data-access-performance.md) — data access, freshness, pagination, sync, caching & performance doctrine
- [`api-response-contract.md`](api-response-contract.md) — envelope + helper spec
- [`api-platform-governance.md`](api-platform-governance.md) — Definition of Done, admission, lifecycle, CI (`npm run api:check`)
- [`api-contract-migration-status.md`](api-contract-migration-status.md) — progress tracker
- [`openapi-readiness.md`](openapi-readiness.md) — OpenAPI eligibility gate + Platform Complete vs Expansion
- [`internal-typescript-client.md`](internal-typescript-client.md) — generated internal TS client (v0)
- [`api-documentation-audit.md`](api-documentation-audit.md) — findings + recommendations
- [`../platform/foundation/architecture.md`](../platform/foundation/architecture.md) — system context
