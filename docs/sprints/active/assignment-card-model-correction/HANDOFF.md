---
owner: sprint
status: active
sprint: assignment-card-model-correction
slot: 6
staging_base: b6cb38f7b04458377ef2f8bbd92ea1a04c713c5c
last_reviewed: 2026-08-04
---

# Assignment Card Product Model Correction — Handoff

## Environment

| Field | Value |
|-------|-------|
| Slot | 6 · port 3016 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt6-assignment-card-model-correction` |
| Branch | `agent/cursor/6-assignment-card-model-correction` |
| Staging base (cardinality pass) | `b6cb38f7b` (merged into branch) |

## Product model

1. **Offer correction** — Assignment = org offer, not five-section report; family request on Children.
2. **Cardinality** — Assignment = collection of independent service entries (Preschool + Before Care + Soccer Shots). Ledger already multi-row; card/quotes/readiness/Start Date corrected.

## Key invariants

- Interest ∉ `commitment_kind`
- Quotes scoped by `schedule_assignment_id`
- Enrollment Start only from enrollment-establishing committed rows (`establishesEnrollment` / primary)
- Per-entry readiness; add-ons do not block core commit by default

## Files (cardinality pass)

- `buildAssignmentCardModel.ts` / `FromTruth.ts` — multi-entry
- `AssignmentCardSections.tsx` — collection UI
- `assignmentQuoteSnapshot.ts` / quote API — per-entry scope
- `effectiveDateAuthority.ts` + `assignmentTypeBehavior.ts` — establishesEnrollment
- Tests updated; Playwright selectors for collection

## Validation

- Unit suites green (cardinality + quotes + dates + Children placement)
- `typecheck` / `typecheck:tests` green

## Browser cert

Run authenticated multi-child matrix on port 3016 before PR. Evidence dir: sprint active folder / `.alloy-agent-evidence`.

## Do not merge automatically

Return PR-ready after browser cert; Kelly authorizes PR creation.
