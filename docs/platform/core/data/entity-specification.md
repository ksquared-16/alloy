---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

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
| Config: preferred_name, gender, allergies, medical_notes, special_instructions | start_date, location_id, program |

**Storage:** Native columns + `field_values` (`entity_type = customer_member`).  
**PATCH:** `/api/admin/customer-members/[id]` (native + field_values).  
**Registry:** `web/lib/fields/customerMemberFieldRegistry.ts`.

---

### `opportunities` — enrollment case / family-level process

| Owns | Does not own |
|------|----------------|
| status_key (`open` \| `closed`) + close_reason_key (case grain) | Per-child outcome status |
| stage_key (Enrollment Process position — written by outcome execution only) | Child profile fields |
| location_id, source, customer_id, primary_person_id | |
| monetary/quote fields, work_unit_id, metadata | |

**SELECT contract:** `OPPORTUNITY_CANONICAL_ADMIN_SELECT`.  
**Legacy:** `opportunities.status` text — **deprecated**, ready to drop.

---

### `opportunity_customer_members` — Enrollment Process Participation

| Operator entity_type | `enrollment_participation` (formerly `inquiry_child` — removed by the Enrollment Alignment sprint; "inquiry" is not a platform concept) |
| Storage table | `opportunity_customer_members` |

One canonical child (`customer_members`) + one process participation (this record). The
participation owns per-child enrollment facts across the whole process — proposal through
commitment; the stage determines interpretation.

| Owns | Does not own |
|------|----------------|
| start_date, location_id, program_category_id | first_name, dob, gender, health |
| program_room_cohort_key, schedule_type | |
| outcome_status_key (durable child enrollment state) + close_reason_key | |
| stage_key (child-track process position — written by outcome execution only) | |
| notes | |

**PATCH:** `/api/admin/opportunity-customer-members/[id]` — participation fields only; profile keys rejected.  
**Registry:** `web/lib/fields/enrollmentParticipationFieldRegistry.ts`.

---

### `field_definitions` — configurable field metadata

| Owns | Does not own |
|------|----------------|
| field_key, field_type, label, section, options config | Actual field values |
| entity_type scope | Native column values |

**Guard:** `validateFieldDefinitionOwnership` — profile fields cannot register on `enrollment_participation`; enrollment fields cannot register on `customer_member`.

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
**Not used for enrollment entities** — outcome execution owns enrollment state movement
(see `docs/platform/core/stage-membership-and-outcomes.md`).

---

### `action_definitions` — action metadata

Registered admin actions with guardrails and placement config. Operator-exposed actions are
domain verbs (`schedule_tour`, `waitlist_child`, `enroll_child`, `close_lead`, …) — no generic
status mutation actions.

---

## Future entities (planned — not fully canonical yet)

| Entity | Intended ownership | Status |
|--------|-------------------|--------|
| **programs** | Location-scoped program categories, room cohorts | Partial via `location_program_categories` |
| **rooms** | Physical/virtual cohort assignment | `child_placements.room_location_id` (durable); pre-materialization draft on `process_instances.metadata` |
| **schedules** | Requested vs enrolled schedule | Draft on `process_instances.metadata.schedule_type`; enrolled (durable) via `schedule_assignments`. OCM `schedule_type` is legacy-only — see [enrollment-process-runtime](../../runtime/enrollment-process-runtime.md) |
| **attendance** | Daily presence records | `child_attendance_events` (consumes the enrollment agreement) |
| **billing** | Invoices, payment methods | `customers` stripe refs; full billing TBD |
| **tuition** | Rate plans, enrollment billing | Not implemented |

Do not treat these as canonical until entity ownership is frozen in platform docs and registries exist.

### Staff / employees — now canonical

**Staff is not an entity.** A staff member is a `persons` row plus an
`employments` edge; there is no staff entity, no staff drawer, no staff view
model, and no staff search subject kind. See
[relationship-model → Employment relationship](relationship-model.md#employment-relationship).

| Concern | Owner |
|---------|-------|
| Human identity | `persons` |
| "Works here, in what capacity, since when" | `employments` |
| Job/position vocabulary | `employment_positions` (org-configured) |
| Tenant staff facts (credentials, checks, training) | `field_definitions` / `field_values`, `entity_type = 'employment'` |
| Staff scheduling eligibility | `public.person_is_employed_on()` |
| Login / roles / scope | `auth.users` → `user_roles` → `user_access_profiles` — **separate from employment** |

---

## Entity relationship summary

```
customers
  ├── customer_persons → persons (guardian, billing contact, …)
  ├── customer_members (child profile)
  └── opportunities (enrollment cases)
        └── opportunity_customer_members → customer_members (participation link)
```

See [./relationship-model.md](./relationship-model.md) for edge detail.
