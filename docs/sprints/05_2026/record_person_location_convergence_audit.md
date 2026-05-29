# Record, Person & Location Convergence Sprint — Card 0 Audit

**Date:** 2026-05-29  
**Status:** Card 0 audit complete · **Card 1 shipped (2026-05-29)** · **Card 2 shipped (2026-05-29)** — child location authority display resolver  
**Goal:** Architectural baseline for converging location, room, child inquiry, person drawer, relationships, record lifecycle, household terminology, and enrollment navigation into a coherent operator model.

**Canonical references:** `docs/core/glossary.md`, `docs/system/entity-model.md`, `docs/system/record-system.md`, `docs/system/workspace-system.md`, `docs/system/configuration-system.md`, `docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`, `docs/sprints/05_2026/waitlist_priority_fact_truth_child_scope.md`, `docs/sprints/05_2026/completed/settings_control_plane_closeout.md`

---

## Executive summary

Alloy's location model is a **single hierarchical `locations` table** (address → site → unit) with no separate `rooms`, `programs`, or `cohorts` tables. Child inquiry placement fields live on **`opportunity_customer_members`** (OCM) with a mixed config/hardcoded UI in the opportunity drawer. The **person drawer uses a hardcoded compact overview** and does not participate in the Settings → Layouts control plane. Relationships are spread across **`customer_persons`**, **`person_relationships`**, and **`customer_members`** with no admin CRUD for directed person edges. Record lifecycle is overwhelmingly **status-based** with **no hard-delete APIs** for core CRM entities. **"Household"** remains in operator-facing copy despite glossary preference for **Customer** / **Case** / **Family**. **Enrollment Pipeline** navigation is structurally unique: one `enrollment_pipeline` work unit expands into domain queue rows in the sidebar.

---

## 1. Location Ownership Audit

### Current State

#### Location tables

| Table | Role |
|-------|------|
| **`locations`** | Canonical location entity — addresses, org sites (`location_type = 'site'`), rooms/classrooms (`location_type = 'unit'`, `parent_location_id` → site) |
| **`location_types`** | Org-scoped type catalog (`key`, `label`, `position`, `is_active`) — includes `room`, `classroom` labels |
| **`person_locations`** | Person ↔ location (`relationship_type`, `is_primary`) |
| **`user_site_access`** | User site scope (`location_id` must be `location_type = 'site'`) |
| **`access_methods`** | Legacy access-method catalog (`locations.access_method_id`) |

**Key `locations` columns:** `id`, `org_id`, `customer_id` / `vendor_id` (XOR), `location_type` (`address` \| `site` \| `unit`), `location_type_id`, `parent_location_id`, address fields, `is_primary`, `is_active`, `status_key`, `metadata`, service-detail fields (`beds`, `baths`, `home_type_key`, etc.).

**Constraint:** `locations_location_type_check` allows only `address`, `site`, `unit` — room/classroom semantics are **`unit` rows** (often `metadata.semantic_kind: "classroom"`).

**Config infrastructure:** `field_definitions` / `field_values` / `field_section_definitions` with `entity_type = 'location'`; option sets for `home_type`, `access_method`, `square_footage_tier`.

#### Room tables

**No `rooms` table.** Rooms/classrooms are **`locations` rows** where `location_type = 'unit'` and `parent_location_id` points to a site.

Cohort keys (`program_room_cohort_key`) typically store the **`locations.id`** of the unit row.

#### Location-related entities (programs, sites, cohorts)

| Concept | Storage | Notes |
|---------|---------|-------|
| **Site** | `locations` (`location_type = 'site'`) | Child site on OCM; waitlist `placement_candidates.site_id`; tour `tour_bookings.location_id` |
| **Program** | Option set `childcare_program_type` | Not a table; stored on OCM `desired_program_type` and opportunity field defs |
| **Cohort / room interest** | Text `program_room_cohort_key` on OCM and `placement_candidates` | Usually a unit `locations.id`; not a first-class entity |
| **Org program categories** | `web/lib/orchestration/placement/orgProgramCategoryRegistry.ts` | Waitlist section grouping by program band, not room |

**Unrelated:** `discount_programs` — billing discounts, not enrollment programs.

#### Source of truth matrix

| Concept | Source of truth | Column / key | Fallback |
|---------|-----------------|--------------|----------|
| **Opportunity location** | `opportunities` | `location_id` → `locations.id` | Service address, tour site, waitlist `site_id` when child site unset |
| **Child site** | `opportunity_customer_members` | `location_id` | Opportunity `location_id` at placement backfill |
| **Room / classroom** | `locations` (unit under site) | Referenced by `program_room_cohort_key` | DOB/heuristic derivation in placement backfill |
| **Program (enrollment)** | `opportunity_customer_members` | `desired_program_type` | Org option set `childcare_program_type` |
| **Cohort (waitlist grain)** | `placement_candidates` + OCM | `program_room_cohort_key`, `site_id` | Derived keys (`unknown_program_room`, etc.) |

#### APIs

| Route | File | Methods |
|-------|------|---------|
| `/api/admin/locations` | `web/app/api/admin/locations/route.ts` | GET (`?hierarchy=1`), POST |
| `/api/admin/locations/[id]` | `web/app/api/admin/locations/[id]/route.ts` | PATCH |
| `/api/admin/location-options` | `web/app/api/admin/location-options/route.ts` | GET |
| `/api/admin/location-types` | `web/app/api/admin/location-types/route.ts` | GET |
| `/api/admin/entity/locations/[id]` | `web/app/api/admin/entity/[type]/[id]/route.ts` | GET (hydrated drawer payload) |
| `/api/admin/related/location/[id]` | `web/app/api/admin/related/[entity]/[id]/route.ts` | GET |
| `/api/admin/field-definitions?entity_type=location` | `web/app/api/admin/field-definitions/route.ts` | GET |

**Gap:** POST/PATCH locations APIs do not expose `parent_location_id` — hierarchy creation is seed/script-driven.

