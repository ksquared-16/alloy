---
owner: sprint
status: active
sprint: assignment-card-model-correction
slot: 6
staging_base: 8fa5697a3df724946eba8cdd4481fa6f6fe48fa1
last_reviewed: 2026-08-04
---

# Assignment Card Product Model Correction — Handoff

## Environment

| Field | Value |
|-------|-------|
| Root | managed worktree `/Users/Kelly/Code/alloy-worktrees/wt6-assignment-card-model-correction` |
| Slot | 6 · port 3016 |
| Branch | `agent/cursor/6-assignment-card-model-correction` |
| Staging base | `8fa5697a3df724946eba8cdd4481fa6f6fe48fa1` (PR #321 merged) |
| Server | not required for unit certification |

## Model correction

Assignment card = org proposed/committed offer (site, program, room, schedule, start, tuition, estimate, quote) with compact state + readiness summary.

Family-request fields = optional Children placements via catalog + nested surface config.

## Files changed (core)

- `web/lib/enrollment/buildAssignmentCardModel.ts`
- `web/components/admin/focusPanel/cards/AssignmentCardSections.tsx`
- `web/components/admin/focusPanel/cards/AssignmentProposalControls.tsx`
- `web/components/admin/focusPanel/cards/SchedulingCard.tsx`
- `web/lib/layout/childcareLayoutFieldCatalog.ts`
- `web/lib/fields/consumerCanonicalProviderAssembly.ts`
- Children evidence / identity compose / mutation binding / edit state
- Tests + Playwright selectors
- `docs/platform/planning/assignment-proposed-commitment-authority.md`

## Tests

- `tests/enrollment/buildAssignmentCardModel.test.ts` — offer model
- `tests/enrollment/childrenEnrollmentFieldPlacement.test.ts` — optional placement
- Authority / readiness / preflight suites retained

## Deferrals

- Full browser screenshot matrix (before = prior sprint five-panel evidence) pending authenticated slot-6 server cert
- Do not force Firefly v129 Children field placements unless QA requests a draft layout
- Do not merge automatically — open PR when Kelly authorizes

## Explicitly untouched

Effective-date authority, quote immutability, primary-contact, ledger posting, readiness **enforcement**, LayoutDoc `scheduling` key.
