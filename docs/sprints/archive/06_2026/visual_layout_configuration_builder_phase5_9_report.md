# Visual Layout Configuration Builder — Phase 5.9 Report

**Sprint:** 06/2026  
**Scope:** Opportunity Drawer visual editor only  
**Theme:** Freeform layout blocks and row builder

## Summary

Phase 5.9 reframes the block registry from canned instances to **constraints + starter templates**. Operators can create custom blocks, compose rows, place multiple fields per row, configure block title visibility, edit behavior, and contact role-aware cards — then publish to the live drawer where safe.

## Workstreams delivered

| Workstream | Status | Notes |
|---|---|---|
| A — Custom block builder | Done | Create block form; block title, show title, type, data context, role, visibility, edit mode |
| B — Row layout inside blocks | Done | Add/remove rows, 1/2/3 column rows, field add via existing picker |
| C — Field display settings | Done (existing + `action_button`) | Phase 5.7 field settings reused |
| D — Inline editing mode | Done | Block `editMode` wired to runtime GroupCell + Edit/Done shell |
| E — Secondary contact via Create block | Done | Contact card + role = Secondary with default visibility |
| F — Runtime parity | Done | Block title/show title, rows, edit button, contact role blocks |
| G — Registry reframing | Done | Starters labeled; registry = allowed primitives |
| H — Tests | Done | `opportunityDrawerLayoutPhase59.test.ts` |

## Files changed

### Lib
- `web/lib/layout/layoutEditorBlockConfig.ts` — block metadata types and visibility helpers
- `web/lib/layout/layoutEditorFreeformBlocks.ts` — create/patch/delete block and row ops
- `web/lib/layout/layoutEditorConstraints.ts` — registry constraint exports
- `web/lib/layout/layoutEditorDisplayConfig.ts` — `action_button` display type
- `web/lib/layout/layoutEditorBlockRegistry.ts` — starter labels; `contact_custom` runtime effective
- `web/lib/layout/surfaceLayoutRegistry.ts` — `layout_block` structural ref key
- `web/lib/layout/validateLayoutDocForSurface.ts` — validate `layoutEditorBlockConfig`

### UI
- `web/components/adminV2/settings/OpportunityDrawerLayoutBlockSettings.tsx` — block builder + create form
- `web/components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx` — Create block + row wiring
- `web/components/layout/LayoutRuntimeBlockEditContext.tsx` — block-level edit gating
- `web/components/layout/LayoutRuntimePlanView.tsx` — GroupCell honors showTitle + editMode

### Tests
- `web/tests/layout/opportunityDrawerLayoutPhase59.test.ts`
- `web/tests/layout/opportunityDrawerLayoutPhase58.test.ts` — contact_custom runtime flag update

## Operator flow

1. Open section → **Create block**
2. Choose type (card, contact card, child row template, …)
3. Add rows (1/2/3 columns)
4. Add fields from entity-aware picker
5. Format fields (label, typography, display type, link behavior)
6. Set edit behavior (display only / inline / Edit button)
7. Publish

## Runtime behavior

- **Block title:** `showTitle: false` hides the group heading in the drawer.
- **Rows:** Multi-column rows render in the existing grid row layout.
- **Contact role blocks:** Field refs resolve from role; secondary defaults to show-when-role-exists visibility.
- **Edit button:** When `editMode === edit_button`, drawer shows read-only values until Edit is clicked; Done collapses back.
- **Display-only:** Fields in the block never open inline inputs even when drawer edit is available.

## Remaining gaps before Person/Child duplication

- Person/Child drawer surfaces not wired to freeform builder
- Communication / activity / notes widget internals unchanged (by design)
- Row label/title per row (metadata shape exists; UI not exposed)
- Field visibility rules inside custom rows — use field settings (existing)
- `open_schedule` row action still preview-only
- Address card starter still preview-only until address hydration path exists

## Suggested commit message

```
feat(layout): Phase 5.9 freeform layout blocks and row builder for opportunity drawer editor
```