#### Routes & settings pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/locations` | `web/app/admin/locations/LocationsClient.tsx` | Flat list → drawer |
| `/adminV2/settings/locations` | `web/components/adminV2/settings/LocationsHierarchySettingsClient.tsx` | Site → unit tree, org program categories |
| `/admin/system/location-fields` | `web/app/admin/system/location-fields/LocationFieldsClient.tsx` | Legacy field definitions |
| `/adminV2/settings/fields?entity=location` | `web/app/adminV2/settings/fields/SettingsFieldsHubClient.tsx` | Fields hub |
| `/adminV2/settings/tours/availability` | `TourAvailabilitySettingsClient.tsx` | Tour rules by `location_id` |

#### Location drawer implementation

- **Shell:** `web/components/admin/AdminEntityDrawer.tsx` — type `"locations"`
- **Presentation:** `web/lib/entityPresentation.ts` — code-defined sections (Overview, Property & custom fields, Customer, Relationships); tabs: overview, related, activity, documents
- **Custom fields:** `field_definitions` (`entity_type=location`) merge into `custom_property_fields` section
- **Not used:** `record_overview_layouts` / `record_drawer_layouts` (opportunity + job only)
- **Access:** `web/lib/admin/accessScope.ts` — `assertLocationDrawerReadable()` (not department-scoped)

#### Configured layout usage

| Layer | Used for locations? |
|-------|---------------------|
| `entityPresentation.ts` | **Yes** — primary drawer structure |
| `field_definitions` + `field_values` | **Yes** — custom/property fields |
| `field_section_definitions` | **Yes** |
| `record_drawer_layouts` | **No** |
| Field behavior policy (`field_placements_v1`) | **No** — opportunity/job only |

### Issues

1. **`entity-model.md` omits** locations, sites, rooms, programs — schema truth is scattered across migrations and sprint docs.
2. **`location_types` catalog is richer than `locations.location_type` CHECK** — `room`, `classroom`, `property` exist as type labels but not as valid `locations.location_type` values.
3. **No admin API for `parent_location_id`** — operators cannot create room-under-site hierarchy through standard CRUD; settings UI is read/tree + drawer edit.
4. **`program_room_cohort_key` is overloaded** — room location id vs derived/heuristic keys.
5. **`opportunity_customer_members.location_id` lacks FK constraint** in schema reference.
6. **Opportunity `location_id` still acts as fallback** for child site in waitlist backfill when OCM site is unset.
7. **`discount_programs` naming** collides conceptually with enrollment "program."

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Split site truth (opp vs child) | **High** | Waitlist ranking and sibling facts depend on child site; fallback masks missing data |
| Room hierarchy not operator-manageable | **Medium** | Demo/seeds work; production tenants cannot self-serve room creation |
| Type catalog vs CHECK mismatch | **Low–Medium** | Confusing for settings authors and future verticals |
| Location drawer not on layout control plane | **Medium** | Inconsistent with opportunity drawer convergence direction |

### Recommended Target State

1. **Single location hierarchy model:** `locations` remains SoT; document site/unit semantics in `entity-model.md`; align `location_types` catalog with runtime CHECK or relax CHECK to include semantic subtypes.
2. **Child site authority:** OCM `location_id` is primary; opportunity `location_id` is case-default / tour-site only — placement backfill must not silently override unset child site without operator signal.
3. **Room = unit under site:** `program_room_cohort_key` resolves to `locations.id` of type `unit`; admin API gains `parent_location_id` on POST/PATCH for hierarchy management.
4. **Program = option set + optional site scoping:** Keep `childcare_program_type` as org config; evaluate site-scoped program availability in a later card.
5. **Location drawer on control plane (deferred):** Add `location` to `LAYOUT_SETTINGS_ENTITY_ORDER` when opportunity/job layout semantics stabilize.
6. **FK hygiene:** Add `opportunity_customer_members.location_id` → `locations(id)` FK in a future migration card.

---

## 2. Child Inquiry Audit

### Current State

#### Persistence

**Table:** `public.opportunity_customer_members` (OCM) — join between opportunity and `customer_members`.

| Operator label | Schema field | Type | Dropdown / label source |
|----------------|--------------|------|-------------------------|
| **Site** | `location_id` | `uuid` | `GET /api/admin/locations?hierarchy=1` — sites only (`location_type = 'site'`) |
| **Room / cohort** | `program_room_cohort_key` | `text` | Units under selected site via `buildInquiryChildRoomOptionsForSite()` (`inquiryChildPlacementScope.ts`) |
| **Program** | `desired_program_type` | `text` | `GET /api/admin/option-sets/childcare_program_type` |
| **Schedule** | `desired_schedule_type` | `text` | `GET /api/admin/option-sets/childcare_schedule_type` |
| **Outcome** | `outcome_status_key` | `text` | `GET /api/admin/status-definitions?entity_type=opportunity_customer_members` |
| **Desired start** | `desired_start_date` | `date` | Native date input; may inherit opportunity-level default in UI |

**Identity (not on OCM):** child name, DOB on `customer_members` (+ `persons` when linked).

**Settings entity type:** `inquiry_child` — operator label "Inquiry child"; persistence on OCM.

**Key files:**
- Manifest: `web/lib/fields/inquiryChildFieldRegistry.ts`
- Primary UI: `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx`
- Hydration: `web/lib/admin/drawer/inquiryChildrenHydration.ts`, `web/lib/admin/opportunityEntityRecord.ts`
- PATCH: `web/app/api/admin/opportunity-customer-members/[id]/route.ts`
- Scope validation: `web/lib/admin/drawer/inquiryChildPlacementScope.ts`, `validateChildPlacementScope.ts`

#### Configurable vs hardcoded

| Layer | Configurable | Hardcoded |
|-------|--------------|-----------|
| Field registry | Labels, visibility, sort via Settings → Fields (`entity_type=inquiry_child`) | Native keys + PATCH allowlist in code |
| DB `field_definitions` seed | program, schedule, outcome, notes, desired_start (migration `20260520120000`) | `location_id`, `program_room_cohort_key` in code manifest but **not** in seed migration |
| Grid layout | Section show/hide/reorder in opportunity `record_drawer_layouts` (`inquiry_children` injected system section) | Column order, Tailwind grid classes in component |
| Column headers | Site, Room/cohort, Desired start via `labelForInquiryChildFieldKey` | Program, Schedule, Outcome headers are **literal strings** in grid |
| Dropdown rules | Option-set items, status defs, location hierarchy data | Site-before-room rule; site/unit filters; API wiring |

