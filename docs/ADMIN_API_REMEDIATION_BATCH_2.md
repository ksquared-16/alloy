# Admin API remediation — Batch 2

Continues the Batch 1 pattern: **`getAdminContext`**, **`adminContextFailureResponse`**, **`assertRowOrg`**, tenant filters on service-role queries.

## Routes fixed

| Route | Changes |
|-------|---------|
| `GET /api/admin/payments` | `getAdminContext` after `requireAdminOrOps`; main query `.eq("org_id", ctx.orgId)`; optional `job_id` filter validated with `assertRowOrg(jobs)`; customer/job label queries scoped by org; payment status labels from `ctx.orgId` only. |
| `PATCH /api/admin/payments/[id]` | `getAdminContext`; `assertRowOrg(payments)`; updates `.eq("org_id", ctx.orgId)`; `status_key` validation uses `ctx.orgId`. |
| `GET /api/admin/workflow-events` | Replaced `ALLOY_PUBLIC_ORG_ID` with `getAdminContext().orgId` for all queries. |
| `GET /api/admin/workflow-runs` | Same; `list=workflows` now scopes **`workflows`** with `.eq("org_id", ctx.orgId)`; failed-action lookup on **`workflow_action_runs`** adds `.eq("org_id", ctx.orgId)`. |
| `GET /api/admin/workflow-runs/[runId]/action-runs` | `getAdminContext`; run and action rows scoped by `ctx.orgId` (action list also `.eq("org_id", ctx.orgId)`). |
| `PATCH/DELETE /api/admin/pipelines/[id]` | `getAdminContext` + `requireAdmin`; `assertRowOrg` then whitelisted PATCH fields; mutate with `.eq("org_id", ctx.orgId)`. |
| `PATCH/DELETE /api/admin/pipeline-stages/[id]` | `getAdminContext` + `requireAdmin`; ownership via parent **`pipelines`** row (`assertRowOrg(pipelines, pipeline_id, …)`); whitelisted PATCH fields. |
| `PATCH /api/admin/verticals/[id]` | `getAdminContext` + `requireAdmin`; **no row-level org** — `verticals` is a **global catalog** (documented in route). |
| `GET /api/admin/discount-redemptions` | `getAdminContext`; list filtered with `.or(...)` over IDs belonging to org: **customers**, **jobs**, **opportunities**, **contacts** each `.eq("org_id", ctx.orgId)`; enrichment selects scoped the same. |
| `PATCH /api/admin/customers/[id]` | `getAdminContext` + `assertRowOrg(customers)`; reads/updates also `.eq("org_id", ctx.orgId)`. |
| `PATCH /api/admin/opportunities/[id]` | Same pattern for **opportunities**. |
| `PATCH /api/admin/vendors/[id]` | Same pattern for **vendors**. |

## Global / schema notes

- **`verticals` / `verticals/[id]`:** Rows are shared across all orgs. Any admin with valid membership may PATCH a vertical; impact is platform-wide.
- **`discount_redemptions`:** Table has **no `org_id`**. Listing uses FK membership (customer / job / opportunity / contact). Redemptions that only reference entities **not** in those sets (e.g. legacy rows) may **not** appear until data is linked or backfilled.
- **Large orgs:** The redemptions `.or(customer_id.in.(…),…)` filter may hit URL/size limits if id lists are huge; consider RPC or chunked queries in a future pass if needed.
- **`pipeline_stages.org_id` null:** Stages on pipelines without `org_id` still fail parent `assertRowOrg` (same as Batch 1 list behavior).

## Follow-up — Batch 3 (done)

See **`docs/ADMIN_API_REMEDIATION_BATCH_3.md`** for workflows, entity drawer GET, vendor contacts/signed URL, schedule/job assign helpers, subscriptions generate-next, payments/run guard, and dashboard SSR org scoping.

**Still deferred (not Batch 3 scope):**

- **`GET /api/admin/pricing/matrix`** — matrix not membership-scoped; define product rule and scope or document as global.

See `docs/ADMIN_API_ORG_SCOPING_AUDIT_V1.md` **Remediation** column for per-route status.
