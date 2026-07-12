# Field Catalog Execution Plan

**Path:** `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/field_catalog_execution_plan.md`  
**Date:** 2026-06-06  
**Status:** Execution plan — no implementation  
**Scope:** Converge existing field systems onto **`field_definitions`** as authoritative entity field catalog; align consumers with **Layout Contract V1**  
**Prerequisite:** [`field_catalog_convergence_audit.md`](./field_catalog_convergence_audit.md)

**Canonical alignment docs (Layout Contract V1 bundle):**

| Doc | What it locks |
|-----|----------------|
| [`docs/sprints/archive/05_2026/layout_field_behavior_semantics_v1.md`](../sprints/archive/05_2026/layout_field_behavior_semantics_v1.md) | **Structure vs surface:** `field_definitions` = registry; `field_placements_v1` = drawer behavior overlay; resolution order placement → definition → preset |
| [`docs/system/configuration-system.md`](../system/configuration-system.md) | Four-plane control plane; mutation classes A/B/B2/C; Fields vs Layouts ownership |
| [`docs/sprints/archive/06_2026/status_ownership_and_lifecycle_grain_expansion.md`](../sprints/archive/06_2026/status_ownership_and_lifecycle_grain_expansion.md) §10 | Layout Configuration consumes runtime context; no grain hardcoding in layout JSON; field **refs** not enrollment branches |
| [`docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/runtime_convergence_inventory.md`](./runtime_convergence_inventory.md) | Layout runtime north star (`entity_layouts` / `LayoutDoc`); field catalog feeds layout item refs |

**Related (do not redesign):**

- [`required_information_v2_operational_readiness_framework.md`](../sprints/archive/06_2026/required_information_v2_operational_readiness_framework.md) — readiness spine for lifecycle consumers
- [`completed/readiness_phase_1_closeout.md`](../sprints/archive/06_2026/completed/readiness_phase_1_closeout.md) — Phase 1 shipped; field-catalog convergence extends identity, not readiness architecture
- [`documents-and-forms.md`](../product/documents-and-forms.md) — forms schema boundary

---

## Executive summary

**Goal:** One **authoritative entity field catalog** (`field_definitions` + `field_section_definitions`), with all entity-field consumers resolving identity, labels, and types from org registry rows keyed by `(entity_type, field_key)`.

**Method:** Converge **existing** systems — no new catalog table, no forms redesign, no lifecycle product redesign. Deprecate **duplicate field lists** in code; keep **orthogonal layers** (layout behavior, lifecycle stage rules, per-form schemas) as separate stores that **reference** registry keys.

**Layout Contract V1 constraint:** Field catalog convergence must preserve the locked split:

```
field_definitions          → WHAT fields exist (structure)
field_placements_v1        → HOW fields behave on drawer_overview (surface)
lifecycle stage field_rules → WHEN fields are required for progression (readiness)
form schema_json           → WHICH fields appear on a form version (capture)
```

Convergence unifies **identity** (first column). It does **not** merge behavior, readiness, or form schema into one JSON blob.

**Child Model doctrine (ratified — governs every `inquiry_child` task below):** Per [`child_model_convergence_audit.md`](./child_model_convergence_audit.md) §FINAL DECISION, **`inquiry_child` is kept as a technical/config field-catalog projection over OCM (`opportunity_customer_members`), but is NOT a primary product-facing layout configuration surface.** The `inquiry_child` tasks here (registry entity_type, native OCM-column manifest, `child_inquiry` refKey namespace, layout catalog API rows) are the **config/catalog plumbing for OCM-scoped fields** — not an endorsement of `inquiry_child` as a product-facing layout entity. Accordingly: durable child truth lives on the **Child / `customer_member`** record; **layout configuration prefers the durable Child / Customer Member concept**; OCM-scoped fields appear in layouts only through an **enrollment-child context** (relationship section / repeater / widget), never as a standalone "Inquiry Child" entity layout; raw table names (OCM) are never exposed in UX; no separate inquiry-child runtime or presentation system is introduced; and existing waitlist / readiness / lifecycle / child-grain queue dependencies are preserved unchanged.