#### Render locations

| Surface | File | Editable? |
|---------|------|-----------|
| **Opportunity drawer inquiry grid** | `OpportunityInquiryChildrenSection.tsx` | Yes — primary SoT editor |
| **Drawer shell placeholder** | `OpportunityInquiryChildrenShellChrome.tsx` | Loading chrome only |
| **Layout settings preview** | `layoutSectionOperatorUi.ts`, `effectiveDrawerLayoutPreview.ts` | Read-only field list |
| **Settings → Fields** | `SettingsFieldsHubClient.tsx` (`entity=inquiry_child`) | Field metadata |
| **Queue previews** | `QueueService.ts`, `crmQueueRowPreviewPresentation.ts`, `childGrainEnrollmentQueue.ts`, `candidateGrainWaitlistQueue.ts` | Read-only |
| **Placement orchestration** | `householdPlacementFacts.ts`, `validateChildPlacementScope.ts` | Backend |
| **Add child modal** | `AddInquiryChildModal.tsx` | **Stub** — identity only; no OCM persistence |

**Child inquiry fields do not render on the person drawer** — they are edited only in the opportunity inquiry children grid.

### Issues

1. **Partial field_definitions coverage** — Site/Room may be missing from Settings → Fields per org until manually seeded.
2. **Grid UI partially hardcoded** — Program/Schedule/Outcome column headers not driven by field defs.
3. **AddInquiryChildModal is a stub** — cannot add children with placement fields from modal.
4. **Dual hydration paths** — `mergeHouseholdActiveChildrenIntoInquiryChildren` merges roster children not yet on OCM; naming still uses "household."
5. **Site inheritance** — opportunity-level desired start inherited in UI but child site fallback to opportunity location persists in placement layer.

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Operators edit site/room in drawer but waitlist uses stale placement_candidates | **High** | Requires hook/backfill on OCM PATCH |
| Settings parity gap for Site/Room | **Medium** | Tenants cannot relabel or hide placement fields consistently |
| Stub add-child modal | **Medium** | Forces workaround through forms/intake for new children |

### Recommended Target State

1. **OCM is authoritative** for Site, Room/cohort, Program, Schedule, Outcome, Desired start — placement_candidates sync on change (existing hooks; verify completeness).
2. **Full field_definitions seed** for all native OCM keys including `location_id` and `program_room_cohort_key`.
3. **Grid headers driven by effective field policy** — same four-plane model as opportunity native fields.
4. **Add child flow** persists `customer_members` + OCM in one action with placement fields.
5. **Document inquiry_child entity** in `record-system.md` and `configuration-system.md` as a first-class configurable surface.

---

## 3. Person Drawer Audit

### Current State

#### Architecture

**No URL route segment** — drawer is React context state (`AdminDrawerContext.tsx`), not path-based.

| Mechanism | Pattern |
|-----------|---------|
| Open | `openDrawer({ type: "persons", id })` |
| Stack / back | `parent: { type: "opportunities", id }` when opened from inquiry |
| Entity GET | `GET /api/admin/entity/persons/:id` |
| Prefetch | `web/lib/admin/prefetchPersonDrawerSnapshot.ts` |
| PATCH | `PATCH /api/admin/persons/:id` |
| Open from opportunity | `web/lib/admin/drawer/openViewPersonFromOpportunity.ts` |

#### Layout: configured vs hardcoded

**Person does NOT use `record_drawer_layouts`.** Layout settings hub supports only `opportunity`, `job`, `schedule`:

```3:3:web/lib/adminV2/layoutsSettingsEntities.ts
export const LAYOUT_SETTINGS_ENTITY_ORDER = ["opportunity", "job", "schedule"] as const;
```

**Runtime branch** in `AdminEntityDrawer.tsx`:
- `usePersonCompactOverview` → **shipped path** for all existing person drawers
- `useConfigDrivenOverview` → used for opportunity/job, **not** persons

| Surface | Source | Configurable? |
|---------|--------|---------------|
| **Compact overview** | `PersonDrawerCompactOverview.tsx` | **Hardcoded** — Contact, Employee status, Relationships |
| **entityPresentation.ts** `persons.drawer` | `web/lib/entityPresentation.ts` (~1367–1448) | Defines Profile, Contact, Employee placement, Relationships, Record info — **bypassed** by compact overview |
| **Field definitions** | Settings → Fields (`entity_type=person`) | Configured but **not rendered** in compact overview |
| **Related tab** | `AdminEntityDrawer.tsx` | Hardcoded: customers, relationships, legacy contacts/members, locations, opportunities |
| **Create flow** | Inline form in `AdminEntityDrawer.tsx` | Hardcoded first/last/email/phone |

#### Person sections (compact overview)

1. **Contact** — read-only email/phone
2. **Employee status** — `PersonEmployeePlacementSection.tsx` (`is_employee`, `employee_id`, `employee_source` on `persons`)
3. **Relationships** — customers, locations, opportunities from entity GET hydration

**Related tab** adds: `person_relationships`, `compatibility_contacts`, `compatibility_members`, `linked_locations`, `linked_opportunities`.

#### Role-specific handling

**No person-type-specific drawer layouts** — same UI for parent, child, employee, emergency contact.

| Role | Where handled |
|------|---------------|
| **Child (inquiry)** | Opportunity drawer `OpportunityInquiryChildrenSection`; "View" opens person drawer |
| **Parent / guardian** | `FamilyContactsPanel`, `PrimaryPersonContactCard`, `EditablePersonContactCard` on opportunity |
| **Emergency contact** | `AddRelatedPersonModal.tsx`, `AddFamilyMemberModal.tsx` — `role_type = emergency_contact` on opportunity |
| **Household children list** | `OpportunityHouseholdPeoplePanel.tsx` |

### Issues

