# Option Sets System

**Status:** Active — Phase 1 (June 2026).  
**Related:** `docs/system/field-model-convergence-doctrine.md`, `docs/system/enrollment-placement-doctrine.md`

## North star

**Option Sets are the canonical selectable-value vocabulary for Alloy.**

Operators configure what can be chosen. Fields bind to a set by key. Runtime surfaces resolve options from the field’s option set — not from hardcoded placement branches.

```
option_sets (+ option_set_items for static mode)
        ↓ option_set_key
field_definitions (select / multiselect)
        ↓
Layouts · Business Processes · Forms · Processing
```

## Ownership split

| Layer | Owns |
|-------|------|
| **Option set** | How options are produced: static items or reference-backed query config, filters, cascade filter bindings |
| **Field** | Which option set (`config.option_set_key`), sibling dependencies (`depends_on_field_key`), **where the value stores** (`storage_class`, `storage_table`, `storage_column`, `field_values`) |

School, Program, and Room are **examples** of reference-backed option sets — not special platform field templates.

## Modes (Phase 1)

### Static (`mode: "static"`)

- Options live in `option_set_items` (label/value pairs).
- Used today for schedule type, gender, cleaning tiers, etc.

### Reference-backed (`mode: "reference"`)

- Options resolve from org-scoped records at runtime.
- Config on `option_sets.config` (jsonb):

```json
{
  "version": 1,
  "mode": "reference",
  "reference": {
    "entity": "locations",
    "value_field": "id",
    "label_field": "label",
    "filters": [{ "field": "location_type", "operator": "eq", "value": "site" }]
  },
  "cascade": {
    "depends_on": [
      { "bind_to_filter": "parent_location_id" },
      { "bind_to_metadata": "category", "optional": true }
    ]
  }
}
```

**Allowlisted reference entities (Phase 1):**

- `locations`
- `location_program_categories`
- `persons`

No arbitrary SQL or unbounded filter builders in Phase 1.

## Platform reference seeds

Per-org seeded option sets (vocabulary prepared; runtime wiring Phase 2):

| set_key | Entity | Purpose |
|---------|--------|---------|
| `schools` | `locations` | Sites (`location_type = site`) |
| `programs` | `location_program_categories` | Programs offered at selected school |
| `rooms` | `locations` | Units (`location_type = unit`), cascade on school + optional program |

## Cascades

Cascade rules are **model-driven**:

1. **Option set** declares which reference filters/metadata keys parent values bind to (`bind_to_filter`, `bind_to_metadata`).
2. **Field** declares which sibling field supplies the parent value (`depends_on_field_key` on `field_definitions.config`).
3. Runtime disables the control and returns empty options until required parent values exist.

Do not hardcode School / Program / Room field keys in shared resolvers once Phase 2 lands.

## Phase 1 vs Phase 2

| Phase 1 (shipped) | Phase 2 (next) |
|-------------------|----------------|
| `option_sets.config` schema + validation | Unified `resolveFieldSelectOptions()` |
| API read/write config | Wire layouts, drawer, forms, processing |
| Admin UI: mode + reference config | Migrate fields from `option_source` → `option_set_key` |
| Seed schools / programs / rooms | Remove `placement_select` hardcoding |

**Legacy paths still active in Phase 1:**

- `field_definitions.config.option_source` (placement resolvers)
- `placement_select` in create-lead intake
- Hardcoded `inquiryChildPlacementFieldMetadata`

These are **not removed** until Phase 2 migration completes.

## Field binding (target)

```json
{
  "option_set_key": "schools",
  "field_kind": "entity_reference",
  "storage_class": "native_column",
  "storage_table": "opportunities",
  "storage_column": "location_id"
}
```

Child room example:

```json
{
  "option_set_key": "rooms",
  "depends_on_field_key": "location_id",
  "field_kind": "entity_reference",
  "storage_class": "native_column",
  "storage_table": "opportunity_customer_members",
  "storage_column": "program_room_cohort_key"
}
```

## API

- `GET/POST /api/admin/option-sets` — list/create; includes `config`
- `GET/PATCH /api/admin/option-sets/[setKey]` — detail; PATCH accepts `label`, `sort_order`, `config`
- Static items CRUD unchanged (`option_set_items`)

## Migration

`supabase/migrations/20260618120000_option_sets_config_reference_seeds.sql`

- Adds `option_sets.config jsonb NOT NULL DEFAULT '{}'::jsonb`
- Seeds / backfills `schools`, `programs`, `rooms` per org

## Out of scope (Phase 1)

- Scheduling / attendance
- Placements table
- Generic relationship builder
- Replacing all runtime placement resolvers
- Removing `option_source`
