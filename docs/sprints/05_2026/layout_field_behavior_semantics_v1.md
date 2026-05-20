# Layout + field behavior semantics v1

**Path:** `docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`  
**Status:** Complete through Card 7 (Cards 0–7 shipped; Card 8 UI density polish pending)  
**Scope lock:** May 2026

## Sprint goal

Move operator-facing **Required** and **Editability** configuration from the primary Fields Settings surface to **Record layouts** (`field_placements_v1` on org `record_drawer_layouts.config_json`) for the **opportunity workflow v1** drawer, while keeping `field_definitions` policies as **compatibility defaults** (not the primary operator control for drawer behavior).

## Risk gate decisions (locked)

| Gate | Decision |
|------|----------|
| **G0** | Use `record_drawer_layouts.config_json.field_placements_v1` JSON overlay for v1. **No new DB table.** |
| **G1** | Confirm no new table for v1. |
| **G2** | Layout placement writes must **NOT** overwrite `field_definitions.requirement_policy` or `interaction_policy`. |
| **G3** | **No automatic sync** from placement writes to `field_definitions.is_required` in v1. `is_required` remains compatibility/default state on the definition row. Opportunity drawer runtime, PATCH enforcement, layout integrity, and Layouts Settings UI all use **effective** behavior (`placement → definition → preset`). Operators change drawer requiredness on **Record layouts**, not Fields. |
| **G4** | Baseline tests run before Card 0: `tests/fields/fieldRequirementPolicy.test.ts`, `tests/fields/enforceDrawerFieldPoliciesOnPatch.test.ts`, `tests/config/layoutIntegrityValidator.test.ts` — **27 passed**. |
| **G5** | Hardcoded inquiry summary layout migration remains **out of scope**. |

## Resolution order (runtime)

For surface `drawer_overview` only (opportunity workflow v1 drawer today):

1. **Placement override** — valid `field_placements_v1` entry for `field_key` on `surfaces.drawer_overview`
2. **Definition default** — `field_definitions.requirement_policy` / `interaction_policy` (or legacy `is_required` when policy JSON absent)
3. **System preset** — `drawerFieldPolicyAdapter` caps (e.g. non-enforceable → optional requirement; deferred/action/relationship fields not placement-controlled)

Implemented in `resolveEffectiveFieldBehavior` + `buildDrawerFieldPolicyResolvedMap` (`web/lib/fields/`). Malformed placement rows are skipped on read (fail closed to definition/preset); resolvers do not throw.

## OUT of scope (v1)

Forms, public booking, workflow status-transition enforcement, inquiry_child/OCM field behavior on layouts, config assist new ops, new DB table, inquiry summary migration, advanced conditional requiredness, job drawer layout behavior controls (job PATCH still uses definition-based enforcement only).

## Implementation cards

| Card | Status | Summary |
|------|--------|---------|
| 0 | **Done** | Types, `fieldPlacementV1` parser, `resolveEffectiveFieldBehavior`, unit tests |
| 1 | **Done** | `PATCH /api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements` (layout JSON only) |
| 2 | **Done** | Opportunity drawer GET `_field_policy_resolved` (placement-aware) |
| 3 | **Done** | Opportunity PATCH enforcement via effective policies |
| 4 | **Done** | Placement-aware layout integrity (`required_on_layout_not_visible`) |
| 5 | **Done** | Layouts Settings UI — Required on this layout / Editability here |
| 6 | **Done** | Fields Settings de-emphasis (structure-only primary UX for opportunity/job) |
| 7 | **Done** | Doctrine + sprint documentation |
| 8 | Pending | UI density polish |

## Current implementation summary

