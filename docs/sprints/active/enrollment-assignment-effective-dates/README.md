---
owner: sprint
status: active
sprint: enrollment-assignment-effective-dates
slot: 3
staging_base: 86c34f13ae5b8f10298a359c992efe9ab5fee701
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
| Staging base | `86c34f13ae5b8f10298a359c992efe9ab5fee701` |
| Config repair | Firefly Enrollment FP Summary **v128 → v129** (Assignments Visible) |

## Artifacts

- [HANDOFF.md](./HANDOFF.md) — closure card, promotion guidance
- [current-state-audit.md](./current-state-audit.md) — authority map + published-layout blocker
- Evidence: `.alloy-agent-evidence/enrollment-assignment-effective-dates/`

## Operator commands

```text
alloy-worker-status
alloy-worker-pause 3
alloy-worker-resume 3
alloy-worker-doctor 3
alloy-sprint-finish 3
```

## Status

Classification **A** config repair published; browser matrix **20/20**; automated **53** enrollment tests + typecheck green. **Do not merge** until Kelly authorizes. See HANDOFF for HEAD / remote durability.