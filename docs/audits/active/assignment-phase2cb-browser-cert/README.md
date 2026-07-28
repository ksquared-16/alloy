# Assignment Platform Phase 2C-B — Browser certification

**Sprint:** Assignment Workspace Completion  
**Worktree:** `wt5-assignment-platform-phase-2` · port `3015`  
**Date:** 2026-07-25  
**Code status:** Implementation complete (local, uncommitted)  
**Browser cert status:** Blocked by machine resource pressure / incomplete interactive pass

## Scope verified in code

| Goal | Status |
|------|--------|
| Rename → Assignments Workspace (nav + shell title) | Done |
| Overview assignment attention | Done (`computeAssignmentAttention`) |
| Roster consumes Primary/Secondary/count/room/type/status | Done (`AssignmentRosterPanel`) |
| Actions framework (Add available; bulk planned) | Done (`SchedulingActions`) |
| Studio Types / Patterns / Templates / Validation | Done |
| Metrics band assignment-centric | Done (`SchedulingKpiStrip`) |
| Consumes Assignment Platform (no parallel model) | Done |

## Unit tests (passed 2026-07-25)

```bash
cd web && npm run test -- \
  tests/scheduling/assignmentAttention.test.ts \
  tests/scheduling/assignmentRosterReadModel.test.ts \
  tests/adminV2/sidebarModalNav.test.ts
```

## Screenshots

Interactive screenshots not captured this session (dev server repeatedly OOM'd under concurrent `tsc` / multi-server load). Re-run when RAM is healthy:

1. Open http://localhost:3015 → sidebar **Assignments**
2. Capture Overview, Roster, Actions, Studio Types, Work metrics band
3. Save under this folder as `01-…png` … `06-…png`

## Ops notes for slot 5

- Max **3** managed servers. If start refuses, stop another (`alloy-dev-stop <worktree>`).
- Do **not** start with `npx next … | head` — that kills the process.
- Prefer `alloy-dev-start wt5-assignment-platform-phase-2` / `alloy-dev-stop`.
- Avoid machine-wide `tsc` while Next is warm on this slot.

## Commit

Await Kelly approval (same as 2C-A). No commit made.
