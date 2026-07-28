# Focus Panel Card Finalization

**Sprint:** `focus-panel-card-finalization`  
**Slot:** 2 · Provider: cursor  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt2-focus-panel-card-finalization`  
**Branch:** `agent/cursor/2-focus-panel-card-finalization`  
**Base:** `origin/staging` @ `7aef5aa6b`  
**Port:** 3012 · `http://localhost:3012`  
**Status:** Slice 1 landed (local) — Slice 2 in progress

## Mission

Finish Surfaces Builder + Focus Panel card authoring/runtime on frozen foundations:

1. Deterministic card drag/order
2. Field picker → provider parity
3. Reusable card-to-card focus links
4. Lossless incremental surface configuration
5. Program editable unless primary classroom derives it

## Defect matrix

| # | Defect | Root cause | Status |
|---|--------|------------|--------|
| 1 | Card drag/order flaky | `snapMoveTarget` over-aggressive insert-above + left-column alignTop yanking stack-below to row 1; no grab offset | **Fixed** (unit) |
| 2 | Advertised fields fail | pending systematic audit | investigating |
| 3 | Card-to-card focus links | foundation present; authoring/wiring incomplete | pending |
| 4 | Incremental edits overwrite | rebuild-from-order dropped metadata; nested publish raced parent; no stale-write guard | **Fixed** (unit) |
| 5 | Program always Linked | LINKABLE refs + default Linked; no primary-classroom gate | pending |

## Slice progress

- [x] Slice 0 — Reproduction and evidence
- [x] Slice 1 — Persistence + drag root cause
- [ ] Slice 2 — Field availability contract
- [ ] Slice 3 — Card-to-card focus links
- [ ] Slice 4 — Program editability
- [ ] Slice 5 — Convergence and certification
