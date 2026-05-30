# Person Relationship & Child Lifecycle Foundation

**Date:** 2026-05-29  
**Status:** Implemented (parent/child relationships + child lifecycle surface polish)  
**Parent doc:** [`child_profile_person_drawer_doctrine.md`](./child_profile_person_drawer_doctrine.md)

---

## Doctrine

**Person** is the canonical identity entity. Child, parent, guardian, emergency contact, employee, volunteer, and authorized pickup are **roles and relationships** — not separate identity systems or drawer architectures.

This pass solves **parent ↔ child** presentation for CRM demo quality while preserving extension points for future roles without another refactor.

**Pass 4 (2026-05-29):** Child drawer lifecycle surface — profile summary, lifecycle roadmap pills, section ordering, and configurability documentation. No new entity systems or future modules.

---

## Lifecycle slot configurability

| Slot | `section_key` (future layout) | Today | Notes |
|------|------------------------------|-------|-------|
| **Enrollment** | `enrollment_activity` | **Data-backed** | OCM mirror + opportunity-person rows; deduped in `buildPersonEnrollmentActivityEntries`; full detail in overview section when data exists |
| **Family / relationships** | `relationships` | **Data-backed** | Household + `person_relationships`; title varies by emphasis (Family / Children) |
| **Lifecycle roadmap** | _(above-fold, not a section)_ | **Code-driven presentation** | `PersonDrawerChildLifecycleSummary` — compact pills for orientation; not separate empty cards |
| **Schedule** | `schedule_summary` | **Future layout** | Roadmap pill only (`phase: future`) |
| **Attendance** | `attendance_summary` | **Future layout** | Roadmap pill only |
| **Billing** | `billing_summary` | **Future layout** | Roadmap pill only |
| **Documents** | `document_history` | **Future layout** | Roadmap pill only |
| **Communications** | `communications` | **Future layout** | Roadmap pill only |
| **History** | `history` | **Future layout** | Roadmap pill only |

**Gating:** `personDrawerShowsChildLifecycleSurface(profile)` — true when `resolvePersonDrawerPresentationEmphasis(profile) === "child_lifecycle"`. Parent/guardian emphasis never renders child lifecycle summary or roadmap.

**Future target:** `record_drawer_layouts.config_json` sections with `visible_when.roles includes child` and `section_key` matching the layout keys above. Code-driven slots are documented in `CHILD_LIFECYCLE_SECTION_SLOTS` and `personDrawerChildLifecycleSlots.ts` until layout runtime ships.

---

## Child drawer (pass 4)

Above overview (not duplicated in header):

1. **Context panel** — max 4 quick links (parents, guardians, siblings; one enrollment link when child emphasis)
2. **Child profile summary** — household, guardians hint, primary enrollment link, lifecycle roadmap pills
3. **Overview sections** (ordered for child): Family → Enrollment activity → profile/medical fields

Header retains name, age/DOB, badges — summary does not repeat those fields.

---

## Current relationship sources (audit)

| Source | Table / join | What it represents | Drawer use today |
|--------|--------------|-------------------|------------------|
| **Person ↔ person edges** | `person_relationships` (`from_person_id`, `to_person_id`, `relationship_type`, `is_primary`, `metadata`) | Canonical directed person links | Primary input to `buildPersonDrawerRelationshipGroups` |
| **Household adult roles** | `customer_persons` (`customer_id`, `person_id`, `role_type`, `is_primary`) | Adult ↔ family account (parent, guardian, …) | Profile resolver + **projected** `_household_adult_links` for child-facing family |
| **Household child members** | `customer_members` (`customer_id`, `person_id?`, `relationship=child`) | Child row on family account; identity on `persons` when linked | Profile resolver + **projected** `_household_child_links` for parent-facing children |
| **Sibling projection** | Same-household `customer_members` (relationship=child, excluding self) | Co-enrolled siblings | `_sibling_links` via `attachPersonDrawerVisibility` |
| **Opportunity roles** | `opportunity_persons`, `opportunities.primary_person_id` | Case-scoped contact roles | Profile resolver badges; `enrollment_activity` section |
| **Inquiry child rows** | `opportunity_customer_members` → `customer_members.person_id` | Pipeline child identity | Enrollment mirror; identity sync to `persons` when linked |
| **Legacy member contacts** | `customer_member_contacts` → `contacts` | Pre-person compatibility | **Not** drawer relationship truth — avoid for new work |
| **Legacy contacts** | `contacts.person_id` | Compatibility infrastructure | `_compatibility_contacts` on GET only |
| **Employee placement** | `persons.is_employee`, `employee_id`, `employee_source` | Staff flag (not full HR module) | `PersonEmployeePlacementSection` when employee role detected |

