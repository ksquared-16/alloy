# Experience Builder doctrine

**Status:** Canonical (June 2026 — Lead/Opportunity drawer reference implementation).

Visual layout authoring for record surfaces — drawers, queue row previews, and future workspace panels.

---

## Purpose

Experience Builder is the **canonical visual surface builder**. Operators configure what appears on a record surface; runtime renders from **LayoutDoc** without parallel code paths.

Lead/Opportunity drawer is the **reference implementation**. Person, Child, and Queue surfaces reuse the same contracts (see [surface cloning plan](./experience-builder-surface-cloning-plan.md)).

---

## Core doctrine

| Rule | Detail |
|------|--------|
| **LayoutDoc is runtime truth** | Published `LayoutDoc` drives `LayoutRuntimePlanView` (and queue row composer for queue surfaces). Builder metadata is stored on LayoutDoc items/sections — not in parallel config stores. |
| **No separate runtime paths** | Builder preview and production runtime share rendering contracts (`LayoutRuntimePlanView`, `variant: "preview" \| "production"`). Preview-only items are publish-guarded, not forked renderers. |
| **Field editability is field/column-level** | `editable: true` on field items or related-list columns, plus a supported save adapter. Block `editMode` metadata is **ignored** at runtime. |
| **Section Edit is derived** | One Edit button per section/card/list header **iff** any descendant field/column has `editable: true` and a supported save adapter. Row actions, block editMode, and save-adapter alone do **not** create Edit. |
| **Canonical field settings** | One modal/panel (`OpportunityDrawerLayoutFieldSettingsModal`) for label, display, visibility, and inline editable — canvas and Properties share `applyLayoutEditorFieldSettingsPatch`. |
| **Relationship-based contacts** | Contact blocks resolve persons from household/opportunity relationships (`resolveLayoutEditorContactBlockPerson`). Not hardcoded “secondary contact” scalars. Primary is excluded from additional-contact blocks. |
| **KPI tiles are peer blocks** | Widget strip / KPI sections use tone styling and peer card width — not a separate widget runtime. |
| **Related lists are repeaters** | `related_list` items with row templates (`childRowGroups`, `layoutEditorRelatedListConfig`). Columns carry the same metadata shape as field items. |
| **Age is computed** | `child.dob_age` / age display is derived from DOB via `formatLayoutRuntimeAgeDisplay` — not stored age migration. |

---

## Builder surfaces

| Surface | Editor entry | Default doc |
|---------|--------------|-------------|
| Opportunity drawer | `/settings/layouts` → Opportunity drawer | `buildLeadDrawerDefaultDoc()` |
| Person drawer | Planned — same builder shell | `buildPersonDrawerDefaultDoc()` |
| Child drawer | Planned | `buildChildDrawerDefaultDoc()` |
| Queue record row | Queue layout editor (v3 metadata) | org / queue presets |

---

## Layout zones (Opportunity drawer)

| Zone | Section keys (examples) | Presentation |
|------|---------------------------|----------------|
| **Summary strip** | `lead_summary`, KPI widget strip | Compact horizontal tiles |
| **Primary workspace** | `children_enrollment`, `program_enrollment` | Centerpiece panel, enrollment card list |
| **Body sections** | `household_contact`, `household_relationships`, custom blocks | `DrawerOverviewPanelShell` with tone/header |
| **Rail / secondary** | Attention, tasks, documents widgets | Widget placeholders + composition hints |

Section metadata: `layoutSectionPresentation`, `layoutEditorSectionType`, card width fractions, peer packing (`layoutBuilderPeerCardRows`).

---

## Section / card / list rendering

1. **Section** — `SectionView` in `LayoutRuntimePlanView.tsx`
   - Evaluates `visibleWhen`, composition hints, household profile substitution (legacy path when active).
   - Wraps body in `LayoutRuntimeBlockEditProvider` when layout-doc inline edit applies.
   - Renders **one** `SectionHeaderEditAction` in panel header.

2. **Field group / card** — `GroupCell` → `GroupCellContent`
   - Contact blocks: relationship resolution + overlay before field render.
   - No nested Edit buttons.

3. **Related list** — `RelatedCell` → `LeadEnrollmentCardList` | `LayoutRuntimeEnrollmentGrid` | compact rows
   - Row template from `childRowGroups` + `layoutEditorRelatedListConfig`.
   - Section-level Edit enables in-place column edits.

