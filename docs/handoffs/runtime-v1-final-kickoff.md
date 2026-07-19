---
owner: platform
status: runtime-v1-final-kickoff
last_reviewed: 2026-07-19
---

# Runtime V1 — Final Session Kickoff (paste this in)

> Assume there will never be a Runtime V2. This foundation must support the next five years of Alloy.

You are finishing and freezing **Runtime V1**. The authoritative reference is
[`docs/handoffs/runtime-v1-final-handoff.md`](runtime-v1-final-handoff.md) — read it first; it assumes
no memory and has every section (truth, completed, purification, remaining, matrix, order, freeze).

## Repository
- **Root class:** run `alloy-root` — MUST say `managed-worktree / SANCTIONED`. If not, `cd` to the
  worktree below before doing anything.
- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion` (managed Slot 3)
- **Branch:** `agent/claude/3-runtime-drawer-deletion` — **74 ahead / 0 behind `origin/staging`**,
  nothing pushed, no PR, no merge.
- **Do NOT push / merge / PR / promote** until Kelly authorizes.

## Current Runtime state (accepted)
`Route → resolveOperationalDestination → DestinationId → K1 → K2 (D1 answer) → atomic Commit →
[Header + Queue + Current Work FROM THE ANSWER] → Settlement (drawer VM enriches)`.
Doctrine: **the first meaningful action is possible from the provisioning answer alone; the drawer VM
enriches, never creates operational truth.** Blockers 1–3 (canonical surface identity, Current Work
from the answer, canonical Thinking owner) are implemented + dev-certified + committed. The abandoned
Operational Graph and Prepared Destination Store are deleted (URL cache keyed by canonical identity is
the one anticipatory runtime). See handoff §1–3, §9 for owners.

## ⚠️ First action required
The browser Supabase session was lost. **Kelly must sign in on `:3013`** before any browser or
production certification. Nothing else can be certified until then.

## Remaining work (handoff §4, in order)
1. **Back/Forward destination stamping** (B2) — popstate doesn't stamp `DestinationId`; write it to
   `history.state` at commit, read+stamp on popstate.
2. **Current Work renderer unification** (B3) — feed a minimal answer-VM into the resolved grid so
   pending == resolved `CurrentWorkCard` (zero resize on enrichment).
3. **Remaining verified legacy deletion** (B4) — one owner at a time, browser-verified.
4. **Publish-driven config invalidation** (B5) — wire `invalidateConfigReadCache` into publish.
5. **Production certification** (B1) — build exists (`.next-prodcert`), run + measure the full matrix.
6. **Runtime Freeze** — §11 checklist, freeze certificate.

## Commands to resume
```bash
alloy-root                                   # must say SANCTIONED / managed-worktree
cd /Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion
git log --oneline origin/staging..HEAD | head -14   # this branch's work
# dev server (if not running on :3013):
( cd web && PORT=3013 npx next dev -p 3013 )         # → http://localhost:3013
# Kelly signs in in the browser pane, THEN certify.
# typecheck (OOMs otherwise): baseline = 10 errors, ALL pre-existing test files
( cd web && pkill -9 -f tsserver; NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit )
# production cert (after re-auth): stop dev, then
( cd web && ALLOY_PROD_CERT_DIST=1 npx next start -p 3013 )   # same origin → fresh session applies
```

## Exact mission
Execute handoff §10 Phase A→G without stopping between phases: restore/verify → Back/Forward canonical
→ Current Work unification → verified legacy deletion → publish invalidation → production certification
→ Runtime Freeze. Certify in the browser and on a production build. Continue autonomously; only stop
for a constitutional contradiction, an irreconcilable architecture conflict, or a genuine product
decision (handoff §5 lists the only two open product questions). Do not freeze until every §11 item is
checked.

## Exact first command
```bash
alloy-root && cd /Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion && git log --oneline origin/staging..HEAD | head -14
```
