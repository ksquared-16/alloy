---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Placement system

**Status:** Canonical foundation (June 2026). Defines ownership boundaries for School → Program → Room → Schedule before scheduling/attendance runtime.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze).** Where this doc frames a dedicated **`child_placements` / `schedule_assignments`** runtime as "future," that framing is stale: the effective-dated committed foundation (`child_enrollment_agreements` → `child_placements` → `schedule_assignments`, with supersede-not-patch and provenance FKs) is **built** and is the canonical **L2 Operational Intent** layer — see the "Enrollment proposal vs operational contract" table below and [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) §1/§3. The OCM-column MVP storage remains the *enrollment proposal*; the committed placement/schedule tables own operational truth after the approve handoff.

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
| Schedule interest | `opportunity_customer_members.desired_schedule_type` | **Enrollment schedule proposal** (may be captured before tour; BOS capacity forecasting) |

### Enrollment proposal vs operational contract (June 2026)

| Layer | Storage | Role |
|-------|---------|------|
| Enrollment proposal | OCM columns (`location_id`, `desired_program_type`, `program_room_cohort_key`, `desired_schedule_type`) | Intent during inquiry/enrollment — not committed operational truth |
| Operational contract | `child_enrollment_agreements` | Per child × site agreement after approve handoff |
| Committed placement | `child_placements` | Effective-dated physical/program/room assignment on an agreement |
| Committed schedule | `schedule_assignments` | Effective-dated schedule on an agreement (from latest valid `desired_schedule_type` at handoff) |

Handoff on `approve_enrollment` creates or reuses the agreement and converts the latest valid enrollment proposal into committed placement/schedule rows. Missing schedule patterns produce partial handoff warnings without blocking approval.

**Operator edits (Batch 5):** After handoff, operators change placement or schedule via supersede (new effective-dated row; prior row closed the day before). Agreement lifecycle uses ending / ended / cancel routes — not in-place patches.

---

- OCM columns act as placement storage before a dedicated placements table.
- `program_room_cohort_key` column name (value is unit location id).
- Dual program columns (`desired_program_category_id` + `desired_program_type`).
- Legacy string cohort keys in waitlist seeds/repair (migrate toward unit UUIDs).
- No effective-dated placement history yet.

---

## Subject scope — this document owns the child branch

`schedule_assignments` is **subject-neutral**: it carries
`subject_type ∈ {child, staff}` as a CHECK constraint
(`supabase/migrations/20260725030801_operational_assignment_foundation_v1.sql`). The two grains
have different shapes — a child assignment names a `customer_members` row and may carry an
enrollment agreement; a staff assignment names a `persons` row, requires a `site_location_id`,
forbids an agreement, and must be `committed`.

**This document owns the child branch.** The staff branch — presence, supply and roster
composition — is owned by [`../modules/attendance-system.md`](../modules/attendance-system.md)
§ Attendance V1. Neither document owns the assignment commitment *object* itself (lifecycle
states, `commitment_kind`, supersede-not-patch, the type registry); that gets a canonical owner
when staff traffic exists — see D6 in
`docs/audits/active/documentation-truth-audit-2026-09/decisions-required.md`.

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

## Operator waitlist rank — one ranking grain

**A waitlist SECTION is the operator-visible ranking grain.** A section is a program category
(Infant, Toddler, Preschool, Pre-K); it is the list an operator reads, and the numerator and
denominator on a row both describe it.

Manual position adjustments resolve against that same section. When an operator moves a candidate
shown at `2/12`, the command means "put this candidate second among these twelve", and the result
is `2/12`. The pin is placed by `applySectionManualPositions`, whose run is the section.

**Internal cohort keys may inform natural ranking or carry lineage; they do not define a second
operator-facing position domain.** `program_room_cohort_key` remains the provenance recorded on
`placement_overrides` and continues to group the natural sort, but it no longer decides which
positions exist.

This was not always true, and the failure is worth remembering. A pin used to be scoped to the
candidate's own cohort while the queue counted positions across the section, so an operator read one
number and edited another — `2/12` on the row, `1/11` in the control. Because
`program_room_cohort_key` is a slugified program/room LABEL rather than a controlled vocabulary, one
program drifts into several spellings: the deployed Firefly INFANT section held twelve candidates,
eleven under `infant_0_18_months` and one under a degraded `infant`. The natural sort groups cohorts
into contiguous blocks, so that one row held section position 1 and **nothing the operator did to
the other eleven could reach it**. A ranked list of twelve with unreachable positions is not a
ranked list.

