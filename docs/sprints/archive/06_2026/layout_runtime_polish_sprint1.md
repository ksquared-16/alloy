# Layout Runtime Polish Sprint 1

Runtime polish and consistency pass for published Experience Builder layouts. No LayoutDoc redesign.

## Design doctrine

**The layout engine owns structure; individual widgets own content.**

Equal heights, row alignment, stacked columns, spacing, borders, and rhythm come from the shared layout runtime (`layoutRuntimeSurfaceStyles`, `LayoutEditorSectionFlowView`, profile card tokens). Household, Children, Documents, Activity, Contact Summary, etc. inherit the same presentation automatically.

---

## 1. Primary Contact audit

### Root cause

| Field | Issue |
|-------|--------|
| **Primary contact badge** preset | Used `renderHint: "status"`. `resolveItemValue` preferred `record._status_display` for *any* status-hint field, so person enrollment status (`pre_enrolled` → "Pre-Enrolled") replaced the primary-contact value. |
| **Is primary contact** | Same refKey (`person.is_primary_contact`) without enrichment or with text hint showed blank when relationship data was missing. |

### Canonical field

- **RefKey:** `person.is_primary_contact`
- **Source:** `_customer_persons` household relationship (`is_household_primary_contact`, `role_type`)
- **Display:** `Primary contact` / `Not primary` — never blank when relationship context exists
- **Not:** enrollment status, opportunity status, or person lifecycle status

### Fix

- Status resolution only uses `_status_display` for true status refKeys (`isLayoutRuntimeStatusRefKey`).
- Primary contact badge preset uses `renderHint: "badge"`.
- `formatLayoutRuntimeStatusLabel` skips vocabulary formatting for primary contact refKey.
- Shared constants in `layoutRuntimePrimaryContactField.ts`.

---

## 2. Header phone formatting

### Audit

- Family/Lead drawer: `resolveLeadDrawerHeaderContext` already formatted phones.
- Person drawer command header: raw digits from `resolvePersonDrawerCommandHeaderMeta`.

### Fix

- Shared `formatLayoutRuntimeDrawerHeaderPhone()` used by Lead and Person header resolvers.

---

## 3. Equal-height row groups

### Fix

- `LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS` / `LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS` on all section flow renderers.
- Body/composition section surfaces use `flex h-full min-h-0 flex-col`.
- Section bodies use `flex-1` so peer cards stretch to tallest sibling.
- Builder preview and published runtime share `LayoutEditorSectionFlowView`.

---

## 4. Section visual polish

- Slightly stronger border contrast on body/composition sections (`border-alloy-stone/26`, bottom edge `/34`).
- Header band separation (`border-alloy-stone/12`, py-2.5).
- Drawer overview panel surfaces aligned with composition tokens.

---

## 5. Child related-list polish

- Shared profile card tokens (`layoutRuntimeProfileCardStyles.ts`).
- Meta columns partitioned into headline (age/status) vs stacked detail lines.
- Honors configured child row template when present.

---

## 6. Stacked layout runtime

- Stacked row groups render via `LayoutEditorSectionFlowView` with `alignItems: stretch` on grid.
- Overflow sections in person/lead overview use `LayoutRuntimeSectionFlowView` with shared row classes.

---

## Manual QA checklist

- [ ] Primary contact badge shows "Primary contact" or "Not primary" — never "Pre-Enrolled"
- [ ] Is primary contact field never blank for known household members
- [ ] Person drawer header phone matches Family drawer formatting
- [ ] Contact Summary + Address peer sections equal height on same row
- [ ] Half + stacked-half layout renders in published runtime (not builder-only)
- [ ] Connected children cards have spaced headline + detail meta lines
- [ ] Section borders read clearly without feeling heavy
- [ ] Builder preview matches published runtime for row/stack layout

---

## Operator-gap follow-up (Sprint 1.1)

Staging review showed the polish landed but three operator problems remained. Fixed via shared
runtime contracts (no per-drawer hardcoding):

### 1. Primary contact is now actionable (not just a badge)

- **Root cause:** `LeadHouseholdContactsWidget` (with "Make primary contact" + canonical
  `patchLeadHouseholdPrimaryContact` mutation) only mounted when an explicit `household_contacts`
  widget was configured. The default/published lead layout has no such widget, so the household
  section fell into the read-only `PrimaryContactProfileCard` + name-only "Secondary contact"
  branch — no action.
