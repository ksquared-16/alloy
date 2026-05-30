# Person Drawer Hardening + Performance Sprint

**Status:** Complete — see `docs/sprints/05_2026/completed/person_drawer_hardening_performance_closeout.md` (2026-05-30)  
**Scope:** Person drawer navigation performance, correct operating shells, global search open, explicit save, formatting, household layout, tab preload, config audit.  
**Out of scope:** Child / Parent / Opportunity IA redesign — operating model is locked.

---

## Operating model (locked)

| Surface | Owns |
|--------|------|
| **Opportunity** | Lead status, pipeline, pre-enrollment child placement (OCM) |
| **Child person drawer** | Child lifecycle operating surface |
| **Parent/Guardian person drawer** | Household / contact operating surface |
| **Person** | Identity, demographics, status |
| **Household / customer** | Mailing address (`customers` → `locations` type address) |
| **customer_persons** | Household-scoped primary contact |
| **OCM** | Child school/site/program/category until Enrollment/Placement exists |

---

## Phase 1 (complete)

- Opportunity / household linked-person prefetch + open seeds
- Typed child/parent loading shells
- OCM placement in header + household child rows
- Primary contact cross-drawer merge
- Unlinked child safety

See git history / `personDrawerHardeningSprint.test.ts`.

---

## Phase 2 (this pass)

### 1. Drawer loading / perceived performance

| Path | Mechanism |
|------|-----------|
| Opportunity ↔ person | Idle prefetch + open seeds (phase 1) |
| Parent ↔ child | `openPersonDrawerFromHousehold` + `prefetchLinkedPersonsFromPersonRecord` |
| Global search → person | `personDrawerOpenSeedFromGlobalSearchHit` + cache stamp + `prefetchPersonDrawerSnapshot` before open |
| Cold load | Child/parent skeleton when chrome hint known; generic shell only for unknown profile |

### 2. Global search open

- `resolveGlobalSearchOpenFromHit` attaches `personDrawerOpenSeed` for `parents` / `children` groups
- `GlobalRecordSearchOpenListener` stamps cache and prefetches before `openDrawer`
- `AdminEntityDrawer` chrome hints honor `global_search` + seed emphasis

### 3. Drawer-to-drawer navigation

- Cache-first layout effect (phase 1)
- `confirmDiscardPersonDrawerUnsaved` on close, back, and cross-open when summary dirty

### 4. Tab preload

- `personRelatedData` prefetched after parent/child hydrate (documents tab instant)
- **Activity tab:** `PersonDrawerOperatingActivityTab` polished empty state — no legacy relationships list on operating surfaces

### 5. Save behavior

- Parent/child summary: explicit **Save** via header record actions (hidden when clean), dirty indicator, no field `onBlur` autosave
- DOB/date fields only persist on Save (fixes partial date entry)
- `personDrawerUnsavedGuard` + branded unsaved modal on drawer close/back/open

### 6. Phone formatting

- `formatPhoneUS` → `(XXX) XXX-XXXX` everywhere it is used (parent summary hint, queue, cards, etc.)

### 7. Parent address ownership

**Decision:** Household mailing address lives on **customer account** (`customers` primary location, type `address`), edited in parent drawer via `PersonDrawerHouseholdAddress`.

- Not person-level mailing fields
- Empty copy: “No household mailing address on file for this account”
- Add/edit uses `patchHouseholdCustomerLocation` / `createHouseholdCustomerAddress`

### 8. Employee status

- `compactOperatingSurface` on person drawer hides **Source** field and shortens help copy
- Premium card shell via `PersonDrawerEmployeeStatusSection`

### 9. Household layout

- Guardians + Children columns always render in paired grid (`data-person-drawer-household-columns="paired"`)
- Empty column shows em dash — no collapse to single column

### 10. Config gap audit (unchanged — defer runtime)

| Area | Today | Target |
|------|-------|--------|
| Section visibility | `personDrawer*OperatingOverviewSections` | `record_drawer_layouts` + `visible_when.profiles` |
| Tabs | Hardcoded parent/child tab lists | Layout tab manifest |
| Summary fields | `PersonDrawer*Summary` components | Overview section field keys |
| Built-in sections | Mounted in `AdminEntityDrawer` | Built-in section registry |
| Status defs | `personStatusApplicability` | Status metadata |
| Header slots | Executive/header components | `record_drawer_layouts` header slots |

---

## Tests

| File | Covers |
|------|--------|
| `personDrawerHardeningSprint.test.ts` | Prefetch, household open, shells, placement |
| `personDrawerHardeningPhase2.test.ts` | Global search seeds, explicit save, phone, layout, employee |
| `formatPhoneUS.test.ts` | `(XXX) XXX-XXXX` |
| Existing parent/child/ownership tests | IA locks, primary contact, household |

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/person/personDrawerHardeningPhase2.test.ts tests/admin/person/personDrawerHardeningSprint.test.ts tests/admin/formatPhoneUS.test.ts
```

---

## Before / after (phase 2)

| Concern | Before | After |
|---------|--------|-------|
| Global search → person | Plain open, generic shell | Profile seed + cache + correct chrome |
| Summary save | Blur autosave (DOB partial save risk) | Explicit Save + dirty + leave warning |
| Phone display | `555-123-4567` | `(555) 123-4567` |
| Activity tab (parent/child) | Legacy relationships in “Activity” | Polished empty state |
| Household columns | Single column when one side empty | Stable two-column grid |
| Employee source | Shown on person drawer | Hidden on operating surface |

---

## Deferred

- Full person Activity timeline (mirror opportunity activity API)
- Communications/documents tab background prefetch beyond related payload
- Config runtime migration for drawer layouts
- Person-level mailing address (not product truth — household location only)
- Opportunity drawer open from global search with queue context seed

---

## Related docs

- `docs/sprints/05_2026/child_profile_person_drawer_doctrine.md`
- `docs/sprints/05_2026/parent_operating_surface_person_drawer.md`
- `docs/sprints/05_2026/person_drawer_primary_contact_location_doctrine.md`
