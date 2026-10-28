---
owner: platform
status: canonical
last_reviewed: 2026-10-27
supersedes: []
---

# Placement system

**Status:** Canonical. Owns child placement / enrollment-agreement boundaries for the Enrollment /
Placement context lane (including provisional Tours booking routing — Director D-02).

> **Recertification note (2026-10-27, Slice 3A).** Earlier drafts framed `child_placements` /
> `schedule_assignments` as "future" and described an OCM-column MVP plus `approve_enrollment`
> handoff as the only path. The committed trio is **built**. The canonical enrollment materialization
> path is process-instance driven. This document is the DIRECT owner for the `enrollment-placement`
> Vacilando lane — keep Tours, Medical, and Financials as **boundary pointers**, not duplicated
> authority.

---

## Definition

**Placement** connects a child to physical and programmatic assignment over time:

- **School / site** — campus (`locations`, `location_type = site`)
- **Program / category** — location-owned offering (`location_program_categories`)
- **Room / unit** — classroom under site (`locations`, `location_type = unit`)
- **Schedule pattern** — schedule assignment on an agreement (effective-dated)
- **Effective dates & status** — on `child_placements` / `schedule_assignments` / agreements

Placement is **not** a loose set of custom fields. School, Program, and Room form a **cascade**
with shared semantics across Fields, layouts, Focus Panel, intake, and waitlist.

---

## Three layers (must not be collapsed)

| Layer | Storage | Role | Writer |
|---|---|---|---|
| **1. Waitlist candidate** | `placement_candidates` (+ overrides / link groups) | Ranked intent while waiting; statuses `active` / `paused` / `withdrawn` / `placed` | Waitlist outcomes / candidate services |
| **2. Proposed assignment** | `schedule_assignments` with `commitment_kind='proposed'` (no agreement); optional `enrollment_pricing_terms` | Operator-proposed schedule/pricing before commit; promoted by `assignment.promote_proposed` | Assignments / enrollment pricing services |
| **3. Committed trio** | `child_enrollment_agreements` → `child_placements` → `schedule_assignments` (`committed`) | Operational truth after materialization; supersede-not-patch | Materialization / placement / schedule services |

Agreement lifecycle statuses include `pending_start`, `active`, `ending`, `ended`, `canceled`,
`voided`. Operator edits after commit **supersede** (close prior row, open successor) — they do not
in-place patch operational facts.

---

## Enrollment journey (operator spine — do not restate BP ownership)

Family stages: `lead` → `tour` → `decision` → `closed`. Child stages: `waitlist` → `enrolling` →
`enrolled` / `closed_withdrawn`. Per-child decisions (`enrollment.decide`) move one child at a time.
Stage vocabulary and outcome execution are owned by Business Process / Status docs; this document
owns placement and agreement consequences.

**Decision / Offer:** There is **no** separate offer entity. "Offer Spot" is the Waitlist outcome
`spot_offered` (template `waitlist_to_enrolling`) moving the child into Enrolling. Candidate status
`placed` is config-driven via outcome targets — not automatic on materialization.

---

## Materialization paths (V1 vs legacy)

| Path | Trigger | Facts from | Gate |
|---|---|---|---|
| **Canonical (V1)** | Child outcome disposition `enrolled` → `materializeEnrollmentFromProcessInstance` → `applyChildEnrollmentMaterialization` | `process_instance.metadata` → `placement_candidates` → opportunity defaults | `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` (default **OFF**; org may override via feature flags). Failures surface as `degradedEffects` — non-blocking |
| **Legacy** | `approve_enrollment` / `enroll_child` alias → `enrollmentAgreementHandoff` | OCM enrollment proposal columns | Compatibility; OCM fallback also gated by `ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK` |

Hosted flag state is **environment evidence**, not something this doc asserts as always-on.

---

## Ownership boundaries

| Concept | Owner | Storage | Authority |
|---------|-------|---------|-----------|
| **Family / Lead** | Opportunity | `opportunities.location_id` | Family default preferred school. Not child placement authority. |
| **Child site (pre-commit)** | OCM / participation | `opportunity_customer_members.location_id` | Child-level site during enrollment; multi-child families may differ |
| **Child enrollment status** | OCM / participation | `opportunity_customer_members.outcome_status_key` (+ `close_reason_key`) | Durable per-child Enrollment **status** |
| **Child stage / journey** | Process instance | `process_instances.stage_key` / `state` | Journey position — **not** `OCM.stage_key` |
| **Committed placement** | This domain | `child_placements` on an agreement | Effective-dated school/program/room |
| **Committed schedule** | This domain | `schedule_assignments` | Effective-dated schedule; subject-neutral table (`child` \| `staff`) — **this doc owns the child branch** |

### Rules

