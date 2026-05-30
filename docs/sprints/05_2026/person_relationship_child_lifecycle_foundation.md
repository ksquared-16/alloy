# Person Relationship & Child Lifecycle Foundation

**Date:** 2026-05-29  
**Status:** Implemented (parent/child relationship presentation foundation)  
**Parent doc:** [`child_profile_person_drawer_doctrine.md`](./child_profile_person_drawer_doctrine.md)

---

## Doctrine

**Person** is the canonical identity entity. Child, parent, guardian, emergency contact, employee, volunteer, and authorized pickup are **roles and relationships** — not separate identity systems or drawer architectures.

This pass solves **parent ↔ child** presentation for CRM demo quality while preserving extension points for future roles without another refactor.

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
      → _household_adult_links, _household_child_links, _sibling_links, enrollment mirrors
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
- **Enrollment activity** section (lifecycle direction preserved)
- Siblings in Family section when present

### Context panel

- **Quick links** only (max 4) — no enrollment duplication, no full relationship repeat

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

Reserved section slots (`CHILD_LIFECYCLE_SECTION_SLOTS`) — only `enrollment_activity` + `relationships`/`Family` render today:

Opportunity → Waitlist → Tours → **Enrollment activity** → Schedule → Attendance → Billing → Documents → Communications → History

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
