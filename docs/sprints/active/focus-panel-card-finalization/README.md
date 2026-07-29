# Focus Panel Card Finalization

**Sprint:** `focus-panel-card-finalization`  
**Slot:** 2 · Provider: cursor  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt2-focus-panel-card-finalization`  
**Branch:** `agent/cursor/2-focus-panel-card-finalization`  
**Base:** `origin/staging` @ `7aef5aa6b`  
**Port:** 3012 · `http://localhost:3012`  
**Status:** Code complete for defects 1–5 (unit + typecheck). **Authenticated browser QA still owed** (slot 2 Next was unstable during this session).

## Defect matrix

| # | Defect | Root cause | Status |
|---|--------|------------|--------|
| 1 | Card drag/order flaky | `snapMoveTarget` insert-above + alignTop yank; no grab offset | **Fixed** + unit |
| 2 | Advertised fields fail | Picker advertised fields without identity providers | **Fixed** + unit |
| 3 | Card-to-card focus links | Foundation present; Assignments→Children not wired | **Fixed** (avatar → Children) |
| 4 | Incremental edits overwrite | Rebuild-from-order dropped metadata; nested publish raced; no stale guard | **Fixed** + unit |
| 5 | Program always Linked | Default Linked ignored primary-classroom gate | **Fixed** + unit |

## Commits

- `ec25bfdb9` — drag + lossless saves + stale write protection
- (this commit) — field parity + program derivation + Assignments→Children link

## Validation

```bash
cd web && npm run test -- \
  tests/adminV2/runtime/focusPanelGridLayout.test.ts \
  tests/adminV2/runtime/focusPanelSummaryDocOps.test.ts \
  tests/adminV2/runtime/focusPanelSummaryPublishLoop.test.ts \
  tests/adminV2/runtime/identityFieldPickerParity.test.ts \
  tests/adminV2/runtime/assignmentProgramRoomGating.test.ts \
  tests/adminV2/runtime/identityLinkedDestinationResolution.test.ts \
  tests/presentation/runtime/queueRowPublishParity.test.ts
# 58 passed

cd web && npm run typecheck
# pass (after clearing corrupted .next)
```

## Remaining

- Authenticated browser scenarios A–E (server flaked repeatedly; re-run with `alloy-dev-start` + `alloy-agent-verify 2`)
- Optional: Surface Builder UI to author arbitrary `FocusPanelCardLink[]` (runtime default Assignments→Children works)
- Canonical docs update after browser certification
