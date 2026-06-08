# Hierarchy schema v1

**Schema source of truth:** `departments`, `work_units`, and `jobs.work_unit_id` as applied in **`supabase/baselines/prod_baseline.sql`** (and/or `supabase/migrations/20260329165048_remote_schema.sql`). An older filename `20260325120000_hierarchy_departments_work_units.sql` may not exist in this branch if history was squashed — **verify in-tree before linking migrations**.

**Doctrine:** [Workspace, work unit, scope](../architecture/workspace-work-unit-scope-doctrine.md) · [Gap audit](../architecture/implementation-gap-audit.md).

**Product context:** [System structure v1](./SYSTEM_STRUCTURE_V1.md), [System implementation plan v1](./SYSTEM_IMPLEMENTATION_PLAN_V1.md).

This document records the **first schema slice** for **Organization → Department → Work unit → Record**. It is **additive only**: new tables and a **nullable** `jobs.work_unit_id`. No `NOT NULL` enforcement on jobs yet, no backfill in this migration. **Admin V1** adds minimal CRUD for departments and work units under `/admin/system/*`; job assignment and workspace runtime wiring are separate passes.

---

## 1. Table definitions (summary)

### 1.1 `departments`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `org_id` | `uuid` NOT NULL | FK → `orgs(id)` **ON DELETE RESTRICT** |
| `key` | `text` NOT NULL | Stable per-org identifier; **UNIQUE (`org_id`, `key`)**; non-empty trim |
| `name` | `text` NOT NULL | Display label |
| `description` | `text` | Optional |
| `sort_order` | `integer` NOT NULL default `0` | Ordering in nav / workspace |
| `is_active` | `boolean` NOT NULL default `true` | Soft-disable |
| `metadata` | `jsonb` NOT NULL default `{}` | Extension point |
| `created_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` | |

**Indexes:** `org_id`; composite `(org_id, is_active, sort_order)` for list UIs.

### 1.2 `work_units`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | |
| `org_id` | `uuid` NOT NULL | FK → `orgs(id)` **ON DELETE RESTRICT**; denormalized copy of `departments.org_id` |
| `department_id` | `uuid` NOT NULL | FK → `departments(id)` **ON DELETE RESTRICT** |
| `key` | `text` NOT NULL | Stable within department; **UNIQUE (`department_id`, `key`)** |
| `name` / `description` | | Same intent as departments |
| `sort_order` / `is_active` | | Same pattern |
| `queue_definition` | `jsonb` NOT NULL default `{}` | Reserved for structured queue/filter DSL (v1 often empty) |
| `metadata` | `jsonb` NOT NULL default `{}` | |
| `created_at` / `updated_at` | | |

**Indexes:** `org_id`; `department_id`; composite `(org_id, department_id, is_active, sort_order)`.

**Why `org_id` is duplicated on `work_units`:** Matches common Supabase/RLS patterns: policies can filter on `work_units.org_id = current_org_id()` without joining on every policy. **Consistency** with the parent row is enforced on **INSERT/UPDATE** via RLS `WITH CHECK` (department must exist and `departments.org_id` must equal `work_units.org_id`).

### 1.3 `jobs.work_unit_id`

| | |
|--|--|
| Column | `work_unit_id uuid` **nullable** |
| FK | → `work_units(id)` **ON DELETE SET NULL** |
| Index | Partial btree on `work_unit_id` **WHERE `work_unit_id IS NOT NULL`** |

**Not added in this pass:** `jobs.department_id`. Department is derivable as `work_units → departments` when `work_unit_id` is set; a denormalized `department_id` on jobs would speed some reports but duplicates truth and was deferred per implementation plan.

---

## 2. Why `work_units` are first-class rows

- **Stable identity** for queues/cohorts (routing, permissions later, audit).
- **FK target** for `jobs` and future tables (`schedules`, `opportunities`, etc.) without encoding queue logic only in JSON.
- **`queue_definition`** can evolve (filters, entity type, status keys) without new migrations for every queue shape.
- Aligns with UI V2 **Work unit workspace** (one scope = one row).

---

## 3. Why `jobs` only get `work_unit_id` first

