# API contracts (selected)

## Purpose

High-level map of **server boundaries** for admin, public booking, and action links — not a full OpenAPI (keep concise).

## Current state

- **Next.js route handlers** under `web/app/api/**` implement REST-ish JSON endpoints.
- **Admin** routes generally require auth + org context via **`getAdminContextCached`** / **`loadAdminAccessBundleCached`** / `createAdminClient`. Capability vs visibility model: **`docs/system/roles-and-permissions.md`**. Full scope dimensions (departments/sites, permission union) resolve through **`getAdminAccessContextCached`** (`web/lib/admin/getAdminAccessContext.ts`); **list/read/mutation routes apply scope helpers** — restricted callers receive empty lists or **404** on out-of-scope single-record targets (deny-by-default).
- **Public/booking** routes use their own validation (e.g. book-v2 flow) and may reference `ALLOY_PUBLIC_ORG_ID` where applicable.

## How it works (representative)

| Surface | Examples | Notes |
|---------|-----------|-------|
| Entity drawer | `GET /api/admin/entity/[type]/[id]` | Many types; jobs/opportunities special surfaces |
| Admin actions (runtime) | `GET /api/admin/actions` (resolve by surface), `POST /api/admin/actions/execute` | `resolveActionsForContext.ts` → `executeAdminAction.ts`; does not change execution semantics |
| Action buttons (Settings) | `GET /api/admin/actions/inventory`, `GET /api/admin/actions/definition-catalog`, `POST /api/admin/action-placements`, `PATCH /api/admin/action-placements/[id]`, `PATCH /api/admin/action-definitions/[id]` | Org **admin**; placement create = catalog row only; see **`docs/system/actions-and-workflows.md`** |
| Workflows | `web/app/api/admin/workflows/[id]/run/route.ts` | Executes/runs workflows (admin) |
| Action links | `web/app/api/action/[token]/consume/route.ts`, `action-links/*` | Emit events → workflows |
| Communications (admin) | `web/app/api/admin/communications/*` | Threads, send, unread, bindings |
| Webhooks (delivery / lifecycle) | `POST /api/webhooks/twilio/sms-status`, `POST /api/webhooks/resend` | Twilio status callback (signed), Resend lifecycle (Svix); public routes, provider-authenticated |
| Message dequeue (worker) | Python **`POST /internal/messages/process`** (`backend/`, `x-cron-token`) | Drains **`public.messages`** (legacy SMS) **and** **`communication_messages`** (canonical SMS/email); Next may wake worker via **`INTERNAL_MESSAGES_PROCESS_URL`** after enqueue (see `web/lib/workflowRun.ts` helpers) |
| Inbound SMS (ingest) | Python backend route (e.g. **`backend/app/routes/sms_inbound.py`**) | Persists inbound into canonical store **person-first**; not a Next `web/app/api` handler |
| BOS — config commits (legacy `admin/agent`) | `web/app/api/admin/agent/v0/**`, `v1/**`, `v2/**` | DEFINER RPC apply + proposal audit; env-gated (`AGENT_V0_ENABLED`, `AGENT_V1_RECORD_LAYOUT_ENABLED`, `AGENT_V2_FIELD_VISIBILITY_ENABLED`) |
| BOS — attention enrich | `POST /api/admin/ai/enrich-attention-suggestion` | Capability `attention_enrich`; org `ai_policy` + RBAC; stub/OpenAI |
| BOS — Task Assist | `web/app/api/admin/ai/task-assist/**` | Capability `task_assist`; propose/apply, proposals, entity-search |
| BOS — Workflow Assist | `web/app/api/admin/ai/workflow-assist/**` | Capability `workflow_assist`; propose/apply/explain; admin-gated mutations |
| BOS — Config/Layout Assist | `web/app/api/admin/ai/config-layout-assist/**`, `web/app/api/admin/config-layout-assist/proposals/**` | Capability `config_layout_assist`; durable proposals; partial apply catalog |
| Scheduled sends | `web/app/api/admin/communication-scheduled-sends/**` | Task Assist V1.1; `process-due` worker |
| Operational tasks | `web/app/api/admin/operational-tasks/**` | Task Assist reminders |
| Booking v2 | `web/app/api/book-v2/*` | Quote, confirm, specialty flows |
| Jobs patch | `web/app/api/admin/jobs/[id]/route.ts` | Includes workflow triggers for actions |
| Users & Roles (Settings) | `GET /api/admin/settings/users-roles/members` | Org **`admin`** or **`settings.users_roles`**; returns members + `departments` + **`site_locations`** (`location_type = site` only) |
| User access scope | `GET`/`PATCH /api/admin/users/[userId]/access-scope` | Same gate as above; replaces profile + allow lists; validates site `location_type` server-side; **`PATCH`** rejects restricted scopes with empty allow lists |
| User role key | `PATCH /api/admin/users/[userId]/role` | Same gate; `role` = `role_definitions.role_key`; replaces all `user_roles` rows for that user/org with one role |
| User invite | `POST /api/admin/users` | Same gate; invites by email and inserts `user_roles` |
| User remove from org | `POST /api/admin/users/[userId]/remove` | Same gate; deletes `user_roles` for org |
| RBAC catalog | `GET /api/admin/rbac/roles`, `GET /api/admin/rbac/permissions`, `GET /api/admin/rbac/grants?role_key=` | Portal (**admin/ops**) **or** org admin / **`settings.users_roles`** |
| RBAC mutations | `POST /api/admin/rbac/roles`, `PATCH /api/admin/rbac/roles/[role_key]`, `PUT /api/admin/rbac/grants?role_key=` | Org **`admin`** or **`settings.users_roles`** |
| Forms (admin) | `/api/admin/forms`, `/api/admin/forms/[formId]/**`, submissions, packet sessions, **`GET …/packet-sessions/[id]/review-rollup`** | Definitions, versions, publish/archive, public links, submissions, **packet review rollup (P2-1)** — **partially implemented** product-wide |
| Forms (public) | `/api/public/forms/[token]/**` | Token-scoped submit / capture |
| Workspace / dept KPIs | e.g. **`GET /api/admin/departments/[departmentId]/opportunity-lifecycle-kpis`**, **`/api/admin/workspace-kpi-placements`** | **Partially implemented** — KPI strips and placements exist; full **reporting V1** **not implemented** |

## Source of truth / key files

- Route tree: `web/app/api/`
- Admin action registry: `web/lib/admin/actions/` (discover exports and callers)
- Communications canonical enqueue: `web/lib/communications/canonicalOutboundEnqueue.ts`
- Forms admin handlers: `web/app/api/admin/forms/**`
- **BOS registry + envelopes:** `web/lib/bos/` (`bosCapabilityRegistry.ts`, `adapters/`, `auth/`) — see **`docs/product/bos-foundation.md`**
- Orchestrator UI: `web/lib/adminV2/aiCommandSurface/` (URLs remain `/api/admin/ai/*`)

## Guardrails

- **Do not** expose service-role supabase to the browser.
- **Do not** widen entity GET responses without considering drawer contracts and RRS consumers.
- **BOS capabilities** must use these HTTP boundaries (or documented DEFINER RPC commits) — no ad hoc DB access from client or assist paths.

## Known gaps / risks

- **Needs verification:** Generated OpenAPI — if absent, maintain this doc’s representative table when adding major families of routes.

## When this doc must be updated

When new externally visible admin or public families ship, when auth/org contract changes, or when a new **BOS capability** adds a route family (update registry in `bos-foundation.md` in the same change).
