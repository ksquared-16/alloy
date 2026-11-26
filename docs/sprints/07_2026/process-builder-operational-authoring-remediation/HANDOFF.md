# Process Builder V2 — Operational Authoring Remediation — Handoff

**Date:** 2026-07-15  
**Worktree:** `/Users/Kelly/.cursor/worktrees/Alloy/i6xq`  
**Branch:** `fix/process-builder-operational-authoring-remediation`  
**Policy:** Local only — **do not push / open PR / merge** until product approval after browser certification.

---

## Implemented (this continuation)

1. **Canonical enrollment defaults promoted** — Lead (Direct Action Contact Family), Tour (Outcome Led Conduct Tour), Decision (Outcome Led + Family Enrolling → Enrolling), Enrolling (Send Enrollment Packet stage-entry Direct Action). Tenant-authored plans remain preserved via `operatingPlanSeedDecision` (`preserve` when saved plan exists).

2. **Stage-entry work after transitions** — `spawnDestinationStageEntryWork` runs after successful `move_to_stage`. Destination primary (or first required) template is instantiated with existing idempotent `instantiateStageWorkFromTemplate`. Terminal/workless stages skip. No Enrolling hardcoding.

3. **Stage Attention elapsed-time duration** — shared value + unit (`minutes`…`months`) via `threshold_duration`; legacy day thresholds normalize on load; non-time rules (e.g. missing requirements, attempt count) show no duration control.

4. **Shared Outcome Definition ownership** — Remove from Work Template unlinks refs only; Delete definition is a separate protected action that blocks while other Work Templates still reference it.

5. **Empty evidence commit removed** from tip history (soft-reset). Browser certification still required — see evidence index.

---

## Browser product QA

**Not completed in this session** (operator chose to skip live UI verification).  
See `evidence/EVIDENCE_INDEX.md` — do not mark product-ready until screenshots exist for the Decision → Enrolling → Send Enrollment Packet Current Work flow.

---

## Validation (automated)

Focused suites for defaults, stage-entry spawn, attention duration, outcome ownership, Process Stage operating contract, Current Work fixtures: **passing**.  
Run `npm run typecheck` / `npm run typecheck:tests` before any promotion.

---

## Key files

| Area | Path |
|------|------|
| Enrollment defaults | `web/lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts` |
| Stage-entry spawn | `web/lib/lifecycle/spawnDestinationStageEntryWork.ts` |
| Transition hook | `web/lib/lifecycle/stageOutcomeRuleTargetExecutor.ts` (`move_to_stage`) |
| Attention duration | `web/lib/lifecycle/stageAttentionThresholdDuration.ts` + catalog + editor |
| Outcome ownership UI | `LifecycleStageOutcomeDefinitionsEditor.tsx` |
