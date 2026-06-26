# Configuration Workspace V1 Doctrine

**Status:** Active — June 2026 (CRM V1 QA foundation).

## Configuration Mode visual rule

Settings configuration must use Alloy’s operational palette — **not** blue/gray legacy admin styling. See **`configuration-mode-doctrine.md`** for the frozen interaction layout (Context → Queue → Workspace → BOS) and pine/midnight/forge/stone tokens.

## Purpose

Settings must feel like part of the product — not an admin console organized around implementation artifacts. Configuration Workspace groups surfaces by **what operators own**, not by database tables or runtime internals.

## Ownership domains

| Domain | Answers | Primary surfaces |
|--------|---------|------------------|
| **Organization** | Who uses the system and where? | Locations, Users & access, Communications |
| **Data Model** | What data exists? | Fields, Option lists, Relationships |
| **Operations** | How does work move? | Business Processes (stages, **perspectives**, missions, required info), Statuses, Actions, Automations |
| **Experience** | How is information collected and displayed? | Layouts (queue rows, Focus Panel presentation), Forms, Workspace metrics |

### Hard rules

- **No Enrollment settings section.** Enrollment is a Business Process — tomorrow there may be Hiring, Onboarding, Case management. Processes are the abstraction.
- **Work Units are runtime output**, not primary configuration. Lanes sync when a Business Process stage is saved.
- **Perspectives** are Business Process stage metadata over queue lanes — not a separate settings product or builder.
- **Queue rows and Focus Panel presentation** are authored in **Layouts / Experience Builder** — not in Business Processes and not via Queue Builder or Focus Panel Builder routes.
- **Attention stage rules** belong in Business Processes (Expected Work + Attention section). Org-wide bucket labels remain in advanced Attention defaults.

## Setup journey (guidance, not a wizard)

1. **Organization** — locations and access
2. **Data Model** — fields and option lists
3. **Operations** — business processes (stages, **perspectives**, membership, requirements, attention, actions); statuses vocabulary (Statuses sprint)
4. **Experience** — layouts (queue rows, Focus Panel presentation) and forms

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

## Parallel sprint dependencies

Configuration Runtime **consumes** canonical systems — it does not duplicate them:

| Sprint | Owner surface | Configuration Runtime must not… |
|--------|---------------|-----------------------------------|
| **Fields & Field Formats** | `/admin/settings/fields` | Add parallel field definitions, formats, or validation outside Fields |
| **Statuses** | `/admin/settings/statuses` | Add status vocabulary or transition UI outside Statuses; stage assignment stays in Business Processes |

---

Per stage:

1. Stage Membership
2. Stage Requirements
3. Operating Plan (expected work + attention rules)
4. Perspectives (lane metadata — Phase 2+ UI; registered in doctrine Phase 0/1)
5. Layout assignments (published layouts from Experience Builder)
6. Ready Check

Process-level (not per-stage):

- **Process Actions** — enablement and stage restrictions

## Placement model (E2 + V2)

Operator labels: **Location → Program → Room → Schedule**

| Concept | Operator label | Storage (MVP) | Owner |
|---------|----------------|---------------|-------|
| Location | Location | `location_id` | Lead / Child OCM |
| Program | Program | `desired_program_category_id` | `location_program_categories` per site |
| Room | Room | `program_room_cohort_key` / unit `locations` | Location hierarchy (required at placement) |
| Schedule | Schedule | `desired_schedule_type` | Org option set interim; location-owned future |

Internal keys (`desired_program_type`, etc.) are compatibility only — hidden from default operator pickers.

See `enrollment_workflow_qa_ready_path.md` for full QA walkthrough.

## Related docs

- `configuration-ownership-doctrine.md` — canonical owner per concept
- `configuration-runtime-design-alignment.md` — Alloy OS Configuration Runtime (approved design)
- `field-model-convergence-doctrine.md` — Fields registry → Layouts / Forms / BP
- `settings-v2-doctrine.md` — visual reference (Business Processes workspace)
