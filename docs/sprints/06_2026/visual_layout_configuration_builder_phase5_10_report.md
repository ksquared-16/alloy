# Visual Layout Configuration Builder — Phase 5.10 Report

**Sprint:** 06/2026  
**Scope:** Opportunity Drawer visual editor only  
**Theme:** Restore true composition primitives (section → row → column → item)

## Summary

Phase 5.10 brings legacy `/layouts` builder capabilities into the visual drawer editor: add row, 1/2/3 columns, add field/block/text/list/action per column, move items up/down/left/right, and inline item configuration anchored to the selected row item.

## Legacy parity checklist

| Capability | Legacy `LayoutConfigClient` | Visual editor (Phase 5.10) | Notes |
|---|---|---|---|
| Add field | ✓ column + picker | ✓ per-column + Field picker | |
| Add block | ✓ `addGroup` / templates | ✓ per-column Block + starters | Starters still available |
| Add text | ✓ `makeTemplateItem` | ✓ per-column Text | Inline content/label edit |
| Add list | ✓ `makeRelatedListItem` | ✓ per-column List | Children list default |
| Add row | ✓ section rows | ✓ + 1/2/3-col row | |
| Columns 1/2/3 | ✓ `setRowColumnCount` | ✓ row + column controls | |
| Move up/down | ✓ item + row | ✓ item + row | |
| Move left/right | ✓ `moveItemHorizontal` | ✓ ← → on items | |
| Visibility condition | ✓ item conditions | ✓ field settings | |
| Block subgrid rows | ✓ `GroupBlockEditor` | ✓ block settings (5.9) | |
| Add action button | — | ✓ Action item (preview) | New in visual editor |
| Add section | ✓ | — | Platform-registered sections only |
| Advanced JSON | ✓ | — | Use `?advanced=1` legacy builder |
| Collapsed sections | ✓ | partial | Hide-after-publish only |

## Workstreams delivered

| Workstream | Status |
|---|---|
| A — Add row primitive | Done |
| B — Add item primitive (field/block/text/list/action) | Done |
| C — Field placement (1/2/3 col rows) | Done |
| D — Inline item editing | Done (anchored under row item) |
| E — Section/block titles | Done (section rename/hide; block showTitle from 5.9) |
| F — Runtime parity | Partial (see below) |
| G — Legacy parity audit | Done (checklist above) |
| H — Tests | Done (`opportunityDrawerLayoutPhase510.test.ts`) |

## Files changed

### Lib
- `web/lib/layout/layoutEditorSectionComposition.ts` — section row/column/item ops
- `web/lib/layout/layoutEditorActionButton.ts` — action button item metadata + registry
- `web/lib/layout/layoutEditorCompositionModel.ts` — section item move/remove via horizontal axis
- `web/lib/layout/surfaceLayoutRegistry.ts` — `_action_button` structural ref
- `web/lib/layout/validateLayoutDocForSurface.ts` — action button metadata validation

### UI
- `web/components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor.tsx` — primary section composition UI
- `web/components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx` — wires row editor; keeps starters
- `web/components/layout/LayoutRuntimePlanView.tsx` — side-by-side rows when LayoutDoc honored; action button preview

### Tests
- `web/tests/layout/opportunityDrawerLayoutPhase510.test.ts`

## Runtime parity summary

**Runtime-effective today**
- Section row order, column count, item order
- Side-by-side field layout when household profile substitution is off (`honorLayoutDocBlocks` / visual config)
- Text/template items (`_template`)
- Field display settings, hidden section titles (`layoutEditorHidden`)
- Block rows/titles/contact roles (Phase 5.9)

**Preview-only (labeled in editor)**
- Action button items — render as styled button in preview; live drawer click wiring pending
- Non-children related lists
- Widget placement

## Remaining gaps before Person/Child

- Person/Child drawer surfaces not wired to section row editor
- Live drawer action button execution path
- Section title typography intent (metadata not exposed)
- Per-row title/label UI (block row labels from 5.9 metadata not in section rows)
- Widget internals unchanged (by design)

## Suggested commit message

```
feat(layout): Phase 5.10 restore section row/column composition primitives in opportunity drawer editor
```
