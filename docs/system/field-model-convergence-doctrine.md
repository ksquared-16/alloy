# Field Model Convergence Doctrine

**Status:** Active planning — Configuration Convergence V4 (June 2026).  
**Prerequisite:** `docs/system/configuration-ownership-doctrine.md` (statuses, actions, queues).

## North star

**One canonical field registry. Everything else consumes it.**

```
field_definitions (+ native column seeds / parity manifests)
        ↓
   Layouts (placement + drawer behavior)
        ↓
   Forms (collection schema references)
        ↓
   Business Processes (stage requiredness / recommendations)
```

No parallel field catalogs in operator-facing configuration.

---

## Canonical source of truth

### Primary: `field_definitions`

| Column / JSON | Owns |
|---------------|------|
| `field_key`, `field_type`, `label`, `help_text`, `placeholder` | Definition |
| `entity_type` | Which record the field belongs to |
| `section_key`, `sort_order` | Catalog grouping (Fields settings) |
| `config` | Option set keys, catalog keys, placement hints, **native reference metadata** (`field_kind: entity_reference`, `option_source`, `storage_class`, `storage_table`, `storage_column`) |
| `requirement_policy`, `is_required` | **Global** field requirement policy |
| `is_visible_in_drawer`, `is_visible_in_public_booking`, … | Visibility flags |

Supporting tables:

| Table | Role |
|-------|------|
| `field_section_definitions` | Section labels for Fields catalog |
| `option_sets` / `option_set_items` | Dropdown vocabulary — static items and reference-backed config (`option_sets.config`) |
| `record_drawer_layouts` | Layout composition + `field_placements_v1` |

### Not canonical (today — migration targets)

| Artifact | Location | Status |
|----------|----------|--------|
| `LIFECYCLE_FIELD_REQUIREMENT_CATALOG` | `web/lib/lifecycle/lifecycleFieldRequirementsCatalog.ts` | Platform bootstrap palette — should become seeds into `field_definitions` |
| `LIFECYCLE_FIELD_RULE_BINDINGS` | `web/lib/lifecycle/lifecycleFieldRuleBindings.ts` | Runtime binding layer — should key off `field_definitions.id` / `field_key` |
| `OPERATIONAL_FORM_SYSTEM_FIELDS` | `web/lib/forms/systemFieldRegistry.ts` | Parallel forms picker — should map to `field_definitions` |
| `CHILDCARE_LAYOUT_FIELD_CATALOG` / `CURATED_FIELDS` | `web/lib/layout/childcareLayoutFieldCatalog.ts`, `fieldCatalog.ts` | Manifest bootstrap when `field_definitions` empty |
| Native column registries | `inquiryChildFieldRegistry`, `customerMemberFieldRegistry`, `opportunityFieldRegistry` | Parity seeds — should converge to `field_definitions` rows |

### Native reference fields (shipped June 2026)

Operator-configurable **entity reference** fields are supported via seeded `field_definitions` rows — not a separate Relationships builder.

| Pattern | Example |
|---------|---------|
| `field_type` | `select` with `config.option_source` (e.g. `locations`) |
| `config.field_kind` | `entity_reference` |
| Storage | Native column on entity table — **not** `field_values` |
| Drawer PATCH | Entity route (e.g. `opportunities.location_id`) |

**MVP example — Lead Location:**

- Registry: `entity_type=opportunity`, `field_key=location_id`
- Storage: `opportunities.location_id` → `locations.id`
- Surfaces: Fields, Business Processes (Lead stage), Layouts (`opportunity.location_id`), Forms (`lead_site`)
- Child placement (`inquiry_child.location_id`) remains separate — per-child canonical doctrine unchanged

Migration: `supabase/migrations/20260617120000_opportunity_location_id_field_definition_repair.sql`

---

## Per-system ownership (current)

### Fields (`/admin/settings/fields`)

**Owns:** field definition, type, metadata, option references, global `requirement_policy`.

| Layer | Detail |
|-------|--------|
| Tables | `field_definitions`, `field_section_definitions` |
| APIs | `GET/PATCH/POST /api/admin/field-definitions`, `field-sections` |
| UI | `EntityFieldsClient`, entity-specific field clients |
| Consumers | Drawer attach (`entityFieldRegistryAttach`), Layouts picker, partial BP palette merge, public booking |

### Layouts (`/admin/settings/layouts`)

**Owns:** placement, visibility, presentation, drawer requiredness per layout.

| Layer | Detail |
|-------|--------|
| Tables | `record_drawer_layouts`, `record_layouts`; reads `field_definitions` |
| Model | `config_json.field_placements_v1` — per-field drawer behavior (`FieldPlacementV1`) |
| APIs | `record-layouts/effective-preview`, `entity-layouts/field-catalog`, placement PATCH routes |
| UI | `LayoutSectionFieldsPanel`, `LayoutFieldBehaviorControls` |
| Consumers | Drawer runtime, queue row layout (`metadata.queue_record_layout`) |

**Requiredness here:** “Required / editable **when this field appears on this layout surface**.”

### Forms (`/admin/forms`)

**Owns:** collection schema, intake flow, submission behavior.

| Layer | Detail |
|-------|--------|
| Tables | `form_definitions`, `form_definition_versions` (`schema_json`) |
| Model | `FormField` tree in `schema_json` — may reference `field_source: system \| custom` |
| Field picker | **`OPERATIONAL_FORM_SYSTEM_FIELDS`** — not `field_definitions` today |
| Consumers | Public embed, prefill (`resolveFormPrefillValues`), lifecycle form coverage checks |

**Gap:** Forms author fields from `systemFieldRegistry`, not from org `field_definitions`.

### Business Processes (`/admin/settings/business-processes`)

