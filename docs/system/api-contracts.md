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
| Admin actions | `POST` paths delegated to `executeAdminAction` | Check router module for exact URLs |
| Workflows | `web/app/api/admin/workflows/[id]/run/route.ts` | Executes/runs workflows (admin) |
| Action links | `web/app/api/action/[token]/consume/route.ts`, `action-links/*` | Emit events → workflows |
| Communications (admin) | `web/app/api/admin/communications/*` | Threads, send, unread, bindings |
| Webhooks (delivery / lifecycle) | `POST /api/webhooks/twilio/sms-status`, `POST /api/webhooks/resend` | Twilio status callback (signed), Resend lifecycle (Svix); public routes, provider-authenticated |
| Message dequeue (worker) | Python **`POST /internal/messages/process`** (`backend/`, `x-cron-token`) | Drains **`public.messages`** (legacy SMS) **and** **`communication_messages`** (canonical SMS/email); Next may wake worker via **`INTERNAL_MESSAGES_PROCESS_URL`** after enqueue (see `web/lib/workflowRun.ts` helpers) |
| Inbound SMS (ingest) | Python backend route (e.g. **`backend/app/routes/sms_inbound.py`**) | Persists inbound into canonical store **person-first**; not a Next `web/app/api` handler |
| Admin agent (config commits) | `web/app/api/admin/agent/**` | Queue/layout/field-visibility propose+apply; env-gated (e.g. `AGENT_V2_FIELD_VISIBILITY_ENABLED`) |
| AI — attention enrich | `POST /api/admin/ai/enrich-attention-suggestion` | Org `ai_policy` + RBAC; stub/OpenAI paths |
| AI — Task Assist | `web/app/api/admin/ai/task-assist/**` | Propose/apply, proposals, entity-search; opportunities-first |
| AI — Workflow Assist | `web/app/api/admin/ai/workflow-assist/**` | Propose/apply/explain/capabilities; admin-gated mutations |
| AI — Config/Layout Assist | `web/app/api/admin/ai/config-layout-assist/**`, `web/app/api/admin/config-layout-assist/proposals/**` | Proposal lifecycle + partial apply |
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
| Forms (admin) | `/api/admin/forms`, `/api/admin/forms/[formId]/**`, submissions, packet sessions | Definitions, versions, publish/archive, public links, submissions — **partially implemented** product-wide |
| Forms (public) | `/api/public/forms/[token]/**` | Token-scoped submit / capture |
| Workspace / dept KPIs | e.g. **`GET /api/admin/departments/[departmentId]/opportunity-lifecycle-kpis`**, **`/api/admin/workspace-kpi-placements`** | **Partially implemented** — KPI strips and placements exist; full **reporting V1** **not implemented** |

## Source of truth / key files

- Route tree: `web/app/api/`
- Admin action registry: `web/lib/admin/actions/` (discover exports and callers)
- Communications canonical enqueue: `web/lib/communications/canonicalOutboundEnqueue.ts`
- Forms admin handlers: `web/app/api/admin/forms/**`

## Guardrails

- **Do not** expose service-role supabase to the browser.
- **Do not** widen entity GET responses without considering drawer contracts and RRS consumers.
- **AI / agents** should prefer these HTTP boundaries over ad hoc DB access.

## Known gaps / risks

- **Needs verification:** Generated OpenAPI — if absent, maintain this doc’s representative table when adding major families of routes.

## When this doc must be updated

When new externally visible admin or public families ship, or when auth/org contract changes.
