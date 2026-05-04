# Hardening sprint — Roles / permissions / CRM access (incremental coverage)

Follow-up to the core access-scope sprint: audit gaps, patch **high-risk** financial/payment/job-adjacent reads, seed demo data, and manual UI checklist. **No model redesign.**

---

## Card A — Incremental route coverage audit

### Method

From `web/app/api/admin`, routes using **`getAdminContextCached`** were scanned; routes **without** any of:

`getAdminAccessContextCached`, `assertJobInAccessScope`, `assertScheduleInAccessScope`, `assertOpportunityInAccessScope`, `assertEntityDrawerRecordReadable`, `assertExistingJobMutableInAdminScope`, `assertExistingScheduleMutableInAdminScope`, `assertExistingOpportunityMutableInAdminScope`, `narrowJobIdsForScheduleList`, `scopeDimensionsFromAccess`

were flagged as **missing explicit access-context wiring** (some still OK if they only touch global config).

Scripts cannot infer HTTP methods reliably from filenames alone; methods below are **primary** handlers verified by hand for representative routes.

### Findings table (representative — CRM / financial leakage risk)

| Route | Method(s) | Entity / surface | Current protection | Risk | Recommended fix |
|-------|-----------|------------------|-------------------|------|-----------------|
| `financials/schedule/[id]` | GET | Schedule + job financials | org_id + membership | **High** | ✅ **Done (Card B)** — `assertScheduleInAccessScope` |
| `financials/job/[id]` | GET | Job GL rollup | org_id | **High** | ✅ **Done** — `assertJobInAccessScope` |
| `financials/journal-entries/[id]` | GET | GL entry + lines | org_id | **High** | Gate via linked `schedule_id` / `job_id` lines (all referenced rows in scope) |
| `jobs/[id]/payments` | GET | Payments by job | org_id | **High** | ✅ **Done** — `assertJobInAccessScope` |
| `jobs/[id]/payout` | GET | Payout breakdown | org_id | **High** | ✅ **Done** — `assertJobInAccessScope` |
| `jobs/[id]/payment-collect-context` | GET | Collect-payment modal context | org_id | **High** | ✅ **Done** — job + optional schedule scope |
| `jobs/[id]/vendors-for-assign` | GET | Vendor picker | org_id | **Medium** | ✅ **Done** — `assertJobInAccessScope` |
| `schedules/[id]/vendors-for-assign` | GET | Vendor picker | org_id | **Medium** | ✅ **Done** — `assertScheduleInAccessScope` |
| `payments/[id]` | PATCH | Payment mutation | org_id | **High** | ✅ **Done** — `assertPaymentDrawerReadable` |
| `payments` | GET | Payment list | org_id | **Medium / High** | ✅ **Partial** — scoped when `job_id` query param set; **full list still org-wide** (see gaps) |
| `payments/run` | POST | Payment run | org_id | **High** | Review + gate by allocation targets / jobs |
| `discount-redemptions` | GET | List redemptions | org_id filter via FK pools | **High** | Build FK id pools using **scoped** job/opportunity/customer predicates (not all org ids) |
| `customers/[id]` | PATCH | Customer | org_id | **Medium** | Deny dept-restricted PATCH unless policy allows household-wide edits |
| `customers` | GET/POST | Customers | org_id | **Medium** | Optional list narrowing by scope |
| `persons`, `persons/[id]` | GET/PATCH | Persons | org_id | **Medium** | Tie readability to linked customer/job scope where feasible |
| `documents/[id]`, `documents/[id]/signed-url` | GET | Documents | org_id | **Medium** | Already partially gated via entity drawer patterns elsewhere; align with `assertDocumentDrawerReadable` |
| `queues/[workUnitId]/[queueKey]` | GET | Queue data | org_id | **High** | Enforce work unit visible under dept scope + queue payload filtering |
| `workflow-events` | GET | Events stream | org_id | **Medium** | Filter payloads or restrict keys for scoped roles |
| `subscriptions/[id]` | GET/PATCH | Subscription | org_id | **Medium** | Gate via job/customer linkage |
| `related/[entity]/[id]` | GET | Related records | org_id | **Medium** | Apply same entity-type gates as drawer |
| `communications/*` | various | Threads / send | org_id | **Medium** | Case-by-case participant linkage to scoped entities |
| `pipelines`, `pipeline-stages`, `status-definitions`, `field-definitions`, `workflows`, `pricing/*`, `rbac/*`, `locations` (POST), `tenant-bootstrap`, `agent/*` | various | Config / catalog | org_id / admin | **Low** | Keep admin-only; optional future “settings role” split |
| `users/[userId]/access-scope` | GET/PATCH | Profiles | admin role | **N/A** | Intentionally uses admin gate, not viewer scope |

**Note:** Routes that only use **`requireAdminOrOps`** still depend on **`getAdminContextCached`** for `org_id`; they were included in the mechanical grep if they did not import access context. Many are **low risk** (settings, RBAC, pricing matrices).