| Layer | Behavior |
|-------|----------|
| **Storage** | `record_drawer_layouts.config_json.field_placements_v1[]` per org effective drawer layout when `inquiry_drawer_mode === workflow_v1` |
| **Layouts Settings** | Per-field selects → Card 1 PATCH; reload via `GET …/record-layouts/effective-preview` (`field_placements_v1`) |
| **Fields Settings** | Opportunity/job: labels, help, type, option sets, visibility — **not** primary Required/editability controls; CTA to Record layouts |
| **Drawer GET** | `respondOpportunityEntityGet` loads effective layout once; attaches placement-aware `_field_policy_resolved` |
| **Drawer PATCH** | `PATCH /api/admin/opportunities/:id` loads same effective layout; `enforceDrawerFieldPoliciesOnPatch` uses effective requirement/interaction |
| **Integrity** | `validateLayoutIntegrity` uses effective requiredness vs drawer preview keys; issue `required_on_layout_not_visible` when required on layout but missing from preview |
| **Job** | Definition-based policy map and PATCH enforcement **unchanged** (no `layoutConfig` on job paths) |

**Key modules:** `fieldPlacementV1.ts`, `resolveEffectiveFieldBehavior.ts`, `drawerFieldPolicyAdapter.ts`, `opportunityWorkflowV1FieldPlacements.ts`, `enforceDrawerFieldPoliciesOnPatch.ts`, `layoutIntegrityValidator.ts`, `layoutFieldBehaviorUi.ts`, `LayoutSectionFieldsPanel.tsx`, `SettingsFieldsHubClient.tsx`.

**Backend compatibility:** `PATCH /api/admin/field-definitions/:id` still accepts `requirement_policy` / `interaction_policy` for advanced or API callers; v1 operator UX does not treat Fields as the drawer-behavior control plane for opportunity/job.

## Card 0 — JSON shape (`field_placements_v1`)

```json
{
  "field_placements_v1": [
    {
      "field_key": "notes",
      "section_key": "inquiry",
      "sort_order": 10,
      "surfaces": {
        "drawer_overview": {
          "requirement": {
            "version": 1,
            "mode": "required_on_save",
            "validation_scope": "save"
          },
          "interaction": {
            "version": 1,
            "editability_mode": "read_only",
            "ownership": {
              "source_entity": "opportunity",
              "source_field": "notes",
              "write_target_entity": "opportunity",
              "write_target_field": "notes",
              "write_behavior": "none",
              "lock_reason": "read_only_policy"
            }
          }
        }
      }
    }
  ]
}
```

Presets written by Settings map to full policy objects via `buildSimpleRequirementPolicy` / `buildSimpleInteractionPolicy` (`fieldPolicySettingsUi.ts`). Requirement presets: `optional`, `required`, `required_on_save`. Interaction presets: `editable`, `read_only`.

## Manual QA checklist

### Layouts → Opportunity (Card 5)

1. Set a supported custom field **Required when saving** on a section row; confirm **Layout behavior saved**.
2. Reload Layouts (same section); confirm the select still shows **Required when saving**.
3. Open an opportunity drawer; confirm the field shows a save-time required indicator (asterisk).
4. Clear the field and save the drawer; confirm validation error (`Field validation failed`).
5. Set **Optional** on the layout for a definition-required field; confirm drawer/save no longer require it.
6. Set **Read-only** on the layout; confirm drawer blocks PATCH for that field.
7. Confirm **status**, **pricing**, and **relationship** fields show locked layout behavior copy, not broken selects.
8. Confirm section Up/Down/Remove/Add still works unchanged.

### Fields → Opportunity / Job (Card 6)

1. Fields hub copy states **data structure** on Fields and **behavior on Record layouts** with CTA link.
2. Fields table has **no** Required / Editability columns for opportunity or job.
3. Field edit modal shows layout behavior note (no Required / Staff can edit for opportunity/job).
4. Label, help text, visibility, and option set editing still save correctly.

### End-to-end

1. After layout placement change, drawer GET `_field_policy_resolved` reflects effective mode and `requirement_source` / `interaction_source` when inspected in network payload.
2. Layout integrity reports `required_on_layout_not_visible` when a layout-required field is absent from drawer preview.
3. Confirm `field_definitions.is_required` does **not** change when saving layout placement behavior only.

## References

- `docs/system/configuration-system.md` — Fields vs Layouts planes, `field_placements_v1`, precedence
- `docs/system/record-system.md` — `_field_policy_resolved`, PATCH scope, integrity semantics
- `docs/execution/operating-doctrine.md` — structure vs layout behavior bullet