1. **Settings → Person Fields configures defs that the drawer does not render** — control plane parity gap.
2. **Compact overview is a parallel implementation** — `entityPresentation.ts` sections are documentation/fallback only.
3. **No child-specific person surface** — child placement fields only on opportunity OCM grid.
4. **No relationship editor** in person drawer — read-only hydration; writes only via opportunity panels or intake.
5. **Person not in layout settings roadmap** — explicit "coming later" copy in `layoutSettingsAddSectionUnavailableCopy`.

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Operators expect person drawer to show child enrollment fields | **High** | UX confusion; convergence sprint must decide grain |
| Field config investment wasted on person | **Medium** | Settings work does not reach operator |
| Relationship management gap | **Medium** | No admin API for `person_relationships` / `customer_persons` CRUD |

### Recommended Target State

1. **Person drawer joins layout control plane** — add `person` to `LAYOUT_SETTINGS_ENTITY_ORDER` after opportunity semantics stabilize.
2. **Role-aware sections (config-driven):** default sections for Contact, Employee, Relationships; optional **Child enrollment** section when person is linked as `customer_members.relationship = child` (read-only mirror of OCM or deep-link to opportunity).
3. **Retire compact overview** in favor of `EntityDrawerOverview` + effective layout resolution — same path as opportunity.
4. **Relationship editor section** — create/update `person_relationships` and `customer_persons` through existing permission gates.
5. **Preserve open-from-opportunity stack** — parent context for back navigation.

---

## 4. Relationship Model Audit

### Current State

Alloy uses a **layered identity model** — not a single relationships table.

| Layer | Table | Purpose |
|-------|-------|---------|
| Human identity | `persons` | Canonical person |
| Person ↔ customer | `customer_persons` | Role on customer (`role_type`, `is_primary`) |
| Person ↔ person | `person_relationships` | Directed edge (`from_person_id` → `to_person_id`, `relationship_type`) |
| Household roster | `customer_members` | Children & members (names, DOB, `person_id` bridge) |
| Child ↔ opportunity | `opportunity_customer_members` | Per-child enrollment row |
| Person ↔ opportunity | `opportunity_persons` | Family members on opportunity (`role_type`) |
| Person ↔ location | `person_locations` | e.g. child ↔ classroom |
| **Legacy** | `customer_member_contacts` | Contact ↔ member bridge |

**Vocabulary tables:** `customer_person_role_types`, `person_relationship_type_settings`, `customer_member_relationship_types`.

**Childcare MVP seeds** (`20260430211000_childcare_mvp_control_plane_seed.sql`):
- `customer_person_role_types`: `child`, `parent`, `guardian`, `emergency_contact`, `authorized_pickup`, `payer`
- `person_relationship_type_settings`: `parent`, `guardian`, `emergency_contact`, `authorized_pickup`
- `customer_member_relationship_types`: `child`

#### Semantics by relationship type

| Relationship | Primary storage | Notes |
|--------------|-----------------|-------|
| **Parent–child** | `person_relationships` (`parent`) + `customer_persons` (`parent`/`child`) + `customer_members` (`relationship = child`) | Children in queues use **`customer_members`** as roster truth |
| **Guardian–child** | Same pattern with `guardian` | Booking writes `customer_persons` via `bookingCustomerPersonLink.ts` |
| **Emergency contact–child** | `person_relationships` (`emergency_contact`) + `customer_persons` | Legacy: `customer_member_contacts` |
| **Sibling** | **Not a `person_relationships` type** | Multiple `customer_members` on same `customer_id`; derived in `householdPlacementFacts.ts` |

**Unique constraints:**
- `person_relationships`: `(org_id, from_person_id, to_person_id, relationship_type)`
- `opportunity_customer_members`: `(org_id, opportunity_id, customer_member_id)`

**FK:** `person_relationships` → `persons` ON DELETE CASCADE.

#### APIs

**Read:**
- `GET /api/admin/db-relationships`
- `GET /api/admin/related/person/[id]`
- `GET /api/admin/entity/persons/[id]`
- `GET /api/admin/customer-person-role-types`
- `GET /api/admin/person-relationship-type-settings`
- `GET /api/admin/person-options?customer_id=`

**Writes (no dedicated relationship CRUD):**
- `bookingCustomerPersonLink.ts`, `book-v2/confirm`, `applyFormIntakeSafe.ts`, `applyIntakeChildToOpportunity.ts`
- `PATCH /api/admin/customer-members/[id]`, `PATCH /api/admin/opportunity-customer-members/[id]`
- Legacy: `POST/DELETE /api/admin/customer-member-contacts`

### Issues

1. **No admin API to create/update/delete `person_relationships` or `customer_persons`** — relationships created only by intake/booking/seeds.
2. **Three parallel child representations** — `customer_members`, `customer_persons` (role=child), `person_relationships` (adult→child).
3. **Sibling is implicit** — no first-class edge; placement facts derive from shared `customer_id`.
4. **Legacy `customer_member_contacts` still has routes** — marked `LEGACY_COMPAT`.
5. **Opportunity-scoped vs customer-scoped people** — `opportunity_persons` vs `customer_persons` can diverge.

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Operators cannot fix relationship errors | **High** | Requires support/scripts |
| Duplicate or conflicting edges across tables | **Medium** | Intake paths may write different layers |
| CASCADE delete on person_relationships | **Medium** | Person delete removes edges without archive trail |

### Recommended Target State

1. **Canonical write path:** `customer_persons` for account roles; `person_relationships` for directed adult→child edges; `customer_members` for child roster identity on customer.
2. **Admin relationship editor API** — CRUD for `person_relationships` and `customer_persons` behind `requireAdminOrOps()` + audit events.
3. **Convergence rule:** new intake writes all three layers consistently; migration card to backfill gaps.
4. **Sibling:** keep implicit via shared customer **or** add optional `person_relationships.sibling` type in a later card — document chosen model in glossary.
5. **Retire `customer_member_contacts`** per `person-vs-contact-audit.md` timeline.

---

## 5. Record Lifecycle Audit

### Current State

Framework: `web/lib/admin/deletionEligibility.ts` + `GET /api/admin/deletion-eligibility`.  
Drawer hard-delete allowlist: `web/lib/admin/deleteConfig.ts` — **pricing config entities only**.