---

## Authority model

### Authoritative (target state)

| Asset | Role |
|-------|------|
| **`field_definitions`** | Org-scoped entity field identity: `field_key`, `field_type`, label, help, visibility, option binding, default policies |
| **`field_section_definitions`** | Org-scoped section taxonomy for catalog grouping |
| **`field_values`** | Custom field value storage (paired with registry ids/keys) |
| **Platform native manifests** (code) | Seed source for `is_system` rows only — `inquiryChildFieldRegistry`, location metadata manifests, record-number batch seeds — **not** a runtime catalog |
| **Platform lifecycle rule catalog** (code, consolidated) | Stable `rule_id` set + single enforceability flag + bindings — **requirement vocabulary**, not field structure |
| **`systemFieldRegistry`** (code or generated) | Forms **operational mapping** layer — links form field ids to CRM/shared-value keys; may read registry at authoring time |

### Remains separate (by design)

| Asset | Why separate |
|-------|----------------|
| **`form_definition_versions.schema_json`** | Per-form versioned capture trees; immutable publish contract |
| **`field_placements_v1`** | Layout Contract V1 surface-behavior overlay on `record_drawer_layouts` |
| **`departments.metadata` lifecycle field rules** | Stage-scoped readiness config (rule ids + levels) |
| **`document_field_definitions`** | Doc-type scoped metadata; different entity model |
| **Layout widgets** (`LAYOUT_WIDGET_CATALOG`) | UI blocks, not data fields |
| **Workflow join paths** (`vendor_status.key`, etc.) | Derived/relationship paths, not registry fields |
| **`option_sets` / `config.catalog_key`** | Option **sources**, not field definitions |
| **Agent planner catalogs** (`JOB_OVERVIEW_RESOLUTION_CATALOG`) | Semantic layout hints for AI; not operator registry |
| **Object-label progression vocabulary** | Display projection over field rules (legacy BOS/checklist grain) |

### Deprecated (convergence retires)

| Asset | Replacement |
|-------|-------------|
| **`CURATED_FIELDS`** in `fieldCatalog.ts` (steady state) | `field_definitions` reads per entity group; bootstrap-only fallback until seeds guaranteed |
| **Duplicate workflow path lists** | Single workflow field picker API |
| **`LIFECYCLE_OBJECT_FIELD_DETAIL` static copy** | Generated from unified rule catalog + registry labels |
| **Catalog vs binding dual `runtime_enforced` flags** | Single enforceability source (Readiness V2 Phase 1 remainder) |
| **Hardcoded person drawer field spec lists** (steady state) | Registry + layout composition |
| **Hardcoded drawer policy storage maps** (steady state) | Registry `config.storage` or generated from native manifests |
| **Layout child_inquiry refKey namespace** (`child_inquiry.*`) | `inquiry_child.{field_key}` aligned with registry |

---

## Convergence principles

1. **Registry first** — New entity-attached fields ship as `field_definitions` (+ migration seed for system natives) before any consumer hardcodes a key.
2. **Reference, don't duplicate** — Consumers store `field_key` / `entity_type` or lifecycle `rule_id`, not parallel label/type catalogs.
3. **Respect Layout Contract V1** — Catalog convergence does not move Required/Editability back to Fields as primary control for opportunity drawer; does not collapse `field_placements_v1` into registry rows.
4. **Respect forms boundary** — `schema_json` stays per form; convergence adds **linkage** (`field_source.field_definition_id` or stable platform id), not schema merge.
5. **Respect lifecycle boundary** — Stage requirements stay in department metadata; convergence aligns **rule_id → registry field_key** bindings, not builder UX.
6. **Native manifest → seed pipeline** — Code manifests generate migrations/seeds; operators edit seeded rows in Settings, not manifest files.
7. **No runtime until parity** — Layout V2 catalog changes stay flag-gated until registry-backed picker matches live drawer keys (per `runtime_convergence_inventory.md`).

---

## Phase roadmap (overview)

| Phase | Name | Outcome | Depends on |
|-------|------|---------|------------|
| **FC-0** | Registry completeness | All entity types in audit have seeded system defs; native manifests feed seeds only | — |
| **FC-1** | Layout catalog alignment | Layout pickers + effective preview use registry for all supported entity groups | FC-0 |
| **FC-2** | Policy / storage metadata | `drawerFieldPolicyAdapter` reads storage class from registry config where possible | FC-0 |
| **FC-3** | Lifecycle identity alignment | Single enforceability flag; bindings reference registry keys; custom rules = registry-only | Readiness Phase 1 (shipped) |
| **FC-4** | Forms linkage | `field_source` carries registry reference; systemFieldRegistry generated or validated against defs | FC-0, forms boundary doc |
| **FC-5** | Workflow catalog union | Workflow picker = column introspection ∪ registry custom fields | FC-0 |
| **FC-6** | Person drawer + layout runtime | Hardcoded person field specs retired; LayoutDoc items use registry refKeys | FC-1, layout runtime adoption |

Phases may overlap where risk gates allow. **FC-0** is the critical path.

---

## 1. `field_definitions` (anchor catalog)

### Current usage

- **Operator authority** for entity field structure via Settings → Fields / Field grouping
- **Runtime attach** on entity GET (`entityFieldRegistryAttach.ts`): defs, sections, `field_values`, policy resolution
- **PATCH paths** for opportunity, job, inquiry_child (OCM), public booking subset
- **Lifecycle palette merge** for org custom fields (`inquiry_child` → Child entity)
- **Seeds** via migrations for system natives (record numbers, inquiry_child OCM columns, location/person childcare fields)
- **Companion allowlists** in code: `FIELD_DEFINITION_ENTITY_TYPES`, `ADMIN_FIELD_TYPES`, reserved inquiry_child keys

### Target usage

- **Single authoritative catalog** for all org-configurable entity-attached fields across CRM, drawer, public surfaces, layout pickers, lifecycle custom rules, and workflow custom-field conditions
- **Platform manifests** exist only to **seed** `is_system` rows and validate reserved keys — never consulted at runtime for labels/types when a registry row exists
- **Storage hints** on registry rows (`config.storage`: `column` | `field_values` | `metadata` | `relationship`) for policy adapter and PATCH routing — populated for all enforceable system fields
- **Stable refKey convention** for layout: `{entity_type}.{field_key}` (singular entity type matching DB, e.g. `inquiry_child.desired_start_date`)

### Convergence path

| Step | Work | Exit criterion |
|------|------|----------------|
| FC-0.1 | **Manifest inventory** — List every code manifest that seeds or guards defs (inquiry_child, location, person address, record numbers) | Single index doc section; no orphan manifests |
| FC-0.2 | **Seed parity audit** — Script/report: every manifest native key has `is_system` row per org (or documented exception) | Zero missing system rows on staging reference org |
| FC-0.3 | **Reserved key enforcement** — Extend reserved-key pattern to other native entities as manifests are added (location public natives already partitioned) | POST field-definitions rejects native collisions for all manifest-backed types |
| FC-0.4 | **Storage metadata** — Add `config.storage` (+ optional `config.patch_body_key`) for opportunity/job/inquiry_child system fields in seeds + adapter read path | Policy adapter uses registry when `config.storage` present; hardcoded map is fallback only |
| FC-0.5 | **Entity type coverage decision** — Document which grains get registry entity types vs stay on case record only (child household profile vs inquiry_child) per child-fields audit | Recorded in platform_convergence; no new entity types without architecture sign-off |

