# Person & Location UX Reset

**Date:** 2026-05-29  
**Status:** Implemented (drawer visual parity + opportunity density pass)

---

## Inquiry Children data integrity (2026-05-29)

### Canonical child identity ownership

| Question | Answer |
|----------|--------|
| **A. Which table owns child identity?** | When `customer_members.person_id` is set → **`persons`** (first/last name native columns; DOB in `field_values` as `date_of_birth`). When no person link → **`customer_members`** (`first_name`, `last_name`, `dob`, `display_name`). |
| **B. Which table does Opportunity Inquiry Children update?** | Same canonical owner via `patchInquiryChildIdentityFromDrawer`: **`PATCH /api/admin/persons/{id}`** when linked; else **`PATCH /api/admin/customer-members/{id}`**. OCM-only fields (program, status, desired start, location, notes) still **`PATCH /api/admin/opportunity-customer-members/{ocmId}`**. |
| **C. Which table does Person drawer read?** | **`persons`** (+ attached field values) via **`GET /api/admin/entity/persons/{id}`**. Header DOB uses `date_of_birth` / `_age`; Profile shows first/last/preferred name. |

### Divergence fixed

Previously Inquiry Children always PATCHed `customer_members` while hydration **read DOB from `persons`** when linked — edits could appear to save but Person drawer and inquiry re-hydrate showed stale person data.

**Fix:** write path routes to the same canonical record as read path; hydration uses `resolveInquiryChildIdentityFields` (person-first when linked for name + DOB).

### DOB column layout

Inquiry Children DOB column uses a fixed min width and `DOB · Age` read copy (e.g. `10/06/2020 · 5y`) without truncation.

---

## Drawer visual parity + opportunity density (2026-05-29)

| Area | Change |
|------|--------|
| **Person header** | Shell title = person name; role pills on `headerTitleRight` via `personDrawerRolePillClassName`; adult email/phone or child DOB/age in `PersonDrawerHeaderContactMeta` under pills; `#67` + single back link in `PersonDrawerHeaderMetadata` |
| **Person context panel** | Operational-only (`PersonDrawerContextPanel`) in `RecordDrawerContextPanel` `variant="lead-summary"` — same pine accent / gradient shell as Opportunity Lead Summary (`oppInqLeadSummaryShellClassName`) |
| **Person body** | Premium `EntityDrawerSection` + `oppInqFieldInput` for adult Profile (first/last/preferred name, email, mobile); header metadata reads saved `overviewData` |
| **Opportunity header meta** | Child lifecycle: `1 child` / `N children` headline; `Family status: …` display line; `new_inquiry` → **New lead**; no `Children: all …` or duplicate count lines; `action_executed` humanized (e.g. **Add family member**) |
| **Opportunity density** | Tighter header→tabs gap (`Drawer.tsx`); Lead Summary uses shared shell with reduced padding/gaps; `showCaseNote={false}` on lifecycle strip; reduced Family & Contacts summary min-heights and list spacing |
| **Family & Contacts** | Text “View person” replaced with shared `ViewPersonDrawerIconButton` (Children section pattern) |
| **Locations table** | `table-fixed` + compact columns (Category 160px; age From/To 70px + Unit 95px; Capacity 80px; Ratio 120px); dropdowns wired to option sets |

Opportunity open coordinator, queue/performance paths, migrations/schema, and broad drawer architecture were **not** modified.

### Option-set configuration (UI today)

Category and age-range unit dropdown values are **UI-configurable** via the existing option-set admin:

| Route | Sets |
|-------|------|
| **`/adminV2/settings/option-sets`** | Admin V2 chrome wrapper |
| **`/admin/system/option-sets`** | Legacy path (same client) |
| Detail: `/adminV2/settings/option-sets/{setKey}` or `/admin/system/option-sets/{setKey}` | Edit items |

Relevant set keys:

- **`childcare_program_type`** — room **Category** (`field_definitions` default for `category`)
- **`location_age_range_unit`** — **Age range unit** (`months`, `years`, etc.)

No new option-set editor was added in this pass; reuse `OptionSetsClient` / `OptionSetDetailClient`.

---

