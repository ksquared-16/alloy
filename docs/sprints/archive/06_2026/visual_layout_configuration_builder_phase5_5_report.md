# Visual Layout Configuration Builder — Phase 5.5 Report

**Date:** 2026-06-15  
**Scope:** UX convergence — make the opportunity drawer layout editor feel like editing the live drawer.

---

## Before / after

### Before (Phase 5)

- Sections rendered as stacked preview cards inside a simplified grid.
- Primary editing lived in a **right-side Section editor** panel (title, hide, field list, flat field select).
- Field picker showed `Label (child.desired_start_date)` — technical keys visible.
- Field flow: search → pick field (no entity step).
- Preview used `variant="preview"` in section cards; composition did not mirror overflow stack (notes, activity).

### After (Phase 5.5)

- **Production-faithful canvas** (`OpportunityDrawerLayoutEditorCanvas`):
  - Summary strip → shell grid (household | enrollment | right rail) → lead source → overflow stack (communication, activity).
  - Same CSS contract as `LeadOverviewRuntimeComposition` (`DRAWER_OVERVIEW_*` classes).
  - Sections render via `LayoutRuntimePlanView` + `leadOverviewCompositionHints()` with **`variant="production"`**.
- **Inline section editing** on hover / Edit:
  - Section boundary highlight, Edit, Settings, Add field, Move controls on the section itself.
  - Inline panel for title, visibility, field list, entity-first picker.
- **Right panel** → guidance, validation context, section settings metadata, add missing sections — not primary editing.
- **Human labels** via `opportunityDrawerLayoutEditorFieldCatalog` (manifest + childcare catalog).
- **Entity-first field picker** — choose entity chip, then field (search within entity).

### Screenshots (capture on staging)

1. **Before reference:** checkout commit before Phase 5.5 on `/admin/settings/layouts?editor=1&layout=<draft-id>`.
2. **After:** current staging — same URL, same draft.
3. **Side-by-side with live drawer:** open an opportunity drawer Overview tab alongside the layout editor.

Suggested captures:

| Frame | What to show |
|-------|----------------|
| Editor full canvas | Summary + 3-column grid + communication/activity stack |
| Inline edit open | Household section with inline field list + entity picker |
| Live drawer | Same org, published layout — Overview tab |
| Field picker | Entity chips (Lead, Child, Parent…) then field list |

---

## Files changed

| File | Change |
|------|--------|
| `web/lib/layout/opportunityDrawerLayoutEditorFieldCatalog.ts` | **New** — human labels, entity-first groups |
| `web/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx` | **New** — production composition + inline editing |
| `web/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx` | Canvas + guidance panel; removed sidebar section editor |
| `web/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker.tsx` | Entity-first + search; no refKey in UI |
| `web/lib/layout/opportunityDrawerLayoutEditorModel.ts` | Picker options delegate to field catalog |
| `web/tests/layout/opportunityDrawerLayoutPhase55.test.ts` | **New** |
| `web/tests/layout/opportunityDrawerLayoutVisualEditor.test.ts` | Updated wiring assertions |

---

## UX improvements summary

1. Editor layout matches live drawer composition slots (including overflow).
2. Runtime renderer reused in editor (`production` variant + composition hints).
3. Page-builder-style hover toolbar and inline edit on sections.
4. Operator-facing labels everywhere in edit UI.
5. Entity → field picker flow aligned with mental model (Child, Lead, Parent, Household…).
6. Safety unchanged: registry validation, draft/publish, duplicate-before-edit, locked shell bands.

---

## Remaining gaps before Person Drawer

1. **Nested field_group / related_list column editing** — top-level items only; enrollment roster columns not individually editable in visual editor.
2. **Widget placement** — fields only in inline picker; widgets still via advanced builder or default layout seeds.
3. **Drawer width** — editor frame is fixed; live drawer container-query breakpoints may differ slightly at narrow widths.
4. **Sample data** — editor uses `LAYOUT_DRAWER_PREVIEW_RECORD`; live record content differs but structure should match.
5. **Summary strip widgets** — editable as a section but not individual widget tuning in visual editor.
6. **Person / child / queue surfaces** — still gallery “coming soon”; no expansion in this phase.

---

## Tests

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutPhase55.test.ts \
  tests/layout/opportunityDrawerLayoutVisualEditor.test.ts \
  tests/layout/opportunityDrawerLayoutPhase5.test.ts
```

---

## Suggested commit message

```
feat(layout): Phase 5.5 opportunity drawer visual editor UX convergence

Use production overview composition and runtime rendering in the layout editor;
inline section editing with entity-first field picker and human labels throughout.
```
