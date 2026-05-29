# Record, Person & Location Convergence Sprint — Card 0 Audit

**Date:** 2026-05-29  
**Status:** Card 0 audit complete · **Card 1 shipped (2026-05-29)** · **Card 2 shipped (2026-05-29)** · **Card 3 audit complete (2026-05-29)** — person drawer convergence design  
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

## Suggested sprint card sequencing

| Card | Scope | Status |
|------|-------|--------|
| 1 | Docs + inquiry UI labels/order + location drawer target spec | ✅ Shipped |
| 1b | Location hierarchy API (`parent_location_id`) + settings UX | Deferred |
| 2 | Child location authority display resolver | ✅ Shipped |
| 3 | Person drawer convergence audit + target architecture | ✅ Audit complete |
| 4 | Person drawer layout control plane (see Card 3 § Recommended Card 4) | Planned |
| 5 | Relationship editor + profile resolver + enrollment mirror | Planned |
| 6 | Person archive/deactivate governance | Planned |
| 7 | Household → Customer/Family string pass | Backlog |
| 8 | Queue child-location enrichment | Backlog |
| 9 | Add child modal persistence + placement fields | Backlog |

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

## Card 3 — Person Drawer Convergence Audit & Target Architecture (audit only, 2026-05-29)

**Status:** Audit + design only — **no drawer implementation, no migrations, no schema changes.**

**Doctrine:** Opportunity drawer is the reference experience. Person drawer should eventually share the same shell, loading behavior, navigation model, and configuration philosophy — with **person-type-aware section composition**, not parallel hardcoded child/parent variants.

---

### Part A — Full Person Drawer Audit

#### A.1 Entry points (every `openDrawer({ type: "persons" })` path)

**Stack behavior** (`AdminDrawerContext.tsx`):
- **`openViewPersonFromOpportunity`** — sets `parent: { type: "opportunities", id }`; opportunity snapshot restore on back. **Only path with explicit parent stack.**
- **All other opens** — push current drawer onto stack; no opportunity restore semantics.

| Category | Source context | File(s) | Parent stack |
|----------|----------------|---------|--------------|
| **Opportunity (canonical)** | Inquiry child, primary/additional contact | `openViewPersonFromOpportunity.ts`; `EditablePersonContactCard.tsx`, `PrimaryPersonContactCard.tsx`, `FamilyContactsPanel.tsx`; `AdminEntityDrawer.tsx` (inquiry children, inquiry summary) | **Yes** |
| **Opportunity (direct)** | Household people, Related tab person link, legacy overview link | `OpportunityHouseholdPeoplePanel.tsx`; `AdminEntityDrawer.tsx` (~10483, ~13939) | No |
| **People directory** | `/admin/people` list + create | `PeopleClient.tsx` | No |
| **Customer / contact / member** | Overview links, legacy banners | `AdminEntityDrawer.tsx` (customer, contact, member hosts) | No |
| **Location / vendor** | `person_locations`, vendor people | `AdminEntityDrawer.tsx`, `RelatedRecordsTabs.tsx` | No |
| **Job / schedule** | `primary_person_id` link fields | `EntityDrawerOverview` via `entityPresentation` overrides | No |
| **System admin** | DB relationships, documents list | `DbRelationshipsClient.tsx`, `DocumentsClient.tsx` | No |
| **Forms intake** | Submission case file connected records | `SubmissionIntakeCaseFileContent.tsx`, `FormSubmissionDetailClient.tsx` | No |
| **Dev** | Direct open helper | `personDrawerDevDirectOpen.ts` | No |

**Does NOT open person drawer:**
- Communications person search (`QuickMessageModal`, `person-search` API) — recipient picker only
- CRM entity search picker — selection only
- Task Assist entity search — opportunities, not persons
- Workspace queues — opportunities/schedules
- `ContextualRecordOpenListener` — opportunities only

**Production open sites:** ~28 (excluding tests). Prefetch: `prefetchPersonDrawerSnapshot.ts`, `prefetchLinkedPersonsFromOpportunityRecord.ts` (idle warm from opportunity).

#### A.2 Current drawer architecture

