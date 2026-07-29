# Slice 0 — Reproduction & evidence

**Updated:** 2026-07-28

## Persistence store / APIs

| Action | Store | API |
|--------|-------|-----|
| Focus Panel Summary draft/publish | `entity_layouts` (`entity_type=opportunities`, `surface=drawer`, `layout_key=focus_panel_summary`) | `GET/POST /api/admin/entity-layouts`, `PATCH` draft, `…/publish` via `focusPanelSummaryLayoutService` |
| Nested identity surfaces (Children/Household) | Nested config embedded in Focus Panel Summary doc (or sibling nested surface APIs) | `saveNestedSurfaceConfig` → `saveFocusPanelSummaryDraft` |
| Card grid composition | `doc.metadata` published layout (`FOCUS_PANEL_PUBLISHED_LAYOUT_META_KEY`) with `grid` as source of truth | Same draft/publish path |

## Defect 1 — Card drag/order

### Lifecycle owners

```
Pointer → FocusPanelRuntimeComposerCanvas.startMove
→ cellFromPointer (76px tracks)
→ snapMoveTarget (focusPanelGridLayoutOps)
→ ghost overlay
→ moveArea → placeArea → normalizeGridColumnStacking
→ applyGrid → local draft LayoutDoc
→ saveFocusPanelSummaryDraft → entity_layouts.doc
→ reload hydrate gridFromPublishedLayout / layout.grid
→ runtime reading order from grid
```

### Likely root cause (code, pending browser confirm)

1. **`snapMoveTarget` insert-above rule is over-aggressive** — third disjunct treats `rowStart ∈ (neighbor.rowStart, neighbor.rowStart+1]` as insert-above, so drops intended “immediately beneath” a tall card often teleport to the neighbor’s top.
2. **No grab-offset** — `cellFromPointer` maps cursor to top-left of the card; grabbing mid-card jumps the region under the cursor.
3. **`normalizeGridColumnStacking`** rewrites overlapping same-column cards after every place; combined with (1) can leave another card unable to reclaim row 1 cleanly if snap always prefers the just-moved card.

Existing tests cover some Kelly scenarios but not: move-to-last, repeated reorder, hidden cards, save/reload order identity, or “drop immediately under tall neighbor without teleport.”

## Defect 2 — Field picker parity

### Owners

- Picker: `availableFieldsForNestedGroup` → `identityPickerFieldsForNamespaces`
- Edit contract: `identityFieldEditContract.ts`
- Save support: `isIdentityFieldSaveSupported` / mutation bindings
- Tests already assert `person.full_name` computed display-only (`identityAtomicNameFields.test.ts`)
- Catalog still hides some keys in childcare catalog (`relationship_to_child`, `communication_preference` flagged in `childcareFieldCatalog.test.ts`)

### Reported fields — preliminary classification

| Field | Likely class | Notes |
|-------|--------------|-------|
| Full Name | Computed display-only | Must publish/render; never writable |
| Communication Preference | Person prefs table OR unsupported in identity picker | Must resolve or remove from context |
| Phone vs Mobile | Dual identity risk | Prefer `persons` canonical phones; no silent Phone→Mobile map |
| Relationship to Child | Relationship-edge / display-only | Only when person+child scope exists |

## Defect 3 — Card-to-card focus links

### Existing vocabulary (reuse — do not invent)

`FocusPanelCardLink` in `focusPanelCardLinks.ts`:
`{ id, fromCard, toCard, fromFieldKey?, label?, destinationOpen?, destinationSubject? }`

Navigation: `navigateFocusPanelCardLink` / `navigateCardLinkWithHistory` via `FocusPanelCoordination.requestFocus`.

Punch list still lists: Surface Builder authoring UI, persist on published metadata, wire Assignments child click → navigate.

## Defect 4 — Configuration overwrite

### Likely owners

- `saveFocusPanelSummaryDraft` patches full `doc` — client must hold complete doc
- Default seed: `FOCUS_PANEL_SUMMARY_DEFAULT_DOC` / `buildFocusPanelSummaryDefaultDoc`
- Nested save path: `nestedSurfaceConfigService.saveNestedSurfaceConfig`
- Normalizers that may drop unknown props or re-apply defaults on load

Hypothesis: partial client projection or default re-seed on load/fork, not dual-store fight — confirm with before/after doc diffs in browser.

## Defect 5 — Program always Linked / read-only

### Likely root cause

- `LINKABLE_IDENTITY_FIELD_REFS` always offers Linked for `inquiry_child.program` / `child.program`
- `buildIdentityCardVM` defaults enrollment fields to Linked when no explicit policy
- `defaultChildFieldModes` hardcodes `inquiry_child.program` editable: false
- Missing conditional: editable when no effective primary classroom; derived otherwise

Related note: `current-program-schedule-ownership.md` — compact queue Program is inquiry desired placement, not operational Current Program.

## Browser reproduction status

| Defect | Browser status | Notes |
|--------|----------------|-------|
| 1 Drag | pending | Server/bootstrap installing |
| 2 Fields | pending | |
| 3 Links | pending | Code foundation present |
| 4 Preserve | pending | Capture full doc before edits |
| 5 Program | pending | Need child w/ and w/o primary classroom |

## Auth / server

- Worktree: slot 2, port 3012
- `npm install` in progress at Slice 0 start
- Auth via `alloy-dev-start` two-tier env (`.env.local.agent` + trusted injection)
