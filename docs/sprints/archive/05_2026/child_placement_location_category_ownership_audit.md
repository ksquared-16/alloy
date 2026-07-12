# Child placement / location / category ownership — audit

**Date:** 2026-05-29  
**Status:** Implemented (drawer display + edit path; pre-close May 2026)  
**Related:** `person_drawer_primary_contact_location_doctrine.md`, `waitlist_priority_fact_truth_child_scope.md`, `child_profile_person_drawer_doctrine.md`

---

## Executive summary

| Phase | Authoritative grain for site + program/cohort |
|-------|-----------------------------------------------|
| **Today (pre-enrollment / waitlist)** | Per-child **`opportunity_customer_members`** (OCM): `location_id`, `desired_program_type`, `program_room_cohort_key`, `outcome_status_key` |
| **Today (case-level lead intent)** | **`opportunities.location_id`** — household/case default site (tours, placement backfill fallback) |
| **Today (orchestration mirror)** | **`placement_candidates`** — `site_id`, `program_room_cohort_key` (often seeded from OCM or opportunity fallback) |
| **Future (enrolled operations)** | **Child placement / enrollment** record (not `persons`) → drives **`schedules`**, attendance, billing; OCM remains inquiry/waitlist history |

**Next step (recommended):** Keep child drawer **read-only** program/location pills sourced from `_enrollment_mirror`; deep-link to **Family Lead / inquiry children** (`opportunity` drawer, `inquiry_child` entity) for edits via existing **`PATCH /api/admin/opportunity-customer-members/[id]`**. Do **not** add `persons.location_id` or drawer PATCH to `persons` for placement. Defer enrolled-state editing until placement/enrollment SoT exists.

---

## 1. Current sources

### Per-child placement (authoritative for drawer display today)

| Store | Fields | Role |
|-------|--------|------|
| **`opportunity_customer_members`** | `location_id`, `desired_program_type`, `desired_schedule_type`, `program_room_cohort_key`, `outcome_status_key`, `desired_start_date` | **SoT** for child site, program interest, room/cohort key, enrollment disposition (`outcome_status_key` per glossary) |
| **`opportunity_customer_members` + option sets** | `desired_program_type` → `childcare_program_type` | “Program” / category label in UI |
| **`locations`** | Sites (`location_type` site), units/rooms (`unit` + `parent_location_id`) | `location_id` on OCM = site; `program_room_cohort_key` may be a **location id** (classroom) or org-level cohort key — resolved in `attachPersonDrawerVisibility` |

### Case / lead shell

| Store | Fields | Role |
|-------|--------|------|
| **`opportunities`** | `location_id`, `status_key`, `metadata.inquiry_children` | **Case-level** site intent (tour default, link `default_location_id`, legacy metadata children before OCM hydrate) |
| **`opportunity.metadata.inquiry_children`** | Hydrated → `_inquiry_children` on opportunity record | Pre-OCM / intake preview; converges to OCM on persist |
| **`opportunity_persons`** | Roles on case | Adults on lead — **not** placement |

### Projection (person drawer read path)

| Projection | Built from | Role |
|------------|------------|------|
| **`_enrollment_mirror`** | OCM rows for `customer_members` linked to child `person_id` + opp status labels | Read-only mirror: `location_label`, `program_label`, `room_label`, `outcome_status_*` |
| **`buildPersonEnrollmentActivityEntries`** | Mirror + `_enrollment_opportunities` | Merged per `opportunity_id`; child header/summary uses **first** entry (not “active lead” ranked) |

### Household / address (not placement)

| Store | Role |
|-------|------|
| **`locations`** (`customer_id`, address fields) | Household **mailing/service address** — not child site enrollment |
| **`customers` / `customer_members`** | Account + member identity; **no** `location_id` on `customer_members` |
| **`customer_persons`** | Adult roles (`primary_contact`, etc.) — location-agnostic |

### Waitlist orchestration

| Store | Role |
|-------|------|
| **`placement_candidates`** | `site_id`, `program_room_cohort_key`, FK to OCM; backfill often uses **opportunity `location_id`** when OCM site null |

### Other location links (not child enrollment SoT)

