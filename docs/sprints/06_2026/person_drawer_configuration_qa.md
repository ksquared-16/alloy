# Person Drawer Configuration QA — Implementation Report

Sprint: published runtime parity follow-up (configuration correctness).

## 1. Conditional visibility not selectable

**Root cause:** Selecting “Conditional (another field)” persisted `crossFieldVisibility` with an empty `sourcePath`. `buildCrossFieldVisibilityCondition()` returned `undefined`, which cleared `visibleWhen`. `resolveVisibilityRuleKey()` then fell back to `"always"`, so the Builder select snapped back.

**Fix:** Persist in-progress conditional rules on item metadata (`layoutEditorCrossFieldVisibility`) even when `sourcePath` is empty. Derive `visibilityRule: "conditional"` from metadata or `visibleWhen`. Write `visibleWhen` only once `sourcePath` is valid.

**Recommendation:** Fix now (implemented).

## 2. Conditional requiredness

**Current capability:** LayoutDoc supports static `required` flags on items where the schema exposes them. Cross-field requiredness (`Employee ID required when Employee = Yes`) is **not** modeled in LayoutDoc today. Entity-level `conditionally_required` exists in `fieldRequirementPolicy.ts` for catalog fields, not layout-runtime rules.

**MVP path:** Post-MVP — smallest extension would mirror conditional visibility metadata (`layoutEditorCrossFieldRequired`) + runtime save validation hook; do not build a general rules engine in this sprint.

**Recommendation:** Post-MVP (documented).

## 3. Editability inventory

| Field | Builder inline editable | Runtime adapter | Status |
|-------|-------------------------|-----------------|--------|
| Employer | Allowed when writeback exists | `person.employer` → PATCH field_values | **A — fixed** |
| Employee | Allowed when writeback exists | `person.is_employee` → persons native | **A — fixed** |
| Employee ID | Allowed when writeback exists | `person.employee_id` → persons native | **A — fixed** |
| Email opt-in | Allowed when writeback exists | `person.email_opt_in` → field_values | **A — fixed** |
| SMS opt-in | Allowed when writeback exists | `person.sms_opt_in` → field_values | **A — fixed** |

Unsupported refs remain blocked in Builder via `isLayoutRuntimeEditableRefKeySupported()`.

**Recommendation:** Fix now (implemented).

## 4. Email / SMS opt-in source of truth

| Surface | Source | Notes |
|---------|--------|-------|
| Person Drawer Contact Summary | `person.sms_opt_in`, `person.email_opt_in` layout refs → `field_values` / VM record | Editable via person PATCH + `upsertFieldValuesFromBody` |
| Legacy person summary | `persons.communication_opt_out` native boolean | Separate from channel opt-in |
| Communications eligibility (UI-5A) | `metadata.sms_opt_in` / `metadata.email_opt_in` on person payload | Passive read — explicit `false` disables channel |

**Alignment:** Layout catalog fields map to person field_values keys (`sms_opt_in`, `email_opt_in`). Communications v2 eligibility reads the same keys from person `metadata` when present. Operators should treat layout opt-in fields as authoritative for drawer edits; ensure VM projects `metadata.sms_opt_in` / `metadata.email_opt_in` from the same field_values on refresh.

**Recommendation:** Fix now for drawer edit path; confirm VM metadata projection in a follow-up if communications UI still shows “unset” after drawer save.

## 5. Secondary contact / household members

**Model today:**
- **Canonical resolver:** `resolvePersonDrawerHouseholdModel` → `resolvePersonOverviewRelatedPeopleGroups` / `resolvePersonDrawerHouseholdContacts` (KPI + household_members related list).
- **Scalar secondary fields:** `person.secondary_contact_name` etc. are role projections; on person drawer they were not enriched from household links.

**Fix:** `enrichPersonDrawerSecondaryContactScalars()` projects the first related adult from the household resolver onto `person.secondary_*` when scalars are empty.

