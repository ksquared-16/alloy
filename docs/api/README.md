# Alloy API documentation

**Status:** First-class inventory (June 2026). Documentation-first — describes the **current** HTTP surface, does not propose new behavior.

**Purpose:** Make Alloy's API surface visible, reviewable, and maintainable, and to provide a clean foundation for a future public / developer API. APIs are the platform contract: AI/config agents, future integrations, and humans should all speak through the same documented surface.

---

## What lives here

| File | Contents |
|------|----------|
| [`api-index.md`](api-index.md) | **Generated** master table of all `web/app/api/**` route handlers (method, path, auth signal, validation signal, service-role, writes/events, stability, tables). Regenerate with `node scripts/generate-api-inventory.mjs`. |
| [`api-response-contract.md`](api-response-contract.md) | **Phase 2** standard response envelope (`ApiSuccess`/`ApiFailure`), helpers, error-code + correlation-id conventions, and migration status. |
| [`api-contract-migration-status.md`](api-contract-migration-status.md) | **Live migration tracker** — normalization priority order, migrated routes, active consumers, and legacy/sunset surfaces (OpenAPI deferred until internally consistent). |
| [`actions-execute-envelope-audit.md`](actions-execute-envelope-audit.md) | `POST /api/admin/actions/execute` consumer inventory + envelope normalization plan (Phase 2B). |
| [`admin-configuration-api.md`](admin-configuration-api.md) | Configuration control plane — fields, layouts, option sets, statuses, pricing, RBAC, users, org settings |
| [`workspace-api.md`](workspace-api.md) | Workspace, queues, work units, focus-panel/drawer view models, analytics/metrics, global search |
| [`entity-record-api.md`](entity-record-api.md) | Entity GET/resolver, CRM records (persons, customers, opportunities, jobs, schedules, vendors, financials, tours) |
| [`business-process-api.md`](business-process-api.md) | Business processes, lifecycle builder/catalog, status & transitions, pipelines, departments |
| [`actions-workflows-api.md`](actions-workflows-api.md) | Action runtime + catalog, workflows/runs/events, action links/tokens |
| [`documents-forms-api.md`](documents-forms-api.md) | Forms authoring/versions/submissions, packets, documents, POS docs, public form links |
| [`communications-api.md`](communications-api.md) | Threads, send, announcements, scheduled sends, inbox, provider webhooks |
| [`ai-bos-api.md`](ai-bos-api.md) | BOS capabilities — Task Assist, Workflow Assist, Config/Layout Assist, legacy agent commits |
| [`internal-system-api.md`](internal-system-api.md) | Diagnostics, bootstrap, public booking, marketing/lead capture |
| [`api-documentation-audit.md`](api-documentation-audit.md) | Audit report — undocumented/duplicate/unclear-auth/envelope/validation findings and Phase 2 recommendations |

The domain docs are **curated** (conventions + representative deep-dives). The exhaustive per-route enumeration is in the **generated** [`api-index.md`](api-index.md) and `api-inventory.json`.

---

## The platform API contract

These invariants hold across the surface and are the doctrine this documentation enforces.

1. **APIs are the contract.** Admin/config writes go through versioned, server-validated HTTP route handlers under `web/app/api/**`. No direct database writes from the browser, no service-role client in client code, no raw SQL path from the UI.
2. **Auth before data.** Every tenant route resolves an authenticated admin context *before* touching data and returns an auth failure (401/403) otherwise.
3. **Explicit org scoping.** Handlers run on a **service-role Supabase client that bypasses RLS** (`createAdminClient`), so org isolation is the handler's responsibility — every tenant query filters `org_id`, and cross-entity reads assert org membership via FK chains.
4. **Deny by default for scope.** Department/site-restricted callers receive empty lists or `404` on out-of-scope single records — never another tenant's or department's data.
5. **Side effects route through the platform.** Meaningful lifecycle/ledger/communications effects flow through actions, workflow events, and audited mutation paths — not ad hoc writes.

> See `docs/platform/governance/api-contracts.md` (canonical map) and `docs/platform/foundation/architecture.md` (system context). This folder is the expanded, per-domain reference.

---

## Auth & scope model

Routes compose a small set of server helpers. The detected helper per route is in [`api-index.md`](api-index.md) (the **Auth** column).