| Store | Role |
|-------|------|
| **`person_locations`** | Generic person↔location (employees, demos, quote flow) — **not** used for childcare child drawer placement |
| **`tour_bookings.location_id`** | Tour event site |
| **`schedules.location_id`** | Job/visit scheduling (platform table exists; childcare enrolled child schedule section not wired in person drawer) |

### “Category” in product language

There is **no** separate `category` column on person or OCM. UI “category/program” maps to:

- **`desired_program_type`** (option set `childcare_program_type`)
- **`program_room_cohort_key`** (+ optional `locations` label for room/cohort)
- Case metadata keys (`program_room_group`, etc.) on opportunities/candidates — display/orchestration, not person fields

---

## 2. Ownership recommendation

| Entity / surface | Owns |
|------------------|------|
| **`persons`** | Identity, demographics, consent field values, `status_key` — **not** site, program, or classroom |
| **`opportunity_customer_members` (`inquiry_child`)** | **Pre-enrollment & waitlist** per-child site, program, cohort/room, desired dates, **`outcome_status_key`** |
| **`opportunities`** | **Lead/case** coordination: case `status_key`, case-level `location_id` as **default intent** until per-child OCM is set |
| **`placement_candidates`** | Waitlist queue grain; mirrors OCM/opportunity site for orchestration |
| **Parent / guardian `persons`** | Contact, household relationships — **location- and program-agnostic**; per-child placement shown only on **child rows** in household projection |
| **Future: child placement / enrollment** | **Enrolled** operational truth: active site, program assignment, room, rate class → feeds scheduling, attendance, billing |
| **Future: `schedules` (+ attendance/billing)** | Time-bound operations at a **placement-resolved** `location_id` — not a substitute for enrollment SoT |

**Principle (already encoded in drawer):** One child may have siblings at different sites; one parent may link to multiple customers; visibility follows **enrollment mirror `location_id` × `customer_member_id`**, not a single household site.

---

## 3. Edit path

### Can the child drawer safely edit location/category today?

**Technically yes, but not via `persons` PATCH.**

| Path | Supported? | Target |
|------|------------|--------|
| Child summary identity (name, DOB, gender, metadata dates) | Yes | `PATCH /api/admin/persons/[id]` via `patchPersonDrawerFields` |
| Program / site / room on child drawer | **No UI today** | N/A |
| Inquiry children / Family Lead | Yes | `PATCH /api/admin/opportunity-customer-members/[id]` — `location_id`, `desired_program_type`, `program_room_cohort_key`, … + `validateInquiryChildPlacementPatch` |
| Field registry entity | `inquiry_child` → OCM id | Settings can expose native OCM fields in opportunity **inquiry_children** section |

### If editing from child drawer were added

- **PATCH target:** `opportunity_customer_members.id` (mirror row `id`), **not** `person_id`.
- **Requires:** Resolved OCM id on mirror, org assert, placement scope validation, site permission on target `location_id`.
- **Risk:** Multiple OCM rows / opportunities per child — must pick correct row or show picker; header currently uses **first** `buildPersonEnrollmentActivityEntries` result.

### Recommended UX (now)

- **Read-only** program · location pills on child header/summary (from `_enrollment_mirror`).
- **CTA:** “Edit on Family Lead” → open `opportunity` drawer (`primary_opportunity_id` when present) with **inquiry_children** section focused; or explicit OCM row when multi-lead.
- **Do not** add inline site/program selects on child person PATCH.

---

## 4. Permissions (location-scoped operators)

Implemented pattern: `attachPersonDrawerVisibility(..., { siteScope })` → `filterPersonDrawerHouseholdVisibilityBySiteScope`.

| Actor view | Behavior |
|------------|----------|
| **Child at Location A** | Visible if mirror `location_id` ∈ `allowedSiteLocationIds` |
| **Sibling at Location B** | Hidden from site-A operator’s household child list / mirror (filtered by **`customer_member_id`**, not only `customer_id`) |
| **Parent linked to both children** | Adult link retained only if **some** child on that `customer_id` remains visible after mirror filter |
| **Household spanning sites** | Parent drawer may show **subset** of children; shared household placement note only when **2+ visible** children share same program **and** location |

