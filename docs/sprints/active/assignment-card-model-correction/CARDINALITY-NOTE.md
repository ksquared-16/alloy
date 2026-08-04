---
owner: sprint
status: active
sprint: assignment-card-model-correction
slot: 6
staging_base_at_cardinality_pass: b6cb38f7b04458377ef2f8bbd92ea1a04c713c5c
last_reviewed: 2026-08-04
---

# Cardinality Correction Note — Multi-service Assignments

## Verdict

`schedule_assignments` + `operational_assignment_types` + `commitment_kind` already support concurrent services per child. Schema change is **not** required for cardinality. The Assignments offer card, readiness, and quote bag still collapse to one offer — that is the product-model debt.

## Already multi-row

- `schedule_assignments` (primary uniqueness is effective-dated overlap, not one-row-per-child)
- OA create/list/promote; Scheduling work-surface list; secondary create (`is_primary: false`)
- Scheduling projection current/proposed arrays
- Quote history array storage shape

## Collapses to one (correct)

- `buildAssignmentCardModel` via `primarySummary` → one field set
- Card `state` at child grain
- `AssignmentProposalControls` one tuition/quote
- Readiness one fact bag per child
- `tuition_plan_id` + active quote on process-instance metadata (supersede-all)
- Start Date considers any committed OA (no enrollment-establishing filter)

## Interest / Proposed / Committed

| Concept | Store |
|---------|--------|
| Interest | Child/participation facts or `assignment_interests` metadata — **not** `commitment_kind` |
| Proposed | `schedule_assignments.commitment_kind = proposed` |
| Committed | `commitment_kind = committed` (+ agreement) |

## Smallest durable correction

1. Multi-entry ViewModel + card collection UI (no five-section return)
2. Per-entry readiness from type behavior + row facts
3. Quote snapshots scoped by `schedule_assignment_id` (supersede same entry only)
4. `establishesEnrollment` on assignment-type behavior (default: `primaryEligible`)
5. Start Date resolver filters to enrollment-establishing committed rows
6. Keep Interest outside `commitment_kind`

## Explicitly untouched

Enrollment Date authority, ledger posting, placement one-home-room invariant, LayoutDoc `scheduling` key, primary-contact.
