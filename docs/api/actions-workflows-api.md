# Actions / Workflows API

**Domain size:** ~30 route handlers. Full list: [`api-index.md` → Actions / Workflows](api-index.md#actions--workflows).

The action runtime (resolve → preflight → execute), action authoring/placement (Settings), the workflow engine (definitions, runs, events), and tokenized **action links** that let external recipients trigger workflow events.

> Doctrine: `docs/platform/modules/actions-and-workflows.md`, `docs/platform/operator/operational-action-doctrine.md`.

---

## Auth & org scoping

- **Auth:** Action **execution** layers `requireAdminOrOps` + `getAdminContextCached` + `getAdminAccessContextCached`. Action **authoring** (placements/definitions) is org-admin gated. Action **links** are token-authenticated (public/tokenized).
- **Scope:** Execution passes access-scope dimensions into `executeAdminAction`; targets are org- and scope-checked. No browser-side mutation of `workflow_events`.

---

## Action runtime

### `POST /api/admin/actions/execute`

Source: `web/app/api/admin/actions/execute/route.ts`.

- **Purpose:** Run a resolved action definition (v1).
- **Auth:** `requireAdminOrOps` → `getAdminContextCached` → `getAdminAccessContextCached`.
- **Body:** `{ action_key, entity_type, entity_id, context?: { surface?, department_id?, work_unit_id?, section_key? }, payload? }`. `create_lead` is special-cased (no `entity_id` required; uses a constant). Missing required fields → `400` `apiError("BAD_REQUEST", …)`.
- **Side effects:** Delegates to `executeAdminAction(supabase, { orgId, userId, accessScope }, …)` (or `runRegisteredAction` for registered keys). On success, busts the action resolver cache via `revalidateTag(adminActionsOrgTag(orgId))` so headers/queue rows refresh.
- **Response (Phase 2B — fully migrated):**
  - **Success:** `{ ok: true, data: { execution_result, affected_id? }, correlation_id }` plus the `x-correlation-id` header. The payload lives **only** under `data` (the legacy top-level mirror was removed once all consumers migrated).
  - **Failure:** `{ ok: false, error: { code, message, details? }, correlation_id }` with the result's preserved HTTP status. Unmet completion/preflight requirements use the stable `ACTION_BLOCKED` code and carry `completion_requirements` / `effective_requirements` / `action_preflight` / `blockers` under `error.details`; other failures derive their code from the status. Auth-gate responses (401/403) remain owned by the shared `requireAdminOrOps` / `adminContextFailureResponse` helpers.
- **Consumers:** All 15 fetch call sites unwrap intentionally — `json.data?.execution_result` on success, `json.error?.message` on failure, and `json.error?.details?.{action_preflight,completion_requirements}` for blocked-action surfaces. See [`actions-execute-envelope-audit.md`](actions-execute-envelope-audit.md) and [`api-response-contract.md`](api-response-contract.md) §5.

### Resolve / preflight / catalog

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/actions` | GET | Resolve actions for a surface/context |
| `/api/admin/actions/preflight` | POST | Preflight an action (requirements without executing) — **Phase 2 migrated:** zod-validated body → `apiZodError`; success `{ ok, data: { effective_requirements, completion_requirements, bos_preflight, executable }, correlation_id }` |
| `/api/admin/actions/right-rail-bundle` | GET | Right rail + work-unit + department surfaces in one auth pass (`loadAdminRouteGate`) |
| `/api/admin/actions/workspace-root-bundle` | GET | Workspace-root action bundle |
| `/api/admin/actions/inventory` | GET | Action inventory (Settings) — **Phase 2 migrated:** `{ ok, data: { items }, correlation_id }` |
| `/api/admin/actions/definition-catalog` | GET | Catalog of definable actions |
| `/api/admin/action-definitions/[id]` | PATCH | Edit an action definition |
| `/api/admin/action-placements` , `/[id]` | POST PATCH DELETE | Create/edit placements (catalog row only) |
| `/api/admin/record-actions` | GET | Record-scoped actions |
| `/api/admin/relationship-actions/execute` , `/add-emergency-contact` | POST | Relationship action framework |

---

## Workflows

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/workflows` , `/[id]` | GET POST PATCH DELETE | Workflow definition CRUD |
| `/api/admin/workflows/[id]/actions` , `/conditions` | GET PATCH | Workflow steps & conditions |
| `/api/admin/workflows/[id]/run` | POST | Execute/run a workflow (admin) |
| `/api/admin/workflows/summary` , `/field-catalog` | GET | Summaries & field catalog |
| `/api/admin/workflows/debug-vendor-enrichment` | * | Debug utility (internal) |
| `/api/admin/workflow-runs` , `/[runId]` , `/[runId]/action-runs` | GET | Run history & per-action runs |
| `/api/admin/workflow-events` | GET POST | Workflow event log (server-mediated) |

Workflows must use **registered event keys** and existing execution paths. `workflow-events` writes are server-mediated — never written directly from the browser.

---

## Action links (tokenized)

| Path | Methods | Auth | Purpose |
|------|---------|------|---------|
| `/api/action/[token]` | GET | token | Resolve an action-link token |
| `/api/action/[token]/consume` | POST | token | Consume token → emit workflow event |
| `/api/action-links/resolve` | GET | token | Resolve link payload |
| `/api/action-links/consume-accept-job` | POST | token | Accept-job link |
| `/api/action-links/consume-reschedule` | POST | token | Reschedule link |

These are **public/tokenized** — no admin session. They validate the token and emit events into the workflow pipeline. Token validation correctness is the security boundary; see [audit](api-documentation-audit.md).

---

## Validation, envelopes & side effects

- **Validation:** Manual body checks with `400` on most routes; `preflight` now uses a **zod** schema (`apiZodError`) as the contract model. Execution validates `action_key`/`entity_type`/`entity_id` and computes completion/effective requirements.
- **Envelopes:** `preflight`, `inventory`, and `execute` use the standard `{ ok, data, correlation_id }` / `{ ok, error, correlation_id }` contract (`execute` is fully migrated as of Phase 2B); other catalogs/lists still use `{ <name>: [...] }`. See [`api-response-contract.md`](api-response-contract.md).
- **Side effects:** This is the platform's **side-effect hub** — workflow events, cache revalidation, and downstream effects all originate here. Meaningful effects must flow through these paths, not ad hoc writes.

Source root: `web/app/api/admin/{actions,action-definitions,action-placements,record-actions,relationship-actions,workflows,workflow-runs,workflow-events}`, `web/app/api/{action,action-links}`.
