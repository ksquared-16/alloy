# Field Catalog Convergence Audit

**Path:** `docs/platform_convergence/field_catalog_convergence_audit.md`  
**Date:** 2026-06-06  
**Status:** Audit only — no implementation  
**Scope:** Inventory every **active** field-definition / field-catalog system in Alloy as of this audit. Document reality; do not propose new catalog architectures beyond what existing platform docs already target.

**Canonical inputs:**

- `docs/system/configuration-system.md` — four-plane control plane (Fields, Field grouping, Layouts, Actions)
- `docs/system/record-system.md` — drawer authority, inquiry child, field policy
- `docs/sprints/06_2026/required_information_v2_operational_readiness_framework.md` — readiness / lifecycle field-rule convergence direction
- `docs/sprints/06_2026/lifecycle_required_info_child_fields_audit.md` — Child vs inquiry_child grain
- `docs/sprints/05_2026/layout_field_behavior_semantics_v1.md` — layout vs field_definitions behavior split
- `docs/product/documents-and-forms.md` — forms schema vs field_definitions boundary

---

## Executive summary

Alloy does **not** have one field catalog today. Operators and runtime code draw field identity, labels, types, and behavior from **at least twelve distinct sources**, with **`field_definitions`** (Postgres, org-scoped) as the closest thing to a durable entity field registry.

| Layer | Closest “catalog” today | Maturity |
|-------|-------------------------|----------|
| **Org entity fields (CRM / drawer / public booking)** | `field_definitions` + `field_section_definitions` | Primary control plane; seeded system rows per org |
| **Drawer surface behavior (opportunity v1)** | `record_drawer_layouts.config_json.field_placements_v1` | Behavior overlay — not field definitions |
| **Lifecycle required information** | Platform TS catalogs + bindings + department metadata | Parallel to registry; merges org `field_definitions` in palette only |
| **Forms intake / linkage** | `systemFieldRegistry` + per-version `schema_json` | Explicitly **not** default `field_definitions` schema |
| **Layout builder (V2 preview)** | `fieldCatalog.ts` curated fallbacks + partial `field_definitions` reads | Child / inquiry groups still curated |
| **Workflow conditions** | `information_schema` RPC + hardcoded relationship paths | Schema introspection, not operator registry |
| **Documents** | `document_field_definitions` | Separate table, doc-type scoped |

**Fragmentation symptoms:**

- Same conceptual field (e.g. `desired_start_date`, `child_first_name`) appears in `field_definitions`, lifecycle rule bindings, `systemFieldRegistry`, layout curated lists, and hardcoded drawer/policy maps — with **no single join key** across all consumers.
- Lifecycle **Child** palette uses entity key `child` but reads/writes **`inquiry_child` / OCM** paths; layout **Child** group uses curated keys that do not match OCM column names.
- Forms **`field_source`** on schema fields can reference registry ids or ad hoc custom keys; lifecycle coverage matches via **`form_capture_keys`** string lists in bindings — not via `field_definitions.id`.

**Documented future direction (existing docs only — not invented here):**

1. **`field_definitions` remains the org-scoped field registry** for entity surfaces (Settings → Fields / Field grouping / Layouts placement). See `configuration-system.md`.
2. **Required Information V2** unifies lifecycle **catalog + bindings + enforcement levels** under a readiness evaluator spine; org custom fields continue to merge from `field_definitions` (`inquiry_child` → Child). See `required_information_v2_operational_readiness_framework.md` §1–§13.
3. **Forms keep dedicated `schema_json`** unless an explicit reuse boundary is added; `systemFieldRegistry` stays the operational mapping layer for intake/linkage. See `documents-and-forms.md` and forms-engine Card 0 decisions.
4. **Layout V2** should eventually source all entity groups from `field_definitions` (today: opportunity/person only; child/inquiry curated). See `web/app/api/admin/entity-layouts/field-catalog/route.ts` header comment.

---

## Inventory at a glance

