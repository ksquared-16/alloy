# Canonical Entity Specification

**Status:** Phase 5 formal contract (June 2026)  
**Platform reference:** `docs/platform/core/entity-model.md`

---

## Implemented canonical entities

### `persons` — identity & contact

| Owns | Does not own |
|------|----------------|
| first_name, last_name, full_name, preferred_name | Household membership role |
| email, phone, date_of_birth | Child enrollment participation |
| status_key (person grain) | Case-level enrollment status |
| metadata, archived_at | |

**Config:** Custom fields via `field_definitions` (`entity_type = person`) → `field_values`.  
**Native columns:** Not duplicated in `field_definitions`.

---

### `customers` — household / account

| Owns | Does not own |
|------|----------------|
| name, customer_number, customer_type | Person identity fields |
| status_key (household grain) | Child profile |
| primary_contact_id, primary_person_id | Per-child enrollment outcome |
| metadata, billing-adjacent refs | |

**SELECT contract:** `CUSTOMER_CANONICAL_ADMIN_SELECT`, `CUSTOMER_CANONICAL_LIST_SELECT`.

---

### `customer_members` — child profile

| Owns | Does not own |
|------|----------------|
| first_name, last_name, dob, display_name, relationship | Enrollment case facts |
| person_id (optional identity link) | outcome_status_key |
| Config: preferred_name, gender, allergies, medical_notes, special_instructions | desired_start_date, location_id, program |

**Storage:** Native columns + `field_values` (`entity_type = customer_member`).  
**PATCH:** `/api/admin/customer-members/[id]` (native + field_values).  
**Registry:** `web/lib/fields/customerMemberFieldRegistry.ts`.

---

### `opportunities` — enrollment case / family-level process

| Owns | Does not own |
|------|----------------|
| status_key (case grain) | Per-child outcome status |
| location_id, source, customer_id, primary_person_id | Child profile fields |
| monetary/quote fields, work_unit_id, metadata | |

**SELECT contract:** `OPPORTUNITY_CANONICAL_ADMIN_SELECT`.  
**Legacy:** `opportunities.status` text — **deprecated**, ready to drop.

---

### `opportunity_customer_members` — child enrollment participation

| Operator entity_type | `inquiry_child` |
| Storage table | `opportunity_customer_members` |

| Owns | Does not own |
|------|----------------|
| desired_start_date, location_id, desired_program_* | first_name, dob, gender, health |
| program_room_cohort_key, desired_schedule_type | |
| outcome_status_key (child enrollment outcome) | |
| notes | |

**PATCH:** `/api/admin/opportunity-customer-members/[id]` — enrollment fields only; profile keys rejected.  
**Registry:** `web/lib/fields/inquiryChildFieldRegistry.ts`.

---

### `field_definitions` — configurable field metadata

| Owns | Does not own |
|------|----------------|
| field_key, field_type, label, section, options config | Actual field values |
| entity_type scope | Native column values |

**Guard:** `validateFieldDefinitionOwnership` — profile fields cannot register on `inquiry_child`; enrollment fields cannot register on `customer_member`.

---

### `field_values` — configurable field values

Grain: `(org_id, entity_type, entity_id, field_key)` → value JSON.

---

### `status_definitions` — status vocabulary

Grain: `(org_id, entity_type, status_key)` → label, color, sort, active.

Entity types include `opportunities`, `opportunity_customer_members`, `persons`, `customers`, etc.

---

### `status_transition_rules` — allowed status movement

Binds Business Process transitions to valid `status_key` changes per entity type.

---

### `action_definitions` — action metadata

Registered admin actions (`update_enrollment_status`, relationship actions, etc.) with guardrails and placement config.

---

## Future entities (planned — not fully canonical yet)

| Entity | Intended ownership | Status |
|--------|-------------------|--------|
| **programs** | Location-scoped program categories, room cohorts | Partial via `location_program_categories` |
| **rooms** | Physical/virtual cohort assignment | Partial via `program_room_cohort_key` on OCM |
| **schedules** | Desired vs enrolled schedule | OCM `desired_schedule_type`; enrolled TBD |
| **attendance** | Daily presence records | Not canonical in CRM layer |
| **billing** | Invoices, payment methods | `customers` stripe refs; full billing TBD |
| **tuition** | Rate plans, enrollment billing | Not implemented |
| **staff / employees** | `persons` + employment relationship | Person grain; employment tables TBD |

Do not treat these as canonical until entity ownership is frozen in platform docs and registries exist.

---

## Entity relationship summary

```
customers
  ├── customer_persons → persons (guardian, billing contact, …)
  ├── customer_members (child profile)
  └── opportunities (enrollment cases)
        └── opportunity_customer_members → customer_members (participation link)
```

See [canonical-relationship-model.md](./canonical-relationship-model.md) for edge detail.
