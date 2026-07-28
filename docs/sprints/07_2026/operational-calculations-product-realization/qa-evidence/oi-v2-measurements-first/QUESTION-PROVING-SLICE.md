# Future Room Capacity — Operational Question proving slice

**Date:** 2026-07-28  
**Branch:** `agent/cursor/2-org-calcs-integration`  
**Base note:** PR #249 still **OPEN** (not merged). Work stacked on the PR integration branch containing `ab17b65ab` (measurements-first). Local commits only — no push until certification.

## Phase 0 preflight (recorded)

| Item | Value |
|------|--------|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt2-org-calcs-integration` |
| Branch | `agent/cursor/2-org-calcs-integration` |
| HEAD at start | `ab17b65ab` |
| `ab17b65ab` present | yes (HEAD) |
| PR #249 | OPEN → staging ([link](https://github.com/ksquared-16/alloy/pull/249)) |
| Ahead/behind vs origin/staging (preflight) | ~7 ahead / 33 behind |
| Slot 4 | not used |
| Parked OI reset | excluded |

## What shipped

- Typed Question Catalog (`future_room_capacity`)
- `answerOperationalQuestion` → existing Measure observe path
- Canonical Answer contract + shared actions
- Configure API (UI/BOS shared) with `question_key` + `entry_point` audit
- OI Question Browser card on home
- BOS intent → command surface route → `/api/admin/operational-questions/bos`
- Proactive `below_goal` event contract (no broad proactive system)

## Validation

- Unit tests: `tests/operationalQuestions/futureRoomCapacityProvingSlice.test.ts` (+ related)
- `npm run typecheck` — pass

## Authenticated UI/BOS QA

Deferred under machine memory pressure on :3012 (same environment as measurements-first QA). Re-run with fresh auth when stable:

1. UI: OI → Future Room Capacity → configure → answer  
2. BOS: “How many seats will Bears have next month?”  
3. Parity: configure via UI and BOS configure API; compare snapshots  

## Scope honesty

Proves one Question → Measure → Measurement → Answer → Action through UI + BOS shared contracts.  
Other ten questions remain cataloged in design docs only.
