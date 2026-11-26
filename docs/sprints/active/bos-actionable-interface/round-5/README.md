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
| **F5-01b** | Parallel constraint-branch tip inspection | **done (docs)** — tip empty |
| **F5-01c** | Product decisions + command-authority comparison | **done (docs)** — **gate for product code** |
| F5-02 | Repeater identity + shared-draft reconciliation | **blocked** — await entity-section realignment |
| F5-03 | Conversation/Form value parity | pending |
| F5-04 | Effective intake Form parity (entity groups; **no Placement section**) | **reset** — reverse premature Placement work |
| F5-05 | Required-state + eligibility reconciliation (shared command contract) | pending |
| F5-06 | Review + Processing identity-review handoff | pending |
| F5-07 | Confirm / execute / success / refresh | pending |
| F5-08 | Old BOS Create Lead retirement | pending (after certification) |
| F5-09 | Tests, authenticated certification, docs | pending |
| F5-10 | Final pause closeout | pending |

## Gate (updated)

**No F5-02+ product code until F5-01c decisions and command-authority comparison are accepted.**

See:

- [`PRODUCT-DECISIONS.md`](./PRODUCT-DECISIONS.md)
- [`evidence/command-authority-comparison.md`](./evidence/command-authority-comparison.md)
- [`F5-01-path-trace-and-retirement-inventory.md`](./F5-01-path-trace-and-retirement-inventory.md)

Premature Placement / BOS-only Location commits (`8771c7c7a` and related) are **provisional and must be realigned** before continuing.

## Product decisions (summary)

1. **Form sections = effective intake entity ownership** — not BOS-owned “Placement & preferences.”
2. **Per entity:** expanded **Required to create this lead** + collapsed **Additional fields** (no silent omissions; blockers never under Additional).
3. **Effective intake spec is the content contract** — no curated field subset.
4. **Do not redefine process/stage/requirements in BOS** — consume the Create Lead command’s effective intake; inspect constraint lane before changing those layers.
5. **Client/server requiredness parity** — code-owned command minimum + effective `record_creation`; no BOS-only Location rule.
6. **Stage language:** technical key may stay `lead`; operator copy uses Create Lead / Lead details / Required to create this lead / Additional fields / Review lead / Lead created; show configured BP stage label when a stage is shown.
7. **Repeaters** stay inside parent/child entity sections with stable shared-draft identity.

## Hard non-goals

- Natural-language / LLM intelligence upgrades (beyond preserving already-parsed values)
- Universal conversational engine / Processing Conversation Runtime
- Migrations / tables
- Parallel command runtime / BOS-specific process resolver
- Synthetic Placement section
- Unrelated Commands sprint work
- Round 4 UI redesign
- Retaining dual BOS Create Lead products after certification

## Canonical statement (target end-state)

- BOS is a **command placement**
- `/create-lead` and Commands/Actions launch the **same** command session
- Conversation and Form share one authoritative `BosCommandDraft`
- **Command-owned effective intake** drives fields, entity groups, and requiredness
- Repeaters preserve multiple adults and children with stable IDs **inside** entity sections
- Review precedes Processing identity review and confirmation
- Execution uses registered `create_lead` only
- Processing owns identity resolution
- Success uses explicit Open Lead + canonical projection refresh
- Old BOS Create Lead path is **retired** (Git rollback, not a permanent flag)