### Risks

| Risk | Mitigation |
|------|------------|
| Operators edit system row labels/types and break bindings | Bindings keyed on `field_key`, not label; document system row edit scope in Settings |
| Seed migrations miss new orgs | Bootstrap/vertical-bootstrap paths call same seed functions as migrations |
| Storage metadata wrong → PATCH regression | FC-0.4 ships with parity tests against current `drawerFieldPolicyAdapter` maps |
| Expanding entity types prematurely (household child) | FC-0.5 explicit grain decision before new `entity_type` values |

---

## 2. Layout consumers

Layout consumers **compose and behave** using registry keys; they must not maintain parallel field catalogs.

### Current usage

| Consumer | Today |
|----------|--------|
| **Record drawer workflow v1** | `effectiveDrawerLayoutPreview.ts` — field keys from `field_definitions`; sections from catalog + workflow virtuals |
| **`field_placements_v1`** | Required/Editability on opportunity drawer — keys match registry |
| **Layout Settings** | Field picker, batch placement, behavior controls — registry-backed for opportunity |
| **`fieldCatalog.ts` + entity-layouts API** | Opportunity/person from DB; child/child_inquiry from `CURATED_FIELDS`; flag-gated preview only |
| **`drawerFieldPolicyAdapter`** | Hardcoded enforceable key sets + storage paths |
| **Person drawer** | `personDrawerParentAddressFields.ts`, operating section dedicated key sets — parallel to person defs |
| **Layout integrity** | Compares layout requiredness to registry + placement |
| **Layout V2 / LayoutDoc** (foundation) | Item refs intended to mirror registry; not production runtime |

### Target usage

| Consumer | Target |
|----------|--------|
| **All layout pickers** | Read active `field_definitions` for entity group; refKey = `{entity_type}.{field_key}` |
| **`field_placements_v1`** | Unchanged role (Layout Contract V1); keys must exist in registry |
| **Layout V2 catalog API** | `child_inquiry` group → `entity_type: inquiry_child` (config/catalog plumbing only — see Child Model doctrine; `inquiry_child` is not a product-facing layout surface, and these OCM-scoped fields surface via an enrollment-child context, not a standalone entity layout); deprecate `CURATED_FIELDS` except empty-org bootstrap |
| **Policy adapter** | Resolve storage from registry `config.storage` (FC-0.4) |
| **Person drawer** | Dedicated key specs removed; layout sections reference person registry keys only |
| **LayoutDoc items** | Field items carry registry ref; widgets remain separate catalog |

### Convergence path

| Step | Work | Exit criterion |
|------|------|----------------|
| FC-1.1 | **Map layout entity groups → registry entity_type** — Document and implement: `opportunity`, `person`, `inquiry_child` (both child + child_inquiry groups) | API returns registry fields for inquiry_child group |
| FC-1.2 | **RefKey normalization** — Standardize on singular DB entity_type in refKeys; adapter translates legacy `child_inquiry.*` during transition | Parser accepts both; new layouts write canonical form |
| FC-1.3 | **Curated fallback shrink** — `CURATED_FIELDS` only when org has zero active defs for group; telemetry on fallback use | Fallback rate → 0 on seeded orgs |
| FC-1.4 | **Person drawer FC-6 prep** — Audit person dedicated keys vs person `field_definitions`; gap list for missing registry rows | Every dedicated key has registry row or documented injection exception |
| FC-1.5 | **Layout Contract V1 regression suite** — Extend layout integrity + field policy tests to include inquiry_child keys used in inquiry children grid | No required placement for keys absent from registry |
| FC-2.* | Policy/storage (see §1) | Adapter registry-first |

