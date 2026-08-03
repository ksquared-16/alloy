---
owner: platform
status: active
last_reviewed: 2026-07-26
supersedes: []
---

# Assignment commitment authority — proposed vs committed

**Guardrail:** `commitment_kind` distinguishes **proposal vs committed assignment state on a
schedule_assignments row**. It must **not** become a parallel lifecycle, a replacement for
Business Process stage/outcome state, a duplicate Start Date authority, or a generic status
field. Committed operational truth remains the agreement + placement + schedule-assignment
trio; Start Date resolves from the first qualifying **committed** assignment via
`lib/enrollment/effectiveDateAuthority.ts`.

## Operator vocabulary

| Internal | Operator-facing |
|----------|-----------------|
| `assignment_type` / `operational_assignment_types` | Assignment Kind |
| `commitment_kind = proposed` | Planned / Proposed Assignment |
| `commitment_kind = committed` | Active / Upcoming Assignment (agreement-backed) |

## Authority XOR (child subjects)

Exactly one authority anchor per child assignment row:

| Kind | Required | Forbidden |
|------|----------|-----------|
| **proposed** | `customer_member_id`, `site_location_id` | `enrollment_agreement_id` |
| **committed** | `customer_member_id`, `enrollment_agreement_id`, `site_location_id` | — |

Staff subjects unchanged: `subject_person_id` + `site_location_id`; no agreement; `commitment_kind = committed`.

Integrity is owned by `schedule_assignments_subject_shape_check` (updated in `20260726190000_assignment_commitment_kind_v1.sql`).

## Effects

| Surface | Proposed | Committed |
|---------|----------|-----------|
| Assignments list / Workspace roster | Visible, labeled Proposed | Visible as operational truth |
| Attendance / ratio reporting truth | Excluded | Included when status operational |
| Billing participation | Never treated as billed | Eligible per Purpose |
| Forecast / capacity planning | May contribute as forecast | Operational counts |
| Primary uniqueness | Soft planning only (no hard primary overlap with committed) | Effective-dated primary overlap trigger |

## Promotion

Command: `assignment.promote_proposed`

- Requires a live enrollment agreement for the same `customer_member_id` (+ org).
- Sets `enrollment_agreement_id`, `commitment_kind = committed`.
- Preserves purpose, pattern, room, program, effective dates when still valid.
- Refuses duplicate committed primary windows.
- Writes provenance in `metadata.promoted_from_proposed_at` / audit via action execute.
- History: projection treats pre-promotion window as planned; post as committed (same row id — no duplicate commitment).

## Projection

- List child assignments by `customer_member_id` (covers proposed + committed).
- Child status may remain `proposed` when only proposed rows exist.
- Metrics must not count proposed rows as active attendance.

## Why not a parallel store

One `schedule_assignments` ledger + one create/list/promote command surface keeps Focus Panel, Workspace, and Operational Calculations on a single runtime.