| # | System | Storage | Owner module / table | Primary consumers |
|---|--------|---------|----------------------|-------------------|
| 1 | Entity field registry | Postgres | `field_definitions`, `field_values` | Drawer GET, Settings, public booking, layout placement, lifecycle palette merge |
| 2 | Field section taxonomy | Postgres | `field_section_definitions` | Settings Field grouping, drawer section labels, batch placement |
| 3 | Layout field catalog | Code + DB merge | `web/lib/layout/fieldCatalog.ts` | Layout V2 builder API (flag-gated preview) |
| 4 | Layout behavior placements | JSON on layout row | `record_drawer_layouts.config_json.field_placements_v1` | Opportunity drawer policy GET/PATCH |
| 5 | Lifecycle field requirement catalog | Code | `lifecycleFieldRequirementsCatalog.ts` | Lifecycle Builder palette, stage saves |
| 6 | Lifecycle field rule bindings | Code | `lifecycleFieldRuleBindings.ts` | Preflight, forms coverage, readiness evaluators |
| 7 | Lifecycle progression object labels | Code + metadata | `lifecycleProgressionRequirementsCatalog.ts` + `departments.metadata` | BOS, progression checklists (object grain, not field grain) |
| 8 | Forms system field registry | Code | `systemFieldRegistry.ts` | Form authoring, intake linkage, lifecycle form coverage |
| 9 | Form version schemas | Postgres | `form_definition_versions.schema_json` | Public submit, packet steps, form UI |
| 10 | Inquiry child native manifest | Code (+ migration seeds) | `inquiryChildFieldRegistry.ts` | Settings allowlist, OCM PATCH partition, drawer labels |
| 11 | Workflow field catalog API | Postgres RPC + code fallbacks | `GET /api/admin/workflows/field-catalog` | Workflow condition builder |
| 12 | Workflow field path vocabulary | Code | `workflowVocab.ts` `WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE` | Workflow editor dropdown (legacy/alternate path list) |
| 13 | Document field definitions | Postgres | `document_field_definitions` | Document-type custom metadata (admin API) |
| 14 | Drawer field policy preset maps | Code | `drawerFieldPolicyAdapter.ts` | `_field_policy_resolved`, PATCH enforcement |
| 15 | Person drawer dedicated field specs | Code | `personDrawerParentAddressFields.ts`, `personDrawer*OperatingSections.ts` | Person drawer layout runtime (hardcoded keys) |
| 16 | Job overview resolution catalog | Code | `jobOverviewResolutionCatalog.ts` | Agent semantic layout planner (jobs only) |
| 17 | Location native / metadata key manifests | Code | `loadPublicBookingFieldDefs.ts`, `locationMetadataFieldKeys.ts` | Public booking write partition, location drawer labels |

---

## 1. `field_definitions` (entity field registry)

### Purpose

Org-scoped registry of **entity-attached fields**: identity (`field_key`), presentation (label, help, section, sort), type, visibility flags, option binding (`config.option_set_key` / inline options / `catalog_key`), and policy columns (`requirement_policy`, `interaction_policy`, legacy `is_required`).

Paired with **`field_values`** for custom (non-native-column) storage per entity instance. System/native columns are documented in registry rows (`is_system: true`) but values live on entity tables unless also in `field_values`.

### Ownership

| Concern | Owner |
|---------|--------|
| Table schema | Postgres (`field_definitions`, `field_values`) |
| CRUD API | `GET/POST /api/admin/field-definitions`, `PATCH …/[id]` |
| Entity type allowlist | `FIELD_DEFINITION_ENTITY_TYPES` in `inquiryChildFieldRegistry.ts` |
| Field types allowlist | `ADMIN_FIELD_TYPES` in `adminFieldTypeList.ts` |
| Config validation | `fieldDefinitionConfig.ts` (options, `catalog_key`, `option_set_key`) |
| Operator UI | Settings → Fields (`EntityFieldsClient`, `/adminV2/settings/fields`) |
| System row seeds | Supabase migrations (batch record numbers, inquiry_child natives, location/person seeds, vertical bootstrap) |

**Supported `entity_type` values (Settings API):** `person`, `customer`, `job`, `opportunity`, `vendor`, `schedule`, `location`, `inquiry_child`.

### Runtime usage

