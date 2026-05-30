# Person Drawer Hardening + Performance Sprint

**Status:** In progress (2026-05-30)  
**Scope:** Person drawer navigation performance, correct operating shells, OCM placement display, household primary contact propagation, unlinked child safety, config gap audit.  
**Out of scope:** Child / Parent / Opportunity IA redesign — operating model is locked.

---

## Operating model (locked)

| Surface | Owns |
|--------|------|
| **Opportunity** | Lead status, pipeline, pre-enrollment child placement (OCM) |
| **Child person drawer** | Child lifecycle operating surface |
| **Parent/Guardian person drawer** | Household / contact operating surface |
| **Person** | Identity, demographics, status |
| **Household / customer** | Address, family account |
| **customer_persons** | Household-scoped primary contact |
| **Future Enrollment/Placement** | Durable schedule / attendance / billing (not this sprint) |

---

## Goals and delivery

### 1. Drawer navigation performance

| Path | Mechanism |
|------|-----------|
| Opportunity → Child / Parent | `prefetchLinkedPersonsFromOpportunityRecord` after opportunity `drawerReady`; open seeds via `personDrawerSeedFromOpportunityRecord` + `cachePersonDrawerChildOpenSeed` / `cachePersonDrawerParentOpenSeed` |
| Parent → Child, Child → Parent | **New:** `prefetchLinkedPersonsFromPersonRecord` after parent/child hydrate; `openPersonDrawerFromHousehold` with typed `personDrawerOpenSeed` |
| All person opens | Cache-first in `AdminEntityDrawer` layout effect (`peekDrawerEntitySnapshot`); `prefetchPersonDrawerSnapshot` on hover/click |

**Before:** Household person links called `openDrawer({ type: "persons", id })` with no seed — cold opens could show generic “Loading person…” and wrong profile chrome until GET completed.

**After:** Household navigation passes child/parent presentation emphasis; typed `PersonDrawerChildOverviewSkeleton` / `PersonDrawerParentOverviewSkeleton` during cold load when chrome hint is known.

### 2. Correct shell / layout loading

- Child: `personDrawerChildChromeActive` + `PersonDrawerChildOverviewSkeleton` / child executive header
- Parent: `personDrawerParentChromeActive` + `PersonDrawerParentOverviewSkeleton`
- Opportunity: unchanged inquiry workflow shell
- Generic `Profile` / `Contact` sections suppressed via `personDrawerChildOperatingOverviewSections` / `personDrawerParentOperatingOverviewSections` and `applyPersonDrawerPresentationProfile`

### 3. Child school location / program

- **Source:** `_enrollment_mirror` (OCM projection) via `resolvePersonDrawerChildPlacementFromRecord`
- **Header:** `PersonDrawerChildHeaderExecutive` (program + location pills; lead pill deep-links to Family Lead when OCM opportunity id present)
- **Household child rows:** `resolveChildHouseholdCardLines` — age · program · location
- **No** `person.location` / `person.program` fields

### 4. Primary contact / action consistency

| Surface | Update path |
|---------|-------------|
| Household drawer PATCH | `patchHouseholdPrimaryContact` → `dispatchHouseholdPrimaryContactChanged` |
| Open opportunity drawer | `adminv2:opportunity-updated` → `refetch()` (existing) |
| Work-unit queue | `dispatchOpportunityQueueUpdated(..., "household_primary_contact")` |
| Open person drawers (same household) | **New:** `admin-entity-saved` listener merges `applyHouseholdPrimaryContactToRecord` |
| Communications default recipient | Opportunity refetch + entity GET primary person resolution (existing server paths) |

### 5. Unlinked records

- `link_state: "unlinked"` when `customer_members.person_id` is null
- Non-clickable row + tooltip + fix hint (`customer_members.person_id` → existing person; do not duplicate person)
- Documented in `personDrawerHouseholdUnlinkedChild.ts`

### 6. Config hardening audit (defer runtime rebuild)

