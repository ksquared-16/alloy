# Layout Runtime Polish Sprint 1

**Goal:** Published layouts feel premium and operator-ready. Builder configuration stays unchanged; polish lives in shared layout runtime contracts.

**Doctrine:** The layout engine owns structure; individual widgets own content. Equal heights, row alignment, stacked columns, spacing, borders, and rhythm come from the shared layout runtime — not per-widget invention.

---

## 1. Primary Contact audit

### Root cause

Two fields looked related but resolved different concepts:

| Field | refKey | What it showed | Actual source |
|-------|--------|----------------|---------------|
| Primary Contact Badge | `person.is_primary_contact` | **Pre-Enrolled** (wrong) | Person lifecycle `_status_display` hijacked via `renderHint: "status"` |
| Is Primary Contact | `person.is_primary_contact` | Blank | Same refKey; value resolver bleed + missing enrichment path in some contexts |

**Canonical indicator:** `person.is_primary_contact` — household relationship role (`Primary contact` / `Not primary`).  
**Not primary contact:** `persons.status_key` → `_status_display` (e.g. Pre-Enrolled) belongs in drawer **header** status control only.

### Fix

- `resolveItemValue`: `_status_display` fallback only when `isLayoutRuntimeStatusRefKey(refKey)`.
- Badge preset: `renderHint: "badge"`, `fieldType: "text"`.
- Shared projection module: `layoutRuntimePrimaryContactField.ts` + `enrichPersonDrawerPrimaryContactFields.ts`.
- Repeater rows use same vocabulary via `formatLayoutRuntimePrimaryContactDisplay()`.
- Picker: `person.is_primary_contact` exposed only in primary-contact context groups.

---

## 2. Header phone formatting

### Root cause

Lead/Family headers used `formatPhoneUS`; Person composition header passed raw digits.

### Fix

Shared `formatLayoutRuntimeDrawerHeaderPhone()` used by Lead and Person header resolvers.

**Expected:** `(121) 313-4321` not `1213134321`.

---

## 3. Equal-height row groups

### Fix

Shared tokens in `layoutRuntimeSurfaceStyles.ts`:

- `LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS` — `grid items-stretch`
- `LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS` — `flex h-full min-h-0 flex-col`

Applied in:

- `LayoutEditorSectionFlowView` (builder + runtime)
- `LayoutRuntimeSectionFlowView`
- `LayoutRuntimePlanView` section shells (`flex h-full flex-col`)
- `LayoutRuntimeCollapsibleSectionShell`
- `DRAWER_OVERVIEW_PANEL_SURFACE`

---

## 4. Section definition

Increased border contrast and bottom separation on composition/body section surfaces without adding nested cards:

- `border-alloy-stone/26`, `border-b-alloy-stone/34`
- Slightly stronger shadow on panel surfaces

---

## 5. Child related-list visual polish

Shared profile-card tokens (`layoutRuntimeProfileCardStyles.ts`):

- Card list gap, surface padding, header row
- Meta primary line (Age · Status) vs detail stack (DOB, Program, Room)
- `partitionLayoutRuntimeProfileCardMeta()` splits columns by tier

`PersonConnectedChildrenCardList` uses shared tokens — closer to Household mini-profile rhythm.

---

## 6. Stacked sections runtime

### Root cause

Composition shells rendered sections one-at-a-time (`CompositionSlot`), breaking `layoutEditorSectionRowGroup` / `stacked_row` segmentation.

### Fix

- `PublishedSectionFlow` + `LayoutRuntimeSectionFlowView` on Person overflow/right-rail and Child overflow/right-rail.
- `mergeCompositionSlotIntoFlowWhenRowGrouped()` merges semantic slots (contact, schedule) into overflow flow when they share a row group.

Builder preview and published runtime both route grouped section arrays through `LayoutEditorSectionFlowView`.

---

## 7. Layout consistency

Shared contracts unify spacing/typography rhythm across Household, Children, Documents, Activity, Contact Summary:

- Section shells: `LAYOUT_RUNTIME_COMPOSITION_SECTION_*` / `DRAWER_OVERVIEW_PANEL_*`
- Profile rows: `LAYOUT_RUNTIME_PROFILE_CARD_*`
- Section flow row classes: single source in `layoutRuntimeSurfaceStyles.ts`

