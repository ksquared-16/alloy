# Implementation gap audit — doctrine vs repo reality

**Status:** Living document. **Doctrine** lives alongside this file in `docs/architecture/`. **Evidence** is drawn from `supabase/baselines/prod_baseline.sql`, recent migrations under `supabase/migrations/`, and representative web/admin code paths (as of audit date).

**Terminology:** [glossary.md](./glossary.md) · **Schema map:** [schema-reference-guide.md](../audits/schema-reference-guide.md) · **Deferrals:** [deferred-decisions.md](./deferred-decisions.md)

---

## 1. What already aligns

### 1.1 Org → department → work unit → record (partial)

- **`departments`** and **`work_units`** exist with org scope, stable keys, sort order, soft-active flags, and `metadata` / `queue_definition` JSON extension points (`prod_baseline.sql`).
- **`jobs.work_unit_id`** exists (nullable FK → `work_units`), with partial index — matches “jobs as first operational anchor” from [HIERARCHY_SCHEMA_V1.md](../implementation/HIERARCHY_SCHEMA_V1.md).
- **RLS** is enabled on departments/work units with org-scoped authenticated policies (baseline).

### 1.2 Locations vs departments

- **`locations`** are modeled as **sites/addresses** with `org_id`, optional `customer_id` / `vendor_id`, and geographic fields — **not** conflated with `departments` in schema.

### 1.3 Persons-first storage (in progress)

- **`persons`** table is present and is the intended canonical human row.
- **`contacts.person_id`** FK links legacy contacts to persons.
- **`customer_persons`** links persons to customers with `role_type`, `is_primary`, dates, `metadata`.
- **`person_relationships`** models person↔person edges with typed `relationship_type`.
- **Governance tables** exist for relationship and role vocabulary (e.g. `person_relationship_type_settings`, `customer_person_role_types` with org/industry/vertical scoping patterns in baseline indexes).

### 1.4 Field registry & sections (custom data + presentation hints)

- **`field_definitions`** / **`field_values`** — org-scoped custom fields with visibility toggles (form, drawer, table, filter, sort) and `config` JSON.
- **`field_section_definitions`** — org-scoped section labels/order for `section_key` (migration `20260402140000_field_sections_public_visibility.sql`).
- **`is_visible_in_public_booking`** on field definitions gates public exposure.

### 1.5 Resolver-shaped admin payloads (incremental, not unified)

- `web/app/api/admin/entity/[type]/[id]/route.ts` composes rows with helpers such as `attachFieldDefinitionsAndValues`, `attachDirectFkRelationshipDisplays`, `attachJobWorkUnitDisplay`, payment rollups, etc. This is **early RRS-style composition** but **per-route** rather than one declared resolver service.

### 1.6 Direct operational FKs

- **`job.customer_id`**, **`job.location_id`**, **`schedule.job_id`**, and related patterns exist as **direct edges** — consistent with layered relationship doctrine.

### 1.7 Financial primitives

- GL tables (`gl_accounts`, journal entries), payments/charges migrations, and admin job pricing helpers support **material financial context** in record payloads where implemented.

---

## 2. What is missing (relative to doctrine)

### 2.1 Unified Record Rendering System (backend)

- **Gap:** No single **versioned resolver contract** (per entity type + surface) that always returns the same payload shape for overview / drawer / full record.
- **Today:** Logic spreads across `entity/[type]/[id]`, `related/*`, drawer attach helpers, and presentation config.
- **Need:** Targeted extraction into a **cohesive resolver layer** with explicit **edit ownership** metadata for each field (per [record-rendering-system-spec.md](./record-rendering-system-spec.md)).

### 2.2 Overview layout config storage

- **Gap:** No first-class **overview layout** table or JSON schema for “header / summary grid / bands” as described in [overview-layout-doctrine.md](./overview-layout-doctrine.md).
- **Today:** Drawer/overview behavior leans on `field_definitions`, `field_section_definitions`, and UI code (`EntityDrawerOverview`, entity presentation registry).
- **Need:** Small, explicit config (per org + entity type, optional vertical) that **selects sections** and supplies **layout hints** without a page builder.

### 2.3 Scope model (data)

- **Gap:** No **`user_scope`**, **location allow-lists**, or **capability** tables beyond coarse patterns.
- **Today:** `user_roles` = `(user_id, org_id, role text)`; `user_profiles` for legacy admin role; RLS often “same org + role in set.”
- **Need (incremental):** Define minimal **scope** representation (e.g. location sets, department visibility, work-unit membership) **before** overbuilding RBAC.

### 2.4 Work unit membership & queue projection

- **Gap:** No **`user_work_units`** / **`work_unit_members`** (or equivalent) for “who executes here.”
- **Gap:** `work_units.queue_definition` is **`{}` in practice**; no shared interpreter documented or enforced as DSL.
- **Need:** Documented **queue_definition** schema version + server-side projection that powers work-unit queues without duplicating filter logic in clients.

