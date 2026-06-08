# Track A — Batch 1 implementation spec

**Status:** Build reference for the first implementation batch.  
**Parent plans:** [track-a-execution-plan.md](./track-a-execution-plan.md) · [foundation-implementation-plan.md](./foundation-implementation-plan.md)  
**Doctrine:** [architecture/README.md](../architecture/README.md) · [record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md) · [deferred-decisions.md](../architecture/deferred-decisions.md)  
**Schema truth:** [schema-reference-guide.md](../audits/schema-reference-guide.md) · `supabase/baselines/prod_baseline.sql`

**Framing:** This batch establishes **Record Resolver v0** — a **record-first** system with **pluggable entity handlers**. **`job`** is the **first** supported entity, not the architecture ceiling. No full UI V2 rollout in this batch; no doctrine changes unless a hard contradiction appears.

---

## A. Objective — what Batch 1 completes

Batch 1 finishes when the repo contains:

1. **DB integrity** — assigning a job to a work unit cannot violate org alignment (`jobs.org_id` = that work unit’s `org_id`).
2. **Overview config v0** — persistent storage for per-org, per-entity-type **record overview layouts** (fixed templates + ordered bands/fields only).
3. **Queue definition v1 scaffold** — documented minimal contract, **types + validation** in application code, and a **single interpretation path** (query intent or narrow Supabase filter builder), without a full DSL.
4. **Record Resolver v0 scaffold** — **shared contract** (input/output, versioning, surfaces, edit ownership, stub actions/signals), with **`job`** as the first **implemented** entity handler.

**Batch 1 does not require** new end-user UI. Admin may keep calling existing routes until a follow-up batch **wires** the resolver behind them.

---

## B. Exact artifacts Batch 1 should produce

| Artifact | Kind | Notes |
|----------|------|--------|
| **Migration: job ↔ work unit org integrity** | SQL (`supabase/migrations/`) | `BEFORE INSERT OR UPDATE` trigger on `public.jobs` |
| **Migration: `record_overview_layouts`** | SQL + RLS | Org-scoped table; unique `(org_id, entity_type)` for v0 |
| **Queue definition v1** | TypeScript (+ tests) | Zod (or equivalent) schema + `parseQueueDefinitionV1` / `safeParse` |
| **Queue intent builder** | TypeScript | e.g. `buildJobQueueIntent(orgId, queueDefinitionV1)` → structured filter/sort/limit for v0 |
| **RRS types + version constant** | TypeScript | `RRS_VERSION`, `RecordSurface`, `ResolveRecordInput`, `ResolvedRecordPayload` |
| **Resolver router** | TypeScript | `resolveRecord(ctx)` dispatches on `entity_type`; **throws or 400** for unsupported types |
| **Job resolver handler** | TypeScript | Implements job assembly + edit ownership + surfaces + persons-first order |
| **Optional: action manifest v0 types + in-memory default** | TypeScript | Table migration can be **Batch 1b** if you want zero new tables beyond overview + trigger |
| **Unit tests** | Vitest/Jest (repo standard) | QueueDefinition parse; trigger behavior if tested via SQL or integration |
| **This doc** | Markdown | Stays the batch contract |

---

## C. Integrity migration plan

### C.1 Approach

Add a **PostgreSQL trigger function** on **`public.jobs`**, fired **BEFORE INSERT OR UPDATE OF `org_id`, `work_unit_id`** (or `BEFORE INSERT OR UPDATE` for simplicity).

### C.2 Trigger vs CHECK

- **CHECK constraints** cannot reference **`work_units`** in PostgreSQL. A CHECK that tries to subquery another table is invalid for this use case.
- **Trigger** is the correct tool: when **`NEW.work_unit_id IS NOT NULL`**, `SELECT org_id FROM work_units WHERE id = NEW.work_unit_id` must equal **`NEW.org_id`**. If the work unit row is missing, treat as **failure** (FK normally prevents missing target; still handle NULL result explicitly).
- When **`work_unit_id IS NULL`**, no cross-table org check is required.

### C.3 Why this fits current schema