| Helper | Module | Establishes |
|--------|--------|-------------|
| `getAdminContextCached` | `web/lib/admin/getAdminContext.ts` | Authenticated user + `org_id` + portal eligibility |
| `getAdminAccessContextCached` | `web/lib/admin/getAdminAccessContext.ts` | Permission keys + department/site scope dimensions |
| `loadAdminRouteGate` | `web/lib/admin/adminRouteGate.ts` | Single-pass org + scope + portal bypass (newer routes) |
| `requireAdminOrOps` / `requireAdmin` | `web/lib/adminAuth.ts` | Portal-level role gate (often layered before a mutation) |
| `requireAdminOrgContextLight` | `web/lib/admin/getAdminOrgContextLight.ts` | Lighter org-context for read-heavy comms/inbox/workflow-run reads |
| `requireUsersRolesManageAuth` | `web/lib/admin/canManageUsersAndRoles.ts` | Org admin **or** `settings.users_roles` permission (RBAC/users routes) |
| `requireAnalyticsV2AdminContext` / `…Mutate` | `web/lib/metrics/platform/adminApiHelpers.ts` | Analytics platform read/mutate gate |
| `loadConfigLayoutAssistAdminContext` + `forbidUnlessGeneratePermission` | `web/lib/agent/configLayoutAssist/*` | BOS capability gate for Config/Layout Assist |

**Failure responses** are produced by `adminContextFailureResponse` (and helper-specific `*.response`), returning `401`/`403`/`404` with a JSON or text body.

**Scope deny-by-default:** list/read/mutation routes that accept CRM records apply scope helpers (`assertRowOrg`, `assertEntityDrawerRecordReadable`, `scopeDimensionsFromAccess`). Restricted callers see empty results or `404`, not foreign data.

---

## Conventions

- **Runtime:** Next.js App Router route handlers (`export async function GET/POST/PATCH/PUT/DELETE`). A few routes re-export handlers from a sibling (`export { GET } from "…"`) as compatibility aliases.
- **Data client:** Server-only `createAdminClient()` (service role). Public booking uses `createServiceRoleClient()` with a resolved public org. **Never** exposed to the browser.
- **Validation:** Mostly **manual** (parse JSON, check required fields, `400` on missing). The analytics platform and a few newer routes use **schema validators** (`validate*`, `zodErrorResponse`) or **zod**. The validation signal per route is in [`api-index.md`](api-index.md).
- **Response envelopes:** Historically **not uniform**. Legacy shapes still in the wild:
  - Bare resource object (`GET /api/admin/entity/[type]/[id]` returns the row plus `_`-prefixed display fields).
  - `{ items: [...] }` / `{ <plural>: [...] }` for lists.
  - `{ ok: true, ... }` / `{ ok: false, error, correlation_id }` for action-style routes.
  - `{ error: string }` with an HTTP status for failures — and some routes returned a **bare JSON string** (`"Not found"`).
  - **Phase 2 standardizes this** into a single envelope (`{ ok, data, correlation_id }` / `{ ok, error: { code, message }, correlation_id }`) via shared helpers in `web/lib/api/`. See [`api-response-contract.md`](api-response-contract.md) for the contract and per-route migration status. A representative slice is migrated; full normalization is incremental.

---

## Stability taxonomy

The **Stability** column in [`api-index.md`](api-index.md) uses:

| Label | Meaning |
|-------|---------|
| `admin-only` | Authenticated operator/admin surface. The large majority. Internal to the product UI today. |
| `public/tokenized` | Public booking, lead capture, action links, public form/tour links. No admin gate by design; rely on input validation + token/public-org resolution. |
| `webhook` | Provider-authenticated callbacks (Twilio signature, Resend/Svix). |
| `experimental` | Flag-gated or assist-stage (BOS agent `v0/v1/v2`, Config/Layout Assist proposals). |
| `internal` | Diagnostics, dev/bootstrap, shadow/proof, audit utilities — should not be exposed externally. |

**No route here is a stable public/developer API yet.** Public exposure is a deliberate future step (see [audit](api-documentation-audit.md) Phase 2).

---

## Regenerating the inventory

```bash
node scripts/generate-api-inventory.mjs
```

Rewrites `docs/api/api-index.md` and `docs/api/api-inventory.json` from current route source. The extraction is **heuristic** (static text scan): auth/validation columns are signals, not guarantees — verify against the handler for security-sensitive decisions. Re-run when route families are added, moved, or change auth.

---

## When to update these docs

- New route family or domain → add to the relevant domain doc and regenerate the index.
- Auth/scope/envelope contract change → update the contract section here + the domain doc in the same PR.
- A route graduates toward public exposure → record it in the audit and (Phase 2) add an OpenAPI entry.

---

## Related

- `docs/platform/governance/api-contracts.md` — canonical representative map
- `docs/platform/foundation/architecture.md` — system context
- `docs/platform/governance/roles-and-permissions.md` — capability vs visibility model
- `docs/platform/modules/configuration-platform.md`, `docs/platform/modules/ai-platform.md`
- `docs/schema/*` — generated table/column/function/policy reference