- **Jobs** are the primary operational “record” already used for dispatch, schedules, and payments; they are the natural first anchor for hierarchy in code paths that matter most.
- **Single nullable FK** minimizes blast radius: existing jobs stay valid; admin APIs continue to work without supplying a work unit.
- **No `NOT NULL`** until product defines default work unit / backfill rules.
- **Cross-entity consistency** (`jobs.org_id` vs `work_units.org_id`) is **not** enforced in the database in this migration; the **service-role admin client** must continue to validate org ownership (same as today). A future **CHECK** or **trigger** can enforce `jobs.org_id = work_units.org_id` when `work_unit_id` is set.

---

## 4. RLS / policies

**Enabled:** `FORCE ROW LEVEL SECURITY` on `departments` and `work_units`.

**`authenticated`:** Same-org pattern as tables like `customer_subscriptions`:

- `departments`: `org_id = current_org_id()` for SELECT / INSERT / UPDATE / DELETE.
- `work_units`: SELECT requires `org_id = current_org_id()` **and** parent `departments` row exists with `departments.id = work_units.department_id` and `departments.org_id = work_units.org_id`. INSERT/UPDATE `WITH CHECK` ensures `department_id` belongs to a department whose `org_id` equals the new row’s `org_id` (and matches `current_org_id()`).

**`service_role`:** Broad allow policies (mirrors existing “service role full access …” pattern) so `createAdminClient()` continues to work; **admin routes must still scope by `getAdminContext().orgId`**.

**`anon`:** No table-level GRANTs on `departments` / `work_units` (only `authenticated` and `service_role`), so anonymous clients cannot target these relations at all.

**Deferred:** Role-specific policies (e.g. ops-only mutate departments); `current_org_id()` session setup for non-standard clients; realtime / publication.

---

## 5. Migration risks

| Risk | Mitigation |
|------|------------|
| **Large `jobs` table** | `ADD COLUMN` nullable is cheap; partial index build is conditional on non-null rows only. |
| **Delete department with work units** | FK **RESTRICT** blocks the delete until work units are removed or moved; admin API should surface counts / 409. Deleting a work unit still sets `jobs.work_unit_id` **NULL** via FK on `work_units` delete. |
| **Orphan `org_id` on `work_units`** | RLS prevents visible inconsistent rows if department linkage is wrong; service role could still insert bad data—**API validation** required. |
| **Job / work unit org mismatch** | Not DB-enforced yet; document and fix in a follow-up migration or trigger. |

---

## 6. Open questions (deferred)

From [SYSTEM_IMPLEMENTATION_PLAN_V1 §2.5](./SYSTEM_IMPLEMENTATION_PLAN_V1.md) and product:

1. **`queue_definition` JSON shape** — versioned schema vs free-form until V2 list filters ship.
2. **`jobs.department_id` denormalization** — add only if reporting requires it without joins.
3. **Other record tables** — `schedules.work_unit_id`, `opportunities.work_unit_id`, etc., and whether schedule should inherit job’s work unit only in app logic.
4. **NOT NULL `jobs.work_unit_id`** — after default work unit + backfill.
5. **DB enforcement** — `jobs.org_id = work_units.org_id` when `work_unit_id` is set.
6. **Multi-work-unit membership** — M2M join table vs single FK (current = single FK).

---

## 7. Suggested backfill strategy (later; not in this migration)

1. **Per org:** insert one `departments` row (e.g. `key = 'default'`, `name = 'General'`).
2. **Per org:** insert one `work_units` row under that department (e.g. `key = 'inbox'`, `name = 'Inbox'`) with `queue_definition = {}`.
3. **Optional:** `UPDATE jobs SET work_unit_id = … WHERE org_id = … AND work_unit_id IS NULL` (batch by org).
4. **Verify** counts and spot-check `jobs.org_id` vs work unit’s `org_id` before any **NOT NULL** migration.

---

## 8. Apply locally / remote

```bash
# from repo root, when ready (operator action)
supabase db push
# or apply migration via your CI/CD pipeline
```

**Do not** consider this migration applied until it has run in each environment. After apply, regenerate Supabase types if your workflow requires them. Minimal **Admin V1** CRUD for departments and work units lives under `/admin/system/departments` and `/admin/system/work-units` (org-scoped APIs; no full runtime / job assignment in that pass).

---

*End of hierarchy schema v1.*
