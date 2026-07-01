# Person Drawer Hardening + Performance Sprint — Closeout

**Status:** Complete (2026-05-30)  
**Branch context:** Person drawer operating surfaces, opportunity cross-drawer identity sync, Admin V2 drawer performance  
**Out of scope (honored):** Layout/config runtime migration, required-field guardrails, IA redesign, enrollment/placement entity work

---

## 1. Objective

Stabilize **Child** and **Parent/Guardian** person drawers and their relationship to the **Opportunity** inquiry drawer so operators can trust identity, household, and placement data without page refresh, while improving perceived navigation performance (prefetch, typed shells, work-unit shell retention).

Success meant:

- Canonical **person** ownership for identity/demographics (not OCM/opportunity mirrors).
- Cross-drawer refresh after saves from opportunity or person surfaces.
- One explicit **record-level save** experience in the drawer header.
- Reduced blank/half shells and click-through under open drawers.
- Documented deferred config/runtime debt for follow-on sprints.

---

## 2. Ownership doctrine confirmed

| Concern | Canonical owner |
|--------|------------------|
| Child/parent name, phone, email, DOB, status | `persons` (+ field_values where applicable) |
| Household mailing address | `customers` → `locations` (type address) |
| Household-scoped primary contact | `customer_persons` |
| Pre-enrollment placement (site, program, room/cohort) | `opportunity_customer_members` |
| Lead / pipeline status | `opportunities` |
| Derived child age | Computed from person DOB (display only) |

**Validated at runtime (operator QA):**

- Child DOB edited from Opportunity → Child Person drawer shows updated DOB and age.
- Parent phone/email edited from Opportunity → Parent Person drawer updates.
- Child name edited from Child drawer → Opportunity inquiry view updates.
- No second DOB field on OCM; person PATCH is the write path when `person_id` is linked.

---

## 3. Runtime issues fixed

| Issue | Fix |
|-------|-----|
| Stale child DOB after opportunity inquiry save | `dispatchPersonRecordUpdated` + `admin-entity-saved` listener patches open person drawer, opportunity `_inquiry_children`, and drawer snapshot cache |
| Stale parent contact fields after family-contacts save | Same event path from `onLinkedPersonUpdated` / `onPrimaryPersonUpdated` |
| Opportunity inquiry child identity | `patchInquiryChildIdentityFromDrawer` → `patchLinkedPersonFromOpportunityDrawer` (`date_of_birth` on person) |
| Native `window.confirm` on leave with unsaved edits | `PersonDrawerUnsavedChangesModal` in `AdminDrawerContext` |
| Backdrop click-through opening queue rows | Drawer dim `pointer-events-auto` + `.adminv2-drawer-backdrop-hit` capture; document fallback skips backdrop targets |
| Misleading parent address empty copy | Removed “No household mailing address on file for this account” |

---

## 4. Performance issues fixed

| Path | Mechanism |
|------|-----------|
| Opportunity ↔ person | Open seeds, idle prefetch, `putDrawerEntitySnapshot` / `peekDrawerEntitySnapshot` |
| Parent ↔ child | `openPersonDrawerFromHousehold`, `resolvePersonDrawerTransitionSnapshot`, typed seeds before swap |
| Global search → person | `personDrawerOpenSeedFromGlobalSearchHit`, prefetch before open |
| Work unit switch | Page gate uses `workUnitShellReady` (not full `workUnitAboveFoldPageReady`) so cached shell stays visible during lane hydrate |
| Opportunity queue refresh | `person_contact_save` / identity events skip off-screen row refetch where configured |

---

## 5. UX consistency changes

| Area | Change |
|------|--------|
| **Save doctrine** | Single header save/cancel via `PersonDrawerOperatingSaveHeaderActions`; hidden when clean; `RecordDrawerHeaderActionButton` styling; no footer save bar; no per-section save bars on parent/child summaries |
| **Unsaved leave** | Branded modal: Continue Editing / Discard Changes |
| **Household** | Single guardian reads as primary (display); no “YOU” label; no redundant “Set as primary” when only guardian; equal min-height cards (`items-stretch`) |
| **Loading** | Typed `PersonDrawerChildOverviewSkeleton` / `PersonDrawerParentOverviewSkeleton` when chrome known; generic “Loading person…” only when profile unknown |
| **Employee (parent)** | Inline checkbox + ID on compact surface; `deferSave` into coordinator |
| **Address (parent)** | Editable household location fields when allowed; no unavailable-edit empty copy |