**Layout Configuration compatibility:** Layout blocks that display field values must receive **resolved values** from runtime/context payloads, not re-query ad hoc catalogs. Field catalog convergence supplies **ref keys** in layout JSON; grain/subject logic stays in `QueueRowContext` / drawer attach — not in catalog modules. System block → contract mapping: [`entity_status_lifecycle_stage_and_location_scope_contract.md`](../sprints/archive/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md) §7.5; field `entity_scope` + `option_source` for dependent selects: §4.5, §7.5.

### Risks

| Risk | Mitigation |
|------|------------|
| Preview refKeys ≠ live drawer keys | FC-1.2 + parity tests against `OpportunityInquiryChildrenSection` keys |
| Layout V2 adoption blocked on person child grain | FC-0.5 grain decision; child group may stay inquiry_child-only until household profile registry exists |
| Moving behavior into registry violates Layout Contract V1 | Explicit review gate: structure changes only in FC phases; behavior stays in placements |
| AdminV2 runtime performance | Registry attach already cached (`entityFieldRegistryAttach`); no new per-field catalog queries in reveal path |

---

## 3. Lifecycle consumers

Lifecycle **does not become** the field catalog. It **consumes** registry keys through bindings and custom rules.

### Current usage

| Consumer | Today |
|----------|--------|
| **`LIFECYCLE_FIELD_REQUIREMENT_CATALOG`** | Platform selectable rules (TS) |
| **`LIFECYCLE_FIELD_RULE_BINDINGS`** | rule_id → value paths, form_capture_keys, enforceability |
| **`lifecycleFieldPaletteMerge`** | Merges org `field_definitions` as custom rules |
| **Department metadata** | `required_rule_ids`, `recommended_rule_ids`, `rule_levels_v1` |
| **Readiness engine** (Phase 1 shipped) | Level-aware evaluation, `ReadinessResult` contract |
| **`lifecycleActionRequirementCatalog`** | Action preflight consumer |
| **Object-label progression catalog** | Legacy checklist / BOS display grain |
| **Forms lifecycle coverage** | Matches form capture index to bindings |

### Target usage

| Consumer | Target |
|----------|--------|
| **Platform rules** | One module truth for rule metadata + enforceability + binding path (catalog/binding merge) |
| **Custom rules** | **Only** fields that exist in org `field_definitions` for mapped entity types |
| **Labels in builder** | Registry label wins via existing palette merge; platform label is fallback |
| **Evaluator** | Resolves values via binding path; binding `field_key` must match registry |
| **Object labels** | Projection only — not a field catalog |
| **Readiness** | Unchanged spine; gains consistent field identity from registry-aligned bindings |

### Convergence path

| Step | Work | Exit criterion |
|------|------|----------------|
| FC-3.1 | **Catalog/binding unify** — Remaining Readiness V2 Phase 1 item: single enforceability flag per rule (remove catalog vs binding drift) | Tests: palette enforceable cap = evaluator block behavior |
| FC-3.2 | **Binding registry audit** — For each binding with `field_key`, verify matching `field_definitions` entity_type (person, inquiry_child, opportunity) on reference org | Matrix doc + CI check for staging seed world |
| FC-3.3 | **form_capture_keys trim** — Derive capture aliases from `systemFieldRegistry` ids + registry field_key where possible; reduce manual string lists | One source for intake field ids per rule |
| FC-3.4 | **Custom rule validation** — Stage save rejects `custom:*` rules whose field_key no longer exists in registry | PATCH lifecycle-requirements validation |
| FC-3.5 | **Object-label deprecation path** — New UI surfaces use rule ids only; object labels generated via `deriveObjectLabelsFromFieldRules` | No new features on label-only config |
| FC-3.6 | **Grain documentation** — Lock: Child *field/config* rules = inquiry_child registry + OCM paths (technical projection, not a product-facing layout surface — Child Model doctrine). Durable child truth = Child / `customer_member`; OCM-scoped fields reach layouts via enrollment-child context only | Matches child-model decision; no separate inquiry-child product entity/runtime; no `customer_member` rule changes without architecture sign-off |

