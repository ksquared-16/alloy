# Lifecycle Required Information — Child Field Source Audit

**Path:** `docs/sprints/archive/06_2026/lifecycle_required_info_child_fields_audit.md`  
**Date:** 2026-05-31  
**Status:** Audit only (no merge of inquiry vs canonical child in this pass)

## Question

Where do **Child** fields in Lifecycle Builder Required Information come from, and are they the same as canonical child / customer member fields?

## Summary

| Layer | What operators see | Under the hood |
|-------|-------------------|----------------|
| **UI entity** | `Child` (`LIFECYCLE_REQUIREMENT_ENTITIES`) | Single palette bucket |
| **Catalog** | `child:*` rule ids in `LIFECYCLE_FIELD_REQUIREMENT_CATALOG` | Platform-defined labels |
| **Runtime evaluation** | Same `child:*` rules | `lifecycleFieldRuleBindings` → `value_source: inquiry_child` → OCM columns |
| **Org custom fields** | Shown under Child when not in catalog | `field_definitions.entity_type = inquiry_child` mapped to entity `child` |

**Child** and **inquiry child** are **not merged** into one DB model in this UI — they are **one operator-facing entity** backed by **inquiry-child (OCM) data paths** only.

There is **no** separate Lifecycle palette for `customer_members` / canonical household child records today.

## Sources (code)

### 1. Platform catalog (`child:*` rules)

`web/lib/lifecycle/lifecycleFieldRequirementsCatalog.ts` — rules such as `child:first_name`, `child:program_interest`, stage-filtered opportunity rules excluded from lead palette via `lifecycleFieldPaletteForStage`.

### 2. Rule bindings (runtime + forms)

`web/lib/lifecycle/lifecycleFieldRuleBindings.ts`:

- All `entity: "child"` bindings use `value_source: "inquiry_child"`.
- `ocm_field` maps to `opportunity_customer_members` columns (e.g. `first_name`, `desired_program_type`).
- Form capture keys align with enrollment lead / child intake schemas (`child_first_name`, etc.).

Preflight and completion read these via `lifecycleFieldRuleEvaluator` → `extractInquiryChildSnapshot` — not `customer_members` directly.

### 3. Org field definitions

`web/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle.ts` loads `entity_type` in `person`, `inquiry_child`, `opportunity`, `customer`.

`lifecycleEntityFromFieldDefinitionEntityType` maps **`inquiry_child` → palette entity `child`**.

Custom org fields become `custom:child:{field_key}` in the palette (`lifecycleFieldPaletteMerge.ts`).

### 4. Deprecated composite rules (hidden)

`person:email_or_phone` is in `DEPRECATED_LIFECYCLE_FIELD_RULE_IDS` — not shown as a selectable field. Conditional “Email or Phone” / “DOB or Age Group” are **not** implemented as single palette rows (removed from operator copy May 2026).

## What does *not* appear in Lifecycle Builder Child palette

- Direct **customer_member** / household child table fields (unless duplicated as `inquiry_child` field_definitions).
- Per-child **outcome_status_key** (case child lifecycle) — case coordination, not intake field rules.
- Opportunity-only tour/enrollment fields (separate **Opportunity** entity in selector).

## Expected direction (recommendation)

**Do not blindly merge** canonical `customer_members` and inquiry OCM fields in the palette without a product model:

1. **Short term (current):** Keep one operator **Child** entity tied to **inquiry_child / OCM** — this matches create-lead intake, form coverage, and stage preflight.
2. **Medium term:** If canonical child fields must be configurable separately, introduce either:
   - a second entity label (e.g. “Household child”) with `value_source: customer_member`, or
   - explicit rule metadata showing which grain each field evaluates.
3. **Unification path:** Single child grain for progression only when runtime evaluator, forms, and action intake spec all read the same snapshot API — likely OCM-first for enrollment, with customer_member sync as implementation detail.

## Action intake alignment

`resolveCreateLeadActionIntakeSpec` includes `child:*` rules as **recommended** at capture (not blocking create) — same OCM-oriented rule ids as Required Information.