---

## 6. Runtime consistency pass (post-closeout)

| Issue | Root cause | Fix |
|-------|------------|-----|
| Program/category blank on Opportunity inquiry children while Child drawer shows program | Server inquiry hydrate used `EMPTY_OPTION_LABEL_MAP`; client only loaded option labels when `enrichmentFetchEnabled` (edit mode). Child `_enrollment_mirror` resolved labels via `batchOptionItemLabelsForOrg`. | Shared `inquiryChildOcmPlacementDisplay` + `enrichInquiryChildrenWithPlacementOptionLabels` on all OCM inquiry hydrate paths; `placementLabelFetchEnabled` on inquiry section for read-only display. |
| Opportunity partial after Opp → Parent → Child → Back | Back restored cached opportunity snapshot but skipped full revalidate when `opportunityDrawerFirstPaintPreloadedRef` matched; person shell state could block opportunity body reveal. | `opportunityDrawerRecordNeedsRevalidate` + restore path triggers background full hydrate; clears person prefetch seed on goBack; `personDrawerOpenSeed` cleared when popping stack. |

**Mapping:** UI label **Program** / **category** → data key `OCM.desired_program_type` → option set `childcare_program_type`. Same resolver as Child header `program_label` from `_enrollment_mirror`.

---

## 7. Identity synchronization fixes

**Components / modules:**

- `dispatchPersonRecordUpdated.ts`
- `applyPersonPatchToOpportunityInquiryChildren.ts`
- `applyPersonIdentityPatchToPersonRecord`
- `OpportunityInquiryChildrenSection` — dispatch after inquiry child identity PATCH
- `AdminEntityDrawer` — unified `admin-entity-saved` handler for customers (primary contact) and persons (identity patch)

**Event contract (`admin-entity-saved` detail for persons):**

```ts
{ type: "persons", id, patch, person?, source?, opportunity_id? }
```

---

## 8. Deferred items

Do **not** treat as sprint blockers; schedule in config/required-field sprints.

### Layout / configuration migration

| Item | Current state | Target |
|------|---------------|--------|
| Person section visibility | `personDrawer*OperatingOverviewSections` filters | `record_drawer_layouts` + `visible_when.profiles` |
| Person tabs | Hardcoded parent/child tab lists in `AdminEntityDrawer` | Layout tab manifest |
| Summary field layout | `PersonDrawerChildSummary` / `PersonDrawerParentSummary` | Overview section field keys from layout |
| Built-in sections | Mounted directly in `AdminEntityDrawer` | Built-in section registry driven by layout |
| Header slots | `PersonDrawerChildHeaderExecutive`, title rows | `record_drawer_layouts` header slots |
| Status applicability | `personStatusApplicability` | Status metadata from config |
| Inquiry children grid columns | Partially hardcoded in `OpportunityInquiryChildrenSection` | Field defs + manifest sort order |
| `useConfigDrivenOverview` | Route exists; operating surfaces bypass compact overview | Full layout runtime for person |

### Required fields + completion guardrails

| Item | Notes |
|------|--------|
| Drawer-level “complete record” rules | Not implemented; explicit save only marks section coordinator dirty state |
| Policy-driven required indicators on person summary | Field interaction policy exists elsewhere; operating summaries use bespoke required UX |
| Opportunity / OCM placement requiredness | Pipeline-specific; out of sprint scope |

### Drawer configuration migration (related)

| Item | Notes |
|------|--------|
| Opportunity drawer from global search with queue navigator seed | Deferred in phase 2 sprint doc |
| Full person Activity timeline | Placeholder tab; mirror opportunity activity API later |
| Communications/documents tab background prefetch | Related payload preload only |

### Other product gaps (document only)

- Person-level mailing address as editable truth (explicitly **not** product model — household location only).
- `record_drawer_layouts` runtime for person (see `child_profile_person_drawer_doctrine.md`).

---

## 9. Recommended next sprint

**Priority order:**

1. **Layout / Configuration Migration** — `record_drawer_layouts` runtime for person (and opportunity parity), section/tab manifests, header slots, built-in registry.
2. **Required Fields + Completion Guardrails** — policy-driven requiredness, drawer save validation, completion states aligned with forms/field registry.

**Not recommended unless P0:** Additional drawer polish passes; runtime behavior and identity sync are closed for this scope.

---

## A. Runtime verification report