**Do not:** Move stage requirements into `field_definitions`. **Do not:** Merge lifecycle builder into Fields Settings.

### Risks

| Risk | Mitigation |
|------|------------|
| Enforceability unify breaks staging configs | Migration map in metadata; dual-read during transition (Readiness Phase 1 pattern) |
| Custom org fields deleted from registry leave orphan rule ids | FC-3.4 validation + builder warning |
| Forms coverage false negatives if capture keys trimmed incorrectly | Contract tests in `evaluateFormsLifecycleFieldCoverage.test.ts` |
| Household vs inquiry child grain confusion | FC-3.6 frozen; separate entity type requires explicit sprint |

---

## 4. Forms consumers

Forms stay a **separate capture catalog** per version. Convergence is **identity linkage**, not schema merge.

### Current usage

| Consumer | Today |
|----------|--------|
| **`systemFieldRegistry`** | ~15 platform intake/enrollment fields; authoring palette |
| **`schema_json`** | Per-version field trees; optional `field_source` |
| **`formFieldCaptureIndex`** | Lifecycle coverage matching via registry ids + unmapped custom |
| **Intake / linkage** | CRM promotion paths; shared_values keys |
| **Lifecycle coverage UI** | Reads binding aliases, not registry ids |

### Target usage

| Consumer | Target |
|----------|--------|
| **`systemFieldRegistry`** | **Generated or validated** against platform seed defs + stable ids; optional runtime read of org defs at **authoring** time for labels/options |
| **`field_source` on schema fields** | Prefer `{ entity_type, field_key, field_definition_id? }` when field maps to registry |
| **`schema_json`** | Still per-form; no global form catalog |
| **Lifecycle coverage** | Match order: `field_definition_id` → registry field_key → systemFieldRegistry id → label token (legacy) |
| **Public intake** | Unmapped custom fields remain allowed; cannot satisfy lifecycle rules without mapping |

### Convergence path

| Step | Work | Exit criterion |
|------|------|----------------|
| FC-4.1 | **Boundary doc update** — Amend `documents-and-forms.md` with chosen linkage option (registry id vs entity_type+field_key) | Product sign-off |
| FC-4.2 | **Authoring UX** — When adding system field, stamp `field_source` with registry reference where entity_type maps | New/edited forms in staging carry linkage |
| FC-4.3 | **Registry validation script** — systemFieldRegistry entries must resolve to platform seed keys | CI check on registry file |
| FC-4.4 | **Coverage matcher update** — `evaluateFormsLifecycleFieldCoverage` checks registry keys before string alias lists | Coverage tests green with linkage |
| FC-4.5 | **Option parity** — Select fields on forms use same `option_set_key` as registry when linked | Visual parity test on staging |

**Explicit non-goals:** Auto-sync form submissions → `field_values`. Auto-generate form schemas from registry. Merge packet PDF fields into entity registry.

### Risks

| Risk | Mitigation |
|------|------------|
| Published forms lack linkage on old versions | Grandfather: alias matching remains fallback |
| Operators change registry label/options; form schema stale | Forms publish immutability unchanged; authoring refresh prompt optional later |
| Over-linking breaks public intake-only forms | Linkage optional except system fields used for lifecycle coverage |

---

## 5. Workflow consumers

Workflow conditions need **DB paths + registry custom fields + documented joins** — not a third field catalog.

### Current usage

| Consumer | Today |
|----------|--------|
| **`GET /api/admin/workflows/field-catalog`** | `information_schema` RPC per entity table + vendor relationship fields + location fallbacks |
| **`WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE`** | Hardcoded parallel path list in workflow editor |
| **Runtime evaluation** | Uses condition paths against entity payloads — not registry-aware for custom fields |

### Target usage

