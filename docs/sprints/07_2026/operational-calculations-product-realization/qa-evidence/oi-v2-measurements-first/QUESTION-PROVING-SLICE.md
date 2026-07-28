# Future Room Capacity — Operational Question proving slice

**Date:** 2026-07-28  
**Branch:** `agent/cursor/2-org-calcs-integration`  
**HEAD:** `adb7ffef8`  
**Base note:** PR #249 still **OPEN** (not merged). Work stacked on the PR integration branch containing `ab17b65ab` (measurements-first). Local commits only — **not pushed**.

## Phase 0 preflight (recorded)

| Item | Value |
|------|--------|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt2-org-calcs-integration` |
| Branch | `agent/cursor/2-org-calcs-integration` |
| Measurements-first | `ab17b65ab` present |
| PR #249 | OPEN → staging ([link](https://github.com/ksquared-16/alloy/pull/249)) |
| Ahead/behind vs origin/staging (cert) | 11 ahead / 33 behind |
| Slot 4 | not used |
| Parked OI reset | excluded |

## Commits (this slice)

1. `4e1a0ab58` feat(questions): add operational question catalog and answer contract  
2. `9fa1c544a` feat(operational-intelligence): add Future Room Capacity question experience  
3. `2919ce6fe` feat(bos): answer and configure Future Room Capacity through shared platform  
4. `adb7ffef8` test(questions): certify UI and BOS configuration parity  

## What shipped

- Typed Question Catalog (`future_room_capacity`)
- `answerOperationalQuestion` → existing Measure observe path
- Canonical Answer contract + shared actions
- Configure / goal / newer-definition helpers (UI/BOS shared) with `question_key` + `entry_point` audit
- OI Question Browser card on home
- BOS intent → command surface → `/api/admin/operational-questions/bos` (configure, answer, goal, history, newer definition)
- Proactive `below_goal` event contract (no broad proactive system)

## Validation

- Unit/regression: `tests/operationalQuestions`, oiOrgCalc, organizationCalculations, OI adminV2 — **39 passed**
- Production typecheck: **deferred** — machine had concurrent stale `tsc` processes; re-run `cd web && npm run typecheck` when clear
- Authenticated UI + BOS browser QA: **deferred** (localhost :3012 responds; full cookie session QA not re-run in this pass)

## Scope honesty

Proves one Question → Measure → Measurement → Answer → Action through UI + BOS shared contracts.  
Other ten questions remain cataloged in design docs only.
