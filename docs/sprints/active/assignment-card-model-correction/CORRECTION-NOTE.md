---
owner: sprint
status: active
sprint: assignment-card-model-correction
slot: 6
staging_base: 8fa5697a3df724946eba8cdd4481fa6f6fe48fa1
last_reviewed: 2026-08-04
---

# Assignment Card Product Model Correction — Correction Note

**PR #321 in staging:** yes (`51f122539` ancestor of `8fa5697a3`)  
**Staging base:** `8fa5697a3df724946eba8cdd4481fa6f6fe48fa1`

## Product-model debt

Assignments (`scheduling`) presents five large sections — Family request / Proposed / Commercial / Committed / Readiness — via `buildAssignmentCardModel`, `AssignmentCardSections`, and `SchedulingCard`. Family-request facts are Assignment chrome; they belong as optional configurable Children enrollment fields. Desired Assignment = one org offer (site, program, room, schedule, start, tuition plan, estimate, quote, compact state/readiness).

## Correct infrastructure (leave untouched)

Participation persistence (`requested_days_per_week`, `weekdays`), `effectiveDateAuthority`, quote snapshot immutability + API, OA/schedule projection, readiness **evaluator** (`assignmentProposalReadiness`), LayoutDoc key `scheduling`, Household primary, Enrollment Date stamp.

## UI/model that must change

- `buildAssignmentCardModel.ts` (+ FromTruth) → offer-oriented public model
- `AssignmentCardSections.tsx` → coherent offer UI, no five panels
- `AssignmentProposalControls.tsx` → remove family-request editors; keep plan/quote near commercial fields
- `SchedulingCard.tsx` → wire new composition
- Children field catalog/placement → optional Requested Start / Days / Preferred Weekdays

## Tests to update

`buildAssignmentCardModel.test.ts`, presentation/readiness UI tests, Playwright evidence selectors for five sections. Keep authority/preflight/quote edge tests.

## Explicitly untouched

Start/Enrollment Date authority, quote immutability, primary-contact, ledger, LayoutDoc card-key rename, Firefly v129 force-edit unless QA requires draft layout.