| Consumer | Target |
|----------|--------|
| **Workflow field picker API** | **Union:** (a) table/join columns from RPC, (b) active org `field_definitions` custom fields (`field_values` keys) with typed operators, (c) documented relationship paths |
| **Vocabulary module** | Deprecated in favor of API or thin wrapper over API |
| **Condition paths for custom fields** | Namespaced: e.g. `field_values.{field_key}` or existing convention documented in `api-contracts.md` |
| **Registry** | Source of custom field keys, labels, types for picker |

### Convergence path

| Step | Work | Exit criterion |
|------|------|----------------|
| FC-5.1 | **Union picker spec** — Document path grammar for registry-backed custom fields | API contract doc |
| FC-5.2 | **API implementation** — Append org custom defs to RPC column list; de-dupe by key | Workflow builder shows custom fields on staging |
| FC-5.3 | **Deprecate workflowVocab paths** — Editor uses API only; remove duplicate lists when parity proven | Single picker source |
| FC-5.4 | **Runtime evaluator parity** — Condition evaluation resolves custom field paths consistently with picker | Integration test on job/opportunity conditions |
| FC-5.5 | **inquiry_child paths** | Document join-based paths for OCM fields in workflow conditions (not registry entity_type in WHERE) | Doc + example conditions |

**Remains separate:** Relationship/join fields (vendor_status, vertical arrays) — not in entity registry.

### Risks

| Risk | Mitigation |
|------|------------|
| Custom field operators wrong for type | Map `field_type` → operator set (reuse workflow catalog logic) |
| Org-scoped picker in global workflow templates | Conditions store org_id context; document multi-tenant limitation |
| Performance on wide defs table | Cache picker per org in workflow editor session |

---

## 6. System field consumers

“System fields” span **DB-seeded registry rows**, **code manifests**, and **forms platform registry** — convergence makes manifests seeds-only and registry rows authoritative.

### Current usage

| Source | Role |
|--------|------|
| **`is_system` rows in `field_definitions`** | Operator-visible system fields (labels editable, keys fixed) |
| **`inquiryChildFieldRegistry` manifest** | Native OCM keys, PATCH partition, reserved keys, migration seeds |
| **`locationMetadataFieldKeys` / public booking natives** | Location metadata + booking write partition |
| **Record number batch migrations** | System defs for `*_number` fields |
| **`systemFieldRegistry`** | Forms platform operational fields |
| **`drawerFieldPolicyAdapter` presets** | Enforceability caps for opportunity/job native keys |
| **Vertical bootstrap seeds** | Childcare MVP control plane inserts defs + sections |

### Target usage

| Source | Target |
|--------|--------|
| **Manifests** | Generate seeds only; runtime reads registry |
| **`is_system` rows** | Authoritative for structure/visibility; keys immutable |
| **PATCH partition helpers** | Key sets generated from manifest constants shared with registry reserved keys |
| **`systemFieldRegistry`** | Aligned to platform seed keys; ids stable for forms linkage |
| **Policy presets** | Shrinks as `config.storage` coverage grows |

### Convergence path

| Step | Work | Exit criterion |
|------|------|----------------|
| FC-0.* | Registry completeness (§1) | Seeds from all manifests |
| FC-6.1 | **Manifest → seed generator** — One script pattern for inquiry_child, location, record numbers (no hand-written drift) | New native field = manifest + generated seed only |
| FC-6.2 | **Bootstrap parity** — Vertical bootstrap uses same generator as migrations | New org has identical system defs as migrated org |
| FC-6.3 | **systemFieldRegistry sync** — CI validates registry entries against seed manifest keys | Broken mapping fails CI |
| FC-6.4 | **Policy preset shrink** — Remove keys from hardcoded adapter maps when `config.storage` present | Adapter map size monotonically decreases |

### Risks

| Risk | Mitigation |
|------|------------|
| Manifest and migration drift | FC-6.1 single generator |
| Operators disable system fields (`is_active: false`) break layouts | Layout picker respects active flag; integrity warns on required inactive fields |
| Forms registry ids decouple from registry field_keys | FC-6.3 + FC-4 linkage |