- Baseline already has **`jobs.work_unit_id`** → **`work_units.id`** FK (`jobs_work_unit_id_fkey`, `ON DELETE SET NULL`).
- Baseline already has **`jobs.org_id`** and **`work_units.org_id`** with RLS and comments that org should align; **application** has carried consistency — Batch 1 **closes the DB gap** called out in [implementation-gap-audit.md](../architecture/implementation-gap-audit.md) and [deferred-decisions.md](../architecture/deferred-decisions.md).

### C.4 Operational notes

- **Existing bad rows** (if any): `UPDATE jobs SET ...` will **fail** until data is corrected — plan a one-off data fix query before or with deploy.
- **Service role** bypass: align with existing RLS patterns (trigger applies to all writes including service role unless explicitly gated — usually **apply to all** for consistency).

---

## D. Overview config v0 design

### D.1 Storage recommendation

**Prefer a dedicated table `record_overview_layouts`** over stuffing JSON into `orgs.metadata`.

| Reason | |
|--------|--|
| Queryable by `org_id` + `entity_type` | Admin and resolver need fast reads |
| RLS parity | Same org-scoped pattern as `field_definitions`, `work_units` |
| Versioning | Column `layout_version` or integer `version` per row |
| Future optional dimensions | Add nullable `vertical_id` later without parsing a blob |

### D.2 Suggested columns (v0)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `org_id` | uuid NOT NULL | Tenant |
| `entity_type` | text NOT NULL | e.g. `jobs` (match `field_definitions.entity_type` conventions) |
| `template_key` | text NOT NULL | One of a **small fixed set** (e.g. `default`, `compact`) — enforced in app or CHECK |
| `config` | jsonb NOT NULL DEFAULT `{}` | Bands + ordered keys (see §D.3) |
| `version` | int NOT NULL DEFAULT 1 | Row revision |
| `created_at` / `updated_at` | timestamptz | Audit |

**Unique:** `UNIQUE (org_id, entity_type)` for v0 (one layout per entity type per org).

### D.3 Minimal `config` JSON schema (v0)

Document in code (Zod) and keep **strict but small**:

```typescript
// Conceptual — implement as Zod in repo
{
  "bands": [
    {
      "band_key": "summary" | "people" | "operational" | "financial" | "relationships",
      "enabled": boolean,
      "items": [
        { "kind": "system_field" | "custom_field" | "section", "key": string, "hint"?: { "span"?: 1|2|3 } }
      ]
    }
  ],
  "header_keys": string[]  // ordered keys for header strip (system field names or logical keys)
}
```

- **`band_key`** values are **enum-like strings** — not user-defined page structure.
- **`hint`** is optional and **limited** (e.g. column span only) — **no** freeform grid coordinates.

**Fallback:** If no row exists for `(org_id, entity_type)`, resolver uses a **code-defined default** layout for that entity (so UI never depends on seed data for dev).

### D.4 Explicitly out of scope

- Drag-and-drop page builder, arbitrary widget trees, per-user layouts.
- Replacing **`field_definitions` visibility flags** — registry remains source of which custom fields exist; overview config only **selects and orders** among allowed content.
- Per-record-type vertical overrides — **defer** unless you add nullable `vertical_id` in a later batch.

---

## E. Queue definition v1 design

### E.1 Minimal JSON structure (v1)

Stored in existing **`work_units.queue_definition`** (jsonb, default `{}`). Empty object means **“no interpreted queue”** until populated.

Proposed **v1** shape (extensible via optional keys and future `version: 2`):

```typescript
// Conceptual
{
  "version": 1,
  "entity_type": "job",           // logical enum: start with job only
  "filters": {
    "status_keys": string[],      // optional; match jobs.status_key semantic
    "job_status_ids": uuid[]      // optional; only if needed for legacy FK path — prefer status_keys long-term
  },
  "sort": {
    "by": "updated_at" | "created_at" | "scheduled_at",
    "direction": "asc" | "desc"
  },
  "limit": number                 // cap, e.g. max 500
}
```

### E.2 Required keys

When **`queue_definition` is non-empty** and intended to be interpreted:

- **`version`** must be **`1`** for v1 interpreter.
- **`entity_type`** must be present and supported (v0 interpreter: **`job`** only).

