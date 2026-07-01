# Person Drawer Published Runtime Parity — Implementation Report

Sprint scope: published Person Drawer runtime matches Experience Builder configuration for linked children, section widths, and related lists. Not an Experience Builder redesign.

## 1. Root cause — missing Child Enrollment Status

**Classification: B → fixed at allow-list layer (picker + validator gap)**

| Layer | Finding |
|-------|---------|
| Field catalog | `inquiry_child.outcome_status_key` exists in childcare catalog as **Enrollment status** (OCM `outcome_status_key`). |
| Linked-child picker | `PERSON_DRAWER_LINKED_CHILD_FIELD_REFS` included legacy `child.status` but **not** the canonical `inquiry_child.outcome_status_key`. Operators searching for "Enrollment status" could not select the canonical ref. |
| Validation | Linked-child validator fallback only allowed `child.*` opportunity refs, not `inquiry_child.*`. |
| Runtime resolver | `normalizeInquiryChildBlockToLayoutRuntimeRow` already maps `outcome_status_key` / label → `child.status` and `inquiry_child.outcome_status_key`. **Runtime existed.** |
| Row renderer | `PersonConnectedChildrenCardList` and repeater formatters resolve status when column ref is configured. **Renderer existed.** |

**Fix:** Extend `PERSON_DRAWER_LINKED_CHILD_FIELD_REFS` with canonical inquiry-child participation refs (including `inquiry_child.outcome_status_key`) and allow `inquiry_child.*` in linked-child validation fallback.

## 2. Section width parity

**Root cause:** Builder preview uses `LayoutEditorSectionFlowView` for overflow and right-rail sections (honors `layoutEditorSectionRowGroup` + `layoutEditorSectionRowSpan`). Published runtime used `PersonOverviewRuntimeComposition`, which rendered overflow/right-rail sections **one card at a time** — ignoring row-group metadata → full-width vertical stack.

**Fix:** Published person overview now routes overflow and right-rail sections through `LayoutRuntimeSectionFlowView` (same segment contract as builder preview). No LayoutDoc schema change.

## 3. Related list parity

**Root cause:** `personOverviewCompositionHints()` set `connectedChildrenPrimaryColumnsOnly: true`, filtering configured columns to legacy `compositionPrimaryColumnRefs` metadata (5-field cap). Builder allowed 6 fields per row × 3 rows; published runtime silently dropped extras.

**Fix:** When `honorLayoutDocBlocks: true` (published + visual editor preview), `connectedChildrenPrimaryColumnsOnly` is **false** — full LayoutDoc column config drives rendering. Connected-children card list now **flex-wraps** meta segments instead of clamping to a single truncated line.

## 4. Linked Children field inventory

| Field | Class | Notes |
|-------|-------|-------|
| Child Name | A | `child.name` — picker + runtime |
| DOB / Age | A | `child.dob_age`, `child.date_of_birth`, `child.age_band` |
| Program | A | `child.program` / `inquiry_child.desired_program_type` |
| Room | A | `child.room` / `inquiry_child.program_room_cohort_key` |
| Schedule | A | `child.schedule` / `inquiry_child.desired_schedule_type` |
| Enrollment Status | A (fixed) | `inquiry_child.outcome_status_key` (canonical); `child.status` alias retained |
| Enrollment Stage | D | No linked-child layout refKey yet — lifecycle stage is case/work-unit scoped |
| Desired Start Date | A | `child.desired_start_date` / `inquiry_child.desired_start_date` |
| Waitlist Position | D | Queue/widget ref only (`waitlist.positionLabel`) — post-MVP for person linked-child context |

## 5. Files changed

- `web/lib/layout/surfaceLayoutRegistry.ts` — linked-child allow-list
- `web/lib/layout/drawerSurfaceFieldValidation.ts` — inquiry_child validation fallback
- `web/lib/layout/runtime/personOverviewComposition.ts` — honor layout doc columns
- `web/components/layout/person/PersonOverviewRuntimeComposition.tsx` — section flow for overflow/right rail
- `web/components/admin/vmDrawer/DrawerLayoutRuntimeShellZoneView.tsx` — honorLayoutDocBlocks in shell zones
- `web/components/layout/person/PersonConnectedChildrenCardList.tsx` — responsive meta wrapping
- `web/tests/layout/personDrawerPublishedRuntimeParity.test.ts` — durable parity tests
- `docs/sprints/06_2026/person_drawer_published_runtime_parity.md` — this report

## 6. Tests added

See `web/tests/layout/personDrawerPublishedRuntimeParity.test.ts`:

- Linked-child picker exposes enrollment status
- Validator allows `inquiry_child.outcome_status_key`
- Related list > 3 fields validates on publish
- `honorLayoutDocBlocks` disables primary-column-only filter
- Half + half row-group metadata segments correctly
- Section flow renders peer row markup
- Runtime resolves enrollment status labels

## 7. Manual QA checklist

- [ ] Published Person Drawer: two 1/2 sections in overflow/right rail render side-by-side
- [ ] 1/3 + 2/3 and stacked composition presets match builder preview
- [ ] Collapsible sections still collapse
- [ ] Linked Children related list: add Enrollment Status (`inquiry_child.outcome_status_key`)
- [ ] Configure 4–6 linked-child fields; published runtime shows all (card list wraps)
- [ ] Builder preview matches published runtime for widths, linked children, documents, activity
- [ ] Opportunity / Child drawer layouts unchanged

## 8. Gap recommendations

| Gap | Recommendation |
|-----|----------------|
| Enrollment Status | **Fix now** (done) |
| Section widths | **Fix now** (done) |
| Related list > 3 fields | **Fix now** (done) |
| Enrollment Stage on linked-child row | **Post-MVP** — needs layout refKey + person-household child resolver |
| Waitlist Position on linked-child row | **Post-MVP** — needs placement projection on person drawer child rows |
| Legacy `child.status` label ("Status") | **Accept limitation** — prefer `inquiry_child.outcome_status_key` in new configs |
