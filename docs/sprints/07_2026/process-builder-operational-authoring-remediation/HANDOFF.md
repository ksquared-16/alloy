# Process Builder V2 — Operational Authoring Remediation — Handoff

**Date:** 2026-07-15  
**Worktree:** `/Users/Kelly/.cursor/worktrees/Alloy/i6xq`  
**Branch:** `fix/process-builder-operational-authoring-remediation`  
**Base:** latest `origin/staging` (includes PR #212 Process Stage operating contract)  
**Policy:** Local only — **do not push / open PR / merge** until product approval.

---

## What changed (product surface)

1. **Outcome Definitions moved into Work Template authoring**  
   Operators configure Available Outcomes → Outcome Definitions → Automation while editing a Work Template. Stage-level Outcome Definitions section removed from the operating plan page. Persistence remains stage-level (`outcomes` / `outcome_rules`).

2. **Execution Mode labels**  
   `Direct Action` vs `Outcome Led` (Primary Action absent when Outcome Led).

3. **Follow-up timing**  
   Immediately / Before / After + value + unit (`minutes` | `hours` | `days` | `weeks` | `months`). Add button beside “Create follow-up work”.

4. **Attention timing**  
   Same timing model; multiple attention items with Add beside “Create attention”.

5. **Outgoing transitions / no Close Record / Available Outcomes terminology**  
   Retained/confirmed from prior sprint; no free-text closed status field in Outcome UI.

---

## Validation run locally

```bash
cd web
npm run test -- \
  tests/lifecycle/processStageOperatingContract.test.ts \
  tests/lifecycle/lifecycleStageWorkTemplateActionsEditor.test.ts \
  tests/lifecycle/stageOutcomeAutomationQa.test.ts \
  tests/lifecycle/stageOperatingPlanV1.test.ts \
  tests/lifecycle/executeStageOperatingOutcome.test.ts \
  tests/lifecycle/stageOperatingPlanConvergence.test.ts \
  tests/adminV2/runtime/currentWorkFocusWorkspace.test.tsx \
  tests/adminV2/runtime/currentWorkOperationalSurface.test.ts
# → 103 passed

npm run typecheck          # pass
npm run typecheck:tests    # pass
```

---

## Browser evidence

`evidence/` is empty — manual screenshots still required before product sign-off:

1. Work Template → Outcome Led Conduct Tour + Outcome Definitions inline  
2. Follow-up timing with hours/weeks  
3. Attention timing with Add beside label  
4. Lead Direct Action + Lead → Tour transition  
5. Billing (industry-neutral)  
6. Save / reload / Current Work reflects execution mode  

---

## Remaining product questions

1. Promote Tour/Lead/Decision proof fixtures into `defaultEnrollmentStageOperatingPlans.ts`?  
2. Enrolling auto-create “Send Enrollment Packet” on stage entry — not authored in this remediation (needs entry automation / Enrolling proof plan).  
3. Stage-level Attention Rules section still uses “Days threshold” — only outcome-behavior attention got value+unit. Should stage rules share the same scheduler UI?  
4. When an outcome is removed from one Work Template but shared with another, definition is retained — OK?  
5. Canonical doctrine docs were updated in PR #212; this remediation is UI/ownership — any further doctrine writes?

---

## Key files

| Area | Path |
|------|------|
| Due policy units + timing UI helpers | `web/lib/lifecycle/stageFollowUpWorkDuePolicy.ts` |
| Attention items in composable behavior | `web/lib/lifecycle/stageOutcomeAutomation.ts` |
| Outcome behavior editor | `LifecycleStageOutcomeBehaviorEditor.tsx` |
| Scoped outcome definitions | `LifecycleStageOutcomeDefinitionsEditor.tsx` |
| Work Template surface | `LifecycleStageWorkTemplateActionsEditor.tsx` |
| Operating plan shell | `LifecycleStageOperatingPlanEditor.tsx` |
