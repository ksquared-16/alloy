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
| **Lifecycle roadmap** | `child_lifecycle_roadmap` | **Code-driven presentation** | Bottom overview section; compact pills; collapsed by default |
| **Schedule** | `schedule_summary` | **Future layout** | Roadmap pill only (`phase: future`) |
| **Attendance** | `attendance_summary` | **Future layout** | Roadmap pill only |
| **Billing** | `billing_summary` | **Future layout** | Roadmap pill only |
| **Documents** | `document_history` | **Future layout** | Roadmap pill only |
| **Communications** | `communications` | **Future layout** | Roadmap pill only |
| **History** | `history` | **Future layout** | Roadmap pill only |

**Gating:** `personDrawerShowsChildLifecycleSurface(profile)` — true when `resolvePersonDrawerPresentationEmphasis(profile) === "child_lifecycle"`. Parent/guardian emphasis never renders child lifecycle summary or roadmap.

**Future target:** `record_drawer_layouts.config_json` sections with `visible_when.roles includes child` and `section_key` matching the layout keys above. Code-driven slots are documented in `CHILD_LIFECYCLE_SECTION_SLOTS` and `personDrawerChildLifecycleSlots.ts` until layout runtime ships.

---

## Child drawer (final UX pass — complete)

### Information ownership (single primary home)

| Information | Primary home |
|-------------|--------------|
| Child identity (name, age, gender) | **Child summary** + header DOB |
| Primary guardian hint | **Child summary** (text only) |
| All guardians, parents, siblings | **Family** section (clickable links) |
| Lead, status, program, location | **Enrollment** section only |
| Core editable fields | **Basic information** (config-driven) |
| Lifecycle orientation | **Lifecycle** stepper (bottom, collapsed) |

Quick links are **hidden** for child emphasis — they duplicated Family.

### Visual hierarchy (green rail)

| Surface | Pine left rail |
|---------|----------------|
| Child summary | Yes (single above-fold accent) |
| Enrollment section content | Yes (`leadSummaryShell` on enrollment cards) |
| Family, Basic, Medical, Lifecycle | No (default section chrome) |

Parent and non-child person drawers keep existing premium overview styling.

### Lifecycle roadmap UX decision

| Option | Decision |
|--------|----------|
| **A — Compact overview stepper** | **Implemented** — horizontal stepper with Lead → Tour → Enrollment → …; informational copy; collapsed section |
| **B — Dedicated Lifecycle tab** | **Deferred** — adopt when schedule/attendance/billing modules ship and rollups exist |

`CHILD_LIFECYCLE_ROADMAP_UX = compact_overview_stepper` in `personDrawerChildLifecycleSlots.ts`.

### Section order

1. Child summary (above overview)
2. Basic information
3. Family
4. Enrollment
5. Medical / consent
6. Lifecycle (bottom)

---

## Child drawer (pass 4 + IA pass)

Above overview (not duplicated in header):

1. **Context panel** — max 4 relationship quick links only (guardians, siblings); **no enrollment link** (Enrollment section is primary home)
2. **Child summary** — child name, age, household, primary guardian, lead status + program hint (no enrollment deep link)
3. **Overview sections** (ordered): Basic information → Family → Enrollment → Medical → … → Lifecycle roadmap (bottom, collapsed by default)

**IA pass (2026-05-29):** Child-first summary, unified Guardians block in Family (parents + guardians with role labels), siblings in Family, CRM lead terminology in person-drawer display labels only, lifecycle roadmap moved to bottom section (Option B).

### Information hierarchy (child emphasis)

| Layer | Content |
|-------|---------|
| Header | Name, Child badge, DOB, age |
| Summary | Child identity, primary guardian, lead status/program hints |
| Basic information | Config-driven core fields (first/last name, etc.; DOB in header) |
| Family | Guardians (merged), siblings |
| Enrollment | Full lead/enrollment cards — **single source of truth** |
| Medical | Config-driven |
| Lifecycle roadmap | Compact orientation pills at bottom |

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
| `web/lib/admin/person/personDrawerChildIdentity.ts` | **New (IA pass)** — child identity summary, CRM display labels, primary guardian |
| `web/components/admin/entity/PersonDrawerChildLifecycleRoadmap.tsx` | **New (IA pass)** — bottom lifecycle strip |
| `web/components/admin/entity/PersonDrawerChildLifecycleSummary.tsx` | Child-first summary (IA pass) |
| `web/components/admin/entity/PersonDrawerVisibilitySections.tsx` | Unified Guardians block for child Family |
| `web/components/admin/entity/PersonDrawerContextPanel.tsx` | Relationship quick links only for child |
| `web/components/admin/entity/PersonDrawerEnrollmentActivity.tsx` | CRM lead display labels |
| `web/tests/admin/person/personDrawerChildFamilyIa.test.ts` | **New (IA pass)** |
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

### Child drawer (final pass)

- **Executive header** — avatar + age / program / location / lead chips via `PersonDrawerChildHeaderExecutive`
- **Lifecycle tab** — `PersonDrawerChildLifecycleOperationalPanel` replaces overview roadmap section
- **Child details** — `basic_info` renamed; first/last/preferred name hidden when shown in header
- **Progressive paint** — seed record from opportunity open shows shell + tabs immediately

See [`child_profile_person_drawer_doctrine.md`](./child_profile_person_drawer_doctrine.md) for ownership table and deferred list.

---

## Validation

```bash
cd web && npm run test -- tests/admin/person/ tests/admin/personDrawerVisibility.test.ts
cd web && npx tsc --noEmit
```

---

## Related

- [`person_location_ux_reset.md`](./person_location_ux_reset.md) — inquiry child identity sync
- [`docs/system/entity-model.md`](../../system/entity-model.md) — persons, customer_persons, customer_members
