# Alloy Entity Model

## 1. Purpose

This document defines the canonical entity model used across Alloy.

It exists to prevent:
- hardcoding vertical-specific concepts in code
- inconsistent relationships between entities
- “random” foreign keys without an explicit pattern
- workflow actions that can’t reliably find their target record

This model should remain stable as Alloy expands into new verticals (cleaning, childcare, etc.).

---

## 2. Core Concepts

### Organization (org_id)
All data is scoped to `org_id`. Every entity record must include `org_id`.
RLS enforces tenant isolation.

### Vertical
A vertical is a configured business domain (e.g., cleaning, childcare).
Verticals influence:
- which entity types exist
- which settings exist
- which workflows are enabled
- which UI modules appear

Verticals should not require different database schemas to function.

### Entity Types
An entity type is a named record category (e.g., `customer`, `job`, `schedule`, `location`).

Alloy treats entity types as:
- first-class in workflows (event triggers reference entity_type)
- first-class in UI (admin drawer can open any entity record)
- first-class in permissions (policies reference entity types)

---

## 3. Canonical Entity Shape

Every entity record should follow these conventions:

- `id` (uuid) — primary key
- `org_id` (uuid) — tenant scope
- `created_at` (timestamp)
- `updated_at` (timestamp nullable)

Optional but common:
- `status` (text or enum)
- `metadata` / `attrs` (jsonb) for small, non-relational additions
- `external_ref` (text) for third-party IDs

---

## 4. Relationships

All relationships should follow consistent naming:

- `<related>_id` as a foreign key reference
  - e.g. `customer_id`, `job_id`, `location_id`

Avoid ambiguous names like:
- `parentId`
- `relatedId`
- `entityId` (unless the table is explicitly polymorphic)

If a relationship is polymorphic:
- use `(entity_type, entity_id)` explicitly as a pair

---

## 5. Events + Workflows Must Reference Entities

Every emitted event should include:

- `org_id`
- `event_type`
- `entity_type`
- `entity_id`
- `occurred_at`
- `payload` (json)

Workflows are selected by:
- `event_type`
- optional `entity_type` match (or null to match all)

Workflows should not rely on “implied” entity references.
Everything needed for execution should be expressible in the event payload.

---

## 6. ID Path Convention (Critical)

Workflow actions often need to mutate a target record.
They must locate it deterministically.

All workflow actions that act on an entity must support an `id_path`:

- `id_path` is a string path into the event payload
- It resolves to a UUID `entity_id`
- Example: `entity_id`, `payload.schedule_id`, `payload.job.id`

Rule:
- Prefer `entity_id` when the action applies to the triggering entity.
- Only use deeper paths when acting on a related entity.

If `id_path` does not resolve or is not a UUID:
- the action should fail loudly and record the error in `workflow_action_runs`.

---

## 7. Locations (Do Not Overbuild)

Alloy should support locations as a general concept across verticals:
- cleaning: property / service address
- childcare: school / campus, then optionally room
- healthcare: building / floor / room

### 7.1 Location as a single entity type
Define a `location` entity that can represent any physical or logical place.

Minimum recommended fields:
- `id`, `org_id`
- `name`
- `location_type` (optional: `site`, `room`, `unit`, `property`)
- `parent_location_id` (nullable) for simple hierarchy
- `address_*` fields (optional, if needed by the vertical)

This gives you hierarchy (site → room) without new tables.

### 7.2 Two-level hierarchy is enough for V1
V1 should support:
- a primary location (site)
- optional sub-location (room/unit)

Do not build:
- unlimited depth UI requirements
- complex tree permission inheritance
- routing / geo features

Just support:
- parent-child link
- filtering and display in UI
- referencing `location_id` from other entities

---

## 8. Recommended Relationship Pattern for Locations

Entities that “happen at a place” should include:
- `location_id`

If sub-location matters, still only store:
- `location_id` and rely on `parent_location_id` to infer site context.

Avoid adding `site_id` + `room_id` everywhere.
One `location_id` with parent support stays flexible.

---

## 9. Customer + Location

Common pattern:
- Customer can have multiple locations (service addresses, campuses)
This is modeled as:
- `locations.customer_id` (or a join table if truly many-to-many)

For V1, prefer:
- `locations.customer_id` nullable
so locations can exist either:
- org-wide (shared facilities)
- customer-bound (service address)

---

## 10. Guardrails

When adding a new entity type, always define:

- what events it emits
- what workflows might trigger from those events
- what other entities it relates to
- whether it can be referenced via action links
- whether it can have ledger impact

If any of these are unclear, pause before building.

---

## 11. Practical Examples

### Cleaning
- customer
- location (service address)
- job (references location_id)
- schedule (references job_id)

### Childcare
- customer (parent household)
- location (school campus)
- location (room) parent_location_id = campus
- enrollment / billing records reference location_id

### Healthcare
- location (building)
- location (floor) parent = building
- location (room) parent = floor
- appointments reference location_id (room)

All supported with the same entity model.