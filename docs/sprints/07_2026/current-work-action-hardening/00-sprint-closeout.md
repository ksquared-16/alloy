# Current Work + Action System Hardening — Sprint Closeout

**Sprint:** July 2026  
**Branch:** `cursor/dea30cea` (worktree)  
**Baseline:** Current Work V1 merged to staging (PR #95)

---

## Sprint goals (status)

| # | Goal | Status |
|---|------|--------|
| 1 | Harden Current Work (Summary, Focus, completion, handoffs, queue, empty states) | **In progress** — awaiting QA screenshots / product feedback |
| 2 | Audit Action System entry points | **Complete** — see [action-system.md](../../platform/operator/action-system.md) |
| 3 | Action Registry alignment | **Partial** — category-backed CW policy; full resolver unification deferred |
| 4 | Cross-domain readiness | **Partial** — policy generalized; domain action seeds pending |
| 5 | Documentation | **Complete** — canonical action-system doc + alignment docs updated |
| 6 | Refactoring | **Partial** — centralized CW action policy module |

---

## What changed (this session)

### Code

| File | Change |
|------|--------|
| `web/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy.ts` | **New** — cross-domain action competition policy using canonical categories |
| `web/lib/adminV2/runtime/focusPanel/currentWork/deriveCurrentWorkSupportingActions.ts` | Refactored to use shared policy (replaces inline enrollment key sets) |
| `web/lib/adminV2/runtime/focusPanel/currentWork/filterRightRailActionsForCurrentWork.ts` | Refactored to use shared policy |
| `web/tests/adminV2/runtime/currentWorkActionSurfacePolicy.test.ts` | **New** — policy unit tests |

### Documentation

| File | Change |
|------|--------|
| `docs/platform/operator/action-system.md` | **New** — canonical Action System inventory and doctrine |
| `docs/sprints/07_2026/current-work-action-hardening/00-sprint-closeout.md` | This closeout |

---

## What was simplified

1. **Single policy module** for Current Work action competition — was duplicated inline key sets in two files  
2. **Category-backed demotion** — `status_lifecycle` and `communication` categories replace per-key enrollment lists for rail/supporting filters (cross-domain)  
3. **Documentation consolidation** — one canonical operator doc for action inventory; prior sprint audits referenced as historical  

---

## Architecture audit summary

### Ownership model (confirmed)

```
Current Work  →  operational progression (stage-work runtime)
Actions       →  execution layer (registry + placements)
Manage        →  administrative catalog slice (overflow slot)
Right rail    →  assistive inventory (demoted when CW owns completion)
BOS           →  assist only (no outcome bypass)
```

### Duplication identified (not yet removed)

| Issue | Location | Phase 2 action |
|-------|----------|----------------|
| Dual drawer stacks | VM path + `AdminEntityDrawerLegacy` | Converge on VM path per drawer sunset roadmap |
| `record_header` triple consume | Manage, supporting, handoff | Single resolver with surface projections |
| Queue actions on V2 rows | `CondensedQueueRow` has no rail | Wire registry `queue_row` placements |
| Legacy manage stubs | `buildRecordManageMenuForEntity` | Registry-backed for person/child drawers |
| Three execute paths | execute, enrollment-status, relationship | Consolidate through `runRegisteredAction` |

### Config vs runtime (confirmed aligned)

- Current Work title/checklist/outcomes: **stage operating plan** — not hardcoded  
- Supporting actions: **DB `record_header`** + policy filter  
- Manage: **same resolve**, overflow slot for admin  
- Completion: **stage-work runtime** — intentionally outside action registry  

---

## What remains (needs QA input)

Awaiting source-of-truth from product:

- [ ] Summary polish issues (spacing, copy, empty states)  
- [ ] Focus completion flow edge cases  
- [ ] Communications handoff verification per outcome type  
- [ ] Queue projection empty/hold states  
- [ ] Browser QA pass on staging with real org data  

### Known code gaps (no QA required)

- Presentation V2 `CondensedQueueRow` — queue registry actions not wired  
- Operating-plan publish reconciliation — dev script only  
- BOS Focus contextual chips — P2  
- Legacy enrollment manage keys in policy module — remove when overflow placement is universal  

---

## Phase 2 recommendations

1. **Operating-plan publish reconciliation** — run `reconcileOrphanedStageWorkForOpportunity` on plan publish  
2. **Queue row actions on Presentation V2** — hydrate `queue_row` placements on condensed rows  
3. **Single action resolver module** — unify work-unit rail + drawer VM resolve  
4. **Expand registered handlers** — migrate high-traffic actions (`schedule_tour`, comms) to `actionRegistry.ts`  
5. **BOS Focus integration** — contextual chips tied to open work template  
6. **Operational Action Rule Sets** — invariant/repair pipeline per operational-action-doctrine  
7. **Remove legacy manage key compat** — once all admin actions use overflow slot in config  

---

## Validation

```bash
cd web && npm run test -- \
  tests/adminV2/runtime/currentWorkActionSurfacePolicy.test.ts \
  tests/adminV2/runtime/currentWorkPolish.test.tsx \
  tests/adminV2/runtime/filterRightRailActionsForCurrentWork.test.ts \
  tests/adminV2/runtime/deriveCurrentWorkSupportingActions.test.ts \
  tests/adminV2/runtime/projectCurrentWork.test.ts

cd web && npx tsc --noEmit
```

**Not committed** per sprint instruction — review before commit.

---

## Suggested commit message (when ready)

```
Harden Current Work action policy with cross-domain category classification.

Centralize supporting/rail demotion in currentWorkActionSurfacePolicy and add
canonical Action System documentation for the post-V1 alignment sprint.
```