| Surface | Usage |
|---------|--------|
| **Drawer / entity GET** | `entityFieldRegistryAttach.ts` loads active defs + sections; merges `field_values`; attaches `_field_policy_resolved` via `drawerFieldPolicyAdapter.ts` |
| **Opportunity / job PATCH** | Custom keys → `field_values`; policy enforcement via effective behavior |
| **Public booking** | `loadPublicBookingFieldDefs.ts` — defs with `is_visible_in_public_booking` |
| **Public field-definitions API** | `GET /api/public/field-definitions` (service role + `ALLOY_PUBLIC_ORG_ID`) |
| **Layout Settings** | Field picker eligibility, batch placement (`section_key`, `sort_order`) |
| **Lifecycle Builder** | `loadOrgFieldDefinitionsForLifecycle.ts` — palette merge for custom rules |
| **Layout integrity** | Compares layout requiredness to visible field keys |
| **Agent / BOS** | `applyFieldDefinitionVisibility.ts`, `config_layout_assist` creates new defs via same API |

### Overlap with other systems

- **Lifecycle:** Same `field_key` / `entity_type` referenced by rule bindings and custom `custom:{entity}:{field_key}` rule ids; lifecycle catalog labels can diverge from registry labels (palette merge overlays org labels).
- **Forms:** Not the default form schema; optional conceptual overlap via `systemFieldRegistry.crm_mapping_key` and lifecycle `form_capture_keys`.
- **Layout V2 catalog:** Source for opportunity/person groups; child/inquiry groups bypass registry today.
- **Inquiry child manifest:** Native OCM keys must exist as `is_system` rows (migration-seeded); manifest defines reserved keys and PATCH partition.
- **Drawer policy adapter:** Hardcoded maps from `field_key` → storage path (`column`, `field_values`, `metadata`) — not stored in `field_definitions`.
- **Workflow field catalog:** Introspects DB columns — overlaps native keys but not custom `field_values` fields.

### Migration recommendation

**Anchor catalog for org entity fields.** Convergence work should **extend** this registry (coverage, entity types, native-key manifests as code-generated seeds) rather than replace it.

- Fold **inquiry child native manifest** into migration/sync from a single manifest module (already partially done via migrations + `INQUIRY_CHILD_NATIVE_FIELD_MANIFEST`).
- Teach **Layout V2** child / child_inquiry groups to read `entity_type: inquiry_child` (and future `person` child profile fields) instead of `CURATED_FIELDS`.
- Align **drawerFieldPolicyAdapter** preset maps with registry rows (storage hints in `config` or generated from schema metadata) — long-term reduce duplicate hardcoding.
- Do **not** force forms to adopt `field_definitions` as schema without an explicit product boundary (existing forms doctrine).

---

## 2. `field_section_definitions` (field grouping catalog)

### Purpose

Org-scoped **section taxonomy** for organizing fields in the Fields hub and drawer catalog: `section_key`, label, description, sort, archive flag, optional `section_config`.

Not a field-definition catalog itself — groups fields via `field_definitions.section_key`.

### Ownership

- Postgres table `field_section_definitions`
- APIs: `GET/POST /api/admin/field-sections`, `PATCH …/[id]`
- Settings → Field grouping (`/adminV2/settings/field-sections`)
- Seeds: childcare MVP control plane, inquiry_child migration, location convergence migrations

### Runtime usage

- Attached with field defs on drawer GET (`entityFieldRegistryAttach.ts`)
- Public booking API returns section labels alongside defs
- Layout effective preview merges catalog sections into drawer composition
- Batch placement API validates section keys against this catalog

### Overlap

- Layout **virtual workflow sections** (opportunity workflow v1) are separate from catalog sections — only custom/catalog-backed sections use `field_section_definitions`.
- Lifecycle and forms do not consume section taxonomy.

### Migration recommendation

**Keep as companion taxonomy** to `field_definitions`. Single-catalog target: sections remain a **grouping dimension** on the unified entity field registry, not a second field store.

---

## 3. Layout field catalog (`fieldCatalog.ts` + entity-layouts API)

### Purpose

Normalize pickable fields for **Layout V2 builder preview** into `{ entityKey, fieldKey, fieldLabel, fieldType, refKey }` across four entity groups: opportunity, person, child, child_inquiry. Includes **widget catalog** (tasks, notes, children_list, etc.) — widgets are not fields.

