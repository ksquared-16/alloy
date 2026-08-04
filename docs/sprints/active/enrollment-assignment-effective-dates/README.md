---
owner: sprint
status: active
sprint: enrollment-assignment-land
slot: 3
staging_base: e6ff28cf87326576b3fa9f0750a876b746071051
last_reviewed: 2026-08-04
---

# Enrollment Assignment Land — Sprint README

## Mission

Land Enrollment Assignment & Effective Dates product work onto post-stabilization `origin/staging`. Prior branch `agent/cursor/3-enrollment-assignment-effective-dates` @ `2fcf696a2` is **evidence only**.

## Environment

| Field | Value |
|-------|-------|
| Slot | 3 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt3-enrollment-assignment-land` |
| Branch | `agent/cursor/3-enrollment-assignment-land` |
| Port | 3013 |
| Staging base | `e6ff28cf87326576b3fa9f0750a876b746071051` |
| Evidence worktree (read-only) | `wt3-enrollment-assignment-effective-dates` |

## Strategy

**B — fresh branch from staging.** Old branch was 18 ahead / 50 behind with tracked certification artifacts. Port product + doctrine + tests only; no `.alloy-agent-evidence` in git.

## Operator commands

```text
alloy-worker-status
alloy-worker-pause 3
alloy-worker-resume 3
alloy-worker-doctor 3
alloy-sprint-finish 3
alloy-day-start 3
alloy-day-end 3
```
