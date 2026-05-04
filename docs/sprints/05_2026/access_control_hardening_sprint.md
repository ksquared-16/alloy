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
- **Package marker:** `demo_seed_package = access_validation_demo_v2` on inserted rows (alongside `access_validation_seed_key`). Inserts only when that entity’s seed key is not already present; **does not** truncate org data.
- **Admin shell compatibility:** Corporate test user gets **`admin`**. Regional and director test users get **`ops`** plus their persona role (**`regional_lead`** / **`school_director`**) so `portalEligible` passes while scope presets stay the same (`user_access_profiles` + department/site access tables unchanged).
- **Full demo wipe:** Optional env `ACCESS_VALIDATION_CLEAN_DEMO=true` deletes **all** rows tagged `metadata.demo_seed_package = access_validation_demo_v1` **or** `access_validation_demo_v2`, then **exits** (re-run without the flag to seed).
- **Legacy cleanup:** Optional env `ACCESS_VALIDATION_CLEAN_OLD_DEMO=true` deletes **only** rows with `metadata.demo_seed_package = access_validation_demo_v1` (old misleading labels). Never deletes v2 rows or data without that marker.

Orgs that ran v1 before cleanup may still show stale rows until cleanup is run once.

### What the seed creates (terminology)

| Concept | Alloy meaning | Seed labels |
|--------|----------------|-------------|
| **Department** | Functional pillar / workspace grouping | **Enrollment**; **Billing / Operations** |
| **Work unit** | Workspace within a department | One enrollment workspace; one billing/operations workspace |
| **Site / location** | Physical campus (`location_type = site`) | **North Campus**; **South Campus** |
| **Lanes** | Demo records tying workspace + campus | **Enrollment · North Campus** and **Enrollment · South Campus** (primary); **Billing / Ops · North/South Campus** (optional extra lanes) |

**Director preset:** restricted to **Enrollment** department **and** **North Campus** only → visible primary lane is Enrollment · North Campus; hidden examples include Enrollment · South Campus, both Billing/Ops lanes, and other campuses outside allow-list.

See **Seed instructions** below.

---

## Card D — UI validation checklist (manual)

Prerequisites: seed run (optional user scopes); three browser sessions or profile switches.

**Roles (seed):** Corporate = `admin`. Regional = `ops` + `regional_lead`. Director = `ops` + `school_director`. Access scopes are unchanged from presets below.

1. **Corporate / admin (`department_scope=all`, `site_scope=all`):** Sees both functional departments (**Enrollment**, **Billing / Operations**); both physical campuses (**North Campus**, **South Campus**); workspace queues for **both** work units; seeded opportunities/jobs across **all** demo lanes (Enrollment north/south + Billing/Ops north/south).
2. **Regional (`site_scope=restricted`, both campuses):** `site_scope` allow-list includes **North Campus** and **South Campus** only; **all departments** remain visible — so Billing/Ops lanes **do** appear. Lists should exclude entities whose resolved site is outside those campuses (spot-check schedules/jobs).
3. **Director (`department_scope=restricted` → Enrollment only; `site_scope=restricted` → North Campus only):** Should see **Enrollment · North Campus** lane only (same enrollment work unit as South, different site). Should **not** see Enrollment · South Campus, any Billing/Ops lane, or queues belonging to the Billing/Ops work unit.
4. **Direct URL:** As director, open an opportunity/job from **Enrollment · South Campus** or **Billing / Ops · …** (IDs from seed stdout) — expect **404** / “Not found”.
5. **Direct mutation:** As director, `PATCH` or charge-post against an **out-of-scope** seeded job — expect **404**.
6. **Settings:** `AdminV2 → Settings → User access scope` — change scope and save; reload and confirm effective JSON preview updates.
7. **Restricted empty allow-list:** `PATCH .../access-scope` with `site_scope=restricted` and `site_location_ids: []` — expect **400** with explicit error (rejected).
8. **Site-only options:** On user-access page, restricted site checkboxes must only list `location_type === 'site'` locations (non-sites excluded in client filter; API validates on save).

---

## Card E — Playwright

**Skipped.** The repo has a single smoke spec (`playwright/tests/smoke-field-registry.spec.ts`) unrelated to authenticated multi-persona CRM access. Adding reliable access-scope E2E would require **auth/session fixtures** and dedicated test users — out of scope for this “lightweight hardening” pass.

---

## Card F — Next UX (planned): AdminV2 header site filter

**Goal:** Users with **multiple allowed sites** need a fast way to narrow what they see without opening another settings page.

**Direction:**

- Header-level **dropdown or combobox** (searchable when many sites), styled to match current AdminV2 chrome.
- **Default:** “All allowed locations” (no extra filter).
- **Options:** only site `location_type === 'site'` locations the user is already allowed to see (from access scope — not a permission change).
- **Semantics:** _view filter_ only. Effective rows = **`access_scope ∩ selected_site`**. Changing the control does not elevate or bypass RBAC.

**Shipped (May 2026, plumbing):** `GET /api/admin/workspace/site-filter`, `WorkspaceSiteFilterContext`, header strip on workspace routes (`WorkspaceSiteFilterGate`), minimal dropdown / single-site label. **Remaining:** thread `selectedSiteId` into workspace data loads per **`docs/sprints/05_2026/site_filter_workspace_card.md`**.

---

## Seed instructions