### Ownership

- Code: `web/lib/layout/fieldCatalog.ts` (`CURATED_FIELDS`, `LAYOUT_WIDGET_CATALOG`, `fieldDefToCatalog`)
- API: `GET /api/admin/entity-layouts/field-catalog` (flag-gated: `isLayoutV2PreviewEnabledServer`)
- Group → DB mapping: opportunity/person read `field_definitions`; child/child_inquiry return **curated code lists only**

### Runtime usage

- **Layout V2 preview / builder only** — explicitly does not drive live AdminV2 drawer runtime today (route header: “Does not touch live runtime”).
- `resolveItemValue.ts`, `defaultLeadLayouts.ts`, `seedFromCurrentPresentation.ts` consume refKey parsing for preview hydration.

### Overlap

- Duplicates labels/types for opportunity/person when org has no defs (falls back to `CURATED_FIELDS`).
- **Child / child_inquiry curated keys** (`child.name`, `child_inquiry.desired_start_date`) do not match OCM column names or `inquiry_child` registry keys — preview placeholders only.
- Live opportunity drawer uses **workflow v1 layout + field_definitions**, not Layout V2 catalog.

### Migration recommendation

**Collapse into `field_definitions`-backed catalog** for all four groups:

1. Map child_inquiry → `entity_type: inquiry_child`
2. Map child → household child profile fields when a registry surface exists (today: partial; person child sections use dedicated drawer specs)
3. Retain `CURATED_FIELDS` only as empty-org bootstrap fallback until seed migrations guarantee defs
4. Widget catalog may remain separate (UI blocks, not data fields)

---

## 4. Layout surface behavior (`field_placements_v1`)

### Purpose

Per-field **Required / Editability** overrides on opportunity workflow v1 drawer overview — stored on layout JSON, not on field registry rows.

### Ownership

- `record_drawer_layouts.config_json.field_placements_v1`
- `PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements`
- Resolution: `resolveEffectiveFieldBehavior.ts` (placement → definition → preset)

### Runtime usage

- Opportunity entity GET `_field_policy_resolved`
- Opportunity PATCH `enforceDrawerFieldPoliciesOnPatch`
- Layout Settings field behavior controls
- Layout integrity diagnostics

### Overlap

- References fields by **`field_key`** shared with `field_definitions` — behavior layer only.
- Lifecycle required information is a **separate** requirement system (department metadata + platform rules).
- Job drawer uses definition-only policies (no placement layer in v1).

### Migration recommendation

**Not a field catalog — keep as surface-behavior overlay** on unified registry keys. Convergence: readiness V2 should distinguish **registry field identity** vs **surface enforcement** vs **lifecycle stage requirements** (already framed in `required_information_v2_operational_readiness_framework.md` §1.4 layout requiredness row).

---

## 5. Lifecycle field catalogs (platform)

Lifecycle uses **multiple code catalogs** plus department metadata — not one module.

### 5a. `LIFECYCLE_FIELD_REQUIREMENT_CATALOG`

**Purpose:** Platform-defined selectable field rules for Lifecycle Builder (`rule_id`, operator `field_label`, entity bucket, optional stage filter, catalog-level `runtime_enforced` flag).

**Ownership:** `web/lib/lifecycle/lifecycleFieldRequirementsCatalog.ts` (platform code).

**Runtime usage:** Palette generation (`lifecycleFieldPaletteForStage`), stage save validation, object-label derivation (`OBJECT_LABEL_TO_FIELD_RULES`).

**Overlap:** Labels and rule ids overlap registry field keys only via **`lifecycleFieldRuleBindings`**; catalog `runtime_enforced` can **drift** from binding flag (documented in Required Information V2 §1.2).

**Migration recommendation:** V2 Phase 1 — **unify catalog + binding enforceability** into one platform truth (`enforceable` flag per rule); org extensions remain `custom:*` rules backed by `field_definitions`.

### 5b. `LIFECYCLE_FIELD_RULE_BINDINGS`

**Purpose:** Maps each `rule_id` → runtime value path (`value_source`, OCM columns, opportunity metadata keys), form capture aliases, binding-level `runtime_enforced` and `form_coverage_supported`.