Verification method: **code-path audit + automated tests + operator-validated items from sprint QA**. Screenshots are **operator-owned** (not captured in repo).

### 1. Drawer transitions

| Path | Result | Evidence / notes |
|------|--------|------------------|
| Opportunity → Child | **PASS** (code + QA) | Open seed + child skeleton branch (`personDrawerChildOverviewPending`); operator confirmed DOB/name sync |
| Child → Parent | **PASS** (code) | `resolvePersonDrawerTransitionSnapshot` prefers parent seed; parent skeleton branch |
| Parent → Child | **PASS** (code) | Household open stamps child seed; child skeleton branch |
| No blank white generic overview | **PASS** (code) | Typed skeletons before hydrate; generic shell only when chrome unknown (`personDrawerShowLoadingShell` without child/parent chrome) |
| No half-rendered layout swap | **PASS** (code) | `personDrawerOperatingSummaryVisible` gates summary until non-seed hydrate |
| No visible layout reshaping | **PASS** (code) | `personDrawerFirstPaintRecord` + transition snapshot reduce chrome flip |

**Screenshots:** Manual — capture opp→child, child→parent, parent→child in staging.

### 2. Backdrop behavior

| Check | Result | Evidence |
|-------|--------|----------|
| Click outside closes drawer | **PASS** (code) | `closeOnBackdropMouseDown` on `.adminv2-drawer-backdrop-hit` |
| Does not open underlying records | **PASS** (code) | Backdrop `pointer-events-auto`; `stopPropagation` on backdrop mousedown |
| No click-through to workspace | **PASS** (code) | Body overflow hidden when open; backdrop captures left-of-panel clicks |

**Screenshots:** Manual — click queue row area left of panel with drawer open.

### 3. Work unit switching

| Check | Result | Evidence |
|-------|--------|----------|
| No full page flash on WU change | **PASS** (code) | Render uses `workUnitShellReady`; placeholder gate only when shell identity missing |
| Cached shell visible during hydrate | **PASS** (code) | `workUnitRenderableModel` from shell placeholder when above-fold pending |
| Queue stable | **PASS** (code) | Lane placeholders vs real markers; deferred queue summary hydrate |
| No unnecessary bootstrap reset | **PASS** (code) | Reveal gate separate from shell ready |

**Screenshots:** Manual — switch between two work units in same department.

### 4. Save UX (final doctrine)

| Check | Result | Evidence |
|-------|--------|----------|
| Save in header only | **PASS** | `PersonDrawerOperatingSaveHeaderActions` in `drawerHeaderActions` |
| No section save buttons | **PASS** | Summaries omit `PersonDrawerSummarySaveBar` |
| No footer save bar | **PASS** | Footer component deleted |
| Hidden when clean | **PASS** | `if (!canMutate \|\| !dirty) return null` |
| Visible when dirty | **PASS** | Dirty poll + coordinator |
| Cancel hidden when clean | **PASS** | Same guard as save |
| Alloy header action styling | **PASS** | `RecordDrawerHeaderActionButton` |

**Screenshots:** Manual — clean header (no save), edit field (save + Unsaved dot).

### 5. Household polish

| Check | Result | Evidence |
|-------|--------|----------|
| Single guardian auto-primary (display) | **PASS** | `applyHouseholdGuardianPrimaryDisplay` |
| No “YOU” label | **PASS** | Removed from `PersonDrawerHouseholdSection` |
| No redundant primary controls | **PASS** | `householdShowsPrimaryContactControl` (count > 1, not primary) |
| Equal card height | **PASS** | `min-h-[4.5rem]`, `items-stretch` on grid |

**Screenshots:** Manual — single- vs multi-guardian household.

### Operator-validated (pre-closeout)

| Item | Result |
|------|--------|
| Child DOB from Opportunity → person | **PASS** |
| Child age recalculation | **PASS** |
| Parent phone/email from Opportunity | **PASS** |
| Child name from Child drawer → Opportunity | **PASS** |
| Identity ownership model | **PASS** |
| Cross-drawer sync / events | **PASS** |

---

## B. Remaining hardcoded / runtime debt (discovery log)

*Listed for migration sprints only — not fixed in this closeout.*