4. **Field** — `ValueCell`
   - Display + optional inline edit when section is in edit mode.

---

## Row packing

- **Section rows/columns** — 12-column grid; card width fractions for peer KPI/contact cards.
- **Child row template** — `childRowGroups` map column indices to related-list columns; runtime via `resolveChildRowTemplateRowLayout`.
- **Queue row** — v3 scoped columns + blocks (`queueRecordLayoutV3`); inline/stack block layout.

---

## Field metadata

Stored on `LayoutItem.metadata` / column metadata:

| Key | Purpose |
|-----|---------|
| `layoutEditorDisplay` | Label visibility, date format, age format, typography, link behavior |
| `layoutEditorVisibility` | Field visibility rules |
| `layoutEditorBlockConfig` | Block type, row groups, data context (authoring only for editMode) |
| `layoutEditorContactRole` | Contact card role (primary, parents, billing, emergency) |
| `layoutEditorRowTemplate` | Related-list row actions (not field editability) |
| `editable` | On field item or column — runtime inline edit flag |

---

## Inline edit behavior

### Activation

- Operator clicks section **Edit** → `LayoutRuntimeBlockEditProvider.blockEditing = true`.
- Editable fields/columns with save adapters become inputs.
- Non-editable fields remain display text.

### Presentation (518Y/518Z)

- **Same row grouping** — configured `childRowGroups` preserved; no stacked form grid.
- **In-place controls** — `LayoutRuntimeInlineEditFieldControl` (`variant="inline"`) in row/card cells; see `web/components/layout/LayoutRuntimeInlineEditFieldControl.tsx`.
- **Compact density** — 11px type, 24px control height, labels stay in configured positions.
- **Persistence** — drawer-level **Save Changes** via `LayoutRuntimeDrawerEditProvider`; section **Done** exits edit mode only.

### Edit button UX

- Hidden until section hover/focus (`group/section`).
- Visible while editing.
- Keyboard focus exposes Edit (`focus:opacity-100`).
- No field-level Edit buttons when section Edit is active.

---

## Save behavior

- `LayoutRuntimeDrawerEditProvider` tracks dirty field values per refKey (+ rowKey for repeaters).
- Save dispatches through existing opportunity PATCH / inquiry-child placement adapters.
- `LAYOUT_RUNTIME_DRAWER_SAVED_EVENT` / `REVERTED` exit section edit mode.

Supported adapters: `layoutRuntimeFieldIsEditable` + `resolveLayoutRuntimeFieldControl` registry (location, program, room, enrollment status, DOB, opportunity fields, etc.).

---

## Status / option label resolution

- `formatLayoutRuntimeStatusLabel` — enrollment vs opportunity vocabulary by refKey/renderHint.
- Option sets loaded via `LayoutRuntimePlacementDataProvider` for placement fields.
- Display labels resolved via `resolveLayoutRuntimeFieldDisplayLabel` / operator date formatting.

---

## Tone / header styling

- `DrawerOverviewPanelShell` — pine accent, icon badge, optional widget tone.
- `LayoutRuntimeTonedPanelShell` — block-level tone for custom cards.
- Section Edit lives in header actions slot — not duplicated inside body.

---

## Relationship / contact resolution

1. `buildOpportunityFamilyContactRows` — merge `_opportunity_persons` + `_customer_persons`.
2. `resolveLayoutEditorContactBlockPerson(role)` — primary, parents/additional, billing, emergency.
3. Exclude primary + already-rendered person IDs (`LayoutRuntimeRenderedContactIdsContext`).
4. Fallback: first non-primary associated person when role label is generic (`associated`, `member`).
5. `shouldHideEmptyLayoutEditorContactBlock` — hide additional blocks when no person resolved; primary always may show empty.

---

## Preview ↔ runtime parity

- Builder canvas uses trace paths (`field:`, `group:`, `column:`) resolved by `resolveLayoutEditorFieldNodeFromSerializedPath`.
- Runtime uses same LayoutDoc + `buildLayoutRuntimePlan`.
- Tests: `layoutBuilderRuntimeParity518*.test.tsx` series.

---

## Related docs

- [Drawer system](./drawer-system.md)
- [Surface cloning plan](./experience-builder-surface-cloning-plan.md)
- [Queue system](./queue-system.md)
- [Record system](../core/record-system.md)
- [Typography / presentation](../../system/typography-and-presentation-doctrine.md)