---

## Cross-system dependency graph

```
                    FC-0 Registry completeness
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
     FC-1 Layout          FC-3 Lifecycle        FC-5 Workflow
     catalog              identity               picker union
        │                     │                     │
        └──────────┬──────────┴──────────┬──────────┘
                   ▼                     ▼
                FC-2 Policy          FC-4 Forms linkage
                storage metadata
                   │
                   ▼
                FC-6 Person drawer +
                   layout runtime adoption
```

**Parallel safe work:** FC-3.1 (enforceability unify) can proceed with Readiness team. FC-5 spec can draft during FC-0. Layout Configuration block work (status_ownership Phase 2) may proceed if blocks use **registry ref keys** and consume runtime payloads — not parallel catalogs.

---

## Alignment with Layout Contract V1

| Layout Contract V1 rule | Field catalog convergence behavior |
|-------------------------|-----------------------------------|
| `field_definitions` = structure | FC-0 expands registry; manifests become seeds only |
| `field_placements_v1` = drawer behavior | Unchanged; placements reference registry keys |
| Placement → definition → preset resolution | FC-2 moves preset **storage** knowledge into registry config; preset **caps** may remain code |
| Fields Settings de-emphasizes drawer Required/Editability for opportunity | Convergence does not reverse; lifecycle Required stays in Lifecycle Builder |
| Layout JSON must not hardcode enrollment grain | Catalog supplies **field refs**; subject/grain from `QueueRowContext` |
| Mutation class B = catalog placement (`section_key`, `sort_order`) | Registry remains placement target |
| Mutation class B2 = layout behavior | Separate from catalog identity |

When **LayoutDoc** production runtime ships (`runtime_convergence_inventory.md`), field items should use the same refKey convention established in FC-1 — one ref namespace across record drawer v1 and layout v2.

---

## Success criteria

| Criterion | Measurement |
|-----------|-------------|
| **Single identity** | No production consumer maintains its own label/type list for entity fields when a registry row exists |
| **Seeded parity** | Reference staging org: 100% manifest native keys present as `is_system` defs |
| **Layout picker** | entity-layouts field-catalog returns registry rows for inquiry_child; `CURATED_FIELDS` unused on seeded orgs |
| **Lifecycle custom rules** | Every `custom:*` rule id resolves to an active registry row |
| **Forms linkage** | New system fields on staging forms carry `field_source` registry reference |
| **Workflow picker** | Custom org fields appear in workflow field catalog API |
| **Layout Contract V1 preserved** | Field policy + integrity tests pass; no behavior moved into registry policies as primary operator control |
| **No new catalog table** | Convergence uses existing `field_definitions` |

---

## Out of scope (this execution plan)

- `document_field_definitions` merge
- Forms schema redesign or auto-generation from registry
- Lifecycle Builder UX redesign
- New readiness scopes (packet, relationship, freshness)
- Queue row preview column registry
- Production LayoutDoc / `entity_layouts` adoption (depends on layout runtime sprint)
- Customer_member / household child registry entity type (requires grain architecture decision)

---

## Suggested implementation sequencing (for eng)

1. **FC-0.1–0.3** — Manifest inventory + seed parity + reserved keys (low runtime risk)
2. **FC-3.1** — Enforceability unify (readiness team, small blast radius)
3. **FC-1.1–1.3** — Layout catalog registry-backed (flag-gated)
4. **FC-4.1–4.3** — Forms linkage spec + CI validation
5. **FC-0.4 / FC-2** — Storage metadata + policy adapter
6. **FC-5** — Workflow picker union
7. **FC-6** — Person drawer hardcoded retirement (after layout runtime plan)

Each tranche: update active topic doc (`configuration-system.md` or `record-system.md`) when behavior-visible parity is claimed.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-06 | Initial execution plan from field catalog convergence audit |