**Ownership:** `web/lib/lifecycle/lifecycleFieldRuleBindings.ts`.

**Runtime usage:**

- `lifecycleFieldRuleEvaluator.ts` — preflight / completion
- `evaluateFormsLifecycleFieldCoverage.ts`, `resolveFormsLifecycleRequirementContract.ts`
- `resolveActionIntakeSpec.ts` — action intake recommended fields

**Overlap:**

- **Child entity** bindings → **`inquiry_child` / OCM only** (not `customer_members`) per child-fields audit.
- **Forms:** `form_capture_keys` overlap `systemFieldRegistry` ids and labels — string matching, not FK.
- **field_definitions:** `field_key` on binding aligns for many person/child/opportunity rules; custom org fields use `custom:{entity}:{field_key}`.

**Migration recommendation:** **Merge with 5a** under readiness evaluator; generate binding paths from registry metadata where possible (value_source, storage class) to avoid triple maintenance (catalog label, binding path, registry label).

### 5c. `lifecycleFieldPaletteMerge` + org defs loader

**Purpose:** Merge platform catalog with org **`field_definitions`** rows (`person`, `inquiry_child`, `opportunity`, `customer`) into Settings palette entries (`field_source: catalog | system | custom`).

**Ownership:** `lifecycleFieldPaletteMerge.ts`, `loadOrgFieldDefinitionsForLifecycle.ts`.

**Runtime usage:** Lifecycle Builder UI, stage bootstrap payloads, rule id validation.

**Overlap:** Sole official bridge between **`field_definitions`** and lifecycle rule ids for **custom** fields; platform rules still live in TS catalogs.

**Migration recommendation:** Keep merge pattern; extend when new entity grains (household child vs inquiry child) get explicit registry entity types.

### 5d. `lifecycleProgressionRequirementsCatalog` (object-label grain)

**Purpose:** Operator-facing **object-level** requirements (`Person`, `Child`, `Program`, …) for progression checklists and BOS — **not field-key grain**.

**Ownership:** `web/lib/completion/lifecycleProgressionRequirementsCatalog.ts`; overrides in `departments.metadata.lifecycle_progression_requirements_v1`.

**Runtime usage:** Progression snapshots, legacy label-based preflight fallbacks, Settings hub copy.

**Overlap:** Maps to field rules via `OBJECT_LABEL_TO_FIELD_RULES` in field requirements catalog — **dual vocabulary** (labels vs rule ids). Required Information V2 plans to deprecate label path for new UI.

**Migration recommendation:** **Phase out as field catalog**; retain as display projection over unified rule ids (V2 §Phase 1–4).

### 5e. `LIFECYCLE_OBJECT_FIELD_DETAIL`

**Purpose:** Display-only nested field labels under object requirements in Settings (not configurable).

**Ownership:** `web/lib/completion/lifecycleRequirementFieldDetail.ts`.

**Runtime usage:** Settings UI helper text only.

**Overlap:** Duplicates catalog labels in prose form.

**Migration recommendation:** Generate from unified catalog at UI time; delete static duplicate when readiness UI lands.

### 5f. `lifecycleActionRequirementCatalog`

**Purpose:** Action-scoped preflight (approve enrollment, move to waitlist, schedule tour, record tour outcome) — composes department overrides, field rule evaluator, and legacy object labels.

**Ownership:** `web/lib/completion/lifecycleActionRequirementCatalog.ts`.

**Runtime usage:** `adminActionPreflight.ts`, `executeAdminAction.ts`, `evaluateEffectiveRequirements.ts`.

**Overlap:** Not a field definition store; **consumes** lifecycle catalogs + live record snapshots.

**Migration recommendation:** Keep as **consumer** of unified readiness evaluator (V2 target); do not add field defs here.

---

## 6. Forms field registries and schemas

### 6a. `systemFieldRegistry` (`OPERATIONAL_FORM_SYSTEM_FIELDS`)

**Purpose:** Platform catalog mapping well-known intake/enrollment fields to form schema shape: stable `id` (`sys:*` / bare id), `entity_type`, `field_key`, `shared_value_key`, `crm_mapping_key`, default label/type/required, `public_intake_safe`, select option lines.