**Owns:** stage requiredness, stage recommendations, stage expectations.

| Layer | Detail |
|-------|--------|
| Tables | `departments.metadata` |
| Keys | `lifecycle_builder_stage_field_rules_v1`, legacy `lifecycle_progression_requirements_v1` |
| Palette | `LIFECYCLE_FIELD_REQUIREMENT_CATALOG` + merge `field_definitions` (extras only) |
| APIs | `GET/PATCH /api/admin/departments/:id/lifecycle-requirements` |
| Persistence | `rule_id` arrays (`required_rule_ids`, `recommended_rule_ids`, `rule_levels_v1`) |
| Runtime | `lifecycleFieldRuleEvaluator`, `resolveActionIntakeSpec`, progression preflight |

**Requiredness here:** “Should be complete **before work advances** while in this stage.”

---

## Requiredness doctrine (recommendation)

**Keep both layout and stage requiredness** — they answer different questions:

| Concept | Owner | Meaning |
|---------|-------|---------|
| **Layout requiredness** | Layouts (`field_placements_v1` + `requirement_policy` on field) | Required when shown / saved in drawer context |
| **Stage requirement** | Business Processes (`lifecycle_builder_stage_field_rules_v1`) | Required or recommended for **stage progression** |

**Converge references, not semantics:** both should reference the same `field_definitions.field_key` (per entity), not parallel `rule_id` / `sys:*` ids.

**Do not merge** layout and stage rules into one storage blob — operators need independent control.

---

## Field list comparison (why screens differ)

| Field example | Fields settings | Layouts picker | Business Processes stage req | Forms builder |
|---------------|-----------------|----------------|------------------------------|---------------|
| Person `first_name` | Yes (`person` entity) | Yes (`person.*` refKey) | Yes (`person:first_name` catalog) | Yes (`guardian_first_name` system registry) |
| Custom org field on `inquiry_child` | Yes if seeded | Yes if in `field_definitions` | Yes (merged as custom `rule_id`) | Only if manually added as custom form field |
| `child:program_interest` (lifecycle catalog) | Maybe (if seeded) | Maybe | Yes (catalog always) | Via system registry variant |
| Layout-only relationship projection | No | Yes (manifest projection) | No | No |
| Ad-hoc custom form question | No | No | No | Yes (`custom` field in schema) |

**Root causes of mismatch:**

1. **Lifecycle hardcoded catalog** appears even when not in `field_definitions`.
2. **Forms system registry** uses different ids/keys than `field_definitions`.
3. **Layout manifest bootstrap** shows curated fields when DB empty.
4. **Entity type mapping** differs (`child` lifecycle entity ↔ `inquiry_child` / `customer_member` in DB).

---

## Convergence plan (phased)

### Phase F0 — Doctrine + guards ✓

- Document ownership (this file).
- Add drift-prevention tests (allowlisted parallel catalogs, required merge paths).
- UI copy: honest field-source notes (already on BP stage requirements).

### Phase E1 — Childcare canonical registry cleanup ✓ (June 2026)

- `web/lib/fields/childcareFieldCatalogDoctrine.ts` — entity + field classification
- `supabase/migrations/20260611120000_childcare_field_catalog_e1_repair.sql` — idempotent repair
- Settings → Fields hub: childcare-primary entities; job hidden; legacy fields filtered from pickers

### Phase F1 — Reference alignment ✓ (June 2026)

- `web/lib/fields/fieldRegistryReferenceMatrix.ts` — central legacy → canonical mapping.
- BP palette: **registry-first** (`mergeLifecycleFieldPaletteRegistryFirst`); catalog fallback only.
- Forms picker: **registry-first** (`buildFormSystemFieldPicker` + `useFormSystemFieldPicker`).
- Layouts: verified registry-first (existing); manifest fallback only when registry empty.
- Persistence: **legacy `rule_id` retained** on BP save; dual mapping via reference matrix until F2.

### Phase F2 — Persistence migration

- New storage: `stage_field_requirements_v1` keyed by `{ entity_type, field_key }` or `field_definition_id`.
- Dual-read: `rule_id` + field_key during transition.
- Dual-write on BP save.

### Phase F3 — Forms convergence

- Forms builder picker reads `field_definitions` (+ system field seeds as read-only aliases).
- `schema_json` stores `field_definition_id` or canonical `field_key` reference.
- Deprecate ad-hoc duplicate labels where registry exists.

### Phase F4 — Runtime cutover

- `lifecycleFieldRuleEvaluator` reads field_key requirements.
- Form coverage checks use registry ids.
- Remove `LIFECYCLE_FIELD_REQUIREMENT_CATALOG` as operator source (keep as migration seed JSON only).

---

## Migration risks

| Risk | Severity |
|------|----------|
| Runtime evaluators bind to `rule_id` | High — needs dual-read |
| Existing department metadata uses `rule_id` arrays | High — migration script per org |
| Forms submissions keyed by form field ids | Medium — schema compatibility |
| Layout `field_placements_v1` already keyed by `field_key` | Low — closest to target |
| Native columns without `field_definitions` rows | Medium — parity seed migrations exist (FC-1, FC-CM-1) |

---

## Implementation timing

**Do not run F1–F4 in this pass.**

Recommended: **separate sprint** after F0 doctrine + FC/layout seed stability. F1 (reference alignment) can start without runtime cutover and gives immediate operator benefit (matching field lists).

---

## Related docs

- `docs/system/configuration-ownership-doctrine.md`
- `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/layout_runtime_cutover_plan.md`
- `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/childcare_field_catalog_source_matrix.md` (if present)
- `docs/sprints/archive/06_2026/lifecycle_required_info_child_fields_audit.md`
