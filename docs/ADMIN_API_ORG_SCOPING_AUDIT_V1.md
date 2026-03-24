# Admin API Org Scoping Audit

**Scope:** Every `route.ts` under `web/app/api/admin/**` (145 route modules).  
**Elevated client:** Primarily `createAdminClient()` from `web/lib/supabaseAdmin.ts` (Supabase **service role**, bypasses RLS). Also `createServiceRoleClient()` in a few routes.  
**Trusted org context:** `getAdminContext()` from `web/lib/admin/getAdminContext.ts` resolves `orgId` from `user_roles` for the current session (admin/ops).  
**Other auth:** `requireAdmin` / `requireAdminOrOps` / `getAdminAuth` from `web/lib/adminAuth.ts` — these **do not** expose `orgId` to the handler; membership must be re-fetched or inferred.

**Important:** Next.js `middleware.ts` only applies special checks to paths under `/admin`, **not** `/api/admin/*`. API security is entirely whatever each route implements.

**Method (table):**

- **Unauthenticated handler:** For each HTTP method, the handler body (from its `export async function` until the next exported method in the same file) was scanned for `getAdminContext`, `requireAdmin`, or `requireAdminOrOps`. If **none** appear in that handler, it was flagged as having no session gate in that handler.
- **LOW (heuristic):** File contains `getAdminContext` plus both `ctx.orgId` (or `const { orgId } = ctx`) and at least one `.eq("org_id", …)` / `.eq('org_id', …)`. This is **not** a proof every branch is safe — spot-check remains required.
- **Manual overrides** were applied for known hotspots (payments list, discount redemptions, pricing matrix, pipelines/workflow families, IDOR-style PATCH routes, env-based org, etc.).

**Corrections to heuristic (read manually):**

| File | Table may imply | Actual |
|------|-----------------|--------|
| `vendors/[id]/documents/signed-url/route.ts` | “No auth helper” | **Batch 3:** `getAdminContext` + vendor `org_id` match before storage signed URL. |
| `payments/run/route.ts` | “No auth” | **Batch 3:** `getAdminContext` + asserts org-owned **`jobs`** row before proxy; **charge/ledger** org enforcement still **Python backend** (see `docs/ADMIN_API_REMEDIATION_BATCH_3.md`). |

---

## Executive summary

| Metric | Count |
|--------|------:|
| Route modules reviewed | **145** |
| **CRITICAL** (table) | **10** |
| **HIGH** | **29** |
| **MEDIUM** | **33** |
| **LOW** (heuristic) | **73** |

**Interpretation**

- **LOW:** Likely the intended pattern (`getAdminContext` + `org_id` filters). Still require regression tests when editing.
- **MEDIUM:** `getAdminContext` present but file not matching the strict LOW heuristic (e.g. global catalogs, complex joins, or `orgId` only in helpers).
- **HIGH:** No `getAdminContext` in file, or known IDOR / env-org / list-leak patterns.
- **CRITICAL:** Unauthenticated sensitive **GET** (or **POST** with no auth) with service role, **or** authenticated **cross-tenant list** (e.g. payments).

**Highest-risk themes**

1. **Unauthenticated GET** on workflow and pipeline list/detail/child resources — full database read via service role.
2. **Financial snapshot/statements** — **Batch 1** authenticated API routes; **Batch 3** admin dashboard SSR uses **`getAdminContext().orgId`** for `getFinancialSnapshot` (constant `ORG_ID_FINANCIALS` in `web/lib/financials.ts` is legacy / scripts only).
3. **`GET /api/admin/payments`** — session required via `requireAdminOrOps`, but query does **not** filter by caller org → **cross-org payment listing**.
4. **`requireAdminOrOps` + UUID PATCH** on customers, opportunities, vendors, payments, etc. — loads row by `id` only, **never compares** `row.org_id` to the caller’s org from `user_roles`.
5. **`ALLOY_PUBLIC_ORG_ID`** in workflow-events / workflow-runs (and mixed into some schedule/job routes) — **wrong tenant** when env is single-org but users are multi-org.
6. **`POST /api/admin/workflows`** — inserts **raw JSON body**; client could supply another org’s `org_id` if column is not stripped server-side.

**Routes clearly safer (pattern)**

- **`getAdminContext()`** then **`.eq("org_id", ctx.orgId)`** (or `orgId` from destructure) on the primary table for list/detail/mutate — seen across many CRM entity routes (e.g. `jobs/[id]/route.ts` GET uses `.eq("org_id", ctx.orgId)`).