---

## Card B — Patches applied (this sprint)

- `GET /api/admin/financials/schedule/[id]` — scope on schedule (`location_id` loaded).
- `GET /api/admin/financials/job/[id]` — scope on job (`work_unit_id`, `location_id`).
- `GET /api/admin/jobs/[id]/payments` — scope on job.
- `GET /api/admin/jobs/[id]/payout` — scope on job.
- `GET /api/admin/jobs/[id]/payment-collect-context` — scope on job; optional `schedule_id` gated.
- `GET /api/admin/jobs/[id]/vendors-for-assign` — scope on job.
- `GET /api/admin/schedules/[id]/vendors-for-assign` — scope on schedule.
- `PATCH /api/admin/payments/[id]` — `assertPaymentDrawerReadable`.
- `GET /api/admin/payments` — when `job_id` is provided, job rows are scoped before listing.

Tests: `web/tests/admin/adminFinancialScope.test.ts` (helper-level).

---

## Card C — Seed script

- **File:** `web/scripts/seedAccessValidationDemo.ts`
- **npm script:** `npm run dev:seed:access-validation`
- **Idempotency:** Inserts only when `metadata` markers (`access_validation_seed_key`, `demo_seed_package = access_validation_demo_v1`) are absent; **does not** truncate org data.

See **Seed instructions** below.

---

## Card D — UI validation checklist (manual)

Prerequisites: seed run (optional user scopes); three browser sessions or profile switches.

1. **Corporate / admin (`department_scope=all`, `site_scope=all`):** Departments list shows all seeded departments; locations/sites lists show both sites; workspace queues for both work units show seeded opportunities.
2. **Regional (`site_scope=restricted`, two sites):** Sees both seeded **site** locations in allowed list; queues and entity lists exclude data whose `location_id` is outside those sites (spot-check schedules list and job drawer).
3. **Director (`site_scope=restricted` + one site, `department_scope=restricted` + one dept):** Only **North** lane data visible; **South** lane opportunity/job/schedule IDs do not appear in lists tied to scope.
4. **Direct URL:** As director, open `GET /api/admin/entity/jobs/{southJobId}` (or drawer URL in UI) — expect **404** (or “Not found” in UI).
5. **Direct mutation:** As director, `PATCH` south job or `POST` job charge for south job — expect **404**.
6. **Settings:** `AdminV2 → Settings → User access scope` — change scope and save; reload and confirm effective JSON preview updates.
7. **Restricted empty allow-list:** `PATCH .../access-scope` with `site_scope=restricted` and `site_location_ids: []` — expect **400** with explicit error (rejected).
8. **Site-only options:** On user-access page, restricted site checkboxes must only list `location_type === 'site'` locations (non-sites excluded in client filter; API validates on save).

---

## Card E — Playwright

**Skipped.** The repo has a single smoke spec (`playwright/tests/smoke-field-registry.spec.ts`) unrelated to authenticated multi-persona CRM access. Adding reliable access-scope E2E would require **auth/session fixtures** and dedicated test users — out of scope for this “lightweight hardening” pass.

---

## Seed instructions

1. Choose a **non-production** org: `ACCESS_VALIDATION_ORG_ID=<uuid>`.
2. From `web/` with `.env.local` service role configured (same as other dev scripts):

   ```bash
   ACCESS_VALIDATION_ORG_ID=<org-uuid> npm run dev:seed:access-validation
   ```

3. Optional — provision **test auth users** in Supabase Auth first, then apply scoped profiles (inserts `user_roles` **only if** no row exists for that user+org):

   ```bash
   ACCESS_VALIDATION_ORG_ID=<org-uuid> \
   ACCESS_VALIDATION_APPLY_USER_SCOPES=true \
   ACCESS_VALIDATION_CORPORATE_USER_ID=<uuid> \
   ACCESS_VALIDATION_REGIONAL_USER_ID=<uuid> \
   ACCESS_VALIDATION_DIRECTOR_USER_ID=<uuid> \
   npm run dev:seed:access-validation
   ```

4. Ensure org has **`new_inquiry`** (or chosen `status_key`) allowed for opportunities if status-definition triggers apply.

---

## Remaining known gaps

- **`GET /api/admin/payments`** without `job_id` — still returns **org-wide** payment rows for any ops/admin caller; scoped filtering would require per-payment job resolution and batch filtering (non-trivial).
- **`discount-redemptions`** — FK pool built from **all** org customers/jobs/opportunities/contacts; restricted users could theoretically see redemption rows anchored only to entities they should not enumerate.
- **`financials/journal-entries/[id]`** — GL lines may reference jobs/schedules outside scope.
- **`queues/[workUnitId]/[queueKey]`** — must align with department/work-unit visibility rules.
- **Persons/customers/documents/subscriptions/workflow-events** — many routes still **org-only**.
- **Playwright** — no automated multi-role CRM smoke yet.