1. Choose a **non-production** org: `ACCESS_VALIDATION_ORG_ID=<uuid>`.
2. Remove **all** access-validation demo rows (v1 **and** v2) when finished UI validation:

   ```bash
   ACCESS_VALIDATION_ORG_ID=<org-uuid> \
   ACCESS_VALIDATION_CLEAN_DEMO=true \
   npm run dev:seed:access-validation
   ```

   The script deletes tagged rows and **exits** (does not re-seed). Run again **without** `ACCESS_VALIDATION_CLEAN_DEMO` to recreate demo data.

3. (Optional legacy) Remove **only** `access_validation_demo_v1` rows if old North/South noise remains:

   ```bash
   ACCESS_VALIDATION_ORG_ID=<org-uuid> \
   ACCESS_VALIDATION_CLEAN_OLD_DEMO=true \
   npm run dev:seed:access-validation
   ```

4. From `web/` with `.env.local` service role configured (same as other dev scripts), seed v2 demo data:

   ```bash
   ACCESS_VALIDATION_ORG_ID=<org-uuid> npm run dev:seed:access-validation
   ```

   Console output maps **functional** departments/work units vs **physical** campuses and lists lane IDs (Enrollment north/south + optional Billing/Ops north/south).

5. Optional — provision **test auth users** in Supabase Auth first, then apply roles + scoped profiles (each `user_roles` **row** is one role; seed adds missing rows only):

   ```bash
   ACCESS_VALIDATION_ORG_ID=<org-uuid> \
   ACCESS_VALIDATION_APPLY_USER_SCOPES=true \
   ACCESS_VALIDATION_CORPORATE_USER_ID=<uuid> \
   ACCESS_VALIDATION_REGIONAL_USER_ID=<uuid> \
   ACCESS_VALIDATION_DIRECTOR_USER_ID=<uuid> \
   npm run dev:seed:access-validation
   ```

   - **Corporate:** `admin`; all departments, all sites.  
   - **Regional:** `ops` + `regional_lead`; all departments; sites restricted to **North Campus** + **South Campus**.  
   - **Director:** `ops` + `school_director`; **Enrollment** department only + **North Campus** site only.

6. Ensure org has **`new_inquiry`** (or chosen `status_key`) allowed for opportunities if status-definition triggers apply.

See also **`docs/sprints/05_2026/site_filter_workspace_card.md`** (header site filter plumbing).

---

## Route Family Hardening (May 2026)

Incremental patches aligned with **Card A** route-family priorities — **no access-model redesign**.

### Patched routes

| Route | Change |
|-------|--------|
| `GET /api/admin/payments` | Without `job_id`, dept/site-restricted callers list payments only when `job_id` is in scoped jobs **or** `id` appears in active allocations tied to scoped jobs (direct job targets + charge-linked allocations). Impossible scope → empty list. |
| `GET /api/admin/financials/journal-entries/[id]` | Restricted users get **404** unless header (`schedule_completed` / `customer_payment` / `vendor_payout` + `source_id` schedule) **and/or** lines resolve via `job_id` / `schedule_id` under scope; lines with only `customer_id` / `vendor_id` (no job/schedule) are denied when restricted. |
| `GET /api/admin/discount-redemptions` | Restricted callers build FK `.or()` pools from **scoped** jobs, opportunities (record constraints), derived customers/contacts — not full-org id scans. |
| `GET /api/admin/queues/[workUnitId]/[queueKey]` | Validates work unit exists; **department-restricted** users receive **404** for other departments’ work units; passes `resolveRecordScopeConstraints` into queue queries so job/opportunity rows respect site **location_id** expansion where applicable; impossible scope → empty items. |
| `GET /api/admin/customers` | Restricted lists constrained to customers referenced from scoped jobs/opportunities. |
| `GET /api/admin/persons` | Restricted lists constrained to persons tied to scoped customers (memberships) or scoped opportunities (`primary_person_id` / `primary_contact_id` → `person_id`). |
| `GET /api/admin/documents` | Restricted lists filter rows through `assertDocumentDrawerReadable` (entity drawer parity). |

### Tests

- `web/tests/admin/routeFamilyHardening.test.ts` — helper-level coverage for journal visibility, redemption pool resolver (unrestricted), payment allocation collector edge, scoped customer/person list helpers (unrestricted).
- `web/tests/queues/queueRoutes.test.ts` — queue drill-in handler mocks extended for `getAdminAccessContextCached`, Supabase work-unit probe, and `getWorkUnitQueueItems` scope arguments.

### Verification commands

From `web/`: `npm test`, `npx tsc --noEmit`.

---

## Remaining known gaps

- **`GET /api/admin/payments`** without `job_id` — pagination totals remain consistent with PostgREST `.or(job_id ∪ allocation-payment ids)`; extremely large scoped job sets may approach URL/filter limits (same class as other `.in`-heavy admin lists).
- **`GET /api/admin/financials/journal-entries`** (list) — still org-wide for restricted callers; individual `[id]` reads are hardened only.
- **`GET /api/admin/customers` / `persons`** — narrowing uses scoped job/opportunity linkages; orphan households without those ties remain hidden for restricted roles (by design).
- **`payments/run`** and other payment **mutations** — not part of this route-family pass.
- **Subscriptions/workflow-events/related records** — still largely org-scoped at the handler layer.
- **Communications** — intentionally untouched (separate sprint).
- **Playwright** — no automated multi-role CRM smoke yet.
