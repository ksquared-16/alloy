---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Entity model

**Status:** Canonical (June 2026 freeze). Conceptual model — column detail in `docs/schema/schema-columns.md`.

---

## Tenancy

All tenant-owned rows scope by **`org_id`**. Admin APIs resolve org via `getAdminContextCached`; CRM routes add department/site scope via `getAdminAccessContextCached`.

---

## Identity

| Entity | Role |
|--------|------|
| `persons` | Canonical human identity |
| `customer_persons` | Person ↔ customer link with `role_type` |
| `contacts` | Legacy compatibility — not forward path |
| `customers` | Household / account shell |

**Rule:** New CRM/booking writes prefer `primary_person_id` over `primary_contact_id`.

---

## Inbound identity resolution

Processing resolves provisional parent, child, and household subjects onto the canonical graph; it does not introduce a parallel identity entity.

| Entity | Role |
|--------|------|
| `processing_cases` / `processing_case_sources` | Durable source-scoped intake work and replay boundary |
| `processing_facts` | Immutable normalized facts with evidence lineage |
| `processing_resolutions` | Subject candidates, conflicts, and operator decisions |
| `processing_commit_plans` / `processing_plan_operations` | Versioned immutable proposed mutations using registered semantic commands |
| `processing_approvals` | Approval bound to exact plan version and content hash |
| `processing_commit_attempts` / `processing_exceptions` | Execution audit, retry/compensation state, and operator-visible failures |

Parent and Guardian remain roles, Child remains a `customer_members` record (optionally person-backed), and Family/Household remains the `customers` account shell plus relationships. Email and phone are matching signals, not universal unique identity keys.

---

## CRM pipeline

| Entity | Role |
|--------|------|
| `opportunities` | Case-level pipeline record |
| `opportunity_customer_members` | Per-child inquiry/enrollment rows |
| `tour_bookings` | Confirmed tour appointments (not `schedules`) |
| `placement_candidates` | Waitlist candidate grain (preview/triage) |

---

## Status grains (frozen)

| Grain | Column | Meaning |
|-------|--------|---------|
| Case | `opportunities.status_key` | Household coordination / pipeline |
| Child enrollment | `opportunity_customer_members.outcome_status_key` | Per-child lifecycle SoT |

---

## Business process configuration

| Entity | Role |
|--------|------|
| `lifecycles` | Business process catalog |
| `work_units` | Execution host for `queue_definition` |
| `departments` | ACL + metadata ownership |

Operator model: Process → Stage → Record. See `business-process-system.md`.

---

## Locations

Single table `locations` with types: `address`, `site`, `unit` (rooms/classrooms are `unit` rows).

Child site authority: `opportunity_customer_members.location_id` — not `opportunities.location_id` alone.

---

## Events & automation

| Entity | Role |
|--------|------|
| `workflow_events` | Append-oriented business facts |
| `workflows` | Automation definitions |
| `action_definitions` | Admin action catalog |

---

## Communications (canonical)

`communication_threads`, `communication_messages`, `communication_provider_bindings` — V1 canonical.

Legacy: `messages`, `messages_outbox`.

---

## Forms

`form_definitions`, `form_definition_versions`, `form_public_links`, `form_submissions`, `packet_sessions`.

---

## Schema reference

- Tables/views: `docs/schema/schema-tables.md`
- Columns: `docs/schema/schema-columns.md`
- Expanded narrative: `../../system/entity-model.md` (transitional)

---

## When to update

New entity types, identity model changes, or location/status grain shifts.