**Ownership:** `web/lib/forms/systemFieldRegistry.ts` (~15 entries: child, guardian, enrollment, opportunity, customer).

**Runtime usage:**

- Form field authoring (`useFormSchemaFieldAuthoring.ts`, `FormFieldAuthoringCard.tsx`)
- `formFieldFromRegistryEntry` — seeds `field_source` on schema fields
- `formFieldCaptureIndex.ts` — lifecycle coverage matching (`SYSTEM_FIELD_BY_ID`)
- Demo seeds (`intakeRuntimeValidationDemo.ts`)

**Overlap:**

- **Lifecycle bindings** `form_capture_keys` lists duplicate registry ids/labels.
- **field_definitions:** No automatic sync; CRM promotion uses separate intake/linkage paths.
- **inquiry_child registry:** Enrollment fields (`desired_program_type`, etc.) exist in both system registry and OCM native manifest with similar semantics.

**Migration recommendation:** Treat as **forms operational mapping layer** (existing doctrine). Convergence options (pick one when implementing):

1. **Reference registry:** System fields become views over `field_definitions` + platform seed manifest (forms read defs, registry becomes code-generated from seeds), or
2. **Explicit link table in schema_json:** `field_source` carries `field_definition_id` when org publishes forms — without making `field_definitions` the form schema store.

Do not silently merge without boundary doc update.

### 6b. `form_definition_versions.schema_json`

**Purpose:** Versioned, immutable form field trees (`FormField` nodes with types, validation, visibility, optional `field_source`). **Per-form catalog** — each published form carries its own field set.

**Ownership:** Postgres `form_definition_versions`; validated by `web/lib/forms/schema.ts` (Zod).

**Runtime usage:** Public submit, admin form builder, packet steps, PDF mapping slots, lifecycle coverage index.

**Overlap:**

- Custom form fields (`field_source.entity_type: custom`, `field_key: unmapped`) **cannot** satisfy lifecycle rules without explicit mapping.
- System fields overlap 6a registry by id.
- Distinct from `field_definitions` by design (`documents-and-forms.md`).

**Migration recommendation:** **Remain per-form** in single-catalog target; unify **identity** via `field_source` / readiness contract, not schema storage location.

---

## 7. Inquiry child field registry

### Purpose

Defines the **`inquiry_child`** product entity type (maps to `opportunity_customer_members`):

- Settings API entity allowlist entry
- **Native OCM column manifest** (`INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS`, `INQUIRY_CHILD_NATIVE_FIELD_MANIFEST`) — labels, types, section, visibility defaults
- Reserved key guard (blocks custom defs colliding with native keys)
- PATCH body partition (`partitionInquiryChildPatchBody`) — native vs custom `field_values`
- Display helpers (`resolveInquiryChildDesiredStartDisplay`, label lookup)

### Ownership

- `web/lib/fields/inquiryChildFieldRegistry.ts`
- Native rows seeded per org via migrations (e.g. `20260520120000_inquiry_child_desired_start_and_field_defs.sql`)
- Settings → Fields (`entity_type: inquiry_child`)

### Runtime usage

- `OpportunityInquiryChildrenSection.tsx` — drawer grid labels/visibility
- `inquiryChildFieldEdit.ts`, `PATCH /api/admin/opportunity-customer-members/:id`
- Lifecycle palette maps `inquiry_child` defs → Child entity (`lifecycleEntityFromFieldDefinitionEntityType`)
- Field definitions POST validation (`isReservedInquiryChildFieldKey`)

### Overlap

- **field_definitions:** Native keys must have matching `is_system` rows; manifest is source for migration seeds, registry is operator-editable labels/visibility.
- **Lifecycle bindings:** OCM column names (`desired_program_type`, …) align with manifest keys.
- **Layout curated child_inquiry:** Different refKey namespace (`child_inquiry.*`) — preview only.
- **systemFieldRegistry:** Enrollment entity fields overlap semantically.

### Migration recommendation

**Single native manifest module** feeding:

1. Migration/seed jobs → `field_definitions` system rows
2. Lifecycle binding generator (OCM field column map)
3. Layout catalog refKeys for inquiry group

