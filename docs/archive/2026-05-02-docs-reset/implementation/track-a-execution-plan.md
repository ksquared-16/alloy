# Track A — execution plan (concrete)

**Purpose:** Bridge from [canonical doctrine](../architecture/README.md) and the [foundation implementation plan](./foundation-implementation-plan.md) into **ordered, implementation-ready work** — without reopening settled doctrine, without UI V2 rollout scope, and without building explicitly [deferred](../architecture/deferred-decisions.md) features.

**Evidence:** [implementation-gap-audit.md](../architecture/implementation-gap-audit.md) · [schema-reference-guide.md](../audits/schema-reference-guide.md) · `supabase/baselines/prod_baseline.sql` · `supabase/migrations/`.

**Batch 1 build spec:** [track-a-batch-1.md](./track-a-batch-1.md).

**Principles for this track**

- **Industry-agnostic** language and abstractions.
- **`persons` canonical** for human identity on new paths; **`contacts`** remain for compatibility (no deletion in Track A).
- **Current financial data model stays** unless the first slice proves a concrete blocker (display composition only in resolver).
- **Targeted schema/config** — prefer small tables, documented JSON, and app-layer validation where PostgreSQL cannot express the rule cheaply.

---

## A. Track A objective

**Track A is complete** when all of the following are true:

1. **Job** is the first **thin slice** with a **versioned, resolver-shaped payload** consumable by **drawer** and **overview** paths (same contract family, surface-specific depth allowed).
2. Every field exposed as editable in that payload carries explicit **edit ownership** metadata (which table/entity and key mutate on save — no silent cross-entity PATCH).
3. **Overview** selection for job is driven by **stored layout config** (header / summary grid / optional bands — fixed templates only, per [overview-layout-doctrine](../architecture/overview-layout-doctrine.md)).
4. **`work_units.queue_definition`** has a **documented v1 shape** and a **single server-side builder/validator** (even if minimal filters at first).
5. **Integrity:** **`jobs.org_id`** matches the **`work_units.org_id`** of **`jobs.work_unit_id`** when the FK is set (DB-enforced).
6. **Identity read path:** Job payload resolves **primary customer-facing person** via **`persons` + `customer_persons`** when data exists, with **documented fallback** to **`primary_contact_id` → `contacts`** (and use of **`jobs.primary_person_id`** when populated — see baseline).

UI V1 / Admin shells may **consume** these contracts incrementally; **shipping a full UI V2 workspace is out of scope** for Track A.

---

## B. Exact scope for Track A (workstreams)

### B.1 Resolver foundation

- Extract **job** payload assembly from the monolithic admin route (`web/app/api/admin/entity/[type]/[id]/route.ts` and related attach helpers) into a **dedicated resolver module** (single place for composition).
- Emit a **stable JSON shape** with explicit top-level or nested sections aligned to [RRS doctrine](../architecture/record-rendering-system-spec.md): base/system fields, custom fields (`field_definitions` / `field_values`), relationship labels, optional financial context, **semantic relationship groups** (even if v0 is one or two named groups), **actions** (stub list ok), **signals** (stub ok).
- Attach **`rrs_version`** (string or small integer) on the payload for forward compatibility.
- **Tests:** golden fixture(s) for at least one org/job shape (prevents drift).

### B.2 Overview config storage

- Add **first-class storage** for overview layout: e.g. **`record_overview_layouts`** (recommended) keyed by **`org_id` + `entity_type`** (+ optional `vertical_id` or `metadata` for future), **or** a versioned JSON blob on a small **`org_ui_config`**-style table.
- Store only what doctrine requires: **template id** (fixed enum of allowed templates), **enabled bands**, **ordered keys** (system field keys, custom `field_key`, and/or section keys), optional **layout hints** (column span, band grouping — no page builder).
- **Reader** in resolver path: merge layout config with payload sections; default/fallback when row missing.

### B.3 Queue / work-unit foundation

- **Document** `queue_definition` **v1** (JSON Schema or Zod in repo); validate on write (admin API) and before interpreting.
- **Minimal interpreter:** one server function that, given `work_unit_id`, reads `work_units.queue_definition` and returns a **structured query intent** (e.g. entity_type = `job`, filter on `status_key` / status id, sort, limit) — actual SQL can be narrow for v1.
- **Defer** universal DSL, cross-entity queue engine, and **M2M job ↔ work units** unless product pulls them in ([deferred-decisions](../architecture/deferred-decisions.md)).