**Recommendation:** Fix now (implemented). Prefer `household_members` related list or KPI widget for multi-adult display; scalar secondary fields are convenience projections.

## 6. Stacked 1/2 column composition

**Model:** Section row groups with stack roles (`primary`, `stack`) already existed for 2/3 + 1/3 layouts. Person drawer overflow/right-rail flow uses `segmentSectionsForRowLayout` + `LayoutRuntimeSectionFlowView`.

**Fix:** Added `half_stacked_right` preset (`[6,6,6]`, `stacked_right_equal`) with equal 50/50 columns so one tall left section can pair with two stacked right sections.

**Recommendation:** Fix now (implemented). Builder preset picker may need UX copy — schema supports the layout.

## 7. Edit affordance + section boundaries

- Editable fields in drawer edit mode use `LAYOUT_RUNTIME_FIELD_EDITABLE_AFFORDANCE` (dashed border, hover/focus states).
- Section surfaces use stronger bottom border + `mb-3` separation (`LAYOUT_RUNTIME_BODY_SECTION_SURFACE`, `LAYOUT_RUNTIME_COMPOSITION_SECTION_SURFACE`).

**Recommendation:** Fix now (implemented).

## Files changed

- `web/lib/layout/layoutEditorVisibilityRules.ts`
- `web/lib/layout/layoutEditorCompositionModel.ts`
- `web/lib/layout/validateLayoutDocForSurface.ts`
- `web/lib/layout/layoutEditorSectionLayout.ts`
- `web/lib/layout/runtime/layoutRuntimePersonNativeFieldEdit.ts` (new)
- `web/lib/layout/runtime/layoutRuntimeFieldEditability.ts`
- `web/lib/layout/runtime/resolveLayoutRuntimeFieldControl.ts`
- `web/lib/layout/runtime/resolveDrawerHouseholdContacts.ts`
- `web/lib/layout/runtime/enrichPersonDrawerSecondaryContactScalars.ts` (new)
- `web/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm.ts`
- `web/lib/layout/runtime/layoutRuntimeSurfaceStyles.ts`
- `web/components/layout/LayoutRuntimeDrawerEditProvider.tsx`
- `web/components/layout/LayoutRuntimeFieldInput.tsx`
- `web/components/layout/LayoutRuntimePlanView.tsx`
- `web/tests/layout/personDrawerConfigurationQa.test.ts` (new)

## Tests added

`web/tests/layout/personDrawerConfigurationQa.test.ts` — conditional visibility persistence, runtime evaluation, editability gates, person native patch/save, secondary contact enrichment, stacked half preset, opt-in field coverage.

Run:

```bash
cd web && npm run test -- tests/layout/personDrawerConfigurationQa.test.ts
cd web && npx tsc --noEmit
```

## Manual QA checklist

- [ ] Builder: select “Conditional (another field)” on Employee ID — stays selected, conditional panel opens
- [ ] Builder: set source `person.is_employee`, operator “is_true”, save layout
- [ ] Published person drawer: Employee ID hidden when Employee = No; visible when Yes
- [ ] Enable inline editable on Employer / Employee / Employee ID; open drawer Edit mode
- [ ] Editable fields show dashed outline; read-only fields stay flat
- [ ] Edit Employee = Yes, Employee ID, Employer; save succeeds and values persist after refresh
- [ ] Contact Summary: SMS/Email opt-in editable and save
- [ ] Household with second parent: scalar “Secondary contact name” or household_members list shows second adult
- [ ] Layout with half + stacked-half sections: builder preview matches published runtime
- [ ] Section cards have clearer bottom separation in drawer body

## Per-issue recommendations summary

| Issue | Recommendation |
|-------|----------------|
| Conditional visibility | Fix now |
| Conditional requiredness | Post-MVP |
| Inline editability | Fix now |
| Edit affordance | Fix now |
| Section boundaries | Fix now |
| Email/SMS opt-in audit | Fix now (drawer path); verify VM metadata projection follow-up |
| Secondary contacts | Fix now |
| Stacked half columns | Fix now |