#### Summary matrix

| Entity | Table(s) | `deleted_at` | `archived_at` / archive API | `is_active` / deactivate | Hard delete API | Eligibility framework |
|--------|----------|--------------|----------------------------|--------------------------|-----------------|----------------------|
| **Person** | `persons` | No | Col yes; **no API** | `status_key` | **No** | Not covered |
| **Opportunity** | `opportunities` | No | **No** (status only) | `status_key` / pipeline | **No** | Recommends archive |
| **Location** | `locations` | No | **No** | `is_active` PATCH | **No** | Recommends archive |
| **Program** | option sets + OCM | N/A | N/A | option `is_active` | N/A | N/A |
| **Room** | `locations` + cohort keys | N/A | N/A | location `is_active` | **No** | N/A |
| **Tour** | `tour_bookings` | No | Cancel = soft terminal | `status_key`, `canceled_at` | **No** | N/A |
| **Waitlist** | `placement_candidates` + OCM | No | `status` on candidates | `outcome_status_key` | Scripts only | N/A |
| **Task** | `operational_tasks` | No | **No** | `status` completed/canceled | **No** | N/A |
| **Document** | `documents` | No | **No** | `status` workflow | **No** (scripts only) | N/A |

#### Per-entity detail

**Person:** `archived_at`, `archived_by` exist; PATCH explicitly excludes `archived_at`. RLS allows owner/admin DELETE; no DELETE route.

**Opportunity:** lifecycle via `status_key` / pipeline; no DELETE or archive endpoint. Child rows (OCM) lifecycle via `outcome_status_key`.

**Location:** `is_active: false` via PATCH; no `archived_at`.

**Tour:** `POST /api/admin/tours/bookings/[bookingId]/cancel` → `status_key = 'canceled'`.

**Waitlist:** `placement_candidates.status`; demo cleanup scripts only; hooks do not delete candidates.

**Task:** `PATCH /api/admin/operational-tasks/[id]` with `status: completed | canceled`.

**Document:** `PATCH /api/admin/documents/[id]` updates `status`; RLS delete for org admin; no user-facing DELETE API.

**Customer member (child roster):** `DELETE /api/admin/customer-members/[id]` — admin only; `PATCH is_active: false`.

#### Permission enforcement

| Guard | Used for |
|-------|----------|
| `getAdminContextCached()` | Base org + role |
| `ctx.role === "admin"` | Persons, locations, documents, customer-members DELETE |
| `requireAdminOrOps()` | Tours, OCM, operational tasks |
| `getAdminAccessContextCached()` + scope asserts | Opportunity PATCH (department/site restrictions) |
| Service-role `createAdminClient()` | All admin API DB access — app enforces role |

### Issues

1. **Archive columns exist without APIs** — `persons.archived_at` is read-only from admin.
2. **No unified archive semantics** — mix of `is_active`, `status_key`, `archived_at`, cancel timestamps.
3. **customer_members DELETE is an exception** — hard delete allowed without eligibility check.
4. **deletionEligibility covers few entity types** — discourages delete but no archive path implemented.
5. **Document hard delete only in scripts** — no operator recovery path.

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Accidental customer_members DELETE | **High** | Orphans OCM / placement_candidates |
| No person/opportunity archive | **Medium** | Operators use status hacks or retain stale rows |
| Inconsistent lifecycle vocabulary | **Medium** | "Archive" vs "deactivate" vs "cancel" vs "outcome" |

### Recommended Target State

1. **Unified lifecycle vocabulary in glossary:** Archive (reversible hide), Deactivate (`is_active`), Terminal status (closed/canceled/enrolled), Hard delete (admin-only, eligibility-gated).
2. **Archive APIs** for person, opportunity, location — write `archived_at` / `archived_by` with audit events; no hard delete for CRM core.
3. **Extend deletionEligibility** to all major record types with recommended action.
4. **OCM / placement_candidates** — soft terminal via `outcome_status_key`; never hard delete when placement history exists.
5. **customer_members DELETE** — gate behind eligibility (block when OCM or placement_candidates exist).

---

## 6. Household Terminology Audit

### Current State

**Glossary:** Customer = "account/household/business shell"; Opportunity = household coordination case. **"Household" is informal childcare shorthand**, not a platform entity type.

**~130 files** under `web/` match `household` (many internal/module names).

#### Operator-facing UI (active product)

| Surface | Text | File |
|---------|------|------|
| Drawer section | `Household people` | `OpportunityHouseholdPeoplePanel.tsx` |
| Drawer errors | "Failed to load household people", "Household links may be incomplete" | same |
| Drawer opportunity | `Household could not be confirmed` | `AdminEntityDrawer.tsx` |
| Waitlist queue slot | `waitlistHouseholdContext` | `QueueBlock.tsx`, `workspace-types.ts` |
| CRM search subtitle | `Household: ${customerName}` | `crm-entity-search/route.ts` |
| Packet launch | `Household` enrollee fallback | `enrollment-packet-launch/route.ts`, `OpportunityEnrollmentPacketModal.tsx` |
| Form fields | `Account / household name` | `systemFieldRegistry.ts` |
| Form authoring | `Customer / household` | `formFieldAuthoringPresentation.ts` |
| Intake review | `Customer (household)`, "wrong person, household, child" | `SubmissionIntakeCaseFileContent.tsx` |
| Packet intake | `Household / opportunity:` | `PacketIntakeContextPanel.tsx` |
| Submission intelligence | `Household linked` | `submissionIntelligencePresentation.ts` |
| Linkage review | "belongs with the right household" | `submissionLinkageReviewUx.ts` |
| Packet validation | "no household customer", "opportunity's household" | `opportunityPacketLaunchValidation.ts` |
| Email template | `{{household_name}}` token | `enrollmentPacketEmailTemplate.ts` |
| Task Assist | `Matched household`, `Matched household member` | `taskAssistEntitySearchDisambiguation.ts` |
| Comms recipients | `Household member` | `drawerEmailRecipients.ts` |
| Admin actions error | `household/customer` | `executeAdminAction.ts` |