| Layer | Implementation | Configurable? |
|-------|----------------|---------------|
| **Shell** | `AdminEntityDrawer.tsx` — same host as all entities | Shared |
| **Overview (shipped)** | `PersonDrawerCompactOverview.tsx` — hardcoded Contact + Employee + Relationships slot | **Hardcoded** |
| **Overview (bypassed)** | `EntityDrawerOverview.tsx` + `entityPresentation.persons` | Defined but **not rendered** for existing persons |
| **Related tab** | Hardcoded sections in `AdminEntityDrawer.tsx` (~10624+) | Section labels hardcoded; role labels from org settings |
| **Create** | Inline form in `AdminEntityDrawer.tsx` (first/last/email/phone) | Hardcoded |
| **Tabs** | `entityPresentation.ts` — `overview`, `related`, `documents` | Presentation config (used for tab list) |
| **Table columns** | `entityPresentation.ts` persons table | Partially configurable |

**Data loaders:**

| Stage | API / module |
|-------|----------------|
| Primary GET | `GET /api/admin/entity/persons/:id` — native row + `_customer_persons`, `_person_relationships`, `_linked_locations`, `_linked_opportunities`, compatibility rows, `_field_definitions` |
| Related tab (lazy) | `GET /api/admin/related/person/:id` |
| PATCH | `PATCH /api/admin/persons/:id` — native keys + `field_values` custom keys |
| Create | `POST /api/admin/persons` |
| Prefetch / cache | `prefetchPersonDrawerSnapshot.ts`, `drawerEntitySnapshotCache.ts` (120s TTL) |

**Loading gates (person-specific):**
- `usePersonCompactOverview` → body branch when data ready
- `personDrawerShowLoadingShell` — cold cache + loading
- Warm snapshot skips loading shell (`adminV2PerformancePass2.test.ts`)

**Config sources:**

| Source | Person support | Runtime effect today |
|--------|------------------|----------------------|
| `entityPresentation.ts` | Yes (persons) | Table + tab list; drawer sections **bypassed** |
| `field_definitions` (`entity_type=person`) | Yes — Settings → Person Fields | Attached on GET; PATCH works; **not rendered** in compact overview |
| `field_placements_v1` / drawer policy | Opportunity/job only | Person GET may attach policy; UI ignores |
| `record_drawer_layouts` | **No** — not in `layoutsSettingsEntities.ts` | Not used |
| `record_layouts` global templates | No person template | Not used |
| `status_definitions` | Yes | `_status_display` on GET; header badge when set |

**Critical bug (audit finding):** `overviewCustomContent` early-returns `{}` for existing persons (`AdminEntityDrawer.tsx` ~7808), so the **Relationships slot in compact overview never renders**. Dead code below (~8070–8173) would populate customers/locations/opportunities. **Related tab is the live relationship surface.**

#### A.3 Person types — how the system actually distinguishes roles

**There is no `person_type` column and no person-drawer layout fork.** Role is inferred from **join tables and context**, not from a single enum.

| Operator concept | Primary storage | How inferred | Person drawer reflects? |
|------------------|-----------------|--------------|-------------------------|
| **Child** | `customer_members.relationship = 'child'`; optional `customer_persons.role_type = 'child'` | Member roster + OCM; `person_id` bridge optional | Related tab → legacy member link only; **no child profile/enrollment on person** |
| **Parent** | `customer_persons.role_type = 'parent'`; `person_relationships.relationship_type = 'parent'` | Customer + directed edge | Related tab read-only |
| **Guardian** | Same with `guardian` | Same | Same |
| **Emergency contact** | `customer_persons`, `person_relationships`, `opportunity_persons` | Opportunity panels + customer links | Same; opportunity `FamilyContactsPanel` is edit surface |
| **Employee** | `persons.is_employee`, `employee_id`, `employee_source` | Native column | **Card 2** — editable in compact overview |
| **Unknown / generic** | Default when no role edges | Any person without resolved role context | Same compact UI as parent |

**Child enrollment fields** (Location, Program, Room, Status) live on **`opportunity_customer_members`**, edited only in **`OpportunityInquiryChildrenSection`** — not on person drawer.

**Vocabulary tables (org-configurable labels):**
- `customer_person_role_types`
- `person_relationship_type_settings`
- `customer_member_relationship_types`

---

### Part B — Relationship Audit

#### B.1 Relationship graph (as implemented)

```
persons (canonical identity)
  ├── customer_persons → customers (role_type: parent, guardian, child, emergency_contact, …)
  ├── person_relationships → persons (directed: adult → child)
  ├── person_locations → locations
  ├── customer_members (via person_id bridge) — child roster
  ├── opportunity_persons — NOT loaded on person GET (opportunity-scoped only)
  └── opportunities.primary_person_id — reverse lookup in related API only
```

