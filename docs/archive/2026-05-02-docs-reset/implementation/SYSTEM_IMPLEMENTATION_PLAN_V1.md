# System implementation plan v1

**Source of truth:** [System structure v1](./SYSTEM_STRUCTURE_V1.md).  
**Scope:** concrete steps for (1) UI V1 nav unification, (2) hierarchy schema, (3) system settings hub.  
**Code anchors:** `web/components/admin/AdminLayout.tsx` (`navGroups`), `web/app/admin/**`, `supabase/migrations/20260323181806_remote_schema.sql` (no `departments` / `work_units` today).

---

## 1. UI V1 navigation migration map

**Implementation default:** keep **existing URLs** for v1; change **only** `navGroups` labels, grouping, and icons in `AdminLayout.tsx` unless a row explicitly says otherwise. That avoids redirects, broken bookmarks, and API coupling to paths.

| Current nav group + item (or route if not in nav) | Route | Proposed top-level section | Action | Notes |
|--------------------------------------------------|-------|---------------------------|--------|--------|
| *(none — entry via `/admin` redirect)* | `/admin/dashboard` | Cross-cutting (above IA) | **keep** | `web/app/admin/page.tsx` redirects here; add explicit sidebar link when restructuring (optional). |
| Directory → People | `/admin/people` | **Records** | **move** (nav only) | Rename group to **Records**; subgroup *People & accounts* or similar. |
| Directory → Customers | `/admin/customers` | **Records** | **move** (nav only) | Same group. |
| Directory → Vendors | `/admin/vendors` | **Records** | **move** (nav only) | Label as *Partners* vs *Vendors* is product copy; `entityType` unchanged. |
| *(not in `navGroups`)* | `/admin/contacts` | **Records** | **merge** (into nav) | Add link under Records; page exists (`web/app/admin/contacts/page.tsx`). |
| *(not in `navGroups`)* | `/admin/customer-members` | **Records** | **merge** (into nav) | Add under Records. |
| Operations → Opportunities | `/admin/opportunities` | **Operations** (primary home) | **keep** | [SYSTEM_STRUCTURE_V1](./SYSTEM_STRUCTURE_V1.md) allows dual mental model; single list URL — optional second nav link under Records = **alias** only (same href). |
| Operations → Jobs | `/admin/jobs` | **Operations** | **keep** | Detail: `/admin/jobs/[id]` stays nested. |
| Operations → Schedules | `/admin/schedules` | **Operations** | **keep** | Detail: `/admin/schedules/[id]`. |
| Operations → Documents | `/admin/documents` | **Documents** | **move** (nav only) | New top-level **Documents** `navGroups` entry; URL unchanged. |
| Operations → Locations | `/admin/locations` | **Records** | **move** (nav only) | Per structure doc: master data / places. |
| Operations → Workflows → Builder | `/admin/workflows` | **Workflows** | **move** (nav only) | New top-level **Workflows** group with three children. |
| Operations → Workflows → Events | `/admin/workflow-events` | **Workflows** | **move** (nav only) | |
| Operations → Workflows → Runs | `/admin/workflow-runs` | **Workflows** | **move** (nav only) | |
| Operations → Messages | `/admin/messaging` | **Operations** | **keep** | |
| *(not in `navGroups`)* | `/admin/messages-outbox` | **Operations** | **merge** | Add next to Messaging or nested under Messages. |
| Operations → Settings → Recurrence | `/admin/operations/recurrence` | **System** (scheduling defaults) | **move** (nav only) | Structure doc: system behavior; URL can stay; nav lives under **System** (or System hub deep link). |
| Financials → Payments | `/admin/financials/payments` | **Financials** | **keep** | |
| Financials → Ledger | `/admin/financials/ledger` | **Financials** | **keep** | |
| Financials → Statements | `/admin/financials/statements` | **Financials** | **keep** | |
| Financials → Discount Redemptions | `/admin/discount-redemptions` | **Financials** | **keep** | |
| Financials → Pricing | `/admin/financials/pricing` | **Financials** | **keep** | |
| *(not in `navGroups`)* | `/admin/discounts` | **Financials** | **merge** | Adjacent to redemptions per structure doc. |
| *(not in `navGroups`)* | `/admin/subscriptions` | **Financials** | **merge** | |
| *(not in `navGroups`)* | `/admin/financials/accounts` | **Financials** | **merge** | GL accounts UI. |
| *(not in `navGroups`)* | `/admin/financials/add-ons` | **Financials** | **merge** | |
| *(not in `navGroups`)* | `/admin/financials/service-offerings` | **Financials** | **merge** | |
| *(not in `navGroups`)* | `/admin/financials/plan-templates` | **Financials** | **merge** | |
| *(not in `navGroups`)* | `/admin/financials/settings/subscription` | **Financials** | **merge** | Nested under Financials → Settings or flat list. |
| *(not in `navGroups`)* | `/admin/financials` | **Financials** | **keep** (optional) | `FinancialsAuditClient` — decide if it stays a dev/audit entry or is linked from System; low traffic risk to hide. |
| System → Access Control | `/admin/system/access-control` | **System** | **keep** | |
| *(not in `navGroups`)* | `/admin/system/roles` | **System** | **merge** | Exists (`system/roles/page.tsx`); wire into Access Control subsection in hub + nav. |
| *(not in `navGroups`)* | `/admin/users` | **System** | **merge** | User list; pair with Access Control. |
| System → Verticals / Industries | `/admin/system/verticals-industries` | **System** | **keep** | |
| System → *(industry detail)* | `/admin/system/industries/[id]` | **System** | **keep** | No nav change; reached from verticals/industries UI. |
| System → Entity Labels | `/admin/system/entity-labels` | **System** | **keep** | |
| System → Statuses | `/admin/system/statuses` | **System** | **keep** | |
| System → Directory Settings → *all field/relationship routes* | `/admin/system/*-fields`, `person-relationship-types`, `db-relationships`, `customer-person-roles` | **System** | **merge** (labels) | Rename nested label to **Custom fields** + **Relationships** in `navGroups`; URLs unchanged. |
| System → Payouts | `/admin/system/payouts` | **Financials** (IA) / **alias** | **alias** | Structure doc: show under Financials in nav; **implement as second nav item same href** or move route in a later phase (higher risk). |
| *(not in `navGroups`)* | `/admin/settings` | TBD | **keep** | Inspect usage; legacy settings shell — either link from System hub or deprecate. |
| *(not in `navGroups`)* | `/admin/verticals` | **System** or deprecate | **merge** / **alias** | Overlap with `verticals-industries`; confirm duplicate vs redirect. |
| *(not in `navGroups`)* | `/admin/contractors` | **Records** or **Financials** | **merge** | Product call: vendor-like vs payout-related. |

**Files to touch for section 1:** primarily `web/components/admin/AdminLayout.tsx` (`navGroups`, `getLinkIcon`, `getInitialCollapsed` keys, any pathname heuristics that reference old group labels).

---

## 2. Hierarchy schema proposal

**Baseline:** `orgs` exists (`id`, `name`, `slug`, `status`, `industry_id`) — see `remote_schema.sql`. The **initial additive migration** is `supabase/migrations/20260325120000_hierarchy_departments_work_units.sql`; full rationale, RLS notes, and deferred items are in [Hierarchy schema v1](./HIERARCHY_SCHEMA_V1.md). *(Before that migration is applied, `departments` / `work_units` do not exist in the database.)*

### 2.1 `departments`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `org_id` | `uuid` NOT NULL | FK → `orgs(id)`; matches tenancy pattern on `jobs.org_id` |
| `key` | `text` NOT NULL | Stable program key (e.g. `operations`, `renewals`); unique per org |
| `name` | `text` NOT NULL | Display label |
| `description` | `text` | Optional |
| `sort_order` | `integer` NOT NULL DEFAULT 0 | Nav / workspace ordering |
| `is_active` | `boolean` NOT NULL DEFAULT true | Soft hide without delete |
| `metadata` | `jsonb` NOT NULL DEFAULT `{}` | Future: industry template id, icon keys |
| `created_at` / `updated_at` | `timestamptz` | Standard |

**Constraints:** `UNIQUE (org_id, key)`.

### 2.2 `work_units`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL | FK → `orgs(id)`; denormalized for RLS and admin queries |
| `department_id` | `uuid` NOT NULL | FK → `departments(id)` ON DELETE CASCADE (or RESTRICT if you need orphan policy) |
| `key` | `text` NOT NULL | Stable key within department |
| `name` | `text` NOT NULL | Display |
| `description` | `text` | Optional |
| `sort_order` | `integer` NOT NULL DEFAULT 0 | |
| `is_active` | `boolean` NOT NULL DEFAULT true | |
| `queue_definition` | `jsonb` NOT NULL DEFAULT `{}` | **Open:** encoded filter (entity type, status keys, date field)—avoid baking SQL into JSON; store structured keys the app interprets |
| `metadata` | `jsonb` NOT NULL DEFAULT `{}` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraints:** `UNIQUE (department_id, key)`; optional `UNIQUE (org_id, key)` only if keys are globally unique per org across departments (usually not).

### 2.3 Likely foreign keys on existing “record” tables

Introduce **nullable** columns first; backfill; then optionally `NOT NULL` per product rules.

| Table | Proposed column | FK | Rationale |
|-------|-----------------|-----|-----------|
| `jobs` | `department_id` | `departments(id)` | Optional denormalized rollup; can derive via `work_unit` only |
| `jobs` | `work_unit_id` | `work_units(id)` | Primary operational bucket for dispatch / V2 Work Unit workspace |
| `schedules` | `work_unit_id` | `work_units(id)` nullable | Often inferable from `job_id`; explicit column helps job-less schedules later |
| `opportunities` | `work_unit_id` | `work_units(id)` nullable | Sales pipeline queues |
| `workflows` | `department_id` | `departments(id)` nullable | Scope automation to a department; `org_id` already on table |

**Defer / open:** `customers`, `vendors`, `documents` — usually org-scoped master data; link to work units only via operational rows unless product requires territory assignment at account level.

### 2.4 How records relate (v1 implementation story)

1. **Org** owns all rows (`org_id` unchanged).
2. **Department** partitions an org’s operational world for UI V2 Company → Department rollups.
3. **Work unit** is the list/queue scope for **Work Unit workspace** and filtered V1 lists.
4. **Record** (job, opportunity, schedule visit, etc.) **optionally** points at `work_unit_id`; navigation and reports use that for grouping.

### 2.5 Open schema decisions

| # | Decision | Options |
|---|----------|--------|
| 1 | `jobs.department_id` redundant vs derived from `work_units.department_id` | Omit `department_id` on jobs and always join through work unit vs denormalize for query speed |
| 2 | `queue_definition` shape | JSON DSL vs separate `work_unit_rules` table vs MVP null + manual assignment only |
| 3 | Unassigned records | Allow `work_unit_id` NULL indefinitely vs default “Inbox” work unit per department |
| 4 | Multi-work-unit membership | One FK only (MVP) vs join table for many-to-many |
| 5 | RLS | Mirror `org_id` checks on new tables; service-role admin routes must add `.eq("org_id", ctx.orgId)` per existing remediation pattern |

---

## 3. System settings hub mapping

**Gap:** there is **no** `web/app/admin/system/page.tsx`; entering `/admin/system` may 404 depending on Next behavior — verify and add a **hub** page.

