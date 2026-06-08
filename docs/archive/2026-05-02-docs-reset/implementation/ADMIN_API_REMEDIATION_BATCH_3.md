# Admin API remediation — Batch 3

Focus: **remaining high-risk IDOR / side-effect admin routes**, the **generic entity drawer** GET, **dashboard SSR** org scoping, and **payments/run** defense-in-depth. Same primitives as prior batches: **`getAdminContext`**, **`adminContextFailureResponse`**, **`assertRowOrg`**, **`createAdminClient`**, explicit **`.eq("org_id", …)`** on service-role queries.

## Routes and pages fixed

| Route / page | Changes |
|--------------|---------|
| `GET /api/admin/entity/[type]/[id]` | **`getAdminContext`** (fail fast) before any Supabase read; primary and hydration queries use **`org_id`** for tenant tables; **`discount_redemptions`** via **`assertDiscountRedemptionInOrg`** (FK membership); deduped inner auth blocks for **locations**, **documents**, **customer_members**, **persons**; **`person_relationships`** filtered by **`org_id`**; **`hydrateVendorDisplayStub`** requires org and scopes **vendors** / **persons**. Global / catalog behavior documented in-file (**`addons`** → **`pricing_addons`**, read-only joins to **verticals**, **discount_codes**, status tables). |
| `POST /api/admin/workflows/[id]/run` | **`getAdminContext`**; workflow row scoped to **`ctx.orgId`** (no **`ALLOY_PUBLIC_ORG_ID`** / env-org fallback). |
| `POST /api/admin/workflows/debug-vendor-enrichment` | **`getAdminContext`**; target vendor must belong to caller org. |
| `GET /api/admin/workflows/field-catalog` | **`getAdminContext`** before building catalog. |
| `POST /api/admin/vendors/[id]/documents/signed-url` | **`getAdminContext`**; vendor **`org_id`** match; document storage key / row checked for org-owned vendor context before signed URL. |
| `POST /api/admin/vendors/[id]/contacts` | **`getAdminContext`**; vendor org; linked contact in same org. |
| `GET /api/admin/vendors/[id]/contacts/available` | Same vendor + org-scoped contact candidates. |
| `DELETE /api/admin/vendors/[id]/contacts/[contactId]` | Vendor org; contact org; vendor–contact link validated. |
| `POST /api/admin/schedules/[id]/assign` | **`getAdminContext`**; schedule (and related job/vendor paths) ownership; vendor lists org-scoped. |
| `GET/PATCH /api/admin/schedules/[id]/assignment` | Context + org assertions on schedule and assignment rows. |
| `POST /api/admin/schedules/[id]/reschedule` | Context + schedule ownership before mutations / workflow triggers. |
| `GET /api/admin/schedules/[id]/vendors-for-assign` | **`assertRowOrg(schedules)`**; vendors **`.eq("org_id", ctx.orgId)`**. |
| `POST /api/admin/jobs/[id]/apply-vendor-to-upcoming` | Job in org; upcoming schedules and vendor picks scoped to org. |
| `GET /api/admin/jobs/[id]/vendors-for-assign` | **`assertRowOrg(jobs)`**; vendor list org-scoped. |
| `POST /api/admin/subscriptions/[id]/generate-next` | **`getAdminContext`** + **`assertRowOrg(customer_subscriptions)`** before **`generateNextSubscriptionSchedule`**. |
| `POST /api/admin/payments/run` | **`getAdminContext`** after **`requireAdmin`**; **`assertRowOrg(jobs, job_id, ctx.orgId)`** before proxy to Python **`/admin/payments/run`**. |
| `GET /admin/dashboard` (`page.tsx`) | **`getAdminContext`** (redirect **401 → /login**, else **/admin**); **`getDashboardData(ctx.orgId)`** adds **`.eq("org_id", orgId)`** on jobs, opportunities, vendors, schedules, assignments, workflow run / outbox failure counts, and follow-up job/customer loads; **`getFinancialSnapshot(supabase, ctx.orgId)`** replaces **`ORG_ID_FINANCIALS`**. |

## Global / schema notes (Batch 3)

- **`discount_redemptions`:** No **`org_id`** on row; drawer access uses **`assertDiscountRedemptionInOrg`** (at least one of customer / job / opportunity / contact must be in caller org).
- **`pricing_addons` (**drawer type **`addons`**):** Vertical-linked catalog; **no `org_id`** on row — any authenticated admin member may open by id; verticals / codes used in joins remain global reference data.
- **`workflow_runs.org_id`:** Nullable in schema; dashboard **failed** count uses **`.eq("org_id", orgId)`** — runs with null org do not appear in per-tenant metrics.

## Out of scope / still not repo-verifiable

- **`POST /api/admin/payments/run`:** Next.js layer proves the **`job_id`** belongs to **`ctx.orgId`**. **Stripe charge creation, ledger posting, and any reuse of `schedule_id` / amounts inside Python** must be enforced in the **backend**; audit or harden there separately.
- **`GET /api/admin/pricing/matrix`:** Still not org-scoped in this batch (called out in Batch 2 deferrals).

## Audit doc

Per-route **Remediation** and risk columns updated in **`docs/audits/ADMIN_API_ORG_SCOPING_AUDIT_V1.md`**.