### B.4 Scope / access foundation

- **Track A default:** **org-wide authenticated admin** assumption remains; **no full ABAC** ([deferred-decisions](../architecture/deferred-decisions.md)).
- **Optional v0 only if** execution surfaces ship in the same train: add **`work_unit_members`** (`user_id`, `work_unit_id`, `role_key`, timestamps) + **RLS** aligned with `work_units.org_id`.
- **Scope storage:** If product needs location/department subsets **this quarter**, add **`user_roles.metadata` jsonb** *or* a thin **`user_org_scopes`** table — **otherwise explicitly defer** and document “org-wide ops” as intentional (see §migration ladder).

### B.5 Identity read-path cleanup (job slice)

- Resolver **primary person** resolution order (document in code + this plan):
  1. **`jobs.primary_person_id`** → `persons` (if non-null and org-safe).
  2. Else **`customer_persons`** (+ `persons`) for **`job.customer_id`**, prefer **`is_primary`** / primary-contact role type where seeded.
  3. Else **`jobs.primary_contact_id`** → **`contacts`** (+ `person_id` → `persons` when present).
- **No** requirement to remove **`contacts`** or stop legacy writes elsewhere in Track A.

### B.6 Action placement / config

- Introduce **action manifest v0**: mapping **action_key** → `{ label, surfaces: ('queue'|'drawer'|'full_record')[], ... }` per **entity_type** (org-scoped).
- **Storage:** small table **`entity_action_manifests`** or JSON in **`orgs.metadata` / dedicated `org_ui_config`** — prefer a table if multiple rows per org/entity are expected.
- **v0 actions** can be **stubs** (keys only); real workflow hooks wire incrementally.

### B.7 Integrity guards

- **Trigger (recommended)** on `jobs` **BEFORE INSERT OR UPDATE**: when **`work_unit_id` IS NOT NULL**, require **`org_id`** equals `(SELECT org_id FROM work_units WHERE id = work_unit_id)` — PostgreSQL **CHECK** cannot reference `work_units`, so **do not rely on CHECK alone**.
- Resolver / APIs must **not** imply multi-entity saves without **explicit** multi-write contracts ([RRS](../architecture/record-rendering-system-spec.md)).

---

## C. First thin slice — **job**

### C.1 Confirmation

**First slice entity: `job`** — aligns with existing **`jobs.work_unit_id`**, schedules/financial adjacency, and person resolution via **`job.customer_id`**.

### C.2 Tables / entities involved (read path)

| Area | Tables / views (baseline-backed) |
|------|----------------------------------|
| Core record | **`jobs`** (`org_id`, `customer_id`, `location_id`, `work_unit_id`, `primary_contact_id`, `primary_person_id`, status fields, money fields, `metadata`, …) |
| Hierarchy | **`work_units`**, **`departments`** (labels for routing context) |
| Custom fields | **`field_definitions`**, **`field_values`**, **`field_section_definitions`** |
| Customer / site | **`customers`**, **`locations`** |
| People | **`persons`**, **`customer_persons`**, **`contacts`** (fallback) |
| Financial display (as today) | Existing payment/charge/rollup queries used by admin (e.g. allocation rollups) — **no new billing model** |
| Optional | **`assignments`**, **`schedules`** — only if slice explicitly includes those summary fields |

### C.3 Payload(s) for v0

- **One resolver contract** with required param **`surface`**: `'drawer' | 'overview' | 'full'` (names can match existing UI routes).
- **Shared core:** identity header fields, edit-ownership metadata for each mutable field, work unit summary, primary person group, customer/location stubs, custom field blocks.
- **Surface rules:**
  - **`drawer`:** subset + smaller relationship/financial blocks.
  - **`overview`:** sections filtered/ordered by **`record_overview_layouts`** (or equivalent).
  - **`full`:** superset for deep inspection (may omit progressive-loaded children initially if documented).
- **Versioning:** `rrs_version` on every response.

### C.4 Schema/config prerequisites (before or with first consumer)

1. Migration: **job ↔ work unit org integrity trigger** (§B.7).
2. Migration: **`record_overview_layouts`** (or chosen config table) with nullable/empty defaults.
3. **Code artifact:** `queue_definition` **v1** spec + validator (stored values may still be `{}` for many rows).
4. **Code artifact:** action manifest v0 **shape** + storage row(s) or seeded JSON (can be empty list).

### C.5 Stubbed or deferred (explicit)

