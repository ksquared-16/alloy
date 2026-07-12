# Visual Layout Configuration Builder — Phase 5.6 Report

**Date:** 2026-06-15  
**Scope:** Layout blocks, inline composition editing, field display configuration, conditional visibility, runtime visibility.

---

## Summary

Phase 5.6 turns the opportunity drawer visual editor from a **section + flat field list** into a **four-layer composition editor**:

```
Drawer → Section → Layout Block → Field → Display Configuration
```

---

## Workstream deliverables

### A — Eliminate separate editing mode
- Removed standalone “Editing section” scroll panel (`visual-editor-inline-section-editor`)
- **Configure** opens `OpportunityDrawerLayoutCompositionPanel` inline at the bottom of the section card
- Right panel remains guidance, validation, publish state, section settings metadata

### B — Layout blocks
- `listSectionLayoutBlocks()` exposes:
  - **Household Card** (column field cluster)
  - **Primary Contact Card** (`field_group` / `contact_block` with email, phone, name)
  - **Child Row Template** (`related_list` columns)
  - Widget blocks (notes, communication, activity) — inspectable, locked for structural edits

### C — Field configuration
- `layoutEditorDisplay` metadata on items (registry validated)
- Controls: label override, show label, icon, typography intent, display type, empty state, helper text, link behavior
- Runtime reads display config in `ValueCell` (empty state, helper text, typography, show label)

### D — Conditional visibility
- V1 presets: always, hide when empty, show when field exists, show when related exists, show when count > 1
- Extended `LayoutCondition` with `count_gt`
- `evaluateLayoutCondition` supports collection counts

### E — Nested structures
- Nested `field_group` fields and `related_list` columns appear in block tree
- Email / phone / child status / row columns configurable via field settings panel

### F — Entity-first picker expansion
- Picker works at block level (add field to field group or row template)

### G — Runtime visibility
- Block tree maps preview elements to editable nodes — no opaque top-level-only list

### H — Sample data cleanup
- Preview child statuses use operator labels (`Qualified`, `On waitlist`) — not raw `Inquiry`

---

## Files changed

| File | Role |
|------|------|
| `web/lib/layout/layoutEditorCompositionModel.ts` | Block tree, nested paths, patch helpers |
| `web/lib/layout/layoutEditorDisplayConfig.ts` | Display metadata schema + validation |
| `web/lib/layout/layoutEditorVisibilityRules.ts` | Visibility presets |
| `web/lib/layout/layoutV2.ts` | `count_gt` condition, `user`/`school` icons |
| `web/lib/layout/layoutV2Schema.ts` | Parse `count_gt` |
| `web/lib/layout/runtime/evaluateLayoutCondition.ts` | Evaluate `count_gt` |
| `web/lib/layout/validateLayoutDocForSurface.ts` | Allow `layoutEditorDisplay` |
| `web/lib/layout/runtime/layoutDrawerPreviewRecord.ts` | Status label cleanup |
| `web/components/layout/LayoutRuntimePlanView.tsx` | Apply display config at render |
| `web/components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx` | Inline block tree |
| `web/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx` | Field display + visibility UI |
| `web/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx` | Configure-in-section flow |
| `web/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx` | Selected field path state |
| `web/tests/layout/opportunityDrawerLayoutPhase56.test.ts` | Phase 5.6 tests |

---

## Tests

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutPhase56.test.ts \
  tests/layout/opportunityDrawerLayoutPhase55.test.ts \
  tests/layout/evaluateLayoutCondition.test.ts
```

---

## Remaining gaps before Person Drawer

1. **Widget block internals** — timeline subject/preview/date/owner not individually configurable (widget-owned rendering)
2. **Communication timeline block** — still widget placeholder; column-level timeline fields need widget contract extension
3. **Link behavior** — stored in metadata; `mailto`/`tel` not yet wired to runtime anchors (presentation-only storage)
4. **Column display metadata** — columns use direct fields (`label`, `renderHint`, `adornment`) not full `layoutEditorDisplay` bag
5. **Click-to-select on preview pixels** — selection via block tree list, not click-through on rendered cells yet
6. **Household profile composition override** — runtime may substitute `DrawerHouseholdProfileSection` while editor shows layout doc shape

---

## Suggested commit message

```
feat(layout): Phase 5.6 opportunity drawer composition editor with layout blocks

Expose nested blocks and field display settings inline; add registry-validated
layoutEditorDisplay metadata, count_gt visibility rules, and preview status cleanup.
```