| Edge | Table | Admin CRUD API | Person drawer | Opportunity drawer |
|------|-------|----------------|---------------|-------------------|
| Parent → child | `person_relationships` | **None** | Related tab read | — |
| Guardian → child | `person_relationships` | **None** | Related tab read | — |
| Emergency → child | `person_relationships` + `customer_persons` | **None** | Related tab read | `AddFamilyMemberModal`, `add_family_member` action |
| Account role | `customer_persons` | `add_related_person` action only | Related tab read | `FamilyContactsPanel`, `OpportunityHouseholdPeoplePanel` |
| Child roster | `customer_members` | `PATCH` / `DELETE` customer-members | Related legacy link | `OpportunityInquiryChildrenSection` |
| Child enrollment | `opportunity_customer_members` | `PATCH` OCM | **Not on person** | Inquiry children grid |
| Sibling | Implicit (shared `customer_id`) | Derived in `householdPlacementFacts.ts` | **Not shown** | Multiple children on opportunity |
| Employee household | `persons.is_employee` via `customer_persons` join | `PATCH` persons | Employee card | — |

#### B.2 Gaps

1. **No relationship editor** on person drawer — `DbRelationshipsClient` copy references adding from person drawer; **not implemented**.
2. **`opportunity_persons` invisible** when viewing a person — no reverse lookup on person GET/related.
3. **Overview Relationships card dead** — compact overview slot never populated.
4. **Three parallel child representations** — `customer_members`, `customer_persons` (child role), `person_relationships` — intake/booking may write different layers inconsistently.
5. **Sibling has no first-class edge** — placement facts only.

---

### Part C — Target Architecture (design only)

#### C.1 Shared principles (align with opportunity drawer)

| Principle | Opportunity today | Person target |
|-----------|-------------------|---------------|
| Drawer shell | `AdminEntityDrawer` + record chrome + staged reveal | **Same shell** — retire `PersonDrawerCompactOverview` fork |
| Layout authority | `record_drawer_layouts` + `entityPresentation` fallback + injected system sections | **Add `person` to layout control plane** |
| Field behavior | `field_definitions` + `field_placements_v1` on opportunity | **Same pipeline** for person native + custom fields |
| Loading | Bootstrap / snapshot / `drawer_visible` patterns | **Reuse** person prefetch + extend to layout-aware reveal |
| Navigation | Parent stack from queue/workspace | **Generalize** `openViewPersonFromOpportunity` pattern for customer parent where needed |
| Type-specific UI | Inquiry children injected section (not a separate drawer) | **Section visibility by resolved person profile**, not separate drawer routes |

#### C.2 Person profile resolution (design)

Introduce a **read-only resolver** (future card) — `resolvePersonDrawerProfile(personRecord, context?)`:

| Profile | Resolution signals (priority order) |
|---------|-----------------------------------|
| `child` | `customer_members.relationship = 'child'` with `person_id` match; or `customer_persons.role_type = 'child'` |
| `parent` | `customer_persons.role_type` in (`parent`, `primary_contact`) or `person_relationships` as `from_person` with type `parent` |
| `guardian` | `guardian` role types |
| `emergency_contact` | `emergency_contact` on customer_persons or person_relationships |
| `employee` | `persons.is_employee === true` (may combine with parent) |
| `generic` | Fallback |

**Not a stored enum** — computed per open for section composition. Supports multi-hat persons (e.g. employee + parent) via **section union**, not exclusive layout swap.

#### C.3 Shared header (all person types)

| Field | Exists today | Target |
|-------|--------------|--------|
| **Name** | `first_name`, `last_name`, `_person_name`; header shows name without prefix | Keep; add `preferred_name` when set |
| **Person type badge** | **Missing** | Show primary profile label from resolver (e.g. "Parent", "Child", "Employee") — config-driven labels from role type settings |
| **Primary contact** | email/phone on `persons`; compact overview read-only | Editable via field policy; show best contact method in header |
| **Status** | `status_key`, `_status_display`; header badge when set | Keep; align with opportunity status chrome |
| **Profile photo** | **Missing** — no `avatar_url` on `persons` | Future — header slot reserved; requires schema/media card |

#### C.4 Child layout (recommended sections)