Custom inquiry_child fields stay in **`field_definitions`** only; manifest covers **native columns** exclusively.

---

## 8. Additional active field sources (discovered)

### 8a. Workflow field catalog API

| | |
|--|--|
| **Purpose** | Condition builder field picker: table columns via `get_workflow_entity_columns` RPC + vendor relationship fields + location fallbacks |
| **Ownership** | `GET /api/admin/workflows/field-catalog` |
| **Runtime** | Workflow authoring UI only |
| **Overlap** | Native DB columns overlap entity tables; **excludes** custom `field_values` fields and `inquiry_child` join paths |
| **Migration** | Expose workflow conditions from **registry + schema introspection** union; document which paths are join-derived vs registry |

### 8b. `WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE` (`workflowVocab.ts`)

Hardcoded path list for workflow editor dropdown — parallel to 8a, not org-scoped. Overlaps job/opportunity/location paths. **Migration:** Consolidate with workflow field catalog API or deprecate duplicate list.

### 8c. `document_field_definitions`

Separate Postgres table for **document-type** custom fields (`doc_type`, `field_key`, `field_label`). Admin CRUD at `/api/admin/document-field-definitions`. **No overlap** with entity `field_definitions` in current runtime. **Migration:** Keep separate unless product merges document metadata into entity registry with scoped `entity_type` prefix.

### 8d. `drawerFieldPolicyAdapter` preset maps

Hardcoded `field_key` → storage class, enforceability mode, PATCH body key for opportunity/job. **Runtime-critical** for policy resolution. **Overlap:** Keys must exist in registry for layout/settings to show them; adapter duplicates storage knowledge. **Migration:** Derive storage class from registry `config.storage` or platform manifest (long-term).

### 8e. Person drawer dedicated field specs

`PERSON_DRAWER_PARENT_ADDRESS_FIELD_SPECS`, `PERSON_DRAWER_PARENT_DEDICATED_FIELD_KEYS`, child lifecycle field keys — hardcoded layout routing for person drawer sections. Fields may also exist in `field_definitions` (`entity_type: person`). **Migration:** Person drawer should consume registry + layout composition only (child profile doctrine doc tracks gap).

### 8f. `JOB_OVERVIEW_RESOLUTION_CATALOG`

Agent semantic planner synonyms for job overview layout bands — **not** operator field registry. Jobs RRS uses resolver fields. **Migration:** No merge with `field_definitions`; optional cross-link via `field_key` where keys match.

### 8g. Location native / metadata key manifests

`NATIVE_LOCATION_PUBLIC_FIELD_KEYS` — excludes native location columns from public booking `field_values` writes. `LOCATION_*_METADATA_FIELD_KEYS` — documents metadata-backed location fields seeded in registry. **Migration:** Fold into inquiry-style native manifest pattern per entity.

### 8h. `resolveFieldCatalog` / `ALLOWED_CATALOG_KEYS`

Resolves **`config.catalog_key`** on select fields (`home_types`, `pricing_sqft_tiers`) to option lists — **option source catalog**, not field definition catalog. Used by public and admin field def readers.

---

## Overlap matrix (selected high-traffic fields)

| Conceptual field | field_definitions | Lifecycle rule | systemFieldRegistry | Layout CURATED | OCM / native |
|-----------------|-------------------|----------------|---------------------|----------------|--------------|
| Child first name | person/child defs (varies) | `child:first_name` | `child_first_name` | `child.name` (curated) | OCM via binding |
| Desired start (child) | `inquiry_child.desired_start_date` | `child:desired_start_date` | `desired_start_date` | `child_inquiry.desired_start_date` | OCM column |
| Guardian email | `person.email` | `person:email` | `guardian_email` | `person.primary_email` (curated) | primary person column |
| Program interest | `inquiry_child.desired_program_type` | `child:program_interest` | `desired_program_type` | `child.program` (curated) | OCM column |

---

## Future single-catalog target (from existing platform docs)