**Already aligned:**
- Drawer titles strip "household" — `opportunityInquiryDrawerTitle.ts`
- Entity labels default `customers` → **Customer** — `EntityLabelsContext.tsx`
- Greeting avoids "Hi Mitchell household" — `suggestedContentTemplates.ts`

**Internal/code names (keep):** `householdPlacementFacts`, `household_label`, `flag_employee_household`, `mergeHouseholdActiveChildrenIntoInquiryChildren`, seed `"{Last} household"`.

**Settings pages:** No "Household" in `/adminV2/settings/**`.

### Issues

1. **Operator UI still says "Household"** in high-traffic surfaces (drawer panel, packet launch, CRM search, forms).
2. **Internal module names leak into operator copy** via `_identity.household` and BOS active context.
3. **Email token `{{household_name}}`** — back-compat alias; docs should map to customer display name.
4. **Active docs** still use household as synonym in sprint prose.

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Terminology confusion (Customer vs Household vs Case) | **Medium** | Onboarding friction; undermines entity-model clarity |
| Template token breakage if renamed | **Low** | Keep internal alias; change display labels only |

### Recommended Target State

| Current | Replacement (operator-facing) |
|---------|-------------------------------|
| `Household people` | **People** or **Customer people** |
| `Household: {name}` | **Customer: {name}** (tenant label via EntityLabelsContext) |
| `Account / household name` | **Account name** or tenant Customer label |
| `Household linked` | **Customer linked** |
| `Customer (household)` | **Customer** |
| `Household / opportunity:` | **Opportunity** or **Case** |
| `Household could not be confirmed` | **Customer could not be confirmed** |
| Enrollee fallback `Household` | **Family** (childcare) or **Customer** |
| `Matched household` | **Matched customer** / **Matched person** |
| `Household member` | **Family member** or **Customer member** |
| API error `household/customer` | **customer** only |

**Keep internal:** `householdPlacementFacts`, `household_label` field on `_identity`, `{{household_name}}` token alias.

**Sprint card:** string-only pass on operator UI; no schema renames.

---

## 7. Navigation Audit

### Current State

#### AdminV2 left nav hierarchy

**Shell:** `web/app/adminV2/components/Sidebar.tsx`

```
Home                 → /adminV2/workspace
Automations          → /adminV2/workflows
Forms                → /adminV2/forms
Departments
  └── {Department}
      └── [expand if children]
          ├── {Queue label} → /adminV2/workspace/dept/{deptId}/work-unit/{wuId}?queue={key}
          └── …
Settings               → /adminV2/settings
```

**Nav data:** `workspaceNavTreeCache.ts` — `GET /api/admin/departments` + `GET /api/admin/work-units`.

**Child row builder:** `buildWorkspaceNavDeptChildren.ts`.

#### Enrollment Pipeline backing

| Attribute | Value |
|-----------|-------|
| Department key | `departments.key = 'enrollment'` |
| Display name | `Enrollment` (tenant-configurable) |
| Execution work unit | `enrollment_pipeline` — single WU for all in-pipeline opportunities |
| Config | `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts` |

**Legacy work units (deactivated):** `pipeline_overview`, `early_inquiries`, `quoting`, `priced_followup`, standalone `needs_attention` — replaced by domain queues inside `enrollment_pipeline` (`20260601140000_deactivate_legacy_enrollment_work_units_v2.sql`).

#### Visible domain queues (v2)

| Sidebar label | Queue key | Grain |
|---------------|-----------|-------|
| New Leads | `new_leads` | case |
| Tours | `tours` | case |
| Follow Up | `communications_followup` | case |
| Waitlist | `waitlist` | candidate/child |
| Enrolling | `enrollment_offers` | child |
| Enrolled | `enrollment_completed` | child |

**Excluded from sidebar lanes:** `needs_attention`, `pipeline_total`, `forms_documents`, `tours_follow_up`.

**Needs Attention:** queue inside `enrollment_pipeline`, not a separate work unit — dept right rail + WU pill, not a sidebar lane.

#### Why Enrollment renders differently

| Mechanism | Enrollment | Other departments |
|-----------|------------|-------------------|
| Sidebar children | `pickDeptPipelineWorkUnit` → `extractPipelineExecutionLanes` → **one row per queue label** | One row per **work unit name** |
| Layout gate | `domain_with_attention` → `pipeline_with_attention` | Usually `single_section` |
| Dept page | Execution pipeline (left) + Needs Attention buckets (right) | Generic WU summary cards |
| Opportunity assignment | All pipeline opps on one `work_unit_id`; lanes = domain filters | Multi-WU verticals scope by WU |

**Key files:** `pickDeptPipelineWorkUnit.ts`, `extractPipelineExecutionLanes.ts`, `buildWorkspaceNavDeptChildren.ts`, dept/WU pages under `web/app/adminV2/workspace/`.

### Issues

1. **Enrollment is special-cased in nav builder** — other departments may need similar domain expansion in future verticals.
2. **Breadcrumb shows WU name ("Enrollment Pipeline")** when domain label (`?queue=waitlist`) would be clearer.
3. **Collapsed rail hides department tree** — mobile/collapsed users lose queue navigation.
4. **Card 15 (Settings Config Management)** for tenant CRUD on domain labels/order — deferred.

### Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Nav special-case drift | **Medium** | New verticals may copy enrollment hacks inconsistently |
| Operator confusion (WU name vs domain) | **Low–Medium** | Partially addressed in Card 13C closeout |
| Legacy WU resurrection | **Low** | Migrations deactivated; seeds must not recreate |

### Recommended Target State

```
Department: Enrollment (key: enrollment)
└── Execution WU: enrollment_pipeline
    ├── Domains (sidebar + dept pipeline + WU pills)
    │   ├── New Leads      [case]
    │   ├── Tours          [case]
    │   ├── Follow Up      [case]
    │   ├── Waitlist       [candidate]
    │   ├── Enrolling      [child]
    │   └── Enrolled       [child]
    └── Overlay: Needs Attention (dept right rail, WU pill — not sidebar lane)
```