1. **Do not** use `opportunities.location_id` as child placement authority for enrollment, capacity, ratio, billing, or attendance.
2. **Do** resolve child site as OCM/participation `location_id` with opportunity location as **fallback only** when child site is empty.
3. **Do not** treat School, Program, and Room as unrelated standalone fields.
4. **Do not** create module-specific placement duplicates (one cascade, many surfaces).

---

## Canonical cascade (proposal fields)

```
School/Site  →  Program/Category  →  Room/Unit  →  Schedule
(location_id)   (program_category_id)            (program_room_cohort_key)   (schedule_type)
```

| Field | Table.column | Meaning |
|-------|--------------|---------|
| Lead school | `opportunities.location_id` | Family default preferred site |
| Child school | `opportunity_customer_members.location_id` | Child site during enrollment |
| Child program | `opportunity_customer_members.program_category_id` | Canonical program/category FK (`desired_program_category_id` / `desired_program_type` were retired/renamed) |
| Child room | `opportunity_customer_members.program_room_cohort_key` | Unit `locations.id` (legacy column name) |
| Schedule interest | `opportunity_customer_members.schedule_type` | Enrollment schedule proposal (`desired_schedule_type` renamed) |

Room cascade resolves program filter via `program_category_id` when present.

---

## Tours booking handoff (provisional — Enrollment lane)

Tours **booking lifecycle** (public calendar request → approve/materialize → operator
schedule/confirm/cancel/complete/no-show; opportunity tour mirror) routes under this lane
(Director D-02). **Do not** create a separate Tours context lane.

| Concern | Owner |
|---|---|
| Booking / public calendar journey | This lane (`web/lib/tours/**`, `tours.book` / `tours.configure`) |
| Marketing consent + canonical send | Communications |
| Availability / public link flags | Configuration (secondary) |
| Operating Calendar authoring | Attendance / Operational Intelligence — Tours **consumes** closures |
| Forms intake embedding | Documents / Forms module narrative — not security authority |

A pending public **requested** tour is not yet a booking. Notification failure must not revoke a
committed booking. Stage-sync follow-up failure similarly must not unwind booking truth.

---

## Medical and consent (boundary only)

Enrollment **does not own** medical storage or marketing-consent preference truth. Health /
`person_medical_consents` / `person_health_facts` belong to the Health capability model. Marketing
consent writers belong to Communications. This lane may surface requirements and Focus Panel cards;
it must not redefine those authorities.

---

## Payer and financial handoff (boundary only)

Enrollment owns fee **requirement** applicability (`financial` stage requirement +
`charge_template_key`), payer binding for enrollment links, and pricing-terms metadata where
configured. **Financials** owns obligation, collection, refund, and ledger truth. Do not state
current payment semantics here while the Financials context lane is `PENDING_DISABLED`.

Participant enrollment payment surfaces exist (`/api/public/forms/.../enrollment-payment` and
related UI) — do not claim "no Pay button / checkout does not exist."

---

## Subject scope — child branch of `schedule_assignments`

`schedule_assignments` is **subject-neutral** (`subject_type ∈ {child, staff}`). **This document
owns the child branch.** Staff presence/roster composition is owned by
[`../modules/attendance-system.md`](../modules/attendance-system.md). Commitment object mechanics
(`commitment_kind`, supersede-not-patch) are shared infrastructure.

---

## Downstream implications

| Domain | Reads from | Notes |
|--------|------------|-------|
| **Scheduling / attendance** | Committed placements + schedule assignments | Built; do not infer from lead location alone |
| **Billing / subsidy** | Person/customer contracts + Financials | No lead-location placement coupling; money authority stays Financials |
| **Staffing / ratio / capacity** | Room unit + program category + site | Use child site and room unit id |
| **Waitlist / placement_candidates** | Candidates + OCM proposal fields | Ranking grain = program-category **section** (below) |
| **Queues (child track)** | `process_instances` first | OCM queue fallback only when explicitly flagged |

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

So the writer obtains the list rather than deriving it. `loadWaitlistSectionOrder` asks the
orchestration path through `composeProvisioningAnswerForRoute` — the same projection the
work-unit surface uses — and reads the positions already stamped. It contains no ordering logic, which is the point: a
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
- Do not treat Tours booking, marketing consent, or Financials money movement as Placement-owned.
- Do not invent a second Tours context lane — Tours booking routes under Enrollment/Placement (D-02).

---

## Related docs

- `docs/platform/core/operational-truth-flow-doctrine.md` — truth-flow axis; this committed foundation is **L2 Operational Intent**
- `docs/system/field-model-convergence-doctrine.md` — field_definitions + option_source
- `docs/system/configuration-workspace-v1-doctrine.md` — operator configuration workspace
- `web/lib/fields/enrollmentPlacementDoctrine.ts` — code-level program model constants