When **`queue_definition` is `{}`**, interpreter returns **“undefined / no queue”** — valid.

### E.3 Validation strategy

- **Application-layer** Zod schema: `QueueDefinitionV1` + `parseQueueDefinitionV1(unknown)`.
- **On write:** Admin API or internal mutation path validates **before** persisting to `work_units` (optional hardening).
- **On read:** Interpreter uses `safeParse`; invalid legacy JSON → **treat as `{}`** and optionally log (avoid breaking work unit loads).

**Do not** require PostgreSQL `CHECK (queue_definition <@ ...)` for v1 — too brittle for evolution.

### E.4 Server-side builder / interpreter approach

1. **`parseQueueDefinition(raw: unknown)`** → discriminated union: `Empty | QueueDefinitionV1`.
2. **`buildQueueQueryIntent(orgId, workUnitId, parsed)`** returns a **neutral struct**, e.g.:

   ```typescript
   type JobQueueIntent = {
     entity: "job";
     orgId: string;
     filters: { statusKeys?: string[]; jobStatusIds?: string[] };
     sort: { by: "updated_at" | "created_at" | "scheduled_at"; direction: "asc" | "desc" };
     limit: number;
   };
   ```

3. A thin **`applyJobQueueIntent(supabase, intent)`** (or inline in one caller) builds the actual `.from("jobs").select(...)` — **one place** only.

### E.5 Deferred (explicit)

- Multi-entity queues, cross-work-unit rollup, saved views, full filter DSL, M2M job ↔ work units ([deferred-decisions.md](../architecture/deferred-decisions.md)).
- **Queue row “preview payload”** shape unified with RRS — later batch.

---

## F. Record Resolver v0 design

### F.1 Top-level contract

**Single entry point** (name illustrative):

```typescript
resolveRecord(input: ResolveRecordInput, deps: ResolverDeps): Promise<ResolvedRecordPayload>
```

- **`ResolverDeps`** includes Supabase admin client (or narrow interface), and optionally loaders for overview layout / action manifest.

### F.2 Input shape (`ResolveRecordInput`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `org_id` | uuid | yes | Tenant |
| `entity_type` | string | yes | e.g. `jobs` — same string family as custom field `entity_type` |
| `entity_id` | uuid | yes | Primary key of row |
| `surface` | enum | yes | `drawer` \| `overview` \| `full` |
| `caller` | optional object | no | Future: user id, role flags — **stub in Batch 1** |

Unsupported `entity_type` → **clear error** (do not return ad hoc shapes).

### F.3 Output shape (`ResolvedRecordPayload`)

Top-level keys (v0):

| Section | Purpose |
|---------|---------|
| `meta` | `rrs_version`, `entity_type`, `entity_id`, `surface`, optional `resolved_at` |
| `record` | Normalized **system row** snapshot (job columns subset or full — document choice) |
| `fields` | Array of **field descriptors** (see §F.4) — primary path for overview/grid and edit ownership |
| `relationship_groups` | Named semantic bundles (v0: 1–2 groups for job) |
| `financial` | Nullable object — **display-only** rollups; reuse existing admin helpers |
| `overview_layout` | Resolved effective layout config used for `surface === "overview"` (from DB or default) |
| `actions` | Array from manifest, filtered by `surface` |
| `signals` | Array — **empty** in Batch 1 or placeholder objects |

**Versioning:** `meta.rrs_version` is a **string** (e.g. `"0.1.0"`) bumped when breaking output changes.

### F.4 Edit ownership metadata (per field descriptor)

Each item in `fields[]` (or nested by section) should include:

| Property | Meaning |
|----------|---------|
| `key` | Stable logical key (system column name or `custom:{field_definition_id}`) |
| `label` | Display label |
| `value` | JSON-serializable current value |
| `source` | `system` \| `custom` \| `computed` \| `relationship` |
| `editable` | boolean |
| `editable_entity` | e.g. `jobs`, `field_values` — **required when `editable`** |
| `editable_key` | Column name on that entity, or `field_definition_id` for custom |
| `provenance` | optional short string for UI (“Customer”, “Location”) |

