# Visual Layout Configuration Builder — Phase 5.14A Report

**Sprint:** 5.14A — Builder Composition Enhancements  
**Surface:** Opportunity Drawer only  
**Date:** June 2026

## Summary

Phase 5.14A extends the opportunity drawer visual builder with section row composition, widget-only and related-list section types, related-list row templates, inline label editing, section deletion, and locked-shell canvas cleanup — all via **section/item metadata** on the existing LayoutDoc model. No architecture redesign.

## Workstreams Delivered

| Workstream | Status | Notes |
|------------|--------|-------|
| A — Section row composition | ✅ | Metadata `layoutEditorSectionRowGroup` + `layoutEditorSectionRowSpan`; presets 50/50, 25/75, 33/66, 25/25/50, equal 3/4; builder + preview + runtime |
| B — Widget sections | ✅ | Section type `widget`; validation requires ≥1 widget; + Widget section control |
| C — Related list builder | ✅ | Entity type selector + primary/secondary/tertiary row field templates; syncs to related_list item + childRowGroups; **children** runtime-supported |
| D — Inline editing | ✅ | Section titles on canvas; field/widget display labels in composition list when selected |
| E — Section deletion | ✅ | Delete section + rebalance row groups; blocks lead_summary delete |
| F — Locked shell cleanup | ✅ | Large locked bands replaced with minimal preview-only indicator |
| G — Runtime validation | ✅ | `opportunityDrawerLayoutPhase514a.test.ts` (8 tests); publish path unchanged |

## Files Changed

### Core model / validation
- `web/lib/layout/layoutEditorSectionLayout.ts` *(new)* — row groups, section types, delete, validation
- `web/lib/layout/layoutEditorRelatedListConfig.ts` *(new)* — entity type + row templates, sync to related_list item
- `web/lib/layout/validateLayoutDocForSurface.ts` — allow new section metadata keys
- `web/lib/layout/opportunityDrawerLayoutEditorModel.ts` — wire validation + re-exports

### Builder UI
- `web/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx` — row-group rendering, inline section titles
- `web/components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx` — type, row layout, delete, related-list settings
- `web/components/adminV2/settings/OpportunityDrawerLayoutRelatedListSettings.tsx` *(new)*
- `web/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx` — shell cleanup, add widget/related-list sections
- `web/components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor.tsx` — inline display labels

### Runtime / preview parity
- `web/components/layout/LayoutEditorSectionFlowView.tsx` *(new)* — shared row-group segment renderer
- `web/components/layout/LayoutRuntimeSectionFlowView.tsx` *(new)* — runtime wrapper
- `web/components/layout/LeadOverviewRuntimeComposition.tsx` — overflow row groups
- `web/components/admin/vmDrawer/DrawerLayoutRuntimeShellZoneView.tsx` — summary strip row groups

### Tests
- `web/tests/layout/opportunityDrawerLayoutPhase514a.test.ts` *(new)*

## Architecture Impact Assessment

**Impact: Low — metadata extension only**

- LayoutDoc hierarchy unchanged (`Section → Row → Column → Item`).
- Section horizontal grouping uses section metadata, not new container nodes.
- Related-list templates reuse existing `layoutEditorBlockConfig.childRowGroups` + `resolveChildRowTemplateRowLayout` runtime path.
- Publish/save/fork workflow from Phase 5.12 unchanged.
- AdminV2 runtime reveal gates, cache keys, and payload readiness **not modified**.

## Runtime Parity Verification

| Check | Result |
|-------|--------|
| Unit tests (5.14A) | ✅ 8/8 pass |
| Surface validation after row groups / related list sync | ✅ parseLayoutDoc + validateOpportunityDrawerLayoutDoc |
| Preview row groups (editor canvas) | ✅ `LayoutEditorSectionFlowView` |
| Runtime row groups (summary + overflow) | ✅ `LayoutRuntimeSectionFlowView` |
| Publish workflow | ✅ No changes to publish module |

**Manual QA recommended on staging:** create → save → publish → refresh → reopen → edit → republish → rollback for a layout using 50/50 summary strip + children related-list section.

## Screenshots

Screenshots were not captured in this implementation pass. On staging, verify:

1. Visual editor starts at first configurable section (minimal shell indicator only).
2. Two summary-strip sections in a 50/50 row.
3. Widget-only section with KPI widgets.
4. Related list section with three configured row templates matching runtime card layout.

## Remaining Builder Blockers (real only)

1. **Related list entity types beyond Children** — Contacts, household members, and opportunities are configurable in the builder but marked preview-only until runtime repeater + structural refKey support ships.
2. **Household + enrollment shell slots** — Registered sections `household_contact` and `children_enrollment` remain in the fixed 4/5/3 composition grid; custom sections row-group in overflow/summary/right-rail zones but cannot replace the primary household/enrollment slot geometry without a future shell-slot builder.
3. **Production opportunity drawer full parity** — Some production blocks (multi-contact household card cluster, enrollment grid read-first modes, action placements) still require starter templates or block-level configuration beyond section-type primitives.

## Suggested Commit Message

```
feat(layout): Phase 5.14A section rows, widget/related-list sections, and builder UX for opportunity drawer
```
