# Configuration Workspace V1 Doctrine

**Status:** Active — June 2026 (CRM V1 QA foundation).

## Purpose

Settings must feel like part of the product — not an admin console organized around implementation artifacts. Configuration Workspace groups surfaces by **what operators own**, not by database tables or runtime internals.

## Ownership domains

| Domain | Answers | Primary surfaces |
|--------|---------|------------------|
| **Organization** | Who uses the system and where? | Locations, Users & access, Communications |
| **Data Model** | What data exists? | Fields, Option lists, Relationships |
| **Operations** | How does work move? | Business Processes, Statuses, Actions, Automations |
| **Experience** | How is information collected and displayed? | Layouts, Forms, Workspace metrics |

### Hard rules

- **No Enrollment settings section.** Enrollment is a Business Process — tomorrow there may be Hiring, Onboarding, Case management. Processes are the abstraction.
- **Work Units are runtime output**, not primary configuration. Lanes sync when a Business Process stage is saved.
- **Attention stage rules** belong in Business Processes (Expected Work + Attention section). Org-wide bucket labels remain in advanced Attention defaults.

## Setup journey (guidance, not a wizard)

1. **Organization** — locations and access
2. **Data Model** — fields and option lists
3. **Operations** — business processes (stages, membership, requirements, attention, actions)
4. **Experience** — layouts and forms

Relationship operators should understand without docs:

**Fields → Business Processes → Forms → Layouts → Runtime**

## Location ownership

Location owns configurable:

- **Programs** — `location_program_categories` (Settings → Locations → Programs / offerings)
- **Rooms** — `locations` unit rows + `metadata` (category, capacity, age range)
- **Schedules** — org option set `childcare_schedule_type` today; per-location schedule offerings deferred

```
Location (site)
├── Programs   (location_program_categories)
├── Rooms      (unit locations + metadata)
└── Schedules  (org vocabulary today; location-scoped offerings future)
```

## Visible entities (childcare MVP)

Primary configuration entities:

- Person, Family (`customer`), Lead (`opportunity`), Child (`inquiry_child`), Location

Hidden from operator paths (not deleted):

- Provider (`vendor`), Schedule (`schedule`), Job (`job`), Customer Member (`customer_member`)

## Business Process stage structure

Per stage:

1. Stage Membership
2. Stage Requirements
3. Operating Plan (expected work + attention rules)
4. Ready Check

Process-level (not per-stage):

- **Process Actions** — enablement and stage restrictions

## Placement model (E2 + V2)

Operator labels: **School → Program → Room → Schedule** (Location is acceptable; orgs may rename via Fields).

| Concept | Operator label | Storage (MVP) | Resolves to |
|---------|----------------|---------------|-------------|
| School | School / Location | `location_id` | `locations.id` (site/campus row) — Lead + Child OCM |
| Program | Program | `desired_program_category_id` | `location_program_categories` per site |
| Room | Room | `program_room_cohort_key` | Child `locations.id` (room/classroom unit under site); legacy column name |
| Schedule | Schedule | `desired_schedule_type` | Org option set interim |

**Cascade:** Child School → Program (`programs_for_location`) → Room (`rooms_for_location_program`, filtered by school + program). Lead School is intake default; child may inherit or override.

**Fields validation:** Native reference / placement selects validate with `config.option_source` — not static `options`.

Internal keys (`desired_program_type`, etc.) are compatibility only — hidden from default operator pickers.

See `enrollment_workflow_qa_ready_path.md` for full QA walkthrough.

## Related docs

- `configuration-ownership-doctrine.md` — canonical owner per concept
- `field-model-convergence-doctrine.md` — Fields registry → Layouts / Forms / BP
- `settings-v2-doctrine.md` — visual reference (Business Processes workspace)
