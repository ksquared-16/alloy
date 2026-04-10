# Configuration model — spec

**Purpose:** Entities, relationships, DB vs code split, and **current repo inventory**. Complements [configuration-doctrine.md](./configuration-doctrine.md).

**Not:** UI design · **Not:** AI implementation

---

## 1. Configurable entities (logical)

| Domain | Entities | Scope notes |
|--------|----------|-------------|
| **Custom data** | `field_definitions`, `field_values`, `field_section_definitions` | **Org-scoped** — primary tenant differentiation for record fields. |
| **Status vocabulary** | `status_definitions` (per `entity_type`, org or industry fallback) | **Org** can override labels/keys within code-enforced allowed keys. |
| **Work hierarchy** | `departments`, `work_units` | **Org-scoped** — keys stable within org; `queue_definition` JSON reserved for queue DSL. |
| **Record presentation** | `record_layouts`, `record_actions` | **Currently global** (no `org_id`) — unique `(entity_type, key)` / `(entity_type, action_key)`; seeds in migration `20260409140000_record_layouts_and_record_actions.sql`. |
| **Documents** | `document_field_definitions` | **Org-scoped** doc types. |
| **Visual / workspace (future wiring)** | `departments.metadata`, `work_units.metadata` | JSON extension points for **hints** (e.g. `visual_context_key`) — must map to **registered** semantic keys in code. |

---

## 2. Relationships (conceptual)

```
org
 ├── field_definitions / field_section_definitions / field_values (entity_type, entity_id)
 ├── departments
 │    └── work_units (queue_definition, metadata)
 ├── status_definitions (entity_type)
 └── document_field_definitions (doc_type)

global (current)
 ├── record_layouts (entity_type, key) → config_json
 └── record_actions (entity_type, action_key) → event_key, placement
```

**RRS / resolver** sits **above** raw tables but **below** pure presentation: it consumes field registry + entity rows. **`record_layouts` / `record_actions`** are explicitly **presentation chrome** (see migration comments): they **reorder** and **label**; they do not define resolver truth.

---

## 3. Database vs code

| Store in **database** | Keep in **code** (until a validated DSL ships) |
|------------------------|--------------------------------------------------|
| Org-scoped field defs, sections, values | Entity table columns **system fields** |
| Departments / work units rows + JSON **with version** | **Resolver** composition rules and **edit ownership** |
| `status_definitions` rows matching enforced keys | Workflow **effects**, **event handlers** for `record_actions.event_key` |
| `record_layouts.config_json` structure (versioned) | **Registry** of allowed `overview_section_order` keys per entity (validate against `entityPresentation`) |
| `record_actions` labels, `event_key` **references** | Implementation of each `event_key` |
| `queue_definition` when schema exists | **Needs Attention** predicates (`exceptionTypes.ts`) today — **candidates** for future data-driven lanes with review |
| Optional `metadata` JSON on dept/wu | **Visual context** catalog (`VISUAL_CONTEXT_REGISTRY`), **lane** → context maps |

---

## 4. Current inventory audit (repo state)

Evidence: migrations in `supabase/migrations/`, APIs in `web/app/api/admin/`, types in `web/lib/recordChrome/types.ts`.

### `field_definitions` / `field_section_definitions` / `field_values`

- **Table:** org-scoped; `field_definitions` includes visibility, `section_key`, `config` jsonb, `is_visible_in_public_booking` (see `20260402140000_field_sections_public_visibility.sql`).
- **API:** `GET/POST /api/admin/field-definitions`, `PATCH/DELETE …/field-definitions/[id]`; field-sections routes update section metadata and bulk-update defs.
- **Role:** Custom field **vocabulary** and **placement** hints for drawer/table/public — **config** domain.

### `record_layouts`

- **Table:** `entity_type`, `key`, `config_json`, `is_active` — **no org_id** (global template).
- **API:** `GET /api/admin/record-layouts?entity_type=job|schedule` — read only in route handler reviewed.
- **Content:** `config_json` supports `overview_section_order`, schedule `overview_rows`, `layout_blocks` (v2) per `web/lib/recordChrome/types.ts`.
- **Gap:** No tenant-specific layouts in DB yet; evolution = optional `org_id` or template inheritance.

### `record_actions`

- **Table:** `entity_type`, `action_key`, `label`, `event_key`, `placement` (`primary`|`secondary`), `is_active` — **global**.
- **API:** `GET /api/admin/record-actions?entity_type=job|schedule`.
- **Role:** Configurable **buttons**; **behavior** = code subscribed to `event_key`.

### `status_definitions`

- **Org + industry resolution** via `GET /api/admin/status-definitions` and status-options.
- **Role:** Labels and effective keys for status controls — **config** within validation against allowed lifecycle.

### `work_units` / `departments`

- **Org-scoped**; `work_units.queue_definition` often `{}`; seed example `20260408180000_cleaning_org_operations_unassigned_work_unit_seed.sql` sets Operations + `unassigned_jobs`.
- **API:** admin routes under `/api/admin/departments`, `/api/admin/work-units` (per existing implementation).
- **Role:** **Routing** and **lane** identity for workspace; **queue_definition** reserved for structured filters.

### `queue_definition`

- **Column:** `jsonb` on `work_units`.
- **Current:** Empty or seed metadata; **Needs Attention** filtering **client-side** from `exceptionTypes.ts` — not yet driven by this JSON alone.

---

## 5. Versioning and validation

- Any JSON blob (`config_json`, `queue_definition`, `metadata`) should carry a **`version`** field where multiple shapes exist (`record_layouts.config_json.version` pattern).
- **Writers** (future admin settings UI or AI) must validate against **Zod/JSON Schema** shared with the server before persist.

---

## 6. Gaps (structural, not bugs)

- **Org-level `record_layouts` / `record_actions`** — absent; needed for true per-tenant chrome without code forks.
- **Unified queue DSL** — `queue_definition` not yet authoritative for Needs Attention (see [implementation-gap-audit](./implementation-gap-audit.md)).
- **Single “settings” namespace** — multiple APIs today; consolidation is a **surfaces/API** concern ([config-surfaces-spec](./config-surfaces-spec.md), [config-api-contract](./config-api-contract.md)).

---

**See:** [config-surfaces-spec.md](./config-surfaces-spec.md) · [config-api-contract.md](./config-api-contract.md)