| Section | Fields / content | Exists today | Gap |
|---------|------------------|--------------|-----|
| **Profile** | Name, DOB, age, preferred name | `persons.date_of_birth`, `preferred_name`; age computable; name in header only | Compact overview hides profile fields; **no gender column** in schema |
| **Enrollment** | Location, Program, Room, Status | On **OCM** per active inquiry; not on person | **Read-only mirror** from active `opportunity_customer_members` rows linked via `customer_members.person_id` — deep-link to opportunity; **no person-native enrollment SoT** |
| **Relationships** | Parents, guardians, emergency contacts, siblings | `_person_relationships`, `_customer_persons` on GET; overview dead | Enable overview section; group by relationship type; siblings via shared customer |
| **Documents** | Person-linked docs | Related tab documents (lazy) | Future dedicated section on layout control plane |
| **Activity** | Comms / events | **Missing** on person drawer | Future — activity tab pattern from opportunity |

**Schema note:** Gender is **not implemented** (`persons` has no column; no `gender` in web/). Would require field_definition custom field or future native column.

#### C.5 Parent layout (recommended sections)

| Section | Exists today | Gap |
|---------|--------------|-----|
| **Contact** | Read-only email/phone in compact | Make policy-driven editable |
| **Employment** | `PersonEmployeePlacementSection` | Keep; move under layout section `employee_placement` |
| **Relationships → Children** | Related tab person edges + customer members | Structured children list with links to child persons/members |
| **Activity** | Missing | Future |

#### C.6 Emergency contact layout (recommended sections)

| Section | Exists today | Gap |
|---------|--------------|-----|
| **Contact** | Read-only | Editable |
| **Relationship type** | On `customer_persons` / `opportunity_persons` | Show configurable label; edit via relationship API (Card 5) |
| **Linked children** | `_person_relationships` to children | Grouped list with links |

---

### Part D — Config Strategy

#### D.1 Why Settings → Person Fields does not drive the drawer today

| Reason | Detail |
|--------|--------|
| **Compact overview fork** | `usePersonCompactOverview` forces hardcoded `PersonDrawerCompactOverview`; `EntityDrawerOverview` never runs |
| **No layout entity** | `layoutsSettingsEntities.ts` excludes `person` — no `record_drawer_layouts` row |
| **No section composition** | Opportunity uses `overview_section_order` + injected sections (`inquiry_children`); person has no equivalent |
| **PATCH without policy UI** | Custom fields PATCH works but compact UI does not render `_field_definitions` |
| **Early return in custom content** | `overviewCustomContent` returns `{}` for persons — blocks even hand-built relationship slots |

#### D.2 Recommended convergence path (no special-case system)

Person should use the **same four-plane model** as opportunity (`configuration-system.md`):

| Plane | Person application |
|-------|-------------------|
| **Fields** | Continue `entity_type=person` in Settings → Fields; ensure native keys (`date_of_birth`, `preferred_name`, employee fields) in manifest |
| **Field grouping** | `field_section_definitions` for person — profile, contact, employment |
| **Layouts** | Add `person` to `LAYOUT_SETTINGS_ENTITY_ORDER`; seed global `record_layouts` template with **profile-aware default sections** (not separate apps) |
| **Actions** | Register person actions (link to customer, add relationship) on `record_section` placements — same registry as opportunity |

**Section visibility by profile:** Layout config supports `section_visibility_rules` keyed off **resolved person profile** (design extension to layout schema — evaluate reuse of opportunity `inquiry_drawer_mode` pattern vs generic `visible_when_profile` array).

**Enrollment on child person:** **Injected read-only system section** `enrollment_inquiries` (mirror `inquiry_children` on opportunity) — loads OCM rows for `customer_members` linked to `person_id`; edit remains on opportunity.

**Do not create** a parallel `person_drawer_compact` or child-only drawer route.

---

### Part E — Delete Governance (current state only)

| Capability | Person today |
|------------|--------------|
| `archived_at` / `archived_by` | Columns exist; **not writable** via PATCH |
| Archive / unarchive API | **Missing** (contacts have archive routes) |
| `is_active` on persons | **Column does not exist** |
| Deactivate | `status_key` PATCH supported; **no UI** in compact drawer |
| Hard delete API | **Missing** |
| Drawer Delete button | **Hidden** — `deleteConfig.ts` excludes persons |
| `deletionEligibility` | **Not registered** for persons |

No person drawer actions support archive, deactivate, or delete today.

---

### Problems (summary)

