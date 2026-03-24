# Admin API remediation — Batch 1 (P0)

## Routes fixed

| Route | Changes |
|-------|---------|
| `GET/POST /api/admin/workflows` | `getAdminContext` on GET; list scoped by `org_id`. POST: `requireAdmin` + `getAdminContext`; whitelist fields; `org_id` / `created_by` server-set; client `org_id` ignored. |
| `GET/PATCH/DELETE /api/admin/workflows/[id]` | `getAdminContext` + `.eq("org_id", ctx.orgId)` on reads/updates/deletes; 404 if wrong tenant. |
| `GET/PUT /api/admin/workflows/[id]/actions` | Session + `assertRowOrg(workflows)`; inserts set `workflow_actions.org_id`. |
| `GET/PUT /api/admin/workflows/[id]/conditions` | Session + `assertRowOrg(workflows)`; inserts set `workflow_conditions.org_id`. |
| `GET/POST /api/admin/pipelines` | Session; list/create scoped with `org_id = ctx.orgId`; POST body no longer trusted for `org_id`. |
| `GET/POST /api/admin/pipeline-stages` | Session; unscoped list replaced with stages whose `pipeline_id` is in caller’s pipelines; `?pipeline_id=` checked via `assertRowOrg(pipelines)`; POST sets `org_id` and validates pipeline. |
| `GET /api/admin/verticals` | Session required (`getAdminContext`). **No** `org_id` column on `verticals` — still a global catalog; any authenticated admin/ops with membership sees full list. |
| `POST /api/admin/verticals` | Unchanged auth (`requireAdmin` only); insert shape unchanged. |
| `GET /api/admin/financials/snapshot` | `getAdminContext`; uses `ctx.orgId` instead of `ORG_ID_FINANCIALS`. |
| `GET /api/admin/financials/statements` | Same as snapshot for org scoping. |

## Pattern used

1. **`getAdminContext()`** at the start of handlers that should run for admin **or** ops with a `user_roles` row (`org_id` + role `admin`/`ops`). On failure, return **`adminContextFailureResponse`**.
2. **`requireAdmin()`** kept for mutations that were already admin-only (workflows, pipelines, pipeline stages, verticals POST).
3. **Reads/writes** on tenant tables: filter or mutate with **`.eq("org_id", ctx.orgId)`** or verify parent row with **`assertRowOrg(supabase, table, id, ctx.orgId)`** from `web/lib/admin/assertRowOrg.ts`.
4. **Creates:** build insert objects server-side; **never** trust client `org_id`.

## Shared helpers

- **`adminContextFailureResponse`** — added in `web/lib/admin/getAdminContext.ts`.
- **`assertRowOrg`** — new `web/lib/admin/assertRowOrg.ts` (optional `idColumn` / `orgColumn` / `columns`).

## Edge cases / ambiguities

- **`getAdminContext`** picks the **first** qualifying `user_roles` row when multiple exist; org is not user-selectable in this batch.
- **Admin via `app_users` / `user_profiles` only** (no `user_roles` row with `org_id`) gets **403** from `getAdminContext` even if `requireAdmin` would pass — intentional alignment with membership-based org.
- **`verticals`:** authenticated read is enforced; data remains **cross-tenant visible** to all admins because the table has no `org_id`. Tightening would need schema/product design.
- **`pipelines` / `pipeline_stages` with `org_id` null:** excluded from org-scoped lists and cannot be targeted by `assertRowOrg` (legacy rows may disappear from UI until backfilled).
- **`ORG_ID_FINANCIALS`:** still used by **`web/app/admin/dashboard/page.tsx`** (SSR) — not part of Batch 1; dashboard org should be aligned in a later pass.

## Follow-up

Batch 2 remediation is documented in **`docs/ADMIN_API_REMEDIATION_BATCH_2.md`** (payments, workflow env-org routes, pipeline/vertical id routes, discount redemptions, PATCH IDOR on customers/opportunities/vendors/payments).

Remaining deferred items from the original Batch 1 list (e.g. **`workflows/[id]/run`**, **`entity/[type]/[id]`**, dashboard financials) are tracked toward **Batch 3** in that doc.
