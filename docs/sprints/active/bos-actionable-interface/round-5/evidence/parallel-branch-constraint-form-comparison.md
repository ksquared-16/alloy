---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-01b
---

# Round 5 — Parallel branch comparison

**Branch inspected:** `claude/create-lead-constraint-form-0f0dae`  
**Compared against:** `agent/cursor/2-bos-actionable-interface-plan` @ `c842f015f` (+ Round 5 docs)  
**Inspection date:** 2026-07-27  
**Rule:** Treat parallel branch as implementation evidence only — **do not** cherry-pick or merge wholesale.

---

## Resolution of the named branch

| Fact | Detail |
|---|---|
| Local checkout | Worktree `/Users/Kelly/Alloy/.claude/worktrees/operational-calc-registry-v1-6aa271` |
| Branch tip | `94cc283d4` — `fix(dev-stop): make stop authoritative on the port listener, not the PID file` |
| Remote | **Not on origin** (`git fetch` / `ls-remote` found no `claude/create-lead-constraint-form-0f0dae`) |
| Ahead of `origin/staging` | **1** commit (`94cc283d4` only — toolkit/dev-stop) |
| Behind `origin/staging` | **~212** commits |
| Merge-base with current BOS branch | `436cc51b9` (pre–Round 2/3/4 BOS product surface) |

### Does the tip contain BOS Round 4 progressive Form / command session?

| Path | At parallel tip |
|---|---|
| `web/lib/bos/commandSession/createLeadSectionPresentation.ts` | **Absent** (`git ls-tree` empty for `web/lib/bos/commandSession`) |
| `web/lib/bos/commandSession/**` | **Absent** |
| `web/lib/admin/actions/createLeadPlatformGather.ts` | Present (older lineage) |
| `docs/sprints/active/bos-actionable-interface` | **Absent** |

**Conclusion:** The named branch tip is **not** a Create Lead constraint/Form parity implementation. It is a misnamed or abandoned slot label sitting on an unrelated (scheduling/toolkit) tip that predates the Round 2–4 BOS command session. There are **no commits unique to that branch** that fix Location Form exposure, effective intake section derivation, or progressive Placement sections.

Related create-lead work found elsewhere (not this branch):

- `agent/claude/2-create-lead-source-kind-fix` / PR #239 — Processing `chk_pcs_source_kind` + work-unit binding (server intake commit), **not** Form Placement UI.

---

## Comparison categories

### Reusable changes

**None to port from `claude/create-lead-constraint-form-0f0dae`.**

Optional adjacent evidence (separate branch, not auto-ported):

- Source-kind / Processing commit fixes already live on other lanes — only relevant if Round 5 execute path hits the same DB check (do not merge that branch for Form Location).

### Obsolete changes

- Branch tip’s single unique commit (`dev-stop`) — irrelevant to Create Lead.
- Any expectation that this branch holds Round 4 progressive section adapters — obsolete; those live only on the current BOS branch.

### Conflicting changes

- Parallel tip **lacks** Round 4 progressive sections, repeaters, shared `BosCommandDraft` session host — wholesale merge would **regress** Round 4 UI and Round punch-list repeaters.
- Parallel tip is **~212 commits behind** staging — merge/cherry-pick risk is high and unjustified.

### Recommended integration strategy

1. **Do not** merge, rebase onto, or cherry-pick `claude/create-lead-constraint-form-0f0dae`.
2. Implement F5-02 + F5-04 on the **current** BOS Round 5 branch from doctrine + local root-cause analysis (below).
3. If Kelly later points at a different SHA that actually contains constraint-form Form work, re-run this comparison against that SHA.

### Exact commits / hunks worth porting

**None.**

---

## Local root-cause notes (current branch — informs F5-02/F5-04)

These are **current-branch** findings, not parallel-branch ports:

1. **Placement swallowed by Family repeater** — `createLeadParserSpec` historically mapped `section: "context"` fields (including `location_id`) to entity `person`. `actionIntakeFieldToGatherField` then put Location under Family. Progressive Form renders person/child as **repeaters only**, so Location never got a scalar control. Fix: map context → `opportunity`, project Placement via `projectCreateLeadFormSections`, and keep Location on `placement_select: "site"`.
2. **Required marking gap** — `isRequiredSection` was hard-coded to `person` only; empty Placement with missing `location_id` was labeled **Optional**. Fixed so Placement is required when Location (or other required placement keys) are missing.
3. **Effective gather merge** — Effective spec now forces `location_id` into `requiredPayloadKeys` when platform policy requires Location.
4. **Multi-adult** — Conversation parse must **merge** into `CreateLeadCommitSelection` (stable IDs), not replace `draft.household`. Flat sync of household must not stamp `operator_entered` before parse field upserts.
5. **Children UX** — empty `selection.children` should not show row validation; blank child rows with `commit_blockers` appear only after explicit Add child or parsed named child.

---

## Decision

| Question | Answer |
|---|---|
| Fixes effective required-input parity? | **No** (tip has no Form session) |
| Exposes Location through Form? | **No** |
| Changes server eligibility / Processing / gather? | **No** Create Lead Form changes |
| Preserves canonical location option sources? | N/A |
| Conflicts with Round 4 progressive / repeaters / shared draft? | **Yes** if merged wholesale |
| Tests valid against current doctrine? | **N/A** — no relevant tests on tip |

**Proceed with F5-02 + F5-04 implementation on the current branch without porting from this parallel branch.**

**Integration strategy executed:** implement on current BOS branch (no ports). See `EXECUTION-LEDGER.md` for F5-02/F5-04 status.
