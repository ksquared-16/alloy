# Schema reference guide

**Purpose:** Where **Supabase / PostgreSQL** truth lives for foundation work — **not** a full schema dump. Use this to navigate DDL without pasting entire baselines into context.

---

## Primary sources (in order of use)

| Source | What it is | When to open it |
|--------|------------|-----------------|
| **`supabase/baselines/prod_baseline.sql`** | Consolidated **public** schema snapshot (tables, FKs, RLS, indexes). | Default “what exists in prod-shaped env” reference. **Large file** — search by table name. |
| **`supabase/migrations/*.sql`** | Incremental changes after baseline. | Newer columns/tables (e.g. `field_section_definitions`, `is_visible_in_public_booking`) may exist only here until merged into baseline. |
| **`supabase/migrations/20260329165048_remote_schema.sql`** | Historical full remote capture (if present in repo). | Use if baseline lags; cross-check with latest migrations. |

**Rule of thumb:** If a column appears in **migrations** but not **baseline**, treat **migrations** as authoritative for local/dev until baseline is regenerated.

---

## By concern (tables / areas)

### Core entity model

- **Org:** `orgs`
- **Operational records:** `jobs`, `schedules`, `opportunities`, `customers`, `vendors`, `assignments`, etc. — search baseline for `CREATE TABLE`.
- **Locations:** `locations` (sites/addresses; **not** departments)

### Field definitions / custom fields

- **`field_definitions`** — org-scoped definitions, `entity_type`, `field_key`, visibility flags, `config` jsonb  
- **`field_values`** — values keyed by `field_definition_id` + `entity_id`  
- **`field_section_definitions`** — section labels/order for `section_key` (see migration `20260402140000_field_sections_public_visibility.sql`)

### Relationships / persons

- **`persons`** — canonical human row  
- **`contacts`** — legacy/compatibility; **`person_id`** FK where present  
- **`customer_persons`** — person ↔ customer roles (`role_type`, `is_primary`, …)  
- **`person_relationships`** — person ↔ person edges (`relationship_type`)  
- **`person_relationship_type_settings`**, **`customer_person_role_types`** — vocabulary governance (org/industry/vertical scoped patterns)  
- **Direct FKs:** e.g. `jobs.customer_id`, `jobs.location_id`, `jobs.primary_contact_id` (legacy path)

### Financial context

- **Payments / charges:** search baseline for `payments`, `charges`, `payment_allocations`, `discount_applications`, etc. (names evolve — grep `CREATE TABLE` in baseline + recent migrations)  
- **GL:** `gl_accounts`, `gl_journal_entries`, related mapping tables  
- **Resolver role:** financial **display** is composed in application layer from these tables — no single “financial_context” table

### Work units / departments / access

- **`departments`** — functional lane, `org_id`, `key`, `sort_order`, `metadata`  
- **`work_units`** — `department_id`, `org_id`, `queue_definition` jsonb, `metadata`  
- **`jobs.work_unit_id`** — nullable FK to `work_units`  
- **Access today:** `user_roles` (`user_id`, `org_id`, `role` text); **`user_profiles`** for legacy admin portal pattern — **not** full scope/capability model (see [deferred-decisions](../architecture/deferred-decisions.md))

---

## Records / resolver relevance

For **RRS**, the important schema buckets are:

1. **Native columns** on the primary entity table.  
2. **`field_definitions` / `field_values` / `field_section_definitions`** for custom data + section ordering.  
3. **Join targets** for FK labels (customer, location, person, work unit).  
4. **Financial** tables feeding computed/display fields.  
5. **No** single table defines “relationship groups” — groups are **resolver logic** over 2–4.

---

## Workspace / work unit relevance

- **Persistence:** `departments`, `work_units`, `jobs.work_unit_id`.  
- **Queues:** `work_units.queue_definition` (intended DSL holder; often `{}` until foundation defines v1).  
- **Membership / scope:** **not** fully modeled — see [implementation-gap-audit](../architecture/implementation-gap-audit.md).

---

## Identity / person model relevance

- **Canonical:** `persons`, `customer_persons`, `person_relationships`.  
- **Transition:** `contacts`, `primary_contact_id` on jobs/customers/opportunities — see [IDENTITY_MODEL_REFACTOR_AUDIT](./IDENTITY_MODEL_REFACTOR_AUDIT.md) for code references.

---

## Related docs

- [HIERARCHY_SCHEMA_V1.md](../implementation/HIERARCHY_SCHEMA_V1.md) — narrative for departments/work_units/job FK.  
- [implementation-gap-audit.md](../architecture/implementation-gap-audit.md) — gaps vs doctrine.  
- [glossary.md](../architecture/glossary.md) — terms vs table names.