- **Source of truth:** `patchHouseholdPrimaryContact(customerId, personId)` → canonical household
  relationship; `applyLeadPrimaryContactToOpportunityRecord` demotes the prior primary in-record;
  `dispatchDrawerLayoutRuntimeBodyRecordPatch` + `dispatchOpportunityDrawerRecordPatch` refresh the
  open drawer; `dispatchOpportunityQueueUpdated` mirrors to the queue preview.
- **Fix:** `DrawerHouseholdProfileSection` (lead variant) now renders the actionable contact list
  for any household with **2+ adults**, even without the explicit widget. Single-adult households
  keep the clean primary-only card. Exactly one contact shows the "Primary contact" badge
  (`is_primary` is resolver-driven), so secondaries never show primary.

### 2. Clearer Builder stacked-section presets

- Section row-layout presets already wrote LayoutDoc metadata and the runtime already consumed
  `stacked_row` segments (shared `LayoutEditorSectionFlowView`), but the preset was mislabeled and
  had no left variant.
- Renamed `half_stacked_right` → **"Half + stacked right (1/2 + 1/2×2)"** and added
  **`half_stacked_left` — "Stacked left + half (1/2×2 + 1/2)"**. Both write
  `layoutEditorSectionRowGroup` / `…RowSpan` / `…RowStackRole` metadata via `applySectionRowLayout`
  and render identically in Builder preview and published runtime.

### 3. Stronger shared section/card structure (all drawers)

Shared tokens strengthened (lead/person/child compositions all consume them):

- `DRAWER_OVERVIEW_PANEL_SURFACE`, `LAYOUT_RUNTIME_COMPOSITION_SECTION_SURFACE`,
  `LAYOUT_RUNTIME_BODY_SECTION_SURFACE`: border `stone/22–26 → stone/40`, bottom edge
  `border-b-stone/30–34 → border-b-[2px] border-b-stone/55`, deeper shadow.
- Section body padding `px-3 pb-3 pt-2 → px-3.5 pb-3.5 pt-2.5` (panel + composition + shell default).
- Related-list profile cards (`layoutRuntimeProfileCardStyles`): list `gap-2.5 p-2.5 → gap-3 p-3`,
  card `px-3 py-2.5 → px-3.5 py-3`, border `stone/12 → stone/22`.

### Tests (1.1)

- `web/tests/layout/leadHouseholdPrimaryContactActionable.test.tsx` (new) — make-primary visible
  for multi-adult, hidden for single-adult and when `canMutate=false`.
- `web/tests/layout/layoutEditorSectionCompositionPresets.test.ts` — added half_stacked_right /
  half_stacked_left preset + segmentation coverage.

---

## Files changed

- `web/lib/layout/resolveItemValue.ts`
- `web/lib/layout/layoutEditorFieldDisplayPresets.ts`
- `web/lib/layout/runtime/formatLayoutRuntimeStatusLabel.ts`
- `web/lib/layout/runtime/layoutRuntimePrimaryContactField.ts` (new)
- `web/lib/layout/runtime/formatLayoutRuntimeDrawerHeaderPhone.ts` (new)
- `web/lib/layout/runtime/layoutRuntimeProfileCardStyles.ts` (new)
- `web/lib/layout/runtime/partitionLayoutRuntimeProfileCardMeta.ts` (new)
- `web/lib/layout/runtime/layoutRuntimeSurfaceStyles.ts`
- `web/lib/layout/runtime/drawerOverviewCompositionStandard.ts`
- `web/lib/layout/runtime/resolveLeadDrawerHeaderContext.ts`
- `web/lib/layout/runtime/resolvePersonDrawerHeaderContext.ts`
- `web/components/layout/LayoutEditorSectionFlowView.tsx`
- `web/components/layout/LayoutRuntimePlanView.tsx`
- `web/components/layout/LayoutRuntimeCollapsibleSectionShell.tsx`
- `web/components/layout/person/PersonConnectedChildrenCardList.tsx`
- `web/components/layout/person/PersonOverviewRuntimeComposition.tsx`
- `web/tests/layout/layoutRuntimePolishSprint1.test.ts` (new)