### 2.5 Multi–work-unit attachment per record

- **Gap:** **`jobs.work_unit_id`** is a **single** nullable FK — insufficient if doctrine requires **multiple work units** per record without abusing JSON.
- **Options (targeted):** M2M join `job_work_units` (or generic `record_work_units` with entity discriminator) **when** product requires simultaneous membership; until then, document **single primary work unit** as interim model.

### 2.6 Action placement configuration

- **Gap:** No org-scoped **action manifest** describing which actions appear on **queue vs drawer vs full record** for a given entity/context.
- **Today:** Actions scattered across workflow actions, UI blocks, and admin patterns.
- **Need:** Central **action definitions** with **surface flags** (even if v1 is JSON in `work_units.metadata` or a small table).

### 2.7 Persons-first API completion

- **Gap:** Many flows still **read/write `primary_contact_id`**, `contacts` CRUD, and booking resolvers keyed on contacts ([IDENTITY_MODEL_REFACTOR_AUDIT.md](../audits/IDENTITY_MODEL_REFACTOR_AUDIT.md) remains accurate).
- **Need:** Milestone plan: dual-write or migrate to **`customer_persons` + persons** for primary identity; deprecate new features on `contacts` **in product**, not necessarily drop table yet.

### 2.8 Vendor ↔ person parity

- **Gap:** No symmetric **`vendor_persons`** (or equivalent) in baseline; vendor links remain **contact-centric** (`vendor_contacts`, `primary_contact_id`).

---

## 3. Incomplete or ambiguous

| Topic | Why ambiguous |
|--------|----------------|
| **`queue_definition` JSON** | Reserved but no versioned schema; risk of ad hoc keys per vertical. |
| **`jobs.org_id` vs `work_units.org_id`** | HIERARCHY doc notes missing DB enforcement for org match on FK — still true until trigger/check added. |
| **Department on job** | `jobs.department_id` was discussed, not required — department is derivable via work unit; reporting may later want denormalization. |
| **Other entities’ `work_unit_id`** | Implementation plan suggested `schedules`, `opportunities`; **not** present in baseline excerpt — confirm before relying on them. |
| **Relationship groups** | UI/config does not yet declare **named semantic groups** independent of table joins; resolver helpers are ad hoc. |
| **`field_definitions.is_visible_in_*`** | Tuned for drawer/table/form/public — **overview** specificity not explicit. |

---

## 4. Recommended next backend / config changes (ordered, targeted)

1. **Resolver consolidation (thin slice)** — Pick one entity (e.g. `job`): define a **stable JSON shape** for drawer + overview consumers; move assembly from `entity/[type]/[id]` into a dedicated module with tests. Add **`editable_entity` + `editable_key`** metadata for each field in the overview/grid.

2. **Overview config v0** — Add org + entity_type keyed **`record_overview_layouts`** (or `org_ui_config` JSON with version key) storing: enabled bands, ordered field keys / section keys, layout template id. Renderer reads **only** allowed templates.

3. **`queue_definition` schema v1** — Document and validate (Zod/JSON Schema) minimal structure: `entity_type`, filter keys referencing **status_definitions** / semantic keys, sort, limit. One server function builds queue queries from it.

4. **Scope v0** — Extend **`user_roles`** with optional `metadata` JSON **or** add `user_org_scopes` with `locations[]` / `department_ids[]` **only if** product needs it in next quarter; otherwise **document** current “org-wide admin/ops” as intentional limit.

5. **Work unit membership v0** — If execution surfaces ship: add **`work_unit_members`** (user_id, work_unit_id, role_key) + RLS; tie queue visibility to membership.

6. **Integrity migration** — Add constraint/trigger for **`jobs.org_id` = work unit’s org** when `work_unit_id` is set.

7. **Persons migration tranche** — For new surfaces, resolve **primary person** via `customer_persons` + `persons`; keep `primary_contact_id` populated for legacy until cutover.

**Leave alone for now**

- Replacing `contacts` table outright.
- Building a general page builder.
- Full capability-based ABAC before scope v0 exists.
- Forcing **all** relationship types into `person_relationships` (keep layered model).

---

## 5. Doc / migration hygiene notes

- [HIERARCHY_SCHEMA_V1.md](../implementation/HIERARCHY_SCHEMA_V1.md) references `supabase/migrations/20260325120000_hierarchy_departments_work_units.sql`; that filename **may not exist** in `supabase/migrations/` if history was squashed into `20260329165048_remote_schema.sql`. **Treat baseline as source of truth** for what shipped.

---

## 6. Change log

| Date | Author | Notes |
|------|--------|-------|
| 2026-04-07 | Architecture pass | Initial doctrine vs baseline audit; cross-links to glossary, deferred-decisions, schema-reference-guide. |