1. **Parallel drawer implementation** — compact overview bypasses config pipeline used by opportunity.
2. **Settings investment wasted** — Person Fields configured but not rendered.
3. **Relationships overview broken** — dead code path; operators must use Related tab.
4. **No person-type presentation** — child enrollment invisible on person record.
5. **No relationship CRUD** — all meaningful edits on opportunity/customer surfaces.
6. **Inconsistent navigation** — only opportunity inquiry uses parent stack restore.
7. **No lifecycle governance** — archive columns exist without product path.

---

### Target architecture (summary diagram)

```text
AdminEntityDrawer (shared shell)
  ├── record_drawer_layouts (person, surface=drawer)
  ├── resolvePersonDrawerProfile(record) → child | parent | guardian | emergency | employee | generic
  ├── EntityDrawerOverview (retire PersonDrawerCompactOverview)
  │     ├── header chrome (name, profile badge, status, contact)
  │     ├── sections from layout (field_definitions + native manifest)
  │     ├── injected: enrollment_inquiries (child profile only, read-only OCM mirror)
  │     └── injected: relationships_grouped (all profiles)
  ├── field_placements_v1 (person — phase after layout)
  └── related tab (documents, full relationship graph — until sections absorb)
```

---

### Recommended implementation sequence

#### Recommended Card 4 — Person drawer layout control plane (implementation)

**Scope:**
1. Add `person` to `layoutsSettingsEntities.ts` and effective-preview API allowlist.
2. Seed global `record_layouts` default template for person (profile, contact, employment, relationships).
3. Switch `AdminEntityDrawer` persons branch from `PersonDrawerCompactOverview` to `EntityDrawerOverview` + effective layout resolution.
4. Fix `overviewCustomContent` early-return — enable relationships section or migrate to layout-injected section.
5. Render `_field_definitions` in overview per layout (parity with opportunity phase 1).
6. Wire `status_key` + name fields through existing field policy where configured.

**Out of scope for Card 4:** profile resolver, enrollment mirror section, relationship editor API, archive.

#### Recommended Card 5 — Relationship improvements (implementation)

**Scope:**
1. `resolvePersonDrawerProfile` helper + header profile badge.
2. Person relationship editor API — CRUD for `person_relationships` and `customer_persons` behind `requireAdminOrOps()` + audit events.
3. Reverse lookup `opportunity_persons` on person GET/related.
4. Layout injected sections: `relationships_grouped`, read-only `enrollment_inquiries` for child profile.
5. Generalize parent stack navigation for customer → person opens (optional).

**Out of scope:** sibling edge type, full graph visualization.

#### Recommended Card 6 — Delete / archive governance (implementation)

**Scope:**
1. Register persons in `deletionEligibility.ts` — recommend archive, block hard delete when edges exist.
2. `POST /api/admin/persons/:id/archive` and `/unarchive` (mirror contacts pattern).
3. Drawer header actions — Archive / Restore; status-based deactivate UX.
4. **Do not** expose hard delete for persons in drawer without eligibility gate.

**Dependency:** Cards 4–5 should land first so lifecycle actions attach to converged drawer chrome.

---

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Retiring compact overview regresses perf | Medium | Keep snapshot prefetch; staged reveal like opportunity |
| Profile resolver wrong for multi-hat persons | Medium | Section union; show multiple badges |
| Enrollment mirror stale vs OCM | Medium | Read-only + deep-link; never PATCH from person |
| Layout migration breaks existing orgs | Low | Global template fallback; no org overrides until stable |
| Relationship API without RLS audit | High | Service-role + app guards; audit events; follow contacts archive pattern |

---

### Open questions

1. **Should child enrollment ever be editable on person drawer?** Audit recommends **no** — OCM remains SoT; person shows mirror + link to opportunity.
2. **Single vs multi profile badge** when person is employee + parent?
3. **When to add `person` to `field_placements_v1`?** After layout Card 4 or in same card?
4. **Avatar / profile photo** — defer to media infrastructure sprint?
5. **Retire `PersonFieldsClient` legacy route** vs migrate fully to Settings → Fields hub (`entity=person`)?
6. **Sibling relationship type** — add to `person_relationship_type_settings` or keep implicit?

---

## When this doc must be updated

After any convergence sprint card ships behavior changes to location model, OCM fields, person drawer layouts, relationship APIs, lifecycle/archive semantics, household terminology, or enrollment navigation.
