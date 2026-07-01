# Visual Layout Configuration Builder — Phase 5 Report

**Date:** 2026-06-15  
**Scope:** Dual-write risk reduction, runtime composition from `entity_layouts`, editor polish.

---

## Summary

Phase 5 makes **entity_layouts** the clearer owner of opportunity drawer **composition** (section order, visibility, fields in supported sections) while **blocking legacy section/order writes** when visual layout runtime adoption is active.

---

## Workstream A — Legacy convergence

### Write path audit (`LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS`)

| Path | Blocked when visual config on? |
|------|-------------------------------|
| `recordDrawerLayoutPersist.ts` | Via guarded APIs only |
| `PATCH …/opportunity-workflow-v1-sections` | **Yes** (409) |
| `PATCH …/opportunity-workflow-v1-order` | **Yes** (409) |
| `PATCH …/opportunity-workflow-v1-field-placements` | **No** — field required/editable still legacy |

### Read-through migration (`legacyOpportunityDrawerLayoutConvergence.ts`)

- `buildLegacyWorkflowV1LayoutMigrationHints()` — operator-facing migration notes
- `applyMappableLegacyHiddenSectionsToLayoutDoc()` — partial import (`notes` → `notes_communication`)
- Unmapped workflow v1 keys remain manual via Layout Gallery

### Legacy editors

- Banner → **read-only** copy when `isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient()` is true
- Section/order UI controls disabled client-side; API returns 409 server-side

---

## Workstream B — Runtime composition

- **Right rail section order** follows `LayoutDoc.sections` order when visual config adoption is on (`sortLayoutSectionsByDocPosition`)
- **Overflow sections** sorted by doc position under same gate
- **Field add/remove/reorder** already flows through published `LayoutDoc` → `LayoutRuntimePlanView` (verified by removal test)
- **Unsupported / empty sections** → `resolveEffectiveProductionLayoutDoc` builtin fallback (unchanged)
- **Lead overview grid** slot mapping unchanged (household | enrollment | right rail)

---

## Workstream C — Editor polish

- **Searchable field picker** (`OpportunityDrawerLayoutFieldPicker`)
- **Main-zone preview** uses production composition grid classes
- **Live publish notice** when Phase 4 runtime gate is on
- **Gallery edit** duplicates published row into draft when no draft exists (`resolveGalleryEditLayoutAction`)

---

## Tests

```bash
cd web && npm run test -- tests/layout/opportunityDrawerLayoutPhase5.test.ts
```

---

## Remaining risks

1. **`field_placements_v1`** still writes `record_drawer_layouts` — orthogonal but same table
2. **Workflow v1 VM overview path** may still render when layout runtime body flag is off
3. **Partial legacy key mapping** — most `overview_hidden_sections` keys do not map 1:1 to LayoutDoc section keys
4. **Nested field_group editing** still limited in visual editor (top-level items only)

---

## Suggested commit message

```
feat(layout): Phase 5 opportunity drawer composition convergence and editor polish

Block legacy section/order writes when visual layout config is active; respect
entity_layouts section order at runtime; duplicate published layouts before edit;
searchable field picker and production-like composition preview.
```