**Navigation UX targets:**
1. **Keep domain queue labels in sidebar** — current post-13C behavior is correct.
2. **Breadcrumb/shell:** prefer active **domain label** when `?queue=` is set (`workUnitShellDisplayTitle.ts`).
3. **Do not restore** legacy status-slice work units as nav siblings.
4. **Extract reusable `extractPipelineExecutionLanes` pattern** for future multi-domain departments without forking nav builder.
5. **Card 15:** tenant-configurable domain labels, order, visibility.

---

## Cross-cutting convergence themes

| Theme | Current fragmentation | Convergence direction |
|-------|----------------------|----------------------|
| **Location grain** | Opp `location_id` vs OCM `location_id` vs `placement_candidates.site_id` | Child OCM primary; opp = case default |
| **Room grain** | `locations` unit vs `program_room_cohort_key` text | Cohort key = unit `locations.id`; admin hierarchy API |
| **Person vs child inquiry** | OCM on opportunity; person drawer generic | Person drawer mirrors child context; edit on opportunity |
| **Layout control plane** | Opportunity yes; person/location no | Expand layouts to person, then location |
| **Relationships** | Read-only in UI; multi-table writes on intake | Admin relationship editor + consistent intake writes |
| **Lifecycle** | Status/is_active mix; archive cols unused | Archive APIs + eligibility for all core entities |
| **Terminology** | Household in UI | Customer / Case / Family per glossary |
| **Navigation** | Enrollment domain expansion | Document pattern; breadcrumb domain labels |

---

## Suggested sprint card sequencing (audit-only proposal)

| Card | Scope |
|------|-------|
| 1 | ~~Location hierarchy API~~ **Shipped (partial):** docs + inquiry UI labels/order + location drawer target spec | ✅ Card 1 |
| 1b | Location hierarchy API (`parent_location_id`) + settings UX for site→room | Deferred |
| 2 | OCM field_definitions parity + inquiry grid header policy | Partially done in Card 1 |
| 3 | Placement sync verification on OCM site/room PATCH |
| 4 | Household → Customer/Family string pass (operator UI) |
| 5 | Person drawer → layout control plane (phase 1) |
| 6 | Relationship editor API (person_relationships, customer_persons) |
| 7 | Archive APIs for person, opportunity, location |
| 8 | Add child modal persistence + placement fields |

---

## Files inspected (representative)

**Schema:** `docs/supabase/reference/supabase_tables.csv`, `supabase/migrations/20260329165048_remote_schema.sql`, `20260430133000_opportunity_customer_members_foundation.sql`, `20260528120000_waitlist_priority_fact_truth_child_scope.sql`

**Location:** `web/lib/entityPresentation.ts`, `web/lib/admin/drawer/inquiryChildPlacementScope.ts`, `web/components/adminV2/settings/LocationsHierarchySettingsClient.tsx`, `web/app/api/admin/locations/route.ts`

**Inquiry / person:** `web/lib/fields/inquiryChildFieldRegistry.ts`, `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx`, `web/components/admin/entity/PersonDrawerCompactOverview.tsx`, `web/components/admin/AdminEntityDrawer.tsx`

**Relationships / lifecycle:** `web/lib/orchestration/placement/householdPlacementFacts.ts`, `web/lib/admin/deletionEligibility.ts`, `web/app/api/admin/persons/[id]/route.ts`

**Nav / terminology:** `web/lib/adminV2/navigation/buildWorkspaceNavDeptChildren.ts`, `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts`, `web/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx`

**Docs:** `docs/core/glossary.md`, `docs/system/record-system.md`, `docs/system/workspace-system.md`, `docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`

---

## Card 1 — Location + Child Inquiry Convergence (shipped 2026-05-29)

### What changed

**Part A — Documentation**
- Added **Location semantics** section to `docs/system/entity-model.md` (canonical path; sprint brief referenced `docs/product/entity-model.md` which does not exist).
- Documents hierarchical `locations` taxonomy (`address` / `site` / `unit`), no separate rooms table, child OCM authority vs opportunity `location_id` fallback, and multi-site display rule.

**Part B — Child inquiry UI**
- Operator labels: **Site → Location**, **Room/Cohort → Room**, **Outcome → Status**.
- Column order: **Location → Program → Room → Schedule → Status** (program before room).
- Code manifest (`inquiryChildFieldRegistry.ts`), grid component (`OpportunityInquiryChildrenSection.tsx`), placement scope copy (`inquiryChildPlacementScope.ts`).
- Migration `20260529120000_inquiry_child_field_label_convergence.sql` updates per-org `field_definitions` labels/sort order and idempotently seeds `location_id` / `program_room_cohort_key` where missing.
- **Database column names unchanged**; saved values unaffected.
- **View person:** verified unchanged — `person_id` opens person drawer via `openViewPersonFromOpportunity`; no `person_id` opens `customer_members` drawer (no fake person).

**Part C — Location drawer convergence prep**
- Added `web/lib/recordChrome/locationDrawerLayoutTarget.ts` — documented target sections/fields with availability (`implemented` / `field_definition` / `not_implemented`).
- Cross-reference comment in `entityPresentation.ts` (`locations` drawer).
- **Did not seed `record_drawer_layouts` for location** — see blockers below.

### Files changed

| File | Change |
|------|--------|
| `docs/system/entity-model.md` | Location semantics section |
| `web/lib/fields/inquiryChildFieldRegistry.ts` | Labels + sort order |
| `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx` | Header/row order + labels |
| `web/lib/admin/drawer/inquiryChildPlacementScope.ts` | Operator copy |
| `web/lib/recordChrome/locationDrawerLayoutTarget.ts` | **New** — target layout spec |
| `web/lib/entityPresentation.ts` | Comment → target spec |
| `supabase/migrations/20260529120000_inquiry_child_field_label_convergence.sql` | Field definition labels |
| `web/tests/admin/fields/inquiryChildFieldRegistry.test.ts` | Manifest label/order test |

### Intentionally deferred

- Location drawer runtime on `record_drawer_layouts` / Settings → Layouts tab for `location`.
- `parent_location_id` on locations POST/PATCH API.
- Site phone, email, director, room capacity, age range, ratio/licensing columns.
- Opportunity-level “Multiple locations” display UX — **shipped in Card 2** (drawer header + overview).
- Delete/archive, permissions, separate rooms/programs tables.

