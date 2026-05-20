# Layout + field behavior semantics v1

**Path:** `docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`  
**Status:** In progress — Card 0 (foundation)  
**Scope lock:** May 2026

## Sprint goal

Move operator-facing **Required** and **Editability** configuration from base field definitions to **Record layouts** (`field_placements_v1` on org `record_drawer_layouts.config_json`) for the **opportunity workflow v1** drawer, while keeping `field_definitions` policies as compatibility defaults.

## Risk gate decisions (locked)

| Gate | Decision |
|------|----------|
| **G0** | Use `record_drawer_layouts.config_json.field_placements_v1` JSON overlay for v1. **No new DB table.** |
| **G1** | Confirm no new table for v1. |
| **G2** | Layout placement writes must **NOT** overwrite `field_definitions.requirement_policy`. |
| **G3** | **No automatic sync** from placement writes to `field_definitions.is_required` in v1. `is_required` remains compatibility/default state. Opportunity drawer runtime uses **effective** placement behavior. |
| **G4** | Baseline tests run before Card 0: `tests/fields/fieldRequirementPolicy.test.ts`, `tests/fields/enforceDrawerFieldPoliciesOnPatch.test.ts`, `tests/config/layoutIntegrityValidator.test.ts` — **27 passed**. |
| **G5** | Hardcoded inquiry summary layout migration remains **out of scope**. |

## Resolution order (runtime)

For surface `drawer_overview` only:

1. **Placement override** — valid `field_placements_v1` entry for `field_key`
2. **Definition default** — `field_definitions.requirement_policy` / `interaction_policy` (or legacy `is_required`)
3. **System preset** — `drawerFieldPolicyAdapter` caps (e.g. non-enforceable → optional requirement, system-controlled interaction)

## OUT of scope

Forms, public booking, workflow status-transition enforcement, inquiry_child/OCM, config assist new ops, new DB table, inquiry summary migration, advanced conditional requiredness.

## Implementation cards

| Card | Status | Summary |
|------|--------|---------|
| 0 | **Done** | Types, parser, `resolveEffectiveFieldBehavior`, unit tests |
| 1 | **Done** | `PATCH …/opportunity-workflow-v1-field-placements` |
| 2 | **Done** | Drawer GET effective `_field_policy_resolved` |
| 3 | **Done** | Opportunity PATCH enforcement |
| 4 | **Done** | Placement-aware layout integrity |
| 5 | **Done** | Layouts Settings UI |

### Card 5 manual QA (Layouts → Opportunity)

1. Set a supported custom field **Required when saving** on a section row; confirm **Layout behavior saved**.
2. Reload Layouts (same section); confirm the select still shows **Required when saving**.
3. Open an opportunity drawer; confirm the field shows a save-time required indicator (asterisk).
4. Clear the field and save the drawer; confirm validation error.
5. Set **Optional** on the layout for a definition-required field; confirm drawer/save no longer require it.
6. Set **Read-only** on the layout; confirm drawer blocks PATCH for that field.
7. Confirm **status**, **pricing**, and **relationship** fields show locked layout behavior copy, not broken selects.
8. Confirm section Up/Down/Remove/Add still works unchanged.
| 6 | Pending | Fields Settings UI de-emphasis |
| 7 | Pending | Doctrine updates |
| 8 | Pending | UI density polish |

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

Invalid placement entries or unknown surface keys are skipped on read (fail closed to definition/preset). Resolver does not throw.

## References

- `docs/system/configuration-system.md` (update in Card 7)
- `docs/system/record-system.md` (update in Card 7)
- Prior audit: layout + field behavior semantics design recommendation (conversation)
