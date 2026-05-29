# Person & Location UX Reset

**Date:** 2026-05-29  
**Status:** Implemented (final drawer cleanup + loading guardrail)

---

## Final drawer cleanup (2026-05-29)

| Area | Fix |
|------|-----|
| **Person context panel** | Removed all “inquiry” copy; consolidated enrollment into compact **Related enrollment** block inside lead-summary shell; associated people unchanged |
| **Person body sections** | Tighter premium `EntityDrawerSection` padding/gradient; adult Profile unlocks editable first/last/preferred name + email/mobile (child contact fields still hidden) |
| **Opportunity Lead Summary density** | `oppInqInnerCardCompact` for Family & contacts; reduced geometry min-heights; tighter primary→additional spacing; header→tabs padding reduced in `Drawer.tsx` |
| **Opportunity header copy** | Operator-facing lifecycle + activity lines only (`1 child`, `Family status: …`, `Last activity: Add family member · 10d ago`) — no raw keys or duplicate inquiry phrasing |
| **Children grid layout** | DOB column ~25% narrower (`6.5rem` min); Desired Start widened (`7.75rem` min); read display `MM/DD/YYYY · Ny` without truncate |
| **Child identity sync** | Linked children write `persons`; unlinked write `customer_members`; OCM fields stay on `opportunity_customer_members` (see below) |
| **Loading guardrail** | Audit-only: staged `drawer_visible`/`drawer_primary` attach unchanged; person prefetch unchanged; no performance file edits |

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
| **Person context panel** | Operational-only in `RecordDrawerContextPanel` `variant="lead-summary"` — **Related enrollment** + associated people; no inquiry language |
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
cd web && npm run test -- tests/admin/person/personDrawerPremiumPrimitives.test.ts
cd web && npm run test -- tests/admin/person/personDrawerPresentationProfile.test.ts
cd web && npm run test -- tests/admin/drawer/recordDrawerPrimitives.test.ts
cd web && npm run test -- tests/admin/opportunity/opportunityDrawerHeaderActionButton.test.ts
cd web && npm run test -- tests/opportunities/buildOpportunityChildLifecycleSummary.test.ts
cd web && npm run test -- tests/admin/activitySignals.test.ts
cd web && npm run test -- tests/admin/drawer/inquiryChildFieldEdit.test.ts
cd web && npm run test -- tests/admin/drawer/inquiryChildrenGridLayout.test.ts
cd web && npm run test -- tests/admin/drawer/drawerLoadingGuardrail.test.ts
cd web && npm run test -- tests/admin/drawer/inquiryChildrenDrawerShell.test.ts
cd web && npx tsc --noEmit
```

---

## Remaining limitations

- Legacy `/admin/locations` unchanged.
- Org program categories banner on settings page is read-only context (separate from option-set items).
- Children OCM `notes` remain in API but are not editable in the inquiry children grid.

---

## Lead Summary density + BOS regression fix (2026-05-29)

### Root causes

| Issue | Root cause |
|-------|------------|
| **Huge empty vertical space** | Lead Summary grid used `lg:items-stretch`; Family & contacts and right column carried `flex-1` / `min-h-*` reserve bands (`8.5rem`–`16rem` shell, `4rem` family root, empty review-assist placeholder). |
| **BOS / Work with BOS disappeared** | Density pass replaced the review-assist empty state with a blank reserved placeholder (`min-h-[2rem]` border box) and never rendered `BosDrawerAssistCta` when no `_operational_*` payload; orchestrator handoff card was already disabled (`showHandoffCard = false`). |
| **Content pop-in on scroll** | `inquirySummaryFetchEnabled` required `below_fold_enrichment_ready` **and** intersection on the right column even though Lead Summary is above the fold. |

### Fixes

- **Content-driven geometry** — `opportunityInquiryRightColumnGeometry.ts`: removed large min-height bands; skeleton rows keep small chip-row heights only.
- **Lead Summary layout** — `AdminEntityDrawer.tsx`: `lg:items-start`; compact inner card on both columns; dropped shell min-height token; family wrapper no longer `flex-1`.
- **BOS restored** — `OpportunityInquirySummaryRightColumn.tsx`: calm state copy + standalone `BosDrawerAssistCta` when review assist is absent or fallback; actionable path still uses `OperationalAttentionHeaderStrip` with BOS in-band.
- **Fetch gating** — inquiry summary operational fetch arms when primary contract is satisfied (no scroll intersection).
- **Family & contacts** — `FamilyContactsPanel.tsx`: summary variant drops `flex-1` / `min-h-[2rem]` on additional contacts block.
- **Header/tabs** — `Drawer.tsx`: tighter signals → tabs spacing for record-modal tone.

### Files changed

| File | Change |
|------|--------|
| `web/lib/admin/drawer/opportunityInquiryRightColumnGeometry.ts` | Content-driven slot tokens |
| `web/components/admin/AdminEntityDrawer.tsx` | Grid stretch, fetch gate, compact right column |
| `web/components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx` | BOS CTA + calm state |
| `web/components/admin/opportunity/FamilyContactsPanel.tsx` | Summary spacing |
| `web/components/admin/Drawer.tsx` | Header → tabs density |
| `web/tests/admin/drawer/leadSummaryDensity.test.tsx` | New regression tests |
| `web/tests/admin/drawer/drawerLoadingGuardrail.test.ts` | Geometry expectations |
| `web/tests/adminV2/drawerPipeline/opportunityInquiryRightColumnStructure.test.ts` | Geometry expectations |
| `web/tests/adminV2/bos/recommendations/bosFinalQualityPass.test.tsx` | Calm/BOS wiring |
| `web/tests/admin/adminV2PerformancePass4.test.ts` | Shell min-height contract |

### Validation

```bash
cd web && npm run test -- tests/admin/drawer/leadSummaryDensity.test.tsx
cd web && npm run test -- tests/admin/drawer/drawerLoadingGuardrail.test.ts
cd web && npm run test -- tests/adminV2/bos/recommendations/bosFinalQualityPass.test.tsx
cd web && npm run test -- tests/adminV2/drawerPipeline/opportunityInquiryRightColumnStructure.test.ts
cd web && npm run test -- tests/admin/adminV2PerformancePass4.test.ts
cd web && npx tsc --noEmit
```

---

## Pre-commit cleanup (2026-05-29)

### Lead Summary spacing

- Tighter Family & contacts card padding (`oppInqInnerCardCompact`, summary card pad).
- Removed summary registry-action band between primary and additional contacts.
- Reduced primary → additional gap (`space-y-0`, `mt-0`, list `space-y-0.5`).
- Lead Summary grid `gap-0.5` / `lg:gap-1`; shell `py-0.5`.
- Header Last activity → tabs tightened (`Drawer.tsx` negative margin + zero tab padding).

### Primary contact ownership

| Layer | Owner | Lead Summary behavior |
|-------|--------|---------------------|
| Opportunity inquiry | `opportunities.primary_person_id` | Primary card slot (authoritative) |
| Linked people | `opportunity_persons.role_type` | Fallback when FK unset; `primary_contact` role sorts first in additional list |
| Customer account | `customer_persons.is_primary` + `role_type` | Person drawer **Customer accounts** section (read-only badge); not duplicated on opportunity FK |

Helper: `web/lib/admin/drawer/opportunityFamilyContactsOrdering.ts`. No new migration — existing columns only.

### BOS recommendation content

- Root cause: `OperationalAttentionHeaderStrip` returned `null` when `_operational_attention` was absent even if `_operational_recommendation` existed; chrome band also `line-clamp-1` hid guidance.
- Fix: render Review Assist band from recommendation-only payloads; remove line clamp; avoid duplicate standalone BOS when band present.

### Validation (pre-commit)

```bash
cd web && npm run test -- tests/admin/drawer/leadSummaryDensity.test.tsx
cd web && npm run test -- tests/admin/drawer/opportunityFamilyContactsOrdering.test.ts
cd web && npm run test -- tests/admin/drawer/bosRecommendationContent.test.ts
cd web && npm run test -- tests/admin/actions/configuredDrawerActions.test.ts
cd web && npm run test -- tests/adminV2/bos/recommendations/bosFinalQualityPass.test.tsx
cd web && npx tsc --noEmit
```

---

## Final micro-cleanup (2026-05-29)

### Lead Summary spacing

- Summary Family & contacts root uses `space-y-0.5` (slightly more primary → additional gap vs pre-commit `space-y-0`; still tighter than earlier passes).

### Opportunity header → tabs

- `Drawer.tsx`: signals wrap `-mb-1.5`, tabs `-mt-1` when signals present (~40–50% tighter Last activity → tabs). CSS-only; no fetch/coordinator changes.

### Person drawer header

- Removed `PersonDrawerContextPanel` from `headerSignalsForDrawer` — no Related enrollment / associated-people strip in header chrome.
- Header remains: name, `#`, Back to Lead, role pill (title rail), contact/DOB metadata.
- Enrollment/activity stays in drawer body sections where already rendered.
- `Drawer.tsx`: when cleaning-v2 has no signals (person), tabs wrap uses compact `pt-1` before tab row.

### Validation (micro-cleanup)

```bash
cd web && npm run test -- tests/admin/drawer/leadSummaryDensity.test.tsx
cd web && npm run test -- tests/admin/person/personDrawerPremiumPrimitives.test.ts
cd web && npm run test -- tests/admin/drawer/recordDrawerPrimitives.test.ts
cd web && npx tsc --noEmit
```

---

## Suggested commit message

```
Fix Lead Summary whitespace regression and restore Work with BOS.

Content-driven summary geometry, primary-contract fetch arming, and calm-state BOS CTA without blank reserve bands.
```