### What is canonical today?

| Concern | Canonical store |
|---------|-----------------|
| Person identity | `persons` |
| Person ↔ person relationship | `person_relationships` (when populated) |
| Adult ↔ household | `customer_persons.role_type` |
| Child ↔ household | `customer_members` (+ `persons` when `person_id` set) |
| Child identity when linked | `persons` (see `person_location_ux_reset.md`) |
| Communication opt-out | `field_values` via `communication_opt_out` field_definition |
| Opportunity-scoped role | `opportunity_persons` (preview / case context, not lifecycle truth) |

### What is duplicated?

| Duplication | Mitigation (this pass) |
|-------------|------------------------|
| `person_relationships` vs household joins for same parent/child | Merge + dedupe in `buildPersonDrawerRelationshipGroups` |
| `_sibling_links` vs `_household_child_links` | Siblings exclude self; children include all household child members for parent emphasis |
| Context panel vs body relationship section | Context = max 4 **quick links**; body = full premium section |
| Legacy `enrollment` + `enrollment_opportunities` sections | Removed — single `enrollment_activity` (pass 2) |

### Temporary compatibility (do not treat as lifecycle truth)

- `contacts` / `customer_member_contacts` — legacy reachability paths
- Unlinked `customer_members` without `person_id` — inquiry-only identity until linked
- `customer_members` display fields when `person_id` is set — read from `persons` instead

---

## Drawer presentation (implemented)

### Data path

```
GET /api/admin/entity/persons/{id}
  → _person_relationships, _customer_persons, _compatibility_members
  → attachPersonDrawerVisibility
      → _household_context, _household_adult_links, _household_child_links, _sibling_links, enrollment mirrors
  → personDrawerRelationshipInputFromRecord
  → buildPersonDrawerRelationshipGroups (merge + dedupe)
  → resolvePersonDrawerRelationshipSectionModel (profile emphasis)
  → PersonDrawerRelationshipsOverview | PersonDrawerContextPanel
```

### Profile-derived sections (not person types)

| Emphasis | Section title | Shows |
|----------|---------------|-------|
| `child_lifecycle` | **Family** | Parents, guardians, emergency, siblings |
| `guardian_communication` | **Children** | Linked children (household + person edges) |
| Mixed roles | **Family** | All applicable groups in one section |
| Other | **Relationships** | Generic fallback |

Modules (isolated for future layout config):

- `personDrawerRelationshipInput.ts` — record → builder input
- `personDrawerRelationshipSection.ts` — section model + titles
- `buildPersonDrawerRelationshipGroups.ts` — merge logic
- `attachPersonDrawerVisibility.ts` — household projections

### Parent drawer

- **Children** premium section from household child members + `person_relationships`
- **Communication opt-out** via configurable `communication_opt_out` field (consent section)
- No empty relationship cards

### Child drawer

- **Family** premium section from household adults + person edges
- **Child profile summary** + lifecycle roadmap (pass 4) — role-gated, not a person type
- **Enrollment activity** section when data exists (deduped)
- Siblings in Family section when present

### Context panel

- **Quick links** only (max 4) — child emphasis may include one enrollment link; full enrollment in body section only

---

## Target relationship model (future — not built this pass)

Existing `person_relationships` is compatible with a richer model:

| Target field | Exists today? | Notes |
|--------------|---------------|-------|
| `from_person_id` | Yes | |
| `to_person_id` | Yes | |
| `relationship_type` / `role_key` | Yes (`relationship_type`) | Org labels via `person_relationship_type_settings` |
| `is_primary` | Yes | |
| `metadata` | Yes | Flags/permissions later |
| `context_entity_type` / `context_entity_id` | No | Future: scope edge to opportunity/enrollment |
| `effective dates` / `status` | Partial (`status` column exists) | Not used in drawer yet |