**Implication:** Site-restricted users see a **partial household** — correct for operational scope. They must not infer global household placement from parent-level fields (none exist).

**Gap to watch:** Opening parent from a Location-A-only queue while child B exists — parent still valid; child B simply absent until user has cross-site scope.

---

## 5. Recommendation matrix

| Item | Action |
|------|--------|
| Display child program/location on person drawer | **Done / keep** — `_enrollment_mirror` + `personDrawerLocationCategoryOwnership` |
| Edit placement from child drawer | **Defer** — use Family Lead / OCM PATCH |
| Add `persons.location_id` (or school_location) | **Do not** — breaks multi-site siblings and conflates identity with placement |
| OCM `location_id` backfill for legacy rows | **Ops/scripts** per `waitlist_priority_fact_truth_child_scope.md` (not drawer) |
| `placement_candidates.site_id` sync from OCM | **Existing orchestration** — keep OCM primary when set |
| Enrolled-state placement SoT | **Defer** — new enrollment/placement entity; mirror becomes historical + link to schedule/billing |
| Site-scoped classroom catalog | **Defer** — `validateChildPlacementScope` documents deferred classroom/rate checks |
| Child drawer deep-link to opportunity | **Implement next** (small UX; no schema) |
| Rank “primary” lead for header pills | **Defer** — explicit rule (active opp, latest OCM, enrolled-first) |

### Migrations required for this decision

**None** for read-only drawer + Family Lead edit path — OCM columns already exist.

Future enrolled phase may add **`child_placements`** / enrollment table (name TBD) — migration then **backfill** from OCM where `outcome_status_key = enrolled`; do not backfill onto `persons`.

### Risk of person-level placement fields

- Wrong SoT when one person = multiple OCM rows or post-enrollment schedule moves site.
- Site scope leaks (household appears single-site).
- Duplicates `opportunity.location_id` vs OCM child site.
- Blocks cross-industry person model (employees use `person_locations` for different semantics).

---

## 6. Drawer behavior (implemented)

| Surface | Source | Edit |
|---------|--------|------|
| Child header pills | `_enrollment_mirror` → program, school/site, `Lead: {status}` | Lead pill + **Edit on Family Lead** open opportunity |
| Child summary | Identity/dates only — no placement block | N/A |
| Household child rows | Mirror per `customer_member_id` (`age · program · site`) | Read-only |
| Parent drawer | Location-agnostic | N/A |

**Site label resolution:** `opportunity_customer_members.location_id` first; if empty, `opportunities.location_id`; label from `locations` via `buildPersonEnrollmentMirrorRowsForMemberIds`.

**Never:** `persons.location_id`, person field_values for school/program/classroom. “Location” here is school/site/campus (AdminV2 header filter sense), not household address.

**Future SoT:** Enrollment / Placement entity when schedule, attendance, billing, and classroom modules exist.

Code: `buildPersonEnrollmentMirrorRows.ts`, `personDrawerChildPlacementContext.ts`, `PersonDrawerChildHeaderExecutive.tsx`

## 7. Next step (post-commit)

1. Drawer hardening / performance pass.
2. When enrolled SoT exists: read active placement; keep OCM as lead history.

---

## 7. Drawer ownership pass (2026-05-30) — implemented

| Area | Status |
|------|--------|
| Primary contact edit on guardian cards | Done — `PATCH …/household-primary-contact` |
| Child placement on household cards | Done — age + program · location + optional classroom |
| Household address edit | Done — `locations` POST/PATCH from parent drawer |
| Header back link | Done — Lead only from opportunity; no person-to-person back |
| Migrations | None |

---

## Reference (code)

- Mirror build: `web/lib/admin/person/attachPersonDrawerVisibility.ts`
- Ownership helpers: `web/lib/admin/person/personDrawerLocationCategoryOwnership.ts`
- Site filter: `web/lib/admin/person/personDrawerHouseholdSiteScope.ts`
- Child summary source: `web/lib/admin/person/personDrawerChildSummaryModel.ts`
- OCM PATCH: `web/app/api/admin/opportunity-customer-members/[id]/route.ts`
- Inquiry child registry: `web/lib/fields/inquiryChildFieldRegistry.ts`