| Existing route / page | Proposed hub subsection | Already exists | Needs wrapper / hub | Priority |
|----------------------|-------------------------|----------------|---------------------|----------|
| `/admin/system/access-control` | Permissions / roles | Yes (`access-control/page.tsx`) | Link card on hub | P0 |
| `/admin/system/roles` | Permissions / roles | Yes | Link card | P0 |
| `/admin/users` | Permissions / roles | Yes | Link card + add to nav | P0 |
| `/admin/system/verticals-industries` | Industry / vertical | Yes | Link card | P0 |
| `/admin/system/industries/[id]` | Industry / vertical | Yes | No hub row (child route) | P1 |
| `/admin/system/entity-labels` | Labels | Yes | Link card | P0 |
| `/admin/system/statuses` | Statuses | Yes | Link card | P0 |
| `/admin/system/person-fields` … `document-fields` | Custom fields (by entity) | Yes (11 field routes) | Hub subsection **Custom fields** with grid of links; optional `system/custom-fields/page.tsx` passthrough | P0 |
| `/admin/system/customer-person-roles` | Relationships | Yes | Link under Relationships | P1 |
| `/admin/system/person-relationship-types` | Relationships | Yes | Link | P1 |
| `/admin/system/db-relationships` | Relationships | Yes | Link (operator-advanced) | P2 |
| `/admin/system/document-fields` | Document config | Yes | Also link from **Documents** hub later | P1 |
| `/admin/operations/recurrence` | Other org-wide / Scheduling | Yes | Link from hub **Scheduling** row | P1 |
| `/admin/system/payouts` | Financials-adjacent | Yes | Link card labeled “Payouts (financials)” or cross-link | P2 |
| `/admin/settings` | Other | Yes | Audit content; link or hide | P2 |
| `orgs` row / `org_settings` | Organization | Partial | **`org_settings`** exists (`org_id`, `payout_type`, `payout_value`, `metadata`) — payout-focused today; **`orgs`** has `name`, `slug`, `industry_id`; no dedicated “org profile” admin page in `app/admin` | P2 |

**Hub implementation sketch:** new `web/app/admin/system/page.tsx` (server or client) rendering sections matching [SYSTEM_STRUCTURE_V1 §3](./SYSTEM_STRUCTURE_V1.md): Organization, Labels, Statuses, Custom fields, Relationships, Document config, Permissions, Industry — each section is a list of `Link` components to existing routes; no business logic duplication.

---

## 4. Recommended build order (lowest risk)

1. **`AdminLayout.tsx` nav-only restructure**  
   Reorder/relabel `navGroups` to six sections + add missing links (contacts, customer-members, subscriptions, discounts, financials children, messages-outbox, users, roles) **without changing any `href` values** except adding new entries.  
   **Risk:** low — visual/IA only; test pathname auto-expand logic in same file.

2. **`/admin/system` hub page**  
   Add `system/page.tsx` with grouped links to existing system + recurrence routes.  
   **Risk:** low — additive; optionally add “System overview” as first item in System `navGroups`.

3. **Icon map and collapse defaults**  
   Update `getLinkIcon` and `getInitialCollapsed` / `nestedCollapsed` keys for new group names (e.g. `Workflows::…`, `Records::…`).  
   **Risk:** low.

4. **Optional nav alias for Payouts**  
   Duplicate link under Financials pointing to `/admin/system/payouts` (same URL).  
   **Risk:** low; avoids route migration.

5. **Resolve orphan / duplicate routes**  
   `/admin/verticals` vs `/admin/system/verticals-industries`, `/admin/settings` — pick redirect or hub link.  
   **Risk:** medium if deleting routes; low if redirect only.

6. **Supabase migration: `departments` + `work_units`**  
   Create tables, indexes, FK to `orgs`, RLS policies for `authenticated` (and service role as today).  
   **Risk:** medium — requires migration review and policy tests.

7. **Nullable FK columns on `jobs` (then schedules, opportunities as needed)**  
   Add `work_unit_id` (and optional `department_id`) nullable; no app requirement to populate yet.  
   **Risk:** medium — DDL only if no NOT NULL.

8. **Admin CRUD API routes + minimal UI for departments/work units**  
   Under `/admin/system/...` or `/api/admin/departments` pattern with `getAdminContext` + org scoping.  
   **Risk:** medium — new surface; follow Batch 1–3 API patterns.

9. **Backfill script**  
   One default department + work unit per org; set `jobs.work_unit_id` where null if policy requires.  
   **Risk:** medium — data migration.

10. **Enforcement**  
    NOT NULL policies (if desired), list filters in V1, V2 adapter query params — **highest coupling**; do last.

---

*References: [SYSTEM_STRUCTURE_V1.md](./SYSTEM_STRUCTURE_V1.md), `web/components/admin/AdminLayout.tsx`, `supabase/migrations/20260323181806_remote_schema.sql`.*
