# Person & Location UX Reset

**Date:** 2026-05-29  
**Status:** Implemented (correction pass complete; uncommitted)  
**Audit:** `docs/sprints/05_2026/person_location_polish_reset_audit.md`

## Summary

Person and Location drawers now have distinct product identities without restarting the Opportunity drawer architecture. Person is **identity + relationships**; Location is **admin configuration**. The canonical locations admin surface is **`/adminV2/settings/locations`**.

Opportunity drawer coordinator, queue fetch, performance gates, and work-unit queue loading were **not** modified.

---

## Correction pass (2026-05-29)

Focused fixes applied after initial reset:

| Area | Fix |
|------|-----|
| **Location metadata fields** | Seeded/configured `category`, `age_range_from`, `age_range_to`, `age_range_unit`, `capacity`, `student_teacher_ratio` on `locations.metadata` via `field_definitions` migration + registry defaults |
| **Location drawer** | Compact header (no body duplication); parent site shows resolved label; category + age unit as selects; age from/to/unit on one row; capacity + Student:Teacher ratio on one row; Save/Cancel/More actions use `OpportunityDrawerHeaderActionButton` |
| **Locations table** | Column renamed **Student:Teacher Ratio**; inline PATCH uses `student_teacher_ratio` (legacy `ratio` read fallback only) |
| **Children section** | Title **Children**; notes column removed from UI; view-person icon immediately left of name; wider status column (`text-xs`); proportional grid without horizontal scroll |
| **Person drawer** | Opportunity-style above-fold card; duplicate Back to Lead removed; parent profiles hide siblings group (show children only); meaningless status hidden when no defs |
| **Buttons** | Location Save/Cancel/More actions + person contextual actions aligned to Opportunity drawer action-button styling |

---

## Canonical page

| Route | Component | Role |
|-------|-----------|------|
| **`/adminV2/settings/locations`** | `LocationsHierarchySettingsClient.tsx` | **Canonical** table editor for sites/rooms |
| `/admin/locations` | `LocationsClient.tsx` | Legacy list (unchanged; not target of this pass) |

---

## Fields configured

### Room metadata (`locations.metadata` + `field_definitions`)

| Field key | UI control | Notes |
|-----------|------------|-------|
| `category` | Dropdown | Default option set `childcare_program_type`; org program categories |
| `age_range_from` | Text/number | Editable in drawer + settings table |
| `age_range_to` | Text/number | Paired with from |
| `age_range_unit` | Dropdown | `months` / `years` via `location_age_range_unit` option set |
| `capacity` | Text/number | Same row as ratio in drawer |
| `student_teacher_ratio` | Text | Label **Student:Teacher ratio**; clears legacy `ratio` keys on save |

Migration: `supabase/migrations/20260529153000_location_room_metadata_field_definitions.sql`

Registry/helpers: `locationRoomMetadataFieldRegistry.ts`, `locationMetadataFields.ts`, `locationDrawerFieldOptions.ts`

### Site metadata (unchanged)

`director_name`, `director_email`, `site_phone` on `locations.metadata`.

---

## What changed (initial reset + correction)

### Person drawer

- **`PersonDrawerAboveFoldSnapshot`** — compact Opportunity-style card: avatar, name, role badges, contact (parent) or DOB/age (child); no nested stat cards; no duplicate back link.
- **`RecordDrawerHeaderStatusSelect`** — status in header when org status definitions exist; hidden when none configured.
- **`personDrawerPresentationProfile.ts`** — profile-aware section filtering; parent relationship presentation hides emergency + **siblings** (children group only).
- Body hides header-duplicated fields by profile.

### Location drawer

- **`LocationDrawerAboveFoldSnapshot`** — type chip, name, parent site link (label not UUID), room count for sites only; no category/capacity/ratio in header.
- **`locationDrawerPresentation.ts`** — site = site details + address; room = 3-col grid with metadata; property/customer/relationship sections suppressed for site/unit.
- Metadata merged into form state; PATCH on save via `mergeLocationMetadataPatch`.
- **`LocationDrawerDeactivateAction`** — More actions (inactive/delete) with Opportunity action-button styling.

### Admin V2 settings locations

- Table columns: Site, Room, Type, Category, Age Range, Capacity, **Student:Teacher Ratio**, Status, Actions.
- Inline metadata edit for room rows; open drawer for full edit.
- Demo/BrightStart removal via deactivate; deletion eligibility reason when hard delete blocked; no visible “Demo” label.

### Children section

- Section title **`Children`**.
- Notes field removed from grid UI (OCM `notes` still in API; not editable in grid).
- View person icon immediately left of child name.
- Proportional grid; status uses larger `text-xs` select; no `min-w-[1100px]` horizontal scroll.

---

## Config-driven choices

| Behavior | Driver |
|----------|--------|
| Person profile sections | `resolvePersonDrawerProfile` + `applyPersonDrawerPresentationProfile` |
| Person status in header | Org `status_definitions` |
| Location site/room shape | `location_type` + `applyLocationDrawerPresentation` |
| Room category / age unit selects | `field_definitions` option sets + registry defaults |
| Location metadata storage | `locations.metadata` JSON |
| BrightStart/demo removal | `isDemoLocation` + `/api/admin/deletion-eligibility` |

---

## Fields hidden vs deleted

**Hidden (presentation only)** — still in DB/API:

- Person child: contact, employee, DOB in body (shown in header), full name, person #, notes in consent.
- Person parent: medical, emergency, DOB, siblings group (children shown instead).
- Location site/unit: home type, beds/baths, pets, customer, relationships, property custom fields.

**Not deleted** — metadata migration adds field definitions; no new location columns.

---

## Validation

Targeted tests:

```bash
cd web && npm run test -- tests/admin/location/locationRoomMetadataFieldRegistry.test.ts
cd web && npm run test -- tests/admin/location/locationDrawerPresentation.test.ts
cd web && npm run test -- tests/admin/location/locationListPresentation.test.ts
cd web && npm run test -- tests/admin/location/locationsClientTable.test.ts
cd web && npm run test -- tests/adminV2/locationsHierarchySettingsClient.test.ts
cd web && npm run test -- tests/admin/person/personDrawerPresentationProfile.test.ts
cd web && npm run test -- tests/admin/person/recordDrawerHeaderStatusSelect.test.tsx
cd web && npm run test -- tests/admin/personDrawerVisibility.test.ts
cd web && npm run test -- tests/admin/drawer/inquiryChildrenDrawerShell.test.ts
cd web && npx tsc --noEmit
```

---

## Remaining limitations

- Category options depend on org program categories / option-set hydration; free-text metadata still works when sets are empty.
- Legacy `ratio` / `ratio_licensing_notes` keys are read for display but cleared when saving `student_teacher_ratio`.
- Children OCM `notes` remain in API but are not editable in the inquiry children grid (intentional for this pass).
- Person `record_drawer_layouts` / full record chrome convergence — deferred.
- Legacy `/admin/locations` unchanged.
- Settings table still hand-rolls editor (not yet wired to `entityPresentation.locations.table`).

---

## Suggested commit message

```
Fix Person/Location drawer UX correction pass; canonicalize room metadata fields.

Student:Teacher ratio metadata, compact headers, Opportunity action buttons, children grid cleanup, adminV2 locations table — without touching Opportunity/queue paths.
```
