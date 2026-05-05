# API contracts (selected)

## Purpose

High-level map of **server boundaries** for admin, public booking, and action links — not a full OpenAPI (keep concise).

## Current state

- **Next.js route handlers** under `web/app/api/**` implement REST-ish JSON endpoints.
- **Admin** routes generally require auth + org context via **`getAdminContextCached`** / **`loadAdminAccessBundleCached`** / `createAdminClient`. Full scope dimensions (departments/sites, permission union) resolve through **`getAdminAccessContextCached`** (`web/lib/admin/getAdminAccessContext.ts`); **list/read/mutation routes apply scope helpers** — restricted callers receive empty lists or **404** on out-of-scope single-record targets (deny-by-default).
- **Public/booking** routes use their own validation (e.g. book-v2 flow) and may reference `ALLOY_PUBLIC_ORG_ID` where applicable.

## How it works (representative)

| Surface | Examples | Notes |
|---------|-----------|-------|
| Entity drawer | `GET /api/admin/entity/[type]/[id]` | Many types; jobs/opportunities special surfaces |
| Admin actions | `POST` paths delegated to `executeAdminAction` | Check router module for exact URLs |
| Workflows | `web/app/api/admin/workflows/[id]/run/route.ts` | Executes/runs workflows (admin) |
| Action links | `web/app/api/action/[token]/consume/route.ts`, `action-links/*` | Emit events → workflows |
| Communications | `web/app/api/admin/communications/*` | Threads, send, unread, etc. |
| Admin agent (AI) | `web/app/api/admin/agent/**` | Versioned agent routes; env-gated (e.g. `AGENT_V2_FIELD_VISIBILITY_ENABLED`) |
| Booking v2 | `web/app/api/book-v2/*` | Quote, confirm, specialty flows |
| Jobs patch | `web/app/api/admin/jobs/[id]/route.ts` | Includes workflow triggers for actions |
| Users & Roles (Settings) | `GET /api/admin/settings/users-roles/members` | Org **`admin`** or **`settings.users_roles`**; returns members + `departments` + **`site_locations`** (`location_type = site` only) |
| User access scope | `GET`/`PATCH /api/admin/users/[userId]/access-scope` | Same gate as above; replaces profile + allow lists; validates site `location_type` server-side; **`PATCH`** rejects restricted scopes with empty allow lists |
| User role key | `PATCH /api/admin/users/[userId]/role` | Same gate; `role` = `role_definitions.role_key`; replaces all `user_roles` rows for that user/org with one role |
| User invite | `POST /api/admin/users` | Same gate; invites by email and inserts `user_roles` |
| User remove from org | `POST /api/admin/users/[userId]/remove` | Same gate; deletes `user_roles` for org |
| RBAC catalog | `GET /api/admin/rbac/roles`, `GET /api/admin/rbac/permissions`, `GET /api/admin/rbac/grants?role_key=` | Portal (**admin/ops**) **or** org admin / **`settings.users_roles`** |
| RBAC mutations | `POST /api/admin/rbac/roles`, `PATCH /api/admin/rbac/roles/[role_key]`, `PUT /api/admin/rbac/grants?role_key=` | Org **`admin`** or **`settings.users_roles`** |

## Source of truth / key files

- Route tree: `web/app/api/`
- Admin action registry: `web/lib/admin/actions/` (discover exports and callers)
- Communications canonical enqueue: `web/lib/communications/canonicalOutboundEnqueue.ts`

## Guardrails

- **Do not** expose service-role supabase to the browser.
- **Do not** widen entity GET responses without considering drawer contracts and RRS consumers.
- **AI / agents** should prefer these HTTP boundaries over ad hoc DB access.

## Known gaps / risks

- **Needs verification:** Generated OpenAPI — if absent, maintain this doc’s representative table when adding major families of routes.

## When this doc must be updated

When new externally visible admin or public families ship, or when auth/org contract changes.