**Rule:** No field is “editable” without **`editable_entity` + `editable_key`**. Computed-only fields: `editable: false`.

### F.5 Action metadata v0

| Field | Notes |
|-------|-------|
| `key` | Stable string |
| `label` | Human label |
| `surfaces_allowed` | `('queue' \| 'drawer' \| 'full_record')[]` |
| `requires_capability` | **null** in Batch 1 — placeholder for future ABAC |

**Source:** In-memory default map for `jobs` **or** tiny JSON/table in a follow-up if you need org overrides without redeploy.

### F.6 Signal metadata v0

| Field | Notes |
|-------|-------|
| `signals: []` | Empty array is acceptable for Batch 1 |
| Optional stub | `{ "key": "placeholder", "severity": "info", "message": null }[]` — only if needed for type completeness |

### F.7 How `job` fits as the first implementation

- **Handler module:** `resolveJobRecord(...)` (or `entityHandlers.jobs`) called from router when `entity_type === "jobs"`.
- **Implementation strategy:** **Lift and shift** logic from `web/app/api/admin/entity/[type]/[id]/route.ts` **jobs** branch into the handler, then **map** the existing `out` shape into **`ResolvedRecordPayload`** gradually — **do not** duplicate business rules long-term.
- **Surface handling:**
  - **`drawer`:** Smaller `fields` set + smaller `relationship_groups` + lighter `financial`.
  - **`overview`:** Apply **`record_overview_layouts`** to order/filter which field descriptors surface in overview-oriented subsection (or tag fields with `overview_rank`).
  - **`full`:** Superset for deep inspection; may still omit lazy children in v0 if documented.

### F.8 Stubbed for later entities

- Router returns **501 / typed error** for other `entity_type` values.
- **No** generic SQL introspection resolver in Batch 1.
- **No** required action manifest persistence (optional table deferred).

---

## G. Job-first slice details

### G.1 Tables involved (read path, v0)

| Table / area | Role |
|--------------|------|
| `jobs` | Primary record |
| `work_units`, `departments` | Routing labels (via `attachJobWorkUnitDisplay` logic) |
| `customers`, `locations` | FK display stubs |
| `persons`, `customer_persons`, `contacts` | Persons-first + fallback |
| `opportunities` | Optional name for `opportunity_id` |
| `verticals` | Slug/name for `vertical_id` |
| `job_statuses`, status definition helpers | `_status_display` |
| `schedules` | Next schedule (existing branch) |
| `cleaning_job_details` | Vertical-specific service fields (existing — keep behind same guards as today) |
| `field_definitions`, `field_values`, `field_section_definitions` | Custom fields |
| `discount_programs`, option sets | Existing display helpers |
| Line items | `fetchActiveJobLineItemsForAdmin` (full surface primarily) |

### G.2 Direct relationships used

- `jobs.customer_id` → `customers`
- `jobs.location_id` → `locations`
- `jobs.work_unit_id` → `work_units` → `departments`
- `jobs.primary_person_id` → `persons`
- `jobs.primary_contact_id` → `contacts` → optional `persons` via `contacts.person_id`
- `jobs.assigned_vendor_id` → `vendors` (+ person stub as today)
- `jobs.opportunity_id` → `opportunities`

### G.3 Custom field path

- Reuse **`attachFieldDefinitionsAndValues`** and registry queries — map results into **`fields[]`** with `source: "custom"`, `editable_entity: "field_values"`, `editable_key: <field_definition_id>`.

### G.4 Person resolution path (canonical order for Batch 1)

Align with [track-a-execution-plan.md](./track-a-execution-plan.md) — **replace** the route’s current **primary_person → else contact**-only ordering where it skips **`customer_persons`**.

1. If **`jobs.primary_person_id`** set → load `persons` (org-scoped).
2. Else resolve via **`customer_persons`** for **`jobs.customer_id`** (prefer primary / primary-contact role type when data exists) → `persons`.
3. Else **`jobs.primary_contact_id`** → `contacts` → optional `persons` via `contacts.person_id`.

Expose result as **`relationship_groups`** entry (e.g. `primary_customer_contact`) **and** mirror key header fields for backward compatibility if the route still returns a flat object during strangler phase.