---

## Audit table

Columns:

- **Elevated client** — uses service role (or other elevated Supabase client).
- **getAdminContext?** — file imports/calls `getAdminContext` (yes/no at file level).
- **Org reads / Org writes** — **yes** = explicit membership scoping observed (heuristic); **no** = missing or unauthenticated; **partial** = ambiguous or IDOR-prone; **n/a** = write not applicable to route.
- **Remediation** — **Batch 1** / **Batch 2** / **Batch 3** fixes where applied; **—** = not yet remediated in those batches (see `docs/ADMIN_API_REMEDIATION_BATCH_1.md`, `docs/ADMIN_API_REMEDIATION_BATCH_2.md`, `docs/ADMIN_API_REMEDIATION_BATCH_3.md`).

| Route | File | Elevated client | getAdminContext? | Org reads | Org writes | Risk | Notes | Recommended fix | Remediation |
|-------|------|:---------------:|:----------------:|:---------:|:----------:|:----:|-------|-----------------|-------------|
| `/api/admin/addons/[id]` | `app/api/admin/addons/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/addons` | `app/api/admin/addons/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/contact-options` | `app/api/admin/contact-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/contacts/[id]/archive` | `app/api/admin/contacts/[id]/archive/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/contacts/[id]` | `app/api/admin/contacts/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/contacts/[id]/unarchive` | `app/api/admin/contacts/[id]/unarchive/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/contacts` | `app/api/admin/contacts/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-member-contact-roles` | `app/api/admin/customer-member-contact-roles/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-member-contacts/[id]` | `app/api/admin/customer-member-contacts/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-member-contacts` | `app/api/admin/customer-member-contacts/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-member-relationship-types` | `app/api/admin/customer-member-relationship-types/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-members/[id]` | `app/api/admin/customer-members/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-members` | `app/api/admin/customer-members/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-options` | `app/api/admin/customer-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-person-role-types/[id]` | `app/api/admin/customer-person-role-types/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customer-person-role-types` | `app/api/admin/customer-person-role-types/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/customers/[id]` | `app/api/admin/customers/[id]/route.ts` | yes | no | partial | partial | **HIGH** | PATCH by id; no compare row.org_id to caller org | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/customers` | `app/api/admin/customers/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/db-relationships` | `app/api/admin/db-relationships/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/deletion-eligibility` | `app/api/admin/deletion-eligibility/route.ts` | no | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/discount-code-options` | `app/api/admin/discount-code-options/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/discount-redemptions` | `app/api/admin/discount-redemptions/route.ts` | yes | no | no | n/a | **HIGH** | List all redemptions; scope via customers.org_id | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/discounts/[id]` | `app/api/admin/discounts/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/discounts` | `app/api/admin/discounts/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/document-field-definitions/[id]` | `app/api/admin/document-field-definitions/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/document-field-definitions` | `app/api/admin/document-field-definitions/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/documents/[id]` | `app/api/admin/documents/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/documents/[id]/signed-url` | `app/api/admin/documents/[id]/signed-url/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/documents/entity-options` | `app/api/admin/documents/entity-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/documents` | `app/api/admin/documents/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/documents/upload` | `app/api/admin/documents/upload/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/entity-labels` | `app/api/admin/entity-labels/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/entity/[type]/[id]` | `app/api/admin/entity/[type]/[id]/route.ts` | yes | yes | yes | n/a | **LOW** | GET only: `getAdminContext` before reads; tenant types use `org_id` filters / `assertDiscountRedemptionInOrg`; global types documented in-route (`addons` → `pricing_addons`, joined catalogs) | Maintain pattern on future methods | **Batch 3** — remediated (GET) |
| `/api/admin/field-definitions/[id]` | `app/api/admin/field-definitions/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/field-definitions` | `app/api/admin/field-definitions/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/accounts/[id]` | `app/api/admin/financials/accounts/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/accounts` | `app/api/admin/financials/accounts/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/job/[id]` | `app/api/admin/financials/job/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/journal-entries/[id]` | `app/api/admin/financials/journal-entries/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/journal-entries` | `app/api/admin/financials/journal-entries/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/ledger/[id]` | `app/api/admin/financials/ledger/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/ledger` | `app/api/admin/financials/ledger/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/schedule/[id]` | `app/api/admin/financials/schedule/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/financials/snapshot` | `app/api/admin/financials/snapshot/route.ts` | yes | no | no | no | **CRITICAL** | GET handler: no session helper in handler body + service role | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/financials/statements` | `app/api/admin/financials/statements/route.ts` | yes | no | no | no | **CRITICAL** | GET handler: no session helper in handler body + service role | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/industries/[id]` | `app/api/admin/industries/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/industries` | `app/api/admin/industries/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/job-statuses` | `app/api/admin/job-statuses/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/jobs/[id]/apply-vendor-to-upcoming` | `app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; job + schedule ownership; vendor list scoped to org | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/jobs/[id]/archive` | `app/api/admin/jobs/[id]/archive/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/assign-vendor` | `app/api/admin/jobs/[id]/assign-vendor/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/location` | `app/api/admin/jobs/[id]/location/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/payment-collect-context` | `app/api/admin/jobs/[id]/payment-collect-context/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/payments` | `app/api/admin/jobs/[id]/payments/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/payout` | `app/api/admin/jobs/[id]/payout/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]` | `app/api/admin/jobs/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/unarchive` | `app/api/admin/jobs/[id]/unarchive/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/jobs/[id]/vendors-for-assign` | `app/api/admin/jobs/[id]/vendors-for-assign/route.ts` | yes | yes | yes | n/a | **LOW** | `getAdminContext`; `assertRowOrg(jobs)`; vendors `.eq("org_id", ctx.orgId)` | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/jobs` | `app/api/admin/jobs/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/location-options` | `app/api/admin/location-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/location-types` | `app/api/admin/location-types/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/locations/[id]` | `app/api/admin/locations/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/locations` | `app/api/admin/locations/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/opportunities/[id]` | `app/api/admin/opportunities/[id]/route.ts` | yes | no | partial | partial | **HIGH** | PATCH IDOR pattern | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/opportunity-options` | `app/api/admin/opportunity-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/org-settings` | `app/api/admin/org-settings/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/org/industry` | `app/api/admin/org/industry/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/payments/[id]` | `app/api/admin/payments/[id]/route.ts` | yes | no | partial | partial | **HIGH** | PATCH payment by id without caller org check | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/payments` | `app/api/admin/payments/route.ts` | yes | no | no | n/a | **CRITICAL** | Authenticated list but missing .eq(org_id, ctx.orgId) on payments | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 2** — remediated |
| `/api/admin/payments/run` | `app/api/admin/payments/run/route.ts` | yes | yes | partial | partial | **MEDIUM** | `getAdminContext` + org-owned **job** asserted before Python proxy; settlement org **not fully verifiable** in-repo | Confirm Python admin API scopes charges by org | **Batch 3** — partial (see Batch 3 doc) |
| `/api/admin/person-options` | `app/api/admin/person-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/person-relationship-type-settings/[id]` | `app/api/admin/person-relationship-type-settings/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/person-relationship-type-settings` | `app/api/admin/person-relationship-type-settings/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/persons/[id]` | `app/api/admin/persons/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/persons` | `app/api/admin/persons/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/pipeline-stages/[id]` | `app/api/admin/pipeline-stages/[id]/route.ts` | yes | no | partial | partial | **HIGH** | Auth without membership org helper — IDOR / cross-org list risk | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/pipeline-stages` | `app/api/admin/pipeline-stages/route.ts` | yes | no | no | partial | **CRITICAL** | GET unauthenticated | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/pipelines/[id]` | `app/api/admin/pipelines/[id]/route.ts` | yes | no | partial | partial | **HIGH** | PATCH/DELETE pipeline by id without org ownership | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/pipelines` | `app/api/admin/pipelines/route.ts` | yes | no | no | partial | **CRITICAL** | GET unauthenticated; POST inserts body without org guard | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/pricing-dimension-values/[id]` | `app/api/admin/pricing-dimension-values/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing-dimension-values` | `app/api/admin/pricing-dimension-values/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing-dimensions/[id]` | `app/api/admin/pricing-dimensions/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing-dimensions` | `app/api/admin/pricing-dimensions/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing-modes/[id]` | `app/api/admin/pricing-modes/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing-modes` | `app/api/admin/pricing-modes/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing/first-clean-prices/[id]` | `app/api/admin/pricing/first-clean-prices/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing/first-clean-prices` | `app/api/admin/pricing/first-clean-prices/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing/matrix/[id]` | `app/api/admin/pricing/matrix/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing/matrix` | `app/api/admin/pricing/matrix/route.ts` | yes | yes | partial | partial | **HIGH** | getAdminContext but matrix rows not membership-scoped | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | — |
| `/api/admin/pricing/options` | `app/api/admin/pricing/options/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing/recurring-prices/[id]` | `app/api/admin/pricing/recurring-prices/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/pricing/recurring-prices` | `app/api/admin/pricing/recurring-prices/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/rbac/grants` | `app/api/admin/rbac/grants/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/rbac/permissions` | `app/api/admin/rbac/permissions/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/rbac/roles/[role_key]` | `app/api/admin/rbac/roles/[role_key]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/rbac/roles` | `app/api/admin/rbac/roles/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/related/[entity]/[id]` | `app/api/admin/related/[entity]/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/schedule-statuses` | `app/api/admin/schedule-statuses/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/schedules/[id]/assign` | `app/api/admin/schedules/[id]/assign/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; schedule/job org; vendor pick lists scoped | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/schedules/[id]/assignment` | `app/api/admin/schedules/[id]/assignment/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; schedule + assignment scoped to org | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/schedules/[id]/cancel` | `app/api/admin/schedules/[id]/cancel/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/schedules/[id]/location` | `app/api/admin/schedules/[id]/location/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/schedules/[id]/post-completion` | `app/api/admin/schedules/[id]/post-completion/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/schedules/[id]/post-customer-payment` | `app/api/admin/schedules/[id]/post-customer-payment/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/schedules/[id]/post-vendor-payout` | `app/api/admin/schedules/[id]/post-vendor-payout/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/schedules/[id]/reschedule` | `app/api/admin/schedules/[id]/reschedule/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; schedule ownership before side effects | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/schedules/[id]` | `app/api/admin/schedules/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/schedules/[id]/vendors-for-assign` | `app/api/admin/schedules/[id]/vendors-for-assign/route.ts` | yes | yes | yes | n/a | **LOW** | `getAdminContext`; `assertRowOrg(schedules)`; vendors org-scoped | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/schedules` | `app/api/admin/schedules/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/send-password-reset` | `app/api/admin/send-password-reset/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/service-frequency-options` | `app/api/admin/service-frequency-options/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/service-offerings/[id]` | `app/api/admin/service-offerings/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/service-offerings` | `app/api/admin/service-offerings/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/service-plan-templates/[id]` | `app/api/admin/service-plan-templates/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/service-plan-templates` | `app/api/admin/service-plan-templates/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/status-definitions/[id]` | `app/api/admin/status-definitions/[id]/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/status-definitions` | `app/api/admin/status-definitions/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/status-options` | `app/api/admin/status-options/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/subscriptions/[id]/generate-next` | `app/api/admin/subscriptions/[id]/generate-next/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; `assertRowOrg(customer_subscriptions)` before generate | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/subscriptions/[id]` | `app/api/admin/subscriptions/[id]/route.ts` | yes | yes | partial | partial | **MEDIUM** | getAdminContext; confirm all queries/joins scoped | Line-by-line verify org predicates on every path | — |
| `/api/admin/users/[userId]/remove` | `app/api/admin/users/[userId]/remove/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/users/[userId]/role` | `app/api/admin/users/[userId]/role/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/users` | `app/api/admin/users/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/vendor-options` | `app/api/admin/vendor-options/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/vendor-statuses` | `app/api/admin/vendor-statuses/route.ts` | yes | no | partial | partial | **HIGH** | Global reference table read — **low leak risk**; listed HIGH only for “no ctx” pattern | Confirm intentional global catalog; else scope | — |
| `/api/admin/vendors/[id]/contacts/[contactId]` | `app/api/admin/vendors/[id]/contacts/[contactId]/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; vendor + contact org checks | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/vendors/[id]/contacts/available` | `app/api/admin/vendors/[id]/contacts/available/route.ts` | yes | yes | yes | n/a | **LOW** | `getAdminContext`; vendor org; contact candidates org-scoped | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/vendors/[id]/contacts` | `app/api/admin/vendors/[id]/contacts/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; vendor org; link contact in same org | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/vendors/[id]/documents/signed-url` | `app/api/admin/vendors/[id]/documents/signed-url/route.ts` | yes | yes | yes | n/a | **LOW** | `getAdminContext`; vendor + document path org match before signed URL | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/vendors/[id]/payout-policy` | `app/api/admin/vendors/[id]/payout-policy/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/vendors/[id]/payout` | `app/api/admin/vendors/[id]/payout/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/vendors/[id]` | `app/api/admin/vendors/[id]/route.ts` | yes | no | partial | partial | **HIGH** | PATCH IDOR pattern | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/vendors` | `app/api/admin/vendors/route.ts` | yes | yes | yes | yes | **LOW** | Typical ctx.orgId / orgId + org_id filters | Maintain pattern; add tests | — |
| `/api/admin/verticals/[id]` | `app/api/admin/verticals/[id]/route.ts` | yes | no | partial | partial | **HIGH** | Auth without membership org helper — IDOR / cross-org list risk | Add getAdminContext; verify resource org; replace env-based org; fix IDOR | **Batch 2** — remediated |
| `/api/admin/verticals` | `app/api/admin/verticals/route.ts` | yes | no | no | partial | **CRITICAL** | GET unauthenticated | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/workflow-events` | `app/api/admin/workflow-events/route.ts` | yes | no | partial | partial | **HIGH** | Uses `ALLOY_PUBLIC_ORG_ID` not user org | Use `getAdminContext().orgId` | **Batch 2** — remediated |
| `/api/admin/workflow-runs/[runId]/action-runs` | `app/api/admin/workflow-runs/[runId]/action-runs/route.ts` | yes | no | partial | partial | **HIGH** | Uses `ALLOY_PUBLIC_ORG_ID` not user org | Use `getAdminContext().orgId` | **Batch 2** — remediated |
| `/api/admin/workflow-runs` | `app/api/admin/workflow-runs/route.ts` | yes | no | partial | partial | **HIGH** | Uses `ALLOY_PUBLIC_ORG_ID` not user org | Use `getAdminContext().orgId` | **Batch 2** — remediated |
| `/api/admin/workflows/[id]/actions` | `app/api/admin/workflows/[id]/actions/route.ts` | yes | no | no | no | **CRITICAL** | GET unauthenticated | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/workflows/[id]/conditions` | `app/api/admin/workflows/[id]/conditions/route.ts` | yes | no | no | no | **CRITICAL** | GET unauthenticated | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/workflows/[id]` | `app/api/admin/workflows/[id]/route.ts` | yes | no | no | no | **CRITICAL** | GET unauthenticated | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |
| `/api/admin/workflows/[id]/run` | `app/api/admin/workflows/[id]/run/route.ts` | yes | yes | yes | yes | **LOW** | `getAdminContext`; workflow org (no env-org fallback) before run | Maintain pattern; add tests | **Batch 3** — remediated |
| `/api/admin/workflows/debug-vendor-enrichment` | `app/api/admin/workflows/debug-vendor-enrichment/route.ts` | yes | yes | partial | n/a | **MEDIUM** | `getAdminContext`; vendor must belong to caller org for debug payload | Maintain pattern | **Batch 3** — remediated |
| `/api/admin/workflows/field-catalog` | `app/api/admin/workflows/field-catalog/route.ts` | yes | yes | yes | n/a | **LOW** | `getAdminContext`; catalog built from org-visible metadata | Maintain pattern | **Batch 3** — remediated |
| `/api/admin/workflows` | `app/api/admin/workflows/route.ts` | yes | no | no | partial | **CRITICAL** | GET unauthenticated; POST inserts client body (set org_id server-side) | Add session check + getAdminContext; scope all queries/mutations by ctx.orgId | **Batch 1** — remediated |

---

## High-risk routes (expanded)

### A. Unauthenticated reads (service role, no session in handler)

- `GET /api/admin/workflows` — `web/app/api/admin/workflows/route.ts`
- `GET /api/admin/workflows/[id]` — `web/app/api/admin/workflows/[id]/route.ts`
- `GET /api/admin/workflows/[id]/actions` — `web/app/api/admin/workflows/[id]/actions/route.ts`
- `GET /api/admin/workflows/[id]/conditions` — `web/app/api/admin/workflows/[id]/conditions/route.ts`
- `GET /api/admin/pipelines` — `web/app/api/admin/pipelines/route.ts`
- `GET /api/admin/pipeline-stages` — `web/app/api/admin/pipeline-stages/route.ts`
- `GET /api/admin/verticals` — `web/app/api/admin/verticals/route.ts`
- `GET /api/admin/financials/snapshot` — `web/app/api/admin/financials/snapshot/route.ts` (also **hardcoded org** `ORG_ID_FINANCIALS` in `web/lib/financials.ts`)
- `GET /api/admin/financials/statements` — same hardcoded org + no auth

**Risk:** Anyone who can reach the URL receives data from **all orgs** (or the hardcoded org’s financials) with **no** `getUser` / `getAdminContext` gate in the handler.

### B. Authenticated but cross-org list

- `GET /api/admin/payments` — `web/app/api/admin/payments/route.ts` — no `.eq("org_id", …)` on the payments query.

### C. Wrong org dimension (env vs membership)

- `GET /api/admin/workflow-events` — `process.env.ALLOY_PUBLIC_ORG_ID`
- `GET /api/admin/workflow-runs` — same
- `GET /api/admin/workflow-runs/[runId]/action-runs` — same

**Risk:** Multi-org deployment always sees **one** org’s events/runs regardless of which org the admin belongs to (or fails if unset).

### D. IDOR-style PATCH (requireAdminOrOps + id, no `row.org_id === ctx.orgId`)

Representative files:

- `web/app/api/admin/customers/[id]/route.ts`
- `web/app/api/admin/opportunities/[id]/route.ts`
- `web/app/api/admin/vendors/[id]/route.ts`
- `web/app/api/admin/payments/[id]/route.ts`
- `web/app/api/admin/pipelines/[id]/route.ts` (requireAdmin, same issue)
- `web/app/api/admin/pipeline-stages/[id]/route.ts`

Pattern: `select ... .eq("id", id)` then `update ... .eq("id", id)` without comparing selected `org_id` to **`getAdminContext().orgId`**.

### E. `entity/[type]/[id]` mega-route

- **Batch 3:** `GET` runs **`getAdminContext`** first; tenant drawer types filter by **`org_id`** (or `assertDiscountRedemptionInOrg` for **discount_redemptions**). **`addons`** resolves **`pricing_addons`** (vertical catalog, no row `org_id`) — documented in-route.

### F. Subscription generate-next

- **Batch 3:** `POST .../subscriptions/[id]/generate-next` asserts **`customer_subscriptions`** row in caller org before side effects.

### G. Admin dashboard SSR (non-API)

- **Batch 3:** `web/app/admin/dashboard/page.tsx` uses **`getAdminContext`** (redirect if missing) and scopes aggregate queries + **`getFinancialSnapshot(supabase, ctx.orgId)`** — no **`ORG_ID_FINANCIALS`** for dashboard data.

---

## Common patterns found

1. **Good:** `const ctx = await getAdminContext()` → queries `.eq("org_id", ctx.orgId)` (or `const { orgId } = ctx` then `.eq("org_id", orgId)`).
2. **Bad:** `createAdminClient()` + `.from("…").select()` with **no** org predicate (global list).
3. **Bad:** `requireAdminOrOps()` only — **no** `orgId` in scope — updates by primary key only.
4. **Bad:** `insert([body])` / `update(body)` from client JSON without **stripping** or **overwriting** `org_id` server-side.
5. **Bad:** `ALLOY_PUBLIC_ORG_ID` as stand-in for tenant when `user_roles` already defines org per user.

---

## Recommended remediation order

1. **Block or authenticate** all **CRITICAL** GETs (workflows, pipelines, pipeline_stages, verticals, financials snapshot/statements) — same release train as any multi-tenant launch.
2. **Fix `GET /api/admin/payments`** org filter + audit other list endpoints that use `requireAdminOrOps` without `getAdminContext`.
3. **Replace `ALLOY_PUBLIC_ORG_ID`** with `getAdminContext().orgId` on workflow event/run routes.
4. **Add ownership check** helper: `assertRowOrg(supabase, table, id, ctx.orgId)` and use in every `requireAdminOrOps` PATCH/DELETE by id.
5. **Workflow POST/create:** force `org_id: ctx.orgId` server-side; reject body `org_id` mismatch.
6. **`pricing/matrix`:** define product rule — if rows are global, document; if per-tenant, add org/vertical scoping consistent with business model.
7. **`entity/[type]/[id]`:** **Batch 3 (GET)** — `getAdminContext` first; org-scoped selects per type.
8. **Subscriptions generate-next:** **Batch 3** — org ownership asserted.
9. **Vendor document signed URL:** **Batch 3** — vendor + storage path org checks.
10. **Backend proxy (`payments/run`):** **Batch 3** asserts org-owned job in Next layer; **still** confirm Python admin API enforces org for charges/ledger (outside this repo).

---

*End of Admin API Org Scoping Audit v1.*
