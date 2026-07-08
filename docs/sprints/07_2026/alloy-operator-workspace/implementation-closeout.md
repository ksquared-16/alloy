# Current Work Implementation Closeout

**Date:** July 2026  
**Scope:** Current Work V1-complete operational surface

---

## Summary

Current Work is a **work-owning Focus Panel surface** with Summary → Focus → completion inside Focus. V1 is **config-driven** from stage operating plans and the action registry — no parallel runtime or enrollment hardcoding in the card.

---

## V1-complete (this pass)

| Capability | Implementation |
|------------|----------------|
| **Config-driven projection** | `projectCurrentWork` from `stageWorkRuntime` + `recordHeaderActions` |
| **Supporting actions in Focus** | `deriveCurrentWorkSupportingActions` → registry `record_header` primary/secondary/header; invokes via `invokeHeaderAction` |
| **Right rail demotion** | `filterRightRailActionsForCurrentWork` when Current Work owns completion |
| **Contact outcome trace** | `recordStageWorkContactOutcomeTrace` on `completeStageWorkWithOutcome` for `follow_up` work definitions |
| **Completion UX polish** | Outcome row consistency, `Continue … work` copy, Back navigation, subtle Open work pill |
| **QA orphan reconciliation** | `reconcileOrphanedStageWorkForOpportunity` + dev script (local only) |
| **Playwright journey** | `playwright/tests/current-work-journey.spec.ts` (`PLAYWRIGHT_CURRENT_WORK=1`) |

---

## Action ownership (V1)

| Surface | Role |
|---------|------|
| **Current Work primary** | Outcome completion (`Record what happened` → picker answers **What happened?**) |
| **Current Work checklist** | Operational handoffs (Communications, Household, Children, Documents) |
| **Current Work supporting** | Registry secondary/assist actions (schedule tour, send form, ask BOS, message) |
| **Manage** | Administrative overflow (archive, merge, export) — `record_header.overflow` |
| **Right rail** | Secondary assist when Current Work does not own completion; demoted when it does |
| **BOS** | Assist only — does not bypass outcome completion |

---

## Communications outcome behavior (V1)

When a non-closing outcome is applied to work whose platform definition category is **`follow_up`**:

1. `workflow_events.stage_work_outcome_recorded` is emitted with `communication_trace: true`
2. Opportunity metadata records `last_contact_attempt_at`, `last_contact_outcome_key`
3. Open work task metadata records `communication_trace_event_id`

Detection uses **work definition category** from the operating-plan template — not enrollment-specific outcome keys.

---

## True P2 (not V1)

- BOS contextual chips inside Current Work Focus
- Production operating-plan publish reconciliation on plan save/publish
- Full communications composer integration for every contact outcome (draft/send before complete)
- Playwright CI gate without `PLAYWRIGHT_CURRENT_WORK=1` env (needs stable test org fixtures)

---

## Tests

```bash
cd web && npm run test -- \
  tests/adminV2/runtime/projectCurrentWork.test.ts \
  tests/adminV2/runtime/deriveCurrentWorkSupportingActions.test.ts \
  tests/adminV2/runtime/filterRightRailActionsForCurrentWork.test.ts \
  tests/adminV2/runtime/currentWorkPolish.test.tsx \
  tests/lifecycle/recordStageWorkContactOutcomeTrace.test.ts \
  tests/lifecycle/reconcileOrphanedStageWork.test.ts

# Live journey (requires auth + dev server)
PLAYWRIGHT_CURRENT_WORK=1 npm run test:playwright-current-work
```

---

## Status

**V1-complete — ready for staging.**

**CTA doctrine:** Work title names the work (template label, e.g. Contact Family). Primary completion CTA is always **`Record what happened`**; the outcome picker eyebrow answers **What happened?**