### G.5 Financial context path

- **Preserve** existing money/display logic (`computeJobDisplayTotalCents`, discount normalization, line items, etc.).
- **Do not** add new payment tables or multi-payer models.
- If payment rollups are not currently attached on the jobs GET, Batch 1 **need not** add them unless needed for overview **financial** band — **optional** use of `getPaymentAllocationRollup` only when wiring `financial` section (import already exists on route file for payments entity).

### G.6 Overview fields likely included first

High-signal, industry-agnostic cluster:

- **Header:** job number/title, status display, customer name, primary person name, work unit label.
- **Summary band:** key dates (`scheduled_at`, `completed_at`), service frequency / next schedule if present, location label.
- **Financial band (if enabled):** display total, discount applied flag — deepen later.

(Exact keys should follow `config` ordering once `record_overview_layouts` is seeded or defaulted.)

### G.7 What **not** to solve yet

- Unifying **queue row** JSON with resolver payload.
- **work_unit_members** / queue visibility by membership.
- **Vendor persons**, **M2M work units**, **capabilities**.
- **Removing `contacts`** or blocking writes to them.
- **Opportunity / schedule** as full RRS entities.

---

## H. Build sequence (Batch 1)

1. **Migration:** `jobs` org ↔ `work_units` org **trigger** + function; verify on staging with sample bad row fix.
2. **Migration:** **`record_overview_layouts`** + **RLS** policies (mirror `work_units` org patterns: `current_org_id()`).
3. **Code:** Zod schemas — **`OverviewLayoutConfigV0`**, **`QueueDefinitionV1`**, **`ResolvedRecordPayload`** types + `RRS_VERSION`.
4. **Code:** `parseQueueDefinitionV1` + `buildJobQueueIntent` + tests.
5. **Code:** Resolver **router** + **`resolveJobRecord`** skeleton returning minimal valid payload (meta + a few fields).
6. **Code:** Fill job handler by **extracting** from `entity/.../route.ts` jobs branch; attach **edit ownership** on `fields[]`.
7. **Code:** Implement **person resolution order** (customer_persons step).
8. **Code:** Wire **overview_layout** read + defaults for `surface === "overview"`.
9. **Code:** **Strangler:** `GET` jobs in `web/app/api/admin/entity/[type]/[id]/route.ts` calls resolver (optional query param `?rrs=1` for parallel run) — **or** defer wire to Batch 2 if this batch is schema + modules only; **document choice** in PR.
10. **Tests:** Golden snapshot or selective assertions on `resolveJobRecord` for one fixture org.

---

## I. Risks / decisions needing explicit confirmation

| Topic | Question |
|-------|----------|
| **`entity_type` string** | Confirm **`jobs`** (plural) matches all consumers (`field_definitions.entity_type`, admin routes) — use **same convention everywhere**. |
| **Strangler flag** | Ship resolver behind **`?rrs=1`** or internal route first to avoid breaking Admin UI that expects flat `_prefixed` keys? |
| **Cleaning-specific joins** | Keep `cleaning_job_details` inside job handler **as today** until vertical plugins exist — confirm no attempt to generalize in Batch 1. |
| **Action manifest storage** | In-memory only for Batch 1 vs small `entity_action_manifests` table — product/ops need org-editable actions? |
| **Bad job/work unit data** | Run a **preflight SQL** in deploy playbook to list offending rows before trigger enable. |

---

## J. Explicit non-goals (Batch 1)

- Full generalized page layout engine; multi-entity resolver completion; **work_unit_members** unless a hard dependency appears; full capability/ABAC; deleting **contacts**; multi-payer financial redesign; full enterprise action registry — **thin manifest only**.

---

## K. Related documents

- [track-a-execution-plan.md](./track-a-execution-plan.md)
- [implementation-gap-audit.md](../architecture/implementation-gap-audit.md)
- [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md)
- [workspace-work-unit-scope-doctrine.md](../architecture/workspace-work-unit-scope-doctrine.md)

---

## L. Change log

| Date | Notes |
|------|--------|
| 2026-04-08 | Initial Batch 1 implementation spec. |