This section **summarizes documented direction** — it does not introduce a new architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│  Platform manifests (code)                                       │
│  • Native column manifests (inquiry_child, location, …)        │
│  • Lifecycle rule seeds → unified enforceable rule catalog (V2)  │
│  • Forms systemFieldRegistry (operational mapping) OR generated  │
└────────────────────────────┬────────────────────────────────────┘
                             │ seeds / sync
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  field_definitions + field_section_definitions (org registry)    │
│  Single operator source for entity field identity & structure    │
└────────────────────────────┬────────────────────────────────────┘
                             │ field_key / entity_type
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  Layout composition   Surface behavior    Readiness evaluator (V2)
  (placement, order)   (field_placements)  (stage requirements)
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
  form schema field_source links          Workflow condition paths
  (per-form schema_json)                  (registry + introspection)
```

**Explicit non-goals in current doctrine:**

- Forms **`schema_json`** as a global catalog (stays per form version).
- **`document_field_definitions`** merged into entity registry without product decision.
- Layout **widgets** treated as fields.
- Queue preview columns as field definitions.

**Phased convergence (from Required Information V2 + configuration system):**

| Phase | Catalog outcome |
|-------|-----------------|
| **Now** | `field_definitions` = org registry; parallel TS catalogs for lifecycle/forms/layout/workflow |
| **V2 Phase 1** | Unified lifecycle rule + binding enforceability; evaluator truth |
| **Layout V2 GA** | All layout groups read registry; curated fallbacks deprecated |
| **Forms** | Stronger `field_source` linkage to registry ids; registry remains optional for pure custom form fields |
| **Workflow** | Condition catalog = registry custom fields + column introspection + documented joins |

---

## Risks if convergence is deferred

1. **Label drift** — Operators edit Fields labels; lifecycle palette and forms registry show different strings for the same datum.
2. **Enforcement drift** — Layout requiredness, lifecycle stage rules, and action preflight can disagree on the same `field_key`.
3. **Grain confusion** — Child vs inquiry_child vs customer_member fields remain ambiguous in layout preview and queue enrichment.
4. **Migration cost** — Each new enrollment field requires edits across manifest, migration seed, bindings, optional systemFieldRegistry, and optional CURATED_FIELDS.

---

## Key file index

| System | Primary files |
|--------|----------------|
| Entity registry | `web/app/api/admin/field-definitions/route.ts`, `web/lib/admin/entityFieldRegistryAttach.ts`, `web/lib/fields/fieldDefinitionConfig.ts` |
| Sections | `web/app/api/admin/field-sections/route.ts` |
| Layout catalog | `web/lib/layout/fieldCatalog.ts`, `web/app/api/admin/entity-layouts/field-catalog/route.ts` |
| Layout behavior | `web/lib/fields/resolveEffectiveFieldBehavior.ts`, `web/lib/admin/opportunityWorkflowV1FieldPlacements.ts` |
| Lifecycle catalogs | `web/lib/lifecycle/lifecycleFieldRequirementsCatalog.ts`, `lifecycleFieldRuleBindings.ts`, `lifecycleFieldPaletteMerge.ts` |
| Lifecycle runtime | `web/lib/lifecycle/lifecycleFieldRuleEvaluator.ts`, `web/lib/completion/lifecycleActionRequirementCatalog.ts` |
| Forms registry | `web/lib/forms/systemFieldRegistry.ts`, `web/lib/forms/schema.ts`, `web/lib/forms/lifecycle/formFieldCaptureIndex.ts` |
| Inquiry child | `web/lib/fields/inquiryChildFieldRegistry.ts` |
| Workflow catalog | `web/app/api/admin/workflows/field-catalog/route.ts`, `web/lib/workflowVocab.ts` |
| Document fields | `web/app/api/admin/document-field-definitions/route.ts` |
| Policy presets | `web/lib/fields/drawerFieldPolicyAdapter.ts` |

---

## Audit methodology

- Repository search for `field_definitions`, `fieldCatalog`, `FieldRegistry`, `systemFieldRegistry`, lifecycle catalog modules, and workflow field catalog routes.
- Read of active system docs (`configuration-system.md`, `record-system.md`, Required Information V2 framework).
- No code changes, migrations, or refactors performed.

**Out of scope:** Historical archived docs under `docs/archive/`, hypothetical `document_field_values` runtime (if not wired), option_sets as a field catalog (option source only).