See [Config gap audit](#config-gap-audit) below. Prefer `record_drawer_layouts`, `visible_when.roles` / profiles, and built-in section registry over new hardcoded branches.

### 7. Tests

- `web/tests/admin/person/personDrawerHardeningSprint.test.ts` — prefetch, seeds, shells, placement, primary contact listener
- Existing: `personDrawerChildStabilization`, `personDrawerOwnershipFinalPass`, `personDrawerPrimaryContactLocationDoctrine`, `personDrawerParentOperatingPass`, `prefetchLinkedPersonsFromOpportunityRecord`

---

## Config gap audit

Hardcoded today — candidate to move to config when runtime supports it safely:

| Area | Current hardcode | Target config |
|------|------------------|---------------|
| Section visibility | `applyPersonDrawerPresentationProfile`, `isPersonDrawerChildSuppressedOverviewSection`, parent operating section filters | `record_drawer_layouts` + `visible_when.profiles` |
| Overview tabs | Parent module nav chips → `setDrawerTab` (communications, etc.) | Built-in section registry + tab manifest per profile |
| Summary field placement | Child hero in `PersonDrawerChildSummary`; parent contact in `PersonDrawerParentSummary` | Layout `overviewSections` with profile-scoped field keys |
| Role / profile chrome | `personDrawerChildChromeActive`, `personDrawerParentChromeActive`, open-source hints | `visible_when.roles` + presentation emphasis from layout metadata |
| Status applicability | `personStatusApplicability`, child lifecycle status keys | Status defs `metadata.applicability` (partially done) |
| Built-in sections | Household, address, employee status, enrollment activity mounted in `AdminEntityDrawer` | Built-in section registry keys (`household`, `household_address`, `employee_status`, …) |
| Child placement edit | Deep-link to opportunity (Family Lead) when `primary_opportunity_id` | Registry action on child profile or OCM row scope |

**Do not migrate in this sprint** unless a small, safe extraction (no parallel config runtime).

---

## Key files

| File | Role |
|------|------|
| `web/lib/admin/drawer/openPersonDrawerFromHousehold.ts` | Typed household navigation |
| `web/lib/admin/drawer/prefetchLinkedPersonsFromPersonRecord.ts` | Post-hydrate linked prefetch |
| `web/lib/admin/drawer/personDrawerOpenSeedFromPersonRecord.ts` | Seeds from household links |
| `web/lib/admin/prefetchPersonDrawerSnapshot.ts` | Snapshot warm + parent/child stamp |
| `web/components/admin/AdminEntityDrawer.tsx` | Shell gates, prefetch effects, primary contact listener |
| `web/lib/admin/person/personDrawerChildPlacementContext.ts` | OCM placement resolution |

---

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/person/personDrawerHardeningSprint.test.ts
cd web && npm run test -- tests/admin/person/personDrawerChildStabilization.test.ts
cd web && npm run test -- tests/admin/drawer/prefetchLinkedPersonsFromOpportunityRecord.test.ts
```

---

## Before / after summary

| Concern | Before | After |
|---------|--------|-------|
| Opp → person | Prefetch + seeds (prior work) | Parent seeds also cached on idle prefetch |
| Parent ↔ child | Plain `openDrawer`, generic loading | Seeds + idle prefetch + typed skeletons |
| Cold load shell | Generic “Loading person…” when hint missing | Child/parent skeleton when open source / seed present |
| Primary contact | Opportunity + queue events | + optimistic merge on other open person drawers in household |
| Placement | OCM mirror in header/household (prior work) | Unchanged; tests locked |
| Unlinked child | Documented + disabled UI (prior work) | Unchanged |

---

## Related docs

- `docs/sprints/05_2026/child_profile_person_drawer_doctrine.md`
- `docs/sprints/05_2026/parent_operating_surface_person_drawer.md`
- `docs/sprints/05_2026/person_drawer_primary_contact_location_doctrine.md`
- `docs/sprints/05_2026/adminv2_drawer_performance_hardening_phase0.md`
