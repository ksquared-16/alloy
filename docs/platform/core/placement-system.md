# Placement system

**Status:** Canonical foundation (June 2026). Defines ownership boundaries for School → Program → Room → Schedule before scheduling/attendance runtime.

---

## Definition

**Placement** is the domain concept connecting a child to physical and programmatic assignment over time:

- **School / site** — campus or center (`locations` row, `location_type = site`)
- **Program / category** — location-owned offering (`location_program_categories`)
- **Room / unit** — classroom under site (`locations` row, `location_type = unit`, `parent_location_id` = site)
- **Schedule pattern** — interim: org option set; future: location-scoped offerings
- **Effective dates & status** — future: `placements` / `child_placements` table

Placement is **not** a loose set of custom fields. School, Program, and Room form a **cascade** with shared semantics across Fields, layouts, drawer, intake, and waitlist.

---

## Ownership boundaries

| Concept | Owner | Storage (MVP) | Authority |
|---------|-------|---------------|-----------|
| **Family / Lead** | Opportunity | `opportunities.location_id` | Family **default preferred school** for intake. Not child placement authority. |
| **Child** | OCM (`inquiry_child`) | `opportunity_customer_members.location_id` | **Child-level school/site** during enrollment. Supports multi-child families at different schools. |
| **Placement** | Conceptual runtime | OCM columns (short-term) | School → Program → Room → Schedule cascade per child. |
| **Enrollment** | Lifecycle / BP | `outcome_status_key`, stage requirements | Process state. References placement needs; **not** long-term placement history SoT. |

### Rules

1. **Do not** use `opportunities.location_id` as child placement authority for enrollment, capacity, ratio, billing, or attendance.
2. **Do** resolve child site as `OCM.location_id` with opportunity location as **fallback only** when child site is empty.
3. **Do not** treat School, Program, and Room as unrelated standalone fields.
4. **Do not** create module-specific placement duplicates (one cascade, many surfaces).

---

## Canonical cascade

```
School/Site  →  Program/Category  →  Room/Unit  →  Schedule
(location_id)   (desired_program_category_id)   (program_room_cohort_key)   (desired_schedule_type)
                     ↳ legacy sync: desired_program_type (program category key)
```

### Location hierarchy

| Role | `locations` shape | Filter |
|------|-------------------|--------|
| School / site | `location_type = site` | Lead + child school pickers |
| Room / unit | `location_type = unit`, `parent_location_id` = site | Room picker; value = `locations.id` |
| Program filter | Unit `metadata.category` or `location_program_categories` | Program picker scoped by school |

Room cascade resolves program filter key via `desired_program_category_id` when present, with **`desired_program_type` fallback** for legacy rows.

---

## Current MVP storage model

| Field | Table.column | Meaning |
|-------|--------------|---------|
| Lead school | `opportunities.location_id` | Family default preferred site |
| Child school | `opportunity_customer_members.location_id` | Child placement site authority |
| Child program | `opportunity_customer_members.desired_program_category_id` | Canonical program/category FK |
| Legacy program key | `opportunity_customer_members.desired_program_type` | Synced category key; legacy read path |
| Child room | `opportunity_customer_members.program_room_cohort_key` | **Unit `locations.id`** (legacy column name) |
| Schedule interest | `opportunity_customer_members.desired_schedule_type` | Option set (org-wide interim) |

### Temporary (acceptable for enrollment MVP)

- OCM columns act as placement storage before a dedicated placements table.
- `program_room_cohort_key` column name (value is unit location id).
- Dual program columns (`desired_program_category_id` + `desired_program_type`).
- Legacy string cohort keys in waitlist seeds/repair (migrate toward unit UUIDs).
- No effective-dated placement history yet.

---

## Future placement runtime

When scheduling and attendance require moves and history:

**`placements` / `child_placements`** becomes effective-dated SoT:

- child/member/person id
- `school_location_id`
- program/category id
- `room_location_id`
- `schedule_pattern_id`
- `start_date`, `end_date`
- `status`, reason/source metadata

Enrollment lifecycle references placement decisions; placement table owns historical truth.

---

## Downstream implications

| Domain | Reads from | Notes |
|--------|------------|-------|
| **Scheduling / attendance** | Future placements table + child site | Not built; do not infer from lead location alone. |
| **Billing / subsidy** | Person/customer contracts | No lead-location placement coupling today. |
| **Staffing / ratio / capacity** | Room unit + program category + site | Use child `location_id` and room unit id; forecast facts reserved. |
| **Waitlist / placement_candidates** | OCM + `placement_candidates` grain | `site_id` from OCM-first resolution; cohort key may be legacy string during transition. |
| **Queues (OCM enrollment track)** | `OCM.location_id` | Child-grain scopes should prefer OCM site over opportunity site. |

---

## Configuration surfaces

- **Fields:** `field_definitions.label` is canonical for operator labels (School / Location, Program, Room).
- **Native references:** `config.option_source` + `field_kind: entity_reference` for lead/child school.
- **Cascade metadata:** `inquiryChildPlacementFieldMetadata` — room depends on `desired_program_category_id`.
- **Validation:** Select-like fields accept `option_source`; entity_reference requires `target_entity_type` + storage metadata.

---

## What not to do

- Do not treat School, Program, and Room as unrelated custom fields.
- Do not use lead `location_id` as child placement authority.
- Do not create parallel placement models per module.
- Do not rename DB columns in foundation pass (`program_room_cohort_key` stays).
- Do not build scheduling/attendance or full placements table until placement foundation is locked.

---

## Related docs

- `docs/system/field-model-convergence-doctrine.md` — field_definitions + option_source
- `docs/system/configuration-workspace-v1-doctrine.md` — operator configuration workspace
- `web/lib/fields/enrollmentPlacementDoctrine.ts` — code-level program model constants