The ranking model is deliberately robust to that drift rather than dependent on repairing it.
Normalizing degraded cohort keys is separate hygiene; this contract holds either way.

### The list contract

A waitlist section is an ORDERED LIST, and a manual adjustment is a LIST MOVE. Five statements,
which hold together or not at all:

1. **One section ranking.** Natural ranking decides the order first; manual adjustment then places
   rows into it. There is no second ranking algorithm and no per-row sort key that encodes position.
2. **Requested position IS the resulting position.** Moving a row shown at `7/12` to `4` leaves it
   at `4/12`. Not near 4, not 4 unless something contends — 4.
3. **No duplicate seats.** Active ordinals within a section are unique. Nothing contends, so no
   contention rule exists to reason about.
4. **The renderer reproduces the stored state.** Replaying stored ordinals through the placement
   rule yields the order the operator was shown. The writer checks this before writing and refuses
   if it fails.
5. **Queue and Focus Panel show the same rank,** because both read the same projection.

**Contended ordinals used to be a feature, and that was the mistake.** The rule was: seats fill in
ascending ordinal and never move backwards, so rivals on one number take consecutive seats. It
sounded like graceful degradation. What it actually meant was that a stored ordinal did not
determine a position — ordinals 2, 5 and 12 could render identically — so an operator could not
predict where a row would land, and one deployed section accumulated three rows all claiming
ordinal 2. Duplicate ordinals are now prevented rather than resolved.

### The writer does not rank

**A position is not a property of a row.** "Third" is a claim about a list, so making one row third
is a claim about every row above it. A writer that sets one `pin_ordinal` and leaves the rest alone
has not expressed the operator's intent; it has recorded a number next to a row.

So the writer obtains the list rather than deriving it. `loadWaitlistSectionOrder` asks the queue
through `getWorkUnitQueueItems` — the same entry point the work-unit surface calls — and reads the
positions the projection already stamped. It contains no ordering logic, which is the point: a
writer holding its own copy of the ordering rules will eventually disagree with the renderer.

That is not hypothetical. A previous writer renumbered ordinals by breaking ties on `created_at`
while the renderer broke them on natural rank. The two disagreed and four live director adjustments
were silently rearranged — TP8 2→4, TP3 4→7, TP11 6→5, TP10 8→6. Nobody asked for that. The lesson
is not "be careful with the tie-break"; it is that the writer must not own a tie-break at all.

**The canonical form is a pinned prefix.** The rows at positions 1..k hold ordinals 1..k, where k
covers the moved row and every already-pinned row; everything after k is unpinned and falls in
natural order. The smaller pin set that `deriveCanonicalManualOrdinals` finds requires knowing the
NATURAL order, and the writer cannot observe it — a row pinned before anyone looked has never had
its natural rank rendered. A prefix removes the question: ordinals 1..k are seated by force, no
natural rank participates, and the result reproduces because the tail holds only rows that were
unpinned before and after, whose relative order the move did not touch.

The cost is bounded and honest: moving to position 3 pins three rows, not the section. Rows pinned
only to hold the prefix record that as their reason rather than borrowing the operator's.

**Provenance survives normalization.** Existing overrides are updated, never replaced: id,
`created_by`, `created_at` and reason are preserved, and only `pin_ordinal` moves, only when it
actually changes. "Who put this child here, and why" keeps its original answer.

---

## Configuration surfaces

- **Fields:** `field_definitions.label` is canonical for operator labels (School / Location, Program, Room).
- **Placement field catalog:** `configurablePlacementFieldCatalog.ts` — admins add School/Program/Room via Settings → Fields "Placement fields" panel (`POST /api/admin/field-definitions/ensure-platform-field`).
- **Native references:** `config.option_source` + `field_kind: entity_reference` + `depends_on_field_key` for cascade.
- **Validation:** Select-like fields accept `option_source`; label-only PATCH must not strip reference config.

---

## What not to do

- Do not treat School, Program, and Room as unrelated custom fields.
- Do not use lead `location_id` as child placement authority.
- Do not create parallel placement models per module.
- Do not rename DB columns in foundation pass (`program_room_cohort_key` stays).
- Do not build scheduling/attendance or full placements table until placement foundation is locked.

---

## Related docs

- `docs/platform/core/operational-truth-flow-doctrine.md` — truth-flow axis; this committed foundation is **L2 Operational Intent**
- `docs/system/field-model-convergence-doctrine.md` — field_definitions + option_source
- `docs/system/configuration-workspace-v1-doctrine.md` — operator configuration workspace
- `web/lib/fields/enrollmentPlacementDoctrine.ts` — code-level program model constants
