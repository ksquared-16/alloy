# Process Builder V2 — Operational Authoring — Engineer Handoff

**Date:** 2026-07-15  
**Worktree:** `/Users/Kelly/.cursor/worktrees/Alloy/i6xq`  
**Branch:** `fix/process-stage-operating-contract`  
**Policy:** Local only — **do not push, open PR, or merge** until product approval.

Companion branch (separate deliverable, not this sprint): `fix/current-work-workspace-product-remediation`

---

## Executive summary

This sprint retargeted work from **Current Work visual remediation** to **Process Builder operational authoring**. The goal: operators configuring a Business Process should never wonder where transitions, outcomes, statuses, or execution modes come from.

**Code and unit tests are largely complete.** What remains is **product review**, **manual browser evidence**, and a few **doctrine decisions** (listed below). No Playwright evidence harness was kept — the next engineer should capture screenshots manually or add a harness only if product requests it.

---

## Local commits (read in order)

All commits are on `fix/process-stage-operating-contract`. After pulling this branch locally, `git log --oneline 8a371ac9a..HEAD` shows the full sprint stack.

| Commit | Summary |
|--------|---------|
| `4afbd38bc` | Optional Primary Action; `direct_action` vs `outcome_led` execution modes |
| `e06c3ad63` | Bind outcome transitions and close behavior to canonical status configuration |
| `96b384d39` | Converge Process Builder outcome authoring and operating-contract validation |
| `c7c25819a` | Add Process Stage operating-contract certification tests and proof fixtures |
| `8fbce8026` | Fix Current Work VM test types for execution-mode contract |
| `e7c2ea2bc` | **Stage-owned outgoing transitions** + composable outcome automation + runtime transition identity |
| `4ebf71b54` | **Recomposed editors**: Outgoing Transitions, Outcome Definitions, Outcome Behavior |
| *(pending)* | Save-flow fix, doctrine docs, this handoff document |

> **Start here after checkout:** `e7c2ea2bc` + `4ebf71b54` for the V2 authoring model; `c7c25819a` for certification fixtures/tests.

---

## Ownership model delivered

```
Business Process
  └── Stage
        ├── outgoing transitions (first-class objects)
        ├── outcome definitions (stage-level)
        ├── work templates
        └── attention rules

Work Template
  ├── title, purpose, requirements
  ├── execution mode: Direct Action | Outcome Led
  ├── optional Primary Action (absent when Outcome Led)
  ├── helpful actions
  └── available outcomes (refs to stage definitions)

Outcome
  ├── what happened (+ optional complete current work)
  └── composable after-recording automation

Transition
  ├── source / destination / label / availability
  ├── transition_ref (runtime identity — not destination text)
  ├── resulting status (canonical selector only)
  └── close semantics (derived from configured closed status)
```

**Removed from operator UI:** separate Close Record behavior, Available Results terminology, raw closed-status text fields.

---

## Key files

### Schema & persistence

| File | Role |
|------|------|
| `web/lib/lifecycle/stageOperatingPlanV1.ts` | `StageOutgoingTransitionV1`, optional `outgoing_transitions[]` |
| `web/lib/lifecycle/stageOperatingPlanEditorModel.ts` | Draft/persist; `outgoing_transitions` optional for legacy compat |
| `web/lib/lifecycle/stageOutcomeAutomation.ts` | Composable behavior read/write (`readComposableOutcomeBehaviorDraft`, `upsertComposableOutcomeBehavior`) |
| `web/lib/lifecycle/validateStageOperatingPlanOperatingContract.ts` | Save-time operating contract validation |

### Runtime

| File | Role |
|------|------|
| `web/lib/lifecycle/resolveStageTransitionExecutionTargets.ts` | Resolve `move_to_stage` by `transition_ref` |
| `web/lib/lifecycle/executeStageOperatingOutcome.ts` | Executes outcomes through transition identity |
| `web/lib/lifecycle/resolveOutgoingProcessTransitions.ts` | Prefers explicit `outgoing_transitions`; legacy fallback when absent |
| `web/lib/lifecycle/resolveStageOutcomeTransitionOptions.ts` | Transition options for outcome behavior editor |

### Process Builder UI

| File | Role |
|------|------|
| `LifecycleStageOutgoingTransitionsEditor.tsx` | **Outgoing Transitions** (`Lead → Tour` summaries) |
| `LifecycleStageOutcomeDefinitionsEditor.tsx` | **Outcome Definitions** + complete-work checkbox |
| `LifecycleStageOutcomeBehaviorEditor.tsx` | Composable after-recording (stay/move, follow-up work, attention) |
| `LifecycleStageOperatingPlanEditor.tsx` | Wires editors; work-template section unchanged in spirit |
| `LifecycleStageWorkTemplateActionsEditor.tsx` | Execution mode, optional primary, Available Outcomes |
| `LifecycleActivationBoard.tsx` | Stage save — validation errors no longer leave UI stuck at "saving" |

**Deleted:** `LifecycleStageOutcomeAutomationEditor.tsx`

### Certification fixtures & tests

| File | Role |
|------|------|
| `web/lib/lifecycle/fixtures/processStageOperatingContractProofPlans.ts` | Tour, Lead, Decision, Billing proof plans |
| `web/tests/lifecycle/processStageOperatingContract.test.ts` | Primary certification suite (~25+ cases) |

### Current Work (minimal contract only — not visual polish)

| File | Role |
|------|------|
| `web/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkExecutionVM.ts` | `executionMode`, `prominentCta` on surface VM |
| `web/components/admin/focusPanel/cards/CurrentWorkWorkspace.tsx` | Outcome-led prominence (`data-execution-mode`, `data-outcome-prominence`) |
| `web/tests/adminV2/runtime/currentWorkFocusWorkspace.test.tsx` | Outcome-led render contract test |