## Opportunity-parity person drawer (2026-05-29, earlier)

| Area | Visual parity change |
|------|---------------------|
| **Title row** | Shell title = person name; role pills on `headerTitleRight` title rail; status + save actions share the rail |
| **Metadata row** | `PersonDrawerHeaderMetadata`: `#67` (not Person #67), single Back link |
| **Context panel** | Operational-only (latest inquiry, enrollment activity, associated people) — no identity repetition |
| **Body sections** | Premium `EntityDrawerSection` cards; person fields use compact density + `oppInqFieldInput` styling |
| **Adult Profile basic** | Editable first/last/preferred name, email, mobile (phone labeled **Mobile**); header metadata reads saved `overviewData` |

---

## Header + locations table correction (2026-05-29)  
**Audit:** `docs/sprints/05_2026/person_location_polish_reset_audit.md`

## Summary

Person and Location drawers now have distinct product identities without restarting the Opportunity drawer architecture. Person is **identity + relationships**; Location is **admin configuration**. The canonical locations admin surface is **`/adminV2/settings/locations`**.

---

## Correction pass (2026-05-29, earlier)

| Area | Fix |
|------|-----|
| **Location metadata fields** | Seeded/configured via `field_definitions` migration + DB-backed defs |
| **Location drawer** | Compact header; parent site label; category + age unit selects; Save/Cancel/More via shared action rail |
| **Locations table** | Column **Student:Teacher Ratio**; inline PATCH on `student_teacher_ratio` |
| **Children section** | View-person icon left of name; wider status column |
| **Drawer doctrine** | Shared `RecordDrawer*` primitives; deleted bespoke above-fold snapshots |

Migration: `supabase/migrations/20260529160000_location_metadata_field_definitions_convergence.sql`

---

## Canonical page

| Route | Component | Role |
|-------|-----------|------|
| **`/adminV2/settings/locations`** | `LocationsHierarchySettingsClient.tsx` | **Canonical** table editor for sites/rooms |
| `/admin/locations` | `LocationsClient.tsx` | Legacy list (unchanged) |

---

## Fields configured

### Room metadata (`locations.metadata` + `field_definitions`)

| Field key | UI control | Option set |
|-----------|------------|------------|
| `category` | Dropdown | `childcare_program_type` |
| `age_range_from` | Text/number | — |
| `age_range_to` | Text/number | — |
| `age_range_unit` | Dropdown | `location_age_range_unit` |
| `capacity` | Text/number | — |
| `student_teacher_ratio` | Text | — |

Helpers: `locationDrawerFieldOptions.ts`, `locationMetadataFields.ts`, `locationMetadataFieldKeys.ts`

---

## Validation

```bash
cd web && npm run test -- tests/admin/drawer/inquiryChildFieldEdit.test.ts
cd web && npm run test -- tests/admin/person/personDrawerPremiumPrimitives.test.ts
cd web && npm run test -- tests/admin/person/personDrawerPresentationProfile.test.ts
cd web && npm run test -- tests/admin/drawer/recordDrawerPrimitives.test.ts
cd web && npm run test -- tests/admin/opportunity/opportunityDrawerHeaderActionButton.test.ts
cd web && npm run test -- tests/admin/opportunity/viewPersonDrawerIcon.test.tsx
cd web && npm run test -- tests/admin/opportunity/editablePersonContactCardLivePath.test.tsx
cd web && npm run test -- tests/opportunities/buildOpportunityChildLifecycleSummary.test.ts
cd web && npm run test -- tests/admin/activitySignals.test.ts
cd web && npm run test -- tests/adminV2/locationsHierarchySettingsClient.test.ts
cd web && npx tsc --noEmit
```

---

## Remaining limitations

- Legacy `/admin/locations` unchanged.
- Org program categories banner on settings page is read-only context (separate from option-set items).
- Children OCM `notes` remain in API but are not editable in the inquiry children grid.

---

## Suggested commit message

```
Align person drawer with Opportunity styling and tighten opportunity drawer density.

Lead-summary context panel, operator-facing lifecycle copy, compact Family & Contacts spacing, and fixed-width locations table columns.
```
