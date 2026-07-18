---
owner: platform
status: active-handoff
last_reviewed: 2026-07-18
---

# Runtime Experience — Next Session Kickoff (paste this into the new Cursor session)

You are continuing the **Runtime Experience** completion sprint. Do **not** push, merge, open a PR, or
promote. Work only in the managed Slot 3 worktree. Continue autonomously; certify in the browser.

## 1. Locate the worktree + confirm root

```bash
alloy-root                                   # MUST print SANCTIONED / managed-worktree
# Expected root: /Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion
# Branch:        agent/claude/3-runtime-drawer-deletion
# If dropped elsewhere: cd into the worktree above (do NOT work in the sibling
# operational-calc-registry-v1-* worktree — it is unmanaged).
```

## 2. Inspect branch + commits

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion
git status                                   # must be clean
git rev-parse --abbrev-ref HEAD              # agent/claude/3-runtime-drawer-deletion
git log --oneline origin/staging..HEAD       # 59 commits ahead of staging (base ba5f50cb6)
```

## 3. Rebase safely onto latest staging (only if behind)

```bash
git fetch origin staging
git rev-list --left-right --count origin/staging...HEAD   # check behind/ahead
# Prior rebases were clean (incoming staging = local-dev work, zero overlap with web/).
# If behind: git rebase origin/staging   — resolve, re-run typecheck, re-certify.
# Backup tag exists: backup/pre-staging-rebase-66a133916
```

## 4. Read these docs FIRST (in order)

1. `docs/handoffs/runtime-experience-destination-identity-handoff.md` — **the authoritative state**:
   findings, timing, identity table, architectural boundary, exact next sequence.
2. `docs/handoffs/runtime-experience-session-3-punchlist.md` — running punch list + cert matrix A–I.
3. `docs/platform/runtime/workspace-operational-preparation-runtime.md` — the anticipatory-prep design
   (Phase A graph / Phase B store) you will now wire.
4. `docs/platform/runtime/alloy-runtime-kernel.md` §K2/K3 — K2 lifecycle (why cross-target
   `provisioning.prepare` is disposed) and Focus commit semantics.

## 5. Run the local Alloy toolkit

```bash
alloy-dev-start wt3-runtime-drawer-deletion  # → http://localhost:3013 (port 3013)
# Sign in in the browser pane yourself — the agent cannot enter Kelly's credentials.
# Typecheck (tsc OOMs otherwise): kill stray tsserver first, then heap-bump:
pkill -9 -f tsserver; ( cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit )
#   Baseline = 10 errors, ALL in test files. Any NEW error is a regression.
```

## 6. Establish current browser state (sanity, ~2 min)

- `/workspace` → wait ~8 s (workspace prep runs on idle) → click a process tile: entry should commit
  a **complete** Focus Panel in ~100 ms with **zero** provisioning/VM network (prepared HIT).
- In a work unit, wait ~8 s then click an adjacent row: ~63 ms, zero network, complete reveal.
- Click a row immediately after entry: the row must **acknowledge instantly** (optimistic rail); the
  complete reveal may still lag on a genuine stage-work miss — that's the work below.
- Instrument with `performance.getEntriesByType('resource')` + a `MutationObserver` on
  `[data-inline-focus-panel]`'s `data-inline-focus-panel-subject` and the body's Household/Current
  Work text. (No permanent debug globals remain in the code.)

## 7. What to implement FIRST

**Canonical Operational Destination Identity.** Build one value (on `DestinationId`,
`lib/runtime/graph/destinationId.ts`) that EVERY producer and consumer derives — resolving the
**implicit-default vs explicit `work_view_id`** fracture at the identity boundary. Then wire the Phase
B store (`lib/runtime/store/preparedDestinationStore.ts`, flag `NEXT_PUBLIC_PREPARED_DESTINATION_STORE`,
currently OFF) as the anticipatory producer/consumer for cross-surface prep, keeping K2 as the live
transition owner. Full sequence: see §"Exact next implementation sequence" in the identity handoff.

## 8. What must NOT be reopened

- Do NOT patch identity with dual-key lookup, multiple URL attempts, alias compat, fallback probing,
  or another cache. ONE canonical identity, one prepared value.
- Do NOT force cross-target `kernel.provisioning.prepare` — K2 disposes off-attention preparations.
- Do NOT reintroduce a subject read from the drawer store (committed Focus is the sole subject owner).
- Do NOT re-litigate settled wins: atomic Focus Panel reveal (no skeleton/resize), config-read cache,
  metric tiles-not-links, A1 duplicate shell, A2 retained Workspace, A4 pill-in-place, Thinking owner.
- Do NOT push / merge / PR / promote until all three blockers are browser-certified and Kelly
  authorizes promotion.

## First command
```bash
alloy-root && cd /Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion && git log --oneline origin/staging..HEAD | head
```

## First implementation objective
Define the **canonical Operational Destination Identity** (on `DestinationId`) and make the Workspace
prewarm producer and the Work Unit entry consumer both derive it — eliminating the implicit-default vs
explicit-`work_view_id` URL fracture — before wiring the Phase B store.