- **Signals / SLA / activity streams:** empty arrays or omitted section; no new tables required for v0.
- **Full relationship group catalog:** start with 1–2 groups (e.g. primary person, customer summary); expand later.
- **Queue row preview payload:** not required to equal full record; optional alignment later.
- **`vendor_persons`**, **M2M `job_work_units`**, **user scope arrays**, **capabilities**: deferred per [deferred-decisions](../architecture/deferred-decisions.md).
- **Deleting `contacts`:** explicitly out of scope.

---

## D. Supabase / schema changes (first)

### D.1 Migrations needed immediately (before or parallel to resolver extraction)

| Change | Why | Notes |
|--------|-----|--------|
| **`jobs` / `work_units` org consistency** | Closes cross-tenant routing risk | **Trigger** on `jobs` (see §B.7); backfill not usually needed — fails bad rows on next update unless cleaned |
| **`record_overview_layouts`** (or equivalent) | Overview doctrine requires config storage | Columns: `id`, `org_id`, `entity_type`, `template_key`, `config` jsonb, `version`, timestamps; RLS org-scoped; unique `(org_id, entity_type)` or include `vertical_id` if needed later |

### D.2 Config / JSON storage needed immediately

| Storage | Content |
|---------|---------|
| **`record_overview_layouts.config`** (jsonb) | Bands, ordered keys, layout hints |
| **`work_units.queue_definition`** | Populated only as needed; **validator** enforces v1 subset |
| **Action manifest v0** | New small table or org-level JSON |

### D.3 Constraints / checks needed immediately

- **Trigger** for `jobs` vs `work_units` **org_id** (see above).
- **Optional:** `CHECK` on `record_overview_layouts.template_key` **IN** allowed template enum (if small fixed set).

### D.4 Schema work that should **wait**

| Wait for | Reason |
|----------|--------|
| **`job_work_units` M2M** | Deferred until simultaneous multi–work-unit membership is a product requirement |
| **`vendor_persons`** | Deferred ([deferred-decisions](../architecture/deferred-decisions.md)) |
| **`user_org_scopes` / capability tables** | Defer until scope story is product-required |
| **Rich `queue_definition` DSL** | Evolve after one entity + one interpreter path proves shape |
| **Enforcing JSON Schema for `queue_definition` in PostgreSQL** | Prefer app validation first |

---

## E. Backend contract work (first)

### E.1 Resolver module

- **New module** (e.g. under `web/lib/admin/rrs/` or `web/lib/rrs/`) exporting **`resolveJobRecord({ orgId, jobId, surface, ... })`** returning the versioned payload.
- **Refactor** `entity/[type]/[id]` for **`type === 'jobs'`** to call this module (strangler pattern — other entity types unchanged in Track A).

### E.2 Payload shape level for v0

- **Documented TypeScript types** (or Zod) checked in tests.
- Minimum sections: **`meta`** (`rrs_version`, `entity_type`, `entity_id`, `surface`), **`fields`** (array or record map each with **`value`, `editable`, `editable_entity`, `editable_key`**, `source`), **`sections`** (optional grouping), **`relationship_groups`**, **`financial`** (nullable object), **`actions`**, **`signals`**.

### E.3 Drawer vs overview: one payload family?

**Yes — one contract family, one resolver entry, `surface` parameter.**  
Differences are **depth and which sections layout config enables**, not divergent ad hoc types per route.

### E.4 Edit ownership metadata (required for v0)

For every user-editable value exposed:

- **`editable`**: boolean (or enum including `read_only` / `system`).
- **`editable_entity`**: logical table name (e.g. `jobs`, `field_values`).
- **`editable_key`**: column or `field_definition_id`-backed key for custom fields.
- Multi-entity forms **must** map to **multiple explicit writes** in API design (stub endpoints acceptable if returns are read-only until wired).

### E.5 Action metadata for v0

- **`actions[]`**: `{ key, label?, surfaces_allowed[], requires_capability?: null }`** — capabilities nullable/deferred.
- Manifest drives which keys appear for which `surface`.

### E.6 Deferrable backend work

- Non-job entities using RRS shape.
- Progressive loading / caching policy.
- Full signal computation pipeline.
- Cross-surface **queue** payload unification.

---

## F. Recommended build order (practical)

