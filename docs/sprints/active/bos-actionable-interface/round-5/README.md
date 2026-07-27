---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# BOS Create Lead — Round 5 (Final Convergence)

Final BOS implementation round before pause. **No visual redesign. No Conversation Runtime. No LLM upgrades. No new commands. No push.**

## Mission

Prove one end-to-end Create Lead product:

Conversation ↔ Form → Review → Processing identity review → Confirm → registered `create_lead` → Success → queue refresh / Open Lead

Then **retire** the old BOS Create Lead path so Alloy has exactly one product path.

## Operator assignment

| | |
|---|---|
| Root | `/Users/Kelly/Code/alloy-worktrees/wt2-bos-actionable-interface-plan` (managed worktree) |
| Slot | 2 · cursor |
| Branch | `agent/cursor/2-bos-actionable-interface-plan` |
| Port | 3012 |
| Push | **forbidden** until Kelly authorizes |

```text
alloy-worker-status
alloy-worker-pause 2
alloy-worker-resume 2
alloy-worker-doctor 2
alloy-sprint-finish 2
```

## Packages

| ID | Objective | Status |
|---|---|---|
| **F5-01** | Current-state path trace + legacy retirement inventory | **done (docs)** |
| F5-02 | Repeater identity + shared-draft reconciliation | pending |
| F5-03 | Conversation/Form value parity | pending |
| F5-04 | Effective required-input/Form parity (incl. Location) | pending |
| F5-05 | Required-state + eligibility reconciliation | pending |
| F5-06 | Review + Processing identity-review handoff | pending |
| F5-07 | Confirm / execute / success / refresh | pending |
| F5-08 | Old BOS Create Lead retirement | pending (after certification) |
| F5-09 | Tests, authenticated certification, docs | pending |
| F5-10 | Final pause closeout | pending |

Package IDs in the brief map as F5-01…F5-10 above (brief’s F5-06–F5-08 Review/Execute/Retire align to table rows F5-06–F5-08).

## Hard non-goals

- Natural-language / LLM intelligence upgrades (beyond preserving already-parsed values)
- Universal conversational engine / Processing Conversation Runtime
- Migrations / tables
- Parallel command runtime
- Unrelated Commands sprint work
- Round 4 UI redesign
- Retaining dual BOS Create Lead products after certification

## Gate

**No code changes until F5-01 inventory is written.** → See [`F5-01-path-trace-and-retirement-inventory.md`](./F5-01-path-trace-and-retirement-inventory.md).

## Canonical statement (target end-state)

- BOS is a **command placement**
- `/create-lead` and Commands/Actions launch the **same** command session
- Conversation and Form share one authoritative `BosCommandDraft`
- Effective intake specification drives fields and requiredness
- Repeaters preserve multiple adults and children with stable IDs
- Review precedes Processing identity review and confirmation
- Execution uses registered `create_lead` only
- Processing owns identity resolution
- Success uses explicit Open Lead + canonical projection refresh
- Old BOS Create Lead path is **retired** (Git rollback, not a permanent flag)