---

## Validation (already run — re-run before product demo)

From `web/`:

```bash
# Focused certification (passed: 110 tests across 10 files)
npm run test -- \
  tests/lifecycle/processStageOperatingContract.test.ts \
  tests/lifecycle/stageOperatingPlanV1.test.ts \
  tests/lifecycle/executeStageOperatingOutcome.test.ts \
  tests/lifecycle/lifecycleStageWorkTemplateActionsEditor.test.ts \
  tests/lifecycle/stageOutcomeAutomationQa.test.ts \
  tests/lifecycle/stageOperatingPlanConvergence.test.ts \
  tests/lifecycle/resolveWorkTemplateActionOptions.test.ts \
  tests/adminV2/runtime/currentWorkOperationalSurface.test.ts \
  tests/adminV2/runtime/workTemplateCurrentWorkRuntime.test.ts \
  tests/adminV2/runtime/currentWorkFocusWorkspace.test.tsx

# TypeScript (serialize machine-wide — one tsc at a time)
npm run workspace:processes -- --kind=tsc
npm run typecheck
npm run typecheck:tests
```

**Note:** Machine had high swap pressure during this sprint. Run `npm run workspace:doctor` before heavy validation.

---

## What is NOT done (next engineer)

### 1. Browser evidence (required for product review)

`docs/sprints/07_2026/process-stage-operating-contract/evidence/` is **empty**.

Manual QA path:

1. `cd web && npm run dev`
2. `/settings/processes` → Enrollment → Stages
3. Capture for **Tour**, **Lead**, and **Billing** (or nearest billing-neutral process):
   - Outgoing Transitions editor
   - Outcome Definitions + composable behavior
   - Work Template: Outcome Led (Tour) vs Direct Action (Lead/Billing)
   - Save with valid config (no contract issues banner)
4. Open a live record → Current Work → confirm outcome-led prominence on Tour-style work

**No Playwright harness is checked in** — product explicitly declined an automated evidence test.

### 2. Promote proof plans to live defaults (doctrine decision)

`processStageOperatingContractProofPlans.ts` has the canonical Tour reference. `defaultEnrollmentStageOperatingPlans.ts` was **not** updated. Decide whether Tour proof becomes tenant defaults or stays certification-only.

### 3. Legacy path deprecation

`stageOutcomeAutomation.ts` still supports legacy `close_record` and enrollment default status paths for old plans. When `outgoing_transitions` is authored, validation blocks conflicting legacy close/status on save — but runtime legacy paths remain for unmigrated data.

### 4. Follow-up scheduling UI gap

`missing_anchor_behavior` exists in `stageFollowUpWorkDuePolicy.ts` but has no first-class editor control.

### 5. Transition `transition_ref` visibility

Currently system-generated and stable; not operator-editable in UI. Product should confirm.

### 6. Canonical docs updated in-branch

These were modified despite sprint note originally saying not to update canonical doctrine. Product must approve or revert:

- `docs/platform/core/business-process-system.md`
- `docs/platform/modules/configuration-platform.md`
- `docs/system/operating-plan-runtime-doctrine.md`

---

## Doctrine questions for product (blockers before merge)

1. Promote Tour proof into `defaultEnrollmentStageOperatingPlans.ts`, or keep as certification fixtures only?
2. When to fully deprecate legacy outcome-level `close_record` (transition-owned close is the V2 model)?
3. Approve canonical doc updates in this branch, or revert and distill into sprint docs only?
4. Should `transition_ref` remain hidden/system-generated, or become operator-visible?
5. Should `missing_anchor_behavior` get a follow-up scheduling UI control?
6. Current Work prominence styling: this branch vs companion `fix/current-work-workspace-product-remediation` — split PR strategy?

---

## Tour reference configuration (certification fixture)

From `tourConductTourProofPlan()`:

- **Conduct Tour:** Outcome Led, no Primary Action
- **Helpful Actions:** Schedule Tour, Send Confirmation, Send Reminder, etc.
- **Available Outcomes:** Tour Scheduled, Tour Completed, No Show, Needs Follow-up, Family Declined, No Availability
- **Transitions:** `tour_to_decision`, `tour_to_closed_lost`, `tour_to_waitlist`
- Each outcome maps to composable automation (complete work + move + follow-up work examples in fixture)

Lead = Direct Action (Contact Family). Decision = Outcome Led. Billing = Direct Action, industry-neutral, empty transitions.

---

## Quick start for next engineer

```bash
cd /Users/Kelly/.cursor/worktrees/Alloy/i6xq   # or your clone of this branch
git checkout fix/process-stage-operating-contract
git log --oneline -8

cd web
npm run workspace:doctor
npm run test -- tests/lifecycle/processStageOperatingContract.test.ts
npm run typecheck
```

Read in order:

1. This file
2. `docs/sprints/07_2026/process-stage-operating-contract/README.md`
3. `docs/sprints/07_2026/process-stage-operating-contract/certification-checklist.md`
4. `web/tests/lifecycle/processStageOperatingContract.test.ts` (acceptance spec as code)

---

## Suggested commit message (final local commit)

```
Document Process Stage operating-contract handoff and fix stage save validation.

Wrap save draft assembly in try/catch so operating-contract validation errors
surface without leaving the stage editor stuck saving; update platform doctrine
and sprint certification docs for product review.
```

---

## Return package for product review

When ready to return (still local only):

- [ ] Screenshots in `evidence/`
- [ ] Re-run validation commands above
- [ ] Confirm doctrine questions answered
- [ ] List of local commits (`git log --oneline 8a371ac9a..HEAD`)
- [ ] Do **not** push until explicit approval
