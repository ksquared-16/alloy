---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Canonical Relationship Model

**Status:** Phase 5 formal contract (June 2026)  
**Platform reference:** `docs/platform/core/entity-model.md`

Relationships are **edges** between canonical entities — not duplicate copies of identity or profile facts.

---

## Household relationships

| Attribute | Value |
|-----------|-------|
| **Owner** | `customers` (household shell) |
| **Cardinality** | 1 customer : N persons (via join) |
| **Source table** | `customer_persons` |
| **Direction** | customer → person |
| **Lifecycle** | Active while `end_date` null / status active |
| **Editable surfaces** | Person drawer household section, Add Person actions |
| **Widget** | Household members repeater |
| **Mutating actions** | `add_person_to_household`, relationship framework actions |

---

## Parent / guardian relationships

| Attribute | Value |
|-----------|-------|
| **Owner** | `customer_persons.role_type` |
| **Cardinality** | N:M customer ↔ person |
| **Source table** | `customer_persons` |
| **Direction** | person linked to customer with role |
| **Lifecycle** | Role may change; primary flag on row |
| **Editable surfaces** | Person drawer, opportunity drawer guardians |
| **Mutating actions** | `make_primary_contact`, add guardian |

---

## Child relationships

| Attribute | Value |
|-----------|-------|
| **Owner** | `customer_members` (profile) + optional `person_id` |
| **Cardinality** | 1 customer : N active children |
| **Source table** | `customer_members` |
| **Direction** | customer → child member |
| **Lifecycle** | `is_active`, relationship = child |
| **Editable surfaces** | Child drawer, household children repeater |
| **Mutating actions** | Add child, PATCH customer_member |

---

## Emergency contact

| Attribute | Value |
|-----------|-------|
| **Owner** | `person_relationships` or scoped contact links |
| **Cardinality** | N per anchor (person or child context) |
| **Source table** | `person_relationships`, layout runtime scoped contacts |
| **Direction** | anchor → contact person |
| **Editable surfaces** | Person/child drawer relationship sections |
| **Mutating actions** | Add emergency contact action |

---

## Authorized pickup

| Attribute | Value |
|-----------|-------|
| **Owner** | Relationship edge (person ↔ child/household) |
| **Source table** | `person_relationships` + role vocabulary |
| **Editable surfaces** | Child/person drawer |
| **Status** | Config-driven role types |

---

## Employee relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | `persons` + employment link (future) |
| **Status** | **Planned** — not fully canonical |
| **Direction** | org → staff person |

---

## Billing contact

| Attribute | Value |
|-----------|-------|
| **Owner** | `customer_persons` with billing role or `customers.primary_contact_id` |
| **Source table** | `customer_persons`, `customers` |
| **Mutating actions** | Make primary, role assignment |

---

## Address

| Attribute | Value |
|-----------|-------|
| **Owner** | `person_locations`, customer metadata, or field_values |
| **Cardinality** | N locations per person/customer |
| **Source table** | `person_locations`, `locations` |
| **Editable surfaces** | Person/customer drawer address sections |

---

## Program relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | OCM enrollment grain |
| **Storage** | `opportunity_customer_members.desired_program_category_id` |
| **Cardinality** | Per child per case |
| **Option source** | Location-scoped programs cascade |
| **Editable surfaces** | Inquiry child enrollment section |

---

## Room relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | OCM enrollment grain |
| **Storage** | `program_room_cohort_key` |
| **Depends on** | location_id, desired_program_category_id |

---

## Schedule relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | OCM enrollment grain |
| **Storage** | `desired_schedule_type` |
| **Vocabulary** | option_set `childcare_schedule_type` |

---

## Enrollment record relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | `opportunity_customer_members` |
| **Cardinality** | N children per opportunity |
| **Direction** | opportunity → customer_member (via OCM) |
| **Link keys** | opportunity_id, customer_member_id |
| **Editable surfaces** | Opportunity drawer inquiry children repeater |
| **Mutating actions** | add_inquiry_child, remove child, update_enrollment_status |

---

## Business process subject relationship

| Attribute | Value |
|-----------|-------|
| **Owner** | `opportunities` (case subject = customer/household) |
| **Cardinality** | 1 primary case per enrollment pipeline subject |
| **Queue binding** | Work unit scopes to opportunity rows |
| **Storage** | `opportunities.customer_id`, `work_unit_id` |

---

## Contacts compatibility layer (deprecated path)

| Attribute | Value |
|-----------|-------|
| **Owner** | `contacts` (legacy) |
| **Classification** | **Isolate → deprecate** |
| **Canonical target** | `persons` + `customer_persons` |
| **Do not** | Create new features on contacts table |

---

## Command Runtime delegation (P3.S1 / P3.S2)

Relationship **semantics and mutation ownership** remain in the Relationship Action Framework
(`executeRelationshipAction`, registries, role resolution). The Command Runtime may delegate
exact operator capabilities through `POST /api/admin/actions/execute`:

| Capability | Notes |
|------------|-------|
| `add_parent_guardian` | Fixed guardian role via registry; create or link person as today |
| `link_existing_person` | Existing identity + role only; no identity creation |
| `add_emergency_contact` | Fixed emergency_contact; create or link; does not imply pickup/guardian |
| `add_authorized_pickup` | Fixed authorized_pickup; create or link; does not imply guardian/billing |
| `add_billing_contact` | Fixed billing_contact; create or link; does not imply financial-account ownership |
| `add_child` | Create or link child person; may attach household member / opportunity participation **only** via existing Relationship Framework path |
| `link_existing_child` | Existing child person id only; no createChildDraft |

`make_primary_contact` (external executor) and the Add Family Member hub remain outside facade
execution. Dedicated `/api/admin/relationship-actions/*` routes remain.

---

## Reusable widget potential

| Widget | Canonical source |
|--------|------------------|
| Person picker | `persons` search |
| Child picker | `customer_members` (active, relationship=child) |
| Household picker | `customers` |
| Relationship repeater | Join table + role vocabulary |
| Program cascade | location → program → room |

Implementation: `web/lib/layout/runtime/*Relationship*`, action registry.