---

## Tests

`web/tests/layout/layoutRuntimePolishSprint1.test.tsx`

- Primary contact does not bleed enrollment status
- Status refKey gating for `_status_display`
- Drawer header phone formatting
- Peer row stretch classes
- Stacked row segmentation + HTML markers
- Profile meta partitioning
- Composition slot merge into section flow
- Person runtime primary contact enrichment

---

## Manual QA checklist

- [ ] Person drawer: Primary Contact Badge shows **Primary contact** or **Not primary**, never Pre-Enrolled or blank
- [ ] Person drawer header phone formatted `(XXX) XXX-XXXX`
- [ ] Family/Lead drawer header phone still formatted correctly
- [ ] Peer sections on same row (Contact Summary + Address) equal height
- [ ] Half + stacked-half preset renders in published runtime overflow zone
- [ ] Connected Children cards: name + avatar, headline meta, stacked details — not table-row cramped
- [ ] Child drawer overflow/right-rail stacked groups match builder preview
- [ ] Section borders readable but quiet — no cards-inside-cards
- [ ] Builder preview and published runtime visually aligned for row groups

---

## Files changed (summary)

| Area | Key files |
|------|-----------|
| Primary contact | `resolveItemValue.ts`, `layoutRuntimePrimaryContactField.ts`, `enrichPersonDrawerPrimaryContactFields.ts`, `layoutEditorFieldDisplayPresets.ts`, `mapLayoutRuntimeContactRepeaterRows.ts` |
| Header phones | `formatLayoutRuntimeDrawerHeaderPhone.ts`, `resolvePersonDrawerHeaderContext.ts`, `resolveLeadDrawerHeaderContext.ts` |
| Equal height / sections | `layoutRuntimeSurfaceStyles.ts`, `LayoutEditorSectionFlowView.tsx`, `LayoutRuntimePlanView.tsx`, `LayoutRuntimeCollapsibleSectionShell.tsx`, `drawerOverviewCompositionStandard.ts` |
| Stacked runtime | `PersonOverviewRuntimeComposition.tsx`, `ChildOverviewRuntimeComposition.tsx`, `LayoutRuntimeSectionFlowView.tsx`, `mergeCompositionSlotIntoFlowWhenRowGrouped` |
| Child polish | `layoutRuntimeProfileCardStyles.ts`, `partitionLayoutRuntimeProfileCardMeta.ts`, `PersonConnectedChildrenCardList.tsx` |

---

## Activation audit (2026-06-24)

### Why sprint 1 was not visible on staging

**Code was deployed** (`3d1a7dde` + build fix `432f7942`), but most person-drawer sessions never activated the polish paths.

| Symptom | Root cause |
|---------|------------|
| Children still cramped (table rows) | Person drawer **fallback** used `leadOverviewCompositionHints` — `personConnectedChildrenCardList` never set |
| Section borders unchanged | Same — `compositionSectionSurface` false on person fallback |
| Header phone raw | `PersonDrawerCommandHeader` only when `shouldUsePersonOverviewComposition` |
| Equal height / stacked-half | Requires v2 composition shell **or** row-group metadata on published doc |
| Primary contact confusing | Resolver fix was in code; published items may retain old `renderHint: "status"` |

### Runtime paths

| Drawer | Composition shell | Fallback body |
|--------|-------------------|---------------|
| Person v2 | `PersonOverviewRuntimeComposition` + `PublishedSectionFlow` | — |
| Person legacy org layout | No | Was lead hints → **fixed: person hints** |
| Family/Lead | `LeadOverviewRuntimeComposition` | Lead hints (correct) |

### Published layout snapshot

Stacked-half requires `layoutEditorSectionRowGroup` on the published org LayoutDoc — republish after configuring row presets in Experience Builder.

### Tailwind

Polish classes are static strings — not a purge issue.

### Activation fix

- `resolveDrawerLayoutRuntimeCompositionHints()`
- Person fallback + shell zone use person/child hints by surface
- Person header active whenever layout runtime body is ready
- QA: `data-layout-runtime-composition-profile` (`person` | `person-shell` | `lead`)
