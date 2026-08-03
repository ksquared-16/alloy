# Enrollment Assignment & Effective Dates — Durable Handoff

**Sprint:** enrollment-assignment-effective-dates  
**Finished:** 2026-08-03  
**Provider:** cursor · **Slot:** 3 · **Port:** 3013

## Environment

| Field | Value |
|-------|-------|
| Root class | managed-worktree |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt3-enrollment-assignment-effective-dates` |
| Branch | `agent/cursor/3-enrollment-assignment-effective-dates` |
| Staging base (exact) | `3195fae4a301e75cac43db934dcb163168e25674` |
| Final HEAD | `26dfe839ed0f436925c83578438fee89e7b9b30d` (run `git rev-parse HEAD` to confirm) |
| Ahead of staging | local only — **not pushed** |
| Server | toolkit-owned on 3013 when running; stop with finish |
| Auth | `qa-slot3-performance@example.com` storage present/valid |

## Authority decisions (accepted)

1. **Requested Start** = `process_instances.metadata.start_date` — never rewritten by commitment.
2. **Start Date** = earliest qualifying **committed** `schedule_assignments.start_date` (`effectiveDateAuthority`); agreement fallback only when no OA row. Canceled excluded; superseded retained for original Start Date; later room/schedule changes do not rewrite; `excluded_from_start_date` correction path.
3. **Enrollment Date** = process-instance stamp via configured paperwork-completion outcome target `stamp_enrollment_date`. `approve_enrollment` may invoke the same helper as **compat only** — does not own the meaning.
4. **`commitment_kind`** = proposed vs committed assignment state only — not a parallel lifecycle, not BP stage replacement, not duplicate Start Date authority.
5. **Requested days** = `requested_days_per_week` on participation metadata (1–7); preferred weekdays reuse existing `weekdays` draft key / SchedulingCard path.
6. **Quote** = immutable snapshot on PI metadata (`assignment_quote_snapshots`); not ledger.
7. **Household primary** = existing `patchHouseholdPrimaryContact` + confirm modal on Household card.

## Migrations

None added this sprint (reuse existing OA / participation / commercial tables).

## Key files

- `web/lib/enrollment/effectiveDateAuthority.ts`
- `web/lib/enrollment/assignmentProposalReadiness.ts`
- `web/lib/enrollment/assignmentQuoteSnapshot.ts` + `generateAssignmentQuote.ts`
- `web/lib/enrollment/stampEnrollmentDateOnProcessInstances.ts`
- `web/lib/enrollment/buildAssignmentCardModel.ts` + `FromTruth`
- `web/components/admin/focusPanel/cards/AssignmentCardSections.tsx`
- `web/components/admin/focusPanel/cards/AssignmentProposalControls.tsx`
- `web/app/api/admin/enrollment/assignment-quote/route.ts`
- Preflight: `lifecycleFieldRuleEvaluator.ts`, `loadRecordForEffectiveRequirements.ts` (PI overlay)
- Doctrine: `stage-membership-and-outcomes.md`, `assignment-proposed-commitment-authority.md`

## Tests

| Suite | Result |
|-------|--------|
| `tests/enrollment/*` + household Make primary | **53 passed** |
| `npm run typecheck` | **passed** (tsconfig.build.json) |
| Staging-base `focusPanelMutation.saveInquiryChild` event-count | **FAIL (pre-existing)** — still fails on exact staging SHA; not introduced here |
| Playwright evidence | Partial — authenticated `/workspace` screenshot captured; Focus Panel Assignments sections not opened in QA org (no row click / Thinking… load). Spec: `playwright/tests/enrollment-assignment-effective-dates-evidence.spec.ts` |

Evidence: `.alloy-agent-evidence/enrollment-assignment-effective-dates/`

## Browser / ops notes

- Worktree had **invalid `node_modules` symlink** to another worktree; replaced with worktree-local `npm install` (Vacilando rule).
- Dev server on 3013 is fragile under concurrent heavy `tsc` heap; restart with `alloy-dev-start` before UI QA.
- Full operator-path browser certification of all 13 scenarios requires a seeded enrollment lead in the QA org with multi-child + commercial rates — **not completed in this finish window**. Unit/server evaluator coverage certifies authority, preflight variants, quote immutability, Start Date edge cases, and Household wiring.

## Intentional deferrals

- Full “sent” quote lifecycle beyond generated / accepted / superseded snapshots
- Dedicated quote table (metadata snapshots are durable for V1)
- BOS slash adapter for make_primary / assignment quote
- Regenerating stale schema CSV
- Fixing pre-existing `focusPanelMutation` double-dispatch assert
- Exhaustive seeded browser matrix for all 13 scenarios (follow-up)

## Promotion guidance

1. Do **not** push until Kelly authorizes.
2. `alloy-sprint-finish 3` is currently **blocked** by Vacilando durability (HEAD not on origin). After Kelly authorizes:  
   `git -C …/wt3-enrollment-assignment-effective-dates push -u origin agent/cursor/3-enrollment-assignment-effective-dates`  
   then re-run `alloy-sprint-finish 3`.
3. Staging has moved **2 commits** past the original base since sprint start (`behind 2` at finish attempt). Reconcile only when Kelly asks (`alloy-worktree-sync` when clean, or explicit merge).
4. PR into `staging` once authorized; then finish the slot.

## Exact next action

**Kelly:** authorize `git push -u origin agent/cursor/3-enrollment-assignment-effective-dates` when ready for remote durability / review, or review locally on slot 3 first (`alloy-dev-start wt3-enrollment-assignment-effective-dates` → `http://localhost:3013`) with a seeded Enrollment lead.