1. **Layout:** Person operating section filters (`personDrawerChildOperatingSections`, `personDrawerParentOperatingSections`).
2. **Layout:** Hardcoded parent/child tab arrays in `AdminEntityDrawer`.
3. **Layout:** `PersonDrawerChildSummary` / `PersonDrawerParentSummary` field composition (not layout keys).
4. **Layout:** Built-in blocks (household, address, employee, lifecycle rail) mounted in drawer shell code.
5. **Layout:** Child header executive / enrollment mirror presentation components.
6. **Layout:** Inquiry children desktop grid column templates in `OpportunityInquiryChildrenSection`.
7. **Drawer config:** `record_drawer_layouts` not driving person runtime (`useConfigDrivenOverview` branch vs operating chrome).
8. **Required fields:** No drawer-level completion guard when sections dirty/saved.
9. **Required fields:** Operating summaries do not surface policy `required` from field definitions uniformly.

---

## C. Tests and build

```bash
cd web && npm run test -- tests/admin/person/personDrawerOpportunityPersonSync.test.ts \
  tests/admin/person/personDrawerHardeningPhase2.test.ts \
  tests/admin/person/personDrawerHardeningPhase3.test.ts \
  tests/admin/person/personDrawerHardeningSprint.test.ts \
  tests/admin/person/personDrawerHouseholdPrimaryContactDisplay.test.ts

cd web && npm run build
```

**Key files (implementation):**

- `web/lib/admin/person/dispatchPersonRecordUpdated.ts`
- `web/lib/admin/person/applyPersonPatchToOpportunityInquiryChildren.ts`
- `web/components/admin/entity/PersonDrawerOperatingSaveHeaderActions.tsx`
- `web/components/admin/entity/PersonDrawerUnsavedChangesModal.tsx`
- `web/components/admin/Drawer.tsx`
- `web/components/admin/AdminEntityDrawer.tsx`
- `web/contexts/AdminDrawerContext.tsx`

---

## Sprint completion checklist

- [x] Runtime behavior verified (code + operator QA on identity sync)
- [x] Save doctrine finalized (header, hidden when clean)
- [x] Drawer transitions stable (typed skeletons + transition snapshot)
- [x] Remaining work documented (Sections 7–8, Appendix B)
- [x] Closeout document exists (this file)

**Sign-off:** Ready to mark `person_drawer_hardening_performance_sprint.md` superseded by this closeout for archive purposes.

---

## 6. Runtime consistency correction (final)

### A. Program/category — single OCM placement source

| Surface | Component / module | Source | Shared resolver |
|---------|-------------------|--------|-----------------|
| Work unit queue | `QueueService.enrichOpportunityRows` → `_crm_compact_children[].secondary` | `opportunity_customer_members.desired_program_type` + option labels | `resolveInquiryChildProgramCategoryLabel` / `resolveQueueChildProgramCategoryLabel` |
| Opportunity inquiry children | `OpportunityInquiryChildrenSection` | `_inquiry_children` OCM fields + `enrichInquiryChildrenPlacementLabels` | `resolveInquiryChildProgramCategoryLabel` |
| Child drawer header | `PersonDrawerChildHeaderExecutive` / `_enrollment_mirror` | OCM via `buildPersonEnrollmentMirrorRows` | Same resolver |

- Removed DOB-derived mock program labels from queue CRM compact when OCM type is present.
- `applyInquiryChildPlacementDisplayLabels` always resolves label; empty option map falls back to `desired_program_type` key (not blank).

### B. Opportunity drawer save doctrine

- `OpportunityDrawerHeaderSaveActions` in drawer header (hidden when clean; form dirty + inquiry children coordinator).
- Removed per-row **Save** buttons from `OpportunityInquiryChildrenSection`; dirty rows show subtle “Unsaved” hint.
- Legacy inline opportunity Save/Cancel in `AdminEntityDrawer` suppressed for `opportunities` entity type.

### C. Child age — Person DOB canonical

| Surface | Source |
|---------|--------|
| Work unit queue | `resolveChildAgeDisplayLabel` (Person DOB when `person_id` linked; else member/inquiry DOB) |
| Opportunity inquiry | Same helper in row display + `applyPersonPatchToOpportunityInquiryChildren` |
| Child drawer | `personDrawerChildAgeLabel` → `resolveChildAgeDisplayLabel` from `date_of_birth` |

Age is never stored as truth; derived from DOB only.

**Tests added/updated:** `inquiryChildOcmPlacementDisplay.test.ts`, `childAgeDisplay.test.ts`, `QueueServiceCustomerMemberChildren.test.ts`, `opportunityDrawerSaveDoctrine.test.ts`.
