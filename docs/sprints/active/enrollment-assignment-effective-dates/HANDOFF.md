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
| Staging base (exact) | `86c34f13ae5b8f10298a359c992efe9ab5fee701` |
| Final HEAD | `4ad9e32fac6cb0c8ab5b5a2b6ba4472a07e9564c` |
| Remote durability | Branch pushed to `origin`; local HEAD must equal remote HEAD at finish |
| Server | toolkit-owned on 3013 when running; stop with finish |
| Auth | `qa-slot3-performance@example.com` storage present/valid |
| Seeded family | Kurzman `df771481-841f-4329-b7bb-c0a03d9fb621` |

## Configuration root cause (Classification **A**)

Firefly’s published Enrollment Focus Panel Summary **v128** set Assignments (`scheduling`) to **Linked** and omitted it from `metadata.focusPanelLayout.grid.areas`. The published LayoutDoc correctly overrode code defaults (which already mark Assignments **visible**). This is a **tenant published-configuration** issue, not a runtime materialization defect and not a broken enrollment preset.

| | Version / id |
|--|--|
| Before | published **v128** `6bf3b8d6-94f8-4dd3-9c51-4dae96ad9dff` — scheduling `linked` |
| After | published **v129** `a7ec300e-cbe2-451d-b4fe-c7e47e3f2afc` — scheduling `visible` + grid area |

Repair used the canonical admin entity-layouts duplicate → PATCH draft → publish path. No Firefly-only runtime bypass. Other tenants: Surfaces → Enrollment Focus Panel Summary → Assignments Visible → place → Publish.

Evidence: `.alloy-agent-evidence/enrollment-assignment-effective-dates/config/ROOT-CAUSE.md`

## Authority decisions (accepted)

1. **Requested Start** = `process_instances.metadata.start_date` — never rewritten by commitment.
2. **Start Date** = earliest qualifying **committed** `schedule_assignments.start_date` (`effectiveDateAuthority`); agreement fallback only when no OA row.
3. **Enrollment Date** = process-instance stamp via configured paperwork-completion outcome target `stamp_enrollment_date`.
4. **`commitment_kind`** = proposed vs committed assignment state only.
5. **Requested days** = `requested_days_per_week` on participation metadata (1–7); preferred weekdays reuse `weekdays`.
6. **Quote** = immutable snapshot on PI metadata (`assignment_quote_snapshots`); not ledger.
7. **Household primary** = `patchHouseholdPrimaryContact` / `PATCH …/household-primary-contact`.

## Migrations

None added this sprint.

## Key files

- `web/lib/enrollment/effectiveDateAuthority.ts`
- `web/lib/enrollment/assignmentProposalReadiness.ts`
- `web/lib/enrollment/assignmentQuoteSnapshot.ts` + `generateAssignmentQuote.ts`
- `web/lib/enrollment/stampEnrollmentDateOnProcessInstances.ts`
- `web/lib/enrollment/buildAssignmentCardModel.ts` + `FromTruth`
- `web/components/admin/focusPanel/cards/AssignmentCardSections.tsx`
- `web/components/admin/focusPanel/cards/AssignmentProposalControls.tsx`
- `web/app/api/admin/enrollment/assignment-quote/route.ts`
- Preflight: `lifecycleFieldRuleEvaluator.ts`, `loadRecordForEffectiveRequirements.ts`
- Doctrine: `stage-membership-and-outcomes.md`, `assignment-proposed-commitment-authority.md`
- Playwright: `web/playwright/tests/enrollment-assignment-effective-dates-evidence.spec.ts`

## Automated results

| Suite | Result |
|-------|--------|
| `tests/enrollment/*` + household Make primary | **53 passed** |
| Focus Panel default/visibility tests | **14 passed** |
| `npm run typecheck` | **passed** |
| `HouseholdCardVerify` stub (prior Vercel fail) | present; in `tsconfig.build.json` graph |
| Full `next build` on cert host | aborted under memory pressure (~300MB free); type graph certified |
| Staging-base `saveInquiryChild` event-count | **FAIL (pre-existing)** |

## Browser matrix

**20/20 pass** on Kurzman after v129 publish. See evidence `browser/browser-matrix.json` and `TEST-NOTES.md`.

Deferral / observation: Focus Panel Household **summary** shows only the current primary adult (Kristi after flip); secondary (Kelly) remains linked at customer/API layer (`previous_primary_person_id`) but Make primary control is not painted without a visible secondary region. Not required to block promotion of the assignment work.

## Intentional deferrals

- Full “sent” quote lifecycle beyond generated / accepted / superseded snapshots
- Dedicated quote table (metadata snapshots are durable for V1)
- BOS slash adapter for make_primary / assignment quote
- Regenerating stale schema CSV
- Fixing pre-existing `focusPanelMutation` double-dispatch assert
- Focus Panel Household secondary-adult summary composition (Kristi/Kelly both visible + Make primary chrome)
- Host-local full `next build` under memory pressure (CI/Vercel remains the production build gate)

## Promotion guidance

1. **Do not merge to staging** until Kelly authorizes.
2. Branch is pushed for remote durability; re-run `alloy-sprint-finish 3` after local=remote HEAD and clean tree.
3. If `origin/staging` moved past `86c34f13a`, use managed sync before PR.
4. PR into `staging` only when Kelly asks.

## Exact next action

**Kelly:** review evidence + matrix on slot 3, then authorize PR/merge to staging when ready.