Future role examples (same table + type registry, not new entities):

- `parent` / `guardian` / `emergency_contact` / `authorized_pickup` → person edges
- `employee_of` / `volunteer_for` → person edges or location links with context metadata

**Do not build yet:** emergency contact module, volunteer module, staff HR module, authorized pickup workflow.

---

## Child lifecycle direction (structure)

Reserved section slots (`CHILD_LIFECYCLE_SECTION_SLOTS`):

Opportunity → Waitlist → Tours → **Enrollment activity** → Schedule → Attendance → Billing → Documents → Communications → History

| Renders today | Mechanism |
|---------------|-----------|
| Enrollment activity (body section) | Real data when mirror/opportunity rows exist |
| Lifecycle roadmap pills | Code-driven summary strip; future slots show dashed “Later” pills — **not** empty overview cards |
| Schedule … History | Layout placeholders only (`layoutSectionKey` documented) |

---

## What not to build yet

- Full emergency contact CRUD module
- Volunteer / authorized pickup workflows
- Staff assignment / scheduling module
- New `person_types` column or enum
- Parallel drawer system
- Profile-aware `record_drawer_layouts` runtime (documented gap only)

---

## Files changed (this pass)

| File | Change |
|------|--------|
| `web/lib/admin/person/personDrawerChildLifecycleSlots.ts` | **New** — lifecycle surface gating, slot states, section order, household/enrollment hints |
| `web/components/admin/entity/PersonDrawerChildLifecycleSummary.tsx` | **New** — child profile summary + lifecycle roadmap |
| `web/components/admin/entity/PersonDrawerContextPanel.tsx` | Child quick links + optional enrollment link; exported `buildPersonDrawerQuickLinks` |
| `web/lib/admin/person/attachPersonDrawerVisibility.ts` | Project `_household_context` (customer names) |
| `web/lib/admin/person/personDrawerVisibilityTypes.ts` | `PersonHouseholdContextRow` |
| `web/lib/admin/person/personDrawerPresentationEmphasis.ts` | Document slot rendering status |
| `web/components/admin/AdminEntityDrawer.tsx` | Wire summary; child section ordering |
| `web/tests/admin/person/personDrawerChildLifecycleSurface.test.ts` | **New** |
| `docs/sprints/05_2026/person_relationship_child_lifecycle_foundation.md` | Pass 4 lifecycle configurability |

### Prior pass files

| File | Change |
|------|--------|
| `web/lib/admin/person/attachPersonDrawerVisibility.ts` | Project `_household_adult_links`, `_household_child_links` |
| `web/lib/admin/person/buildPersonDrawerRelationshipGroups.ts` | Merge household links + dedupe |
| `web/lib/admin/person/personDrawerRelationshipInput.ts` | **New** — record → builder input |
| `web/lib/admin/person/personDrawerRelationshipSection.ts` | **New** — profile section model |
| `web/lib/admin/person/personDrawerRelationshipVisibility.ts` | Use full record + section model |
| `web/lib/admin/person/personDrawerVisibilityTypes.ts` | Household link row types |
| `web/components/admin/entity/PersonDrawerVisibilitySections.tsx` | Profile-aware Family/Children section |
| `web/components/admin/entity/PersonDrawerContextPanel.tsx` | Quick links only |
| `web/components/admin/AdminEntityDrawer.tsx` | Dynamic section title + visibility |
| `web/tests/admin/person/personRelationshipChildLifecycle.test.ts` | **New** |
| `docs/sprints/05_2026/person_relationship_child_lifecycle_foundation.md` | This document |

---

## Validation

```bash
cd web && npm run test -- tests/admin/person/ tests/admin/personDrawerVisibility.test.ts
```

---

## Related

- [`person_location_ux_reset.md`](./person_location_ux_reset.md) — inquiry child identity sync
- [`docs/system/entity-model.md`](../../system/entity-model.md) — persons, customer_persons, customer_members
