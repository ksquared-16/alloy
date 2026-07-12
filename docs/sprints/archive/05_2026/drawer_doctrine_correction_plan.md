# Drawer Doctrine Correction — Implementation Plan

**Date:** 2026-05-29  
**Status:** Implemented  
**Supersedes:** bespoke Person/Location snapshot accumulation in `person_location_ux_reset.md`

## Problem statement

Person and Location drawers had accumulated bespoke snapshot cards, presentation filters, and a parallel `locationRoomMetadataFieldRegistry` that bypassed the Opportunity drawer framework. This pass converges Person and Location onto shared premium record-drawer primitives and database-backed `field_definitions`.

---

## 1. Supabase migration

### Migration file

| File | Purpose |
|------|---------|
| **`supabase/migrations/20260529160000_location_metadata_field_definitions_convergence.sql`** | Complete location metadata field_definitions + option sets for all orgs |

**Note:** Superseded draft `20260529153000_location_room_metadata_field_definitions.sql` (removed from repo — never required if `20260529160000` is applied).

### Option sets seeded

| `set_key` | Items |
|-----------|-------|
| `location_age_range_unit` | `months`, `years` |
| `childcare_program_type` | *(referenced only — existing org option set)* |

### Field definitions seeded (`entity_type = location`, `config.storage = metadata`)

| Key | Label | Type | Section |
|-----|-------|------|---------|
| `category` | Category | select | room_metadata |
| `age_range_from` | Age range from | text | room_metadata |
| `age_range_to` | Age range to | text | room_metadata |
| `age_range_unit` | Age range unit | select | room_metadata |
| `capacity` | Capacity | number | room_metadata |
| `student_teacher_ratio` | Student:Teacher Ratio | text | room_metadata |
| `director_name` | Director name | text | site_metadata |
| `director_email` | Director email | text | site_metadata |
| `site_phone` | Site phone | text | site_metadata |

---

## 2. Shared premium drawer primitives

Extracted under `web/components/admin/drawer/record/`:

| Primitive | Role |
|-----------|------|
| `RecordDrawerContextPanel` | Pine-accent above-fold/context card shell |
| `RecordDrawerPremiumHeader` | Avatar/title/chips/back-link/context rows |
| `RecordDrawerActionRail` + `RecordDrawerHeaderActionButton` | Header action rail + buttons |
| `RecordDrawerStatusSelect` | Header status dropdown (hidden when no defs) |
| `RecordDrawerSectionCard` | Premium section surface wrapper |

Opportunity keeps **identical behavior** via re-exports:

- `OpportunityDrawerHeaderActionButton` → `RecordDrawerHeaderActionButton`
- `OpportunityDrawerHeaderActionsPanel` → `RecordDrawerActionRail`
- `RecordDrawerHeaderStatusSelect` → `RecordDrawerStatusSelect`

---

## 3. Person drawer convergence

- **`PersonDrawerContextPanel`** replaces `PersonDrawerAboveFoldSnapshot` (deleted)
- Uses `RecordDrawerContextPanel` + `RecordDrawerPremiumHeader`
- **Back to Lead** restored when opened from another drawer
- Admin V2 modal: `personRecordChromeBodyShell` + `sectionSurface="premium"` on overview

Profile-aware section filtering unchanged (`applyPersonDrawerPresentationProfile`).

---

## 4. Location drawer convergence

- **`LocationDrawerContextPanel`** replaces `LocationDrawerAboveFoldSnapshot` (deleted)
- Admin V2 modal: `locationRecordChromeBodyShell` + premium section surface
- **`applyLocationDrawerPresentation`** — layout/grouping only; labels from `_field_definitions`
- **`locationMetadataFieldKeys.ts`** — key constants only (no parallel label/option registry)
- **`locationRoomMetadataFieldRegistry.ts`** deleted

---

## 5. Admin V2 locations settings

**Canonical route:** `/adminV2/settings/locations` (`LocationsHierarchySettingsClient.tsx`)

- Inline table editor unchanged in column set
- Metadata PATCH keys: `student_teacher_ratio` (not legacy `ratio`)
- `/admin/locations` **not modified**

Drawers opened from settings use admin V2 record modal + shared premium primitives.

---

## 6. Files touched

### Added

- `supabase/migrations/20260529160000_location_metadata_field_definitions_convergence.sql`
- `web/components/admin/drawer/record/*`
- `web/components/admin/entity/PersonDrawerContextPanel.tsx`
- `web/components/admin/entity/LocationDrawerContextPanel.tsx`
- `web/lib/admin/location/locationMetadataFieldKeys.ts`
- Tests: `recordDrawerPrimitives`, `locationFieldDefinitionsMigration`, `personDrawerPremiumPrimitives`, `locationDrawerPremiumPrimitives`

### Modified

- `AdminEntityDrawer.tsx`, `EntityDrawerOverview` consumers, location/person presentation libs
- `OpportunityDrawerHeaderActionButton.tsx`, `OpportunityDrawerHeaderActionsPanel.tsx` (re-exports)
- `RecordDrawerHeaderStatusSelect.tsx` (re-export)
- `LocationsHierarchySettingsClient.tsx`, `locationDrawerFieldOptions.ts`, `locationDrawerPresentation.ts`

### Deleted

- `20260529153000_location_room_metadata_field_definitions.sql`
- `PersonDrawerAboveFoldSnapshot.tsx`, `LocationDrawerAboveFoldSnapshot.tsx`
- `locationRoomMetadataFieldRegistry.ts` + its test

### Not touched

Opportunity coordinator, queue fetch, work-unit loading, `opportunityDrawerLayoutStability.ts`, performance gate tests.

---

## 7. Validation results (2026-05-29)

```bash
cd web && npm run test -- tests/admin/drawer/recordDrawerPrimitives.test.ts \
  tests/admin/location/locationFieldDefinitionsMigration.test.ts \
  tests/admin/location/locationDrawerPremiumPrimitives.test.ts \
  tests/admin/person/personDrawerPremiumPrimitives.test.ts \
  tests/admin/opportunity/opportunityDrawerHeaderActionButton.test.ts \
  tests/admin/drawer/opportunityDrawerFirstPaintContract.test.ts \
  tests/admin/drawer/opportunityDrawerLayoutStability.test.ts \
  tests/adminV2/drawerPipeline/drawerAboveFoldDoctrine.test.ts \
  tests/admin/opportunityDrawerOpenCoordinator.test.ts \
  tests/admin/opportunityDrawerHydrateGuards.test.ts \
  tests/admin/location/locationDrawerPresentation.test.ts \
  tests/admin/person/personDrawerPresentationProfile.test.ts \
  tests/admin/person/recordDrawerHeaderStatusSelect.test.tsx \
  tests/adminV2/locationsHierarchySettingsClient.test.ts
```

**Result:** 16 files, **64 tests passed**

Changed-path `tsc`: no errors in doctrine-touched modules (pre-existing failures elsewhere unchanged).

---

## 8. Remaining limitations

- Person/Location do not yet use full Opportunity **drawer pipeline adapters** — visual/control primitives and `field_definitions` converged first.
- Settings table category column still free-text inline edit; select hydration from option sets is drawer-first (table can adopt option-set fetch in a follow-up).
- Legacy `ratio` metadata: read fallback in `locationMetadataFields.ts`; save writes `student_teacher_ratio`.

---

## Suggested commit message

```
Converge Person/Location drawers on shared record primitives; seed location field_definitions.

Extract RecordDrawer* primitives from Opportunity path, migration-backed location metadata fields, adminV2 locations table — without touching queue/coordinator paths.
```
