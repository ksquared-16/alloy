---
owner: platform
status: canonical
last_reviewed: 2026-08-04
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

## Assignments Focus Panel card (product model)

The Assignments card (`scheduling`) presents the **organization’s proposed or committed
operational offers** for a child as a **collection of independent service entries**
(core care, before/after care, enrichment, …). Each entry owns schedule, dates, commercial
terms, quote, proposal/commitment state, and compact readiness.

A child may have zero, one, or many entries. Do not collapse concurrent services into one
campus/program/room/schedule object.

**Family-request facts** (Requested Start, Requested Days per Week, Preferred Weekdays, and
other preferred enrollment preferences) are **child-enrollment fields**. They may appear on the
Children card when configured; they are not Assignment sections.

**Interest** (family expressed interest without an operational offer) is composed from its
canonical source — never stored as a third `commitment_kind` value.

**Readiness** is per assignment entry. Present required/missing state on offer fields and a
compact per-entry summary (e.g. “2 items required”); server-side preflight remains authoritative.
Incomplete add-on proposals must not block committing an unrelated enrollment-establishing
assignment unless process configuration explicitly aggregates them.

**Estimated tuition** is an attribute of each assignment proposal (near Tuition Plan). Quote
snapshots are scoped by `schedule_assignment_id` and remain immutable commercial artifacts —
not ledger truth. Regenerating one entry’s quote must not supersede another entry’s quote.

**Enrollment Start Date** derives only from committed assignments whose category/row
**establishes enrollment** (`establishesEnrollment` on assignment-type behavior, defaulting
from `primaryEligible` / primary rows). Enrichment and add-on commitments do not redefine it.

`commitment_kind` must **not** become a visible parallel lifecycle or duplicate status system;
use compact proposed/committed (and Interest outside that field) treatment only.

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
