---
owner: sprint
status: active
sprint: enrollment-assignment-effective-dates
slot: 3
staging_base: 3195fae4a301e75cac43db934dcb163168e25674
last_reviewed: 2026-08-03
---

# Enrollment Assignment & Effective Dates — Sprint README

## Environment

| Field | Value |
|-------|-------|
| Slot | 3 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt3-enrollment-assignment-effective-dates` |
| Branch | `agent/cursor/3-enrollment-assignment-effective-dates` |
| Port | 3013 |
| Staging base | `3195fae4a301e75cac43db934dcb163168e25674` |
| Server | stopped until UI QA |

## Artifacts

- [current-state-audit.md](./current-state-audit.md) — authority map, conflicts, gaps, decisions, slices

## Operator commands

```text
alloy-worker-status
alloy-worker-pause 3
alloy-worker-resume 3
alloy-worker-doctor 3
alloy-sprint-finish 3
```