1. **Migration:** `jobs` ↔ `work_units` **org integrity trigger** (small, immediate risk reduction).
2. **Spec in repo:** `queue_definition` **v1** TypeScript/Zod types + short markdown fragment (link from this doc); **validator function** + unit tests.
3. **Migration:** **`record_overview_layouts`** (+ RLS policies mirroring org-scoped patterns from `work_units` / `field_definitions`).
4. **Resolver module:** extract **job** composition from `entity/[type]/[id]`; add **`rrs_version`** + **edit ownership**; add **person read path** (§B.5).
5. **Wire consumers:** admin **drawer** and **overview** for **job only** to use resolver output (feature flag acceptable if needed).
6. **Overview config reader:** load layout row; apply **fixed template** mapping to payload sections.
7. **Queue builder v0:** read `queue_definition`, build narrow job query for one work unit; **admin-only** or internal API first.
8. **Action manifest v0:** storage + filter `actions` in payload by `surface`.
9. **If needed for same release train:** **`work_unit_members`** + RLS; else **skip** and document org-wide assumption.
10. **Golden tests** for resolver payloads after each significant change.

---

## G. Risks / dependencies

| Item | Risk if skipped | Dependency / mitigation |
|------|-----------------|-------------------------|
| **Single resolver contract** | Drawer vs overview diverge; UI V2 rework | Strangler refactor from day one |
| **Edit ownership** | Wrong-table updates from merged forms | Enforce in types + API review |
| **`queue_definition` v1 doc + validator** | Unmigratable ad hoc JSON | Ship validator before bulk authoring |
| **Org/work unit integrity** | Bad data from integrations | Trigger + monitor failed updates |
| **Persons read path** only on new code | Doctrine stalls on `contacts` | Explicit resolution order + tests |
| **Product call: work unit membership** | Either over-build RLS or under-ship execution UX | Flag **work_unit_members** as release-gated |
| **Feature flags** | Safe rollout | Flag new resolver path + overview config per org if needed |

---

## H. Migration & config proposal ladder

### H.1 Required now (before first slice is “done”)

- **`jobs` / `work_units` org integrity** (trigger).
- **`record_overview_layouts`** (or equivalent org+entity_type keyed config).
- **`queue_definition` v1** specification + **runtime validation** (app layer).
- **Resolver module** + **types/tests** for job payload.
- **Action manifest v0** storage **shape** + at least empty default for job.

### H.2 Soon after (important, not blocking first resolver slice)

- **`work_unit_members`** + RLS if execution/queue UX is in the same train.
- **Golden payload regression tests** in CI.
- **`user_roles.metadata` jsonb** or **`user_org_scopes`** if product confirms subset access this quarter.
- Expand **relationship_groups** and **financial** blocks with documented boundaries (still industry-agnostic).

### H.3 Later (safe to defer)

- M2M **`job_work_units`**.
- Full **capability / ABAC** model.
- **Vendor ↔ person** parity.
- **AI-driven** layout or queue tuning.
- **Contacts** removal / hard deprecation.
- Universal **queue DSL** across all entity types.
- **Billing account** abstraction / multi-payer models.

---

## I. Explicitly **not** part of Track A

- **Full UI V2 workspace rollout** or new shell as a deliverable.
- **Multi-payer / split financial responsibility** models ([deferred-decisions](../architecture/deferred-decisions.md)).
- **Full ABAC / capability system** (beyond nullable placeholders in action metadata).
- **M2M work-unit membership** for jobs **unless** product elevates it from deferred — baseline remains **single `jobs.work_unit_id`**.
- **`vendor_persons` / vendor–person parity** unless a job-slice requirement appears (not assumed).
- **AI-driven layout tuning** or automated queue optimization.
- **Deletion of `contacts`** or hard migration off `primary_contact_id` everywhere.
- **General page builder** or arbitrary grid overview layouts.
- **Employee/staff ↔ app user** roster product (deferred).
- Replacing **GL / charges / payments** architecture (financial **display** composition only).

---

## J. Related documents

- [foundation-implementation-plan.md](./foundation-implementation-plan.md) — strategic bridge (this doc is the **execution** detail).
- [implementation-gap-audit.md](../architecture/implementation-gap-audit.md) — living doctrine vs reality.
- [schema-reference-guide.md](../audits/schema-reference-guide.md) — where DDL lives.
- [record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md), [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md), [workspace-work-unit-scope-doctrine.md](../architecture/workspace-work-unit-scope-doctrine.md).

---

## K. Change log

| Date | Notes |
|------|--------|
| 2026-04-08 | Initial Track A execution plan from doctrine + baseline evidence. |