### Location drawer `record_drawer_layouts` blockers

Seeding a `record_drawer_layouts` row for `entity_type = location` would be **inert** today:

1. **`layoutsSettingsEntities.ts`** — Settings hub allows only `opportunity`, `job`, `schedule`.
2. **`effective-preview` route** — rejects `entity_type=location` (`ALLOWED` set).
3. **`AdminEntityDrawer`** — locations branch uses `entityPresentation.ts` canon directly; does not call `fetchEffectiveRecordDrawerLayout`.
4. **`field_placements_v1`** — behavior policy applies to opportunity/job only.

**Safe next step (Card 2+):** add `location` to layout settings allowlist, wire drawer to effective layout resolution, then seed global `record_layouts` template.

### Risks

| Risk | Mitigation |
|------|------------|
| Orgs with customized `field_definitions` labels retain custom text until operators edit Settings | Migration only renames known legacy labels (`Site`, `Outcome`, `Room / cohort`) |
| Grid column order still hardcoded in component | Manifest + field_defs sort order aligned for Settings preview; full policy-driven grid deferred |
| Tenants who customized inquiry column labels in DB won't get new defaults | Expected — config overrides code fallbacks via `labelForInquiryChildFieldKey` |

---

## Card 2 — Child Location Authority + Opportunity Display Consistency (shipped 2026-05-29)

### Part A — Implementation path audit

Surfaces that render opportunity location and Card 2 disposition:

| Surface | File(s) | Card 2 action |
|---------|---------|---------------|
| **Drawer header / subtitle** | `AdminEntityDrawer.tsx` (`opportunityHeaderLocationLabel`, `data-opportunity-drawer-location`) | **Updated** — uses `opportunityDisplayLocationLabel` |
| **Opportunity overview** (`location_id` field) | `EntityDrawerOverview.tsx` via `opportunityOverviewRelationshipReadLabel` | **Updated** — resolver in `opportunityOverviewLabels.ts` |
| **Child inquiry grid** (per-child Location column) | `OpportunityInquiryChildrenSection.tsx` | **Unchanged columns**; added multi-location operator hint |
| **Queue row meta** (`locationContext`) | `enrollmentWorkUnitViewModel.ts`, `realWorkUnitFromOpportunities.ts` | **Not touched** — rows lack child `location_id`; see deferred |
| **Queue enrichment** | `QueueService.ts` (`_location_label` from `opportunities.location_id`) | **Not touched** — no child location on preview rows |
| **Lead/customer summary** | `FamilyContactsPanel`, `PrimaryPersonContactCard` | **Not touched** — no opportunity location display |
| **Child lifecycle strip** | `OpportunityChildLifecycleSummaryStrip` / `buildOpportunityChildLifecycleSummary.ts` | **Not touched** — lifecycle only, not site |
| **Tour section** | `OpportunityTourDrawerSection.tsx` | **Not touched** — tour site is booking truth, separate concern |
| **Queue preview seed (loading)** | `opportunityQueuePreviewSeed` → drawer gate | **Unchanged fallback** — opportunity-level label during shell load only |

### What changed

**Shared resolver** — `web/lib/opportunities/resolveOpportunityDisplayLocation.ts`
- `resolveOpportunityDisplayLocation(input)` — framework-agnostic rules (child-first, dedupe, single/multiple/none, opportunity fallback).
- `opportunityDisplayLocationFromRecord(record)` — reads `_inquiry_children[].location_id` / `location_label` + opportunity fields.
- `opportunityDisplayLocationLabel(record)` — operator-facing string.

**Applied surfaces**
- Drawer header: `Location: {label}` uses resolver (shows **Multiple locations** when children disagree).
- Overview `location_id` read label uses same resolver via `opportunityOverviewRelationshipReadLabel`.
- Inquiry children section: hint when `opportunityDisplayLocationKind === "multiple"`; per-child Location column unchanged.

**Tests**
- `web/tests/opportunities/resolveOpportunityDisplayLocation.test.ts` — resolver matrix.
- `web/tests/admin/opportunityOverviewLocationLabel.test.ts` — overview integration.

### Files changed

| File | Change |
|------|--------|
| `web/lib/opportunities/resolveOpportunityDisplayLocation.ts` | **New** — shared resolver |
| `web/lib/admin/opportunityOverviewLabels.ts` | `location_id` case uses resolver |
| `web/components/admin/AdminEntityDrawer.tsx` | Header label + pass kind to inquiry section |
| `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx` | Multi-location hint |
| `web/tests/opportunities/resolveOpportunityDisplayLocation.test.ts` | **New** |
| `web/tests/admin/opportunityOverviewLocationLabel.test.ts` | **New** |

### Intentionally deferred

- **Queue row location display** — preview rows only carry `_location_label` from `opportunities.location_id` (`QueueService.ts`); no `_inquiry_children` or per-child `location_id` on queue VMs. Enriching queue view models is a follow-up card (no new network calls in Card 2).
- **Location badges** in header when multiple — label string only.
- **Placement backfill** behavior (`placement_candidates.site_id` fallback) — unchanged.
- Schema, delete, permissions, new tables.

### Validation results

| Check | Result |
|-------|--------|
| `npm run test -- tests/opportunities/resolveOpportunityDisplayLocation.test.ts tests/admin/opportunityOverviewLocationLabel.test.ts` | Pass |
| `npx tsc --noEmit` | Pre-existing repo failures; no errors in Card 2 files |
| `npm run lint` | Pre-existing repo-wide issues |

### Known risks

| Risk | Notes |
|------|-------|
| Drawer shell loading still shows queue-seed opportunity location before full hydrate | Acceptable gate-only fallback; full record replaces with resolver output |
| Overview edit mode for `location_id` still edits opportunity FK | Canonical child placement remains on OCM; opportunity field is convenience |
| Queue operators may still see opportunity-level site in meta lines | Documented; needs queue enrichment card |

---

## When this doc must be updated

After any convergence sprint card ships behavior changes to location model, OCM fields, person drawer layouts, relationship APIs, lifecycle/archive semantics, household terminology, or enrollment navigation.
