---
owner: platform
status: active-handoff
last_reviewed: 2026-07-28
---

# Runtime V1 Certification — Session Handoff

**Read in this order:** this file → [`RUNTIME-V1-CERTIFICATION-SPRINT.md`](./RUNTIME-V1-CERTIFICATION-SPRINT.md)
(the canonical tracker: scoreboard, priority queue, §7 continuation plan) →
[`CARD-PLACEMENT-OWNERSHIP.md`](./CARD-PLACEMENT-OWNERSHIP.md) ·
[`CARD-LOADING-AUTHORITY.md`](./CARD-LOADING-AUTHORITY.md) ·
[`CARD-READINESS-LIFECYCLE.md`](./CARD-READINESS-LIFECYCLE.md) (the three frozen conclusions).

Supersedes `PLACEMENT-SESSION-HANDOFF.md` (retired).

---

## 0. Environment — verify before doing anything

- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-placement` (managed, slot 3, port 3013).
- **Branch:** `agent/claude/3-runtime-v1-placement` — **11 commits ahead of base `86949ebc4`**,
  **committed-not-pushed**, **tree clean**.
- **`origin/staging` has advanced to `61e4e2c6c`** (branch is 60 behind). Nothing here has been
  pushed, merged, or deployed. **Do not push/merge/deploy without Kelly's explicit authorization.**
- **Node/arch (critical):** `next build` and `vitest` FAIL under x64 Homebrew node@22
  (lightningcss/rolldown are arm64-only). Use nvm arm64:
  `export PATH="/Users/Kelly/.nvm/versions/node/v22.21.1/bin:$PATH"`. `tsc` is arch-agnostic.
- **Prod build recipe (the real gate — a bare `next build` skips `prebuild`):**
  ```
  cd web; set -a; . ./.env.local.agent; . /Users/Kelly/Alloy/web/.env.local; set +a
  NODE_OPTIONS=--max-old-space-size=8192 npm run build
  ```
  Then `PORT=3013 ./node_modules/.bin/next start -p 3013`.
- **Server restart gotcha (cost me a cycle):** a rebuild while the old server holds `.next` yields
  chunk 500s and a blank "Application error" page that LOOKS like a code regression. Always
  `lsof -ti tcp:3013 | xargs kill -9` and confirm the port is free before starting the new server.
- **A prod server built from `3107630aa` is currently RUNNING on :3013.**
- **Auth:** slot3 Playwright storage-state `~/.local/state/alloy-dev/auth/slot3/storage-state.json`
  is **~11 h old** and worked for the last cert run, but it expires unpredictably.
  `alloy-agent-login 3` is manual sign-in — **Kelly-only; I am barred from entering credentials.**
- **Repro subject:** `/workspace/work-unit/lifecycle_wu_lead?subject_id=b29921ca-b4d2-4cf4-b26c-2b9bd7263d78`
  (Chapmap, 1 child). Needs `?subject_id=`, not the bare queue.

## 1. Test baseline — the number that matters

The runtime suite carries **inherited rot**. Do not "fix" it silently and do not compare against zero.

```
BASELINE (branch base):  79 failed / 1219 passed
CURRENT  (3107630aa):    78 failed / 1236 passed   → zero new failures, one fixed
```

Method (reuse it):
```
cd web && npx vitest run tests/adminV2/runtime/ > run.txt 2>&1
grep -aoE "FAIL +tests/[^ ]+ > .*" run.txt | sed 's/FAIL *//' | sort -u > run.names
comm -13 baseline.names run.names   # MUST be empty
```
Compare **test names**, not counts — a file can regress and improve in the same run.
Baseline name-list lives in the scratchpad; regenerate from the branch base if lost.

## 2. Where the work stands

| Step | State |
|---|---|
| **Step 1 — Visual atomicity** | CLOSED · certified |
| **Step 2 — Placement (RegC-2)** | CLOSED · **rejected as a registry concern**, by evidence |
| **Step 3 — Loading policy (RegC-3)** | CLOSED · **rejected as a registry concern**, by evidence |

Both rejections are *successful architectural results*, recorded with their reasoning. **Do not
reopen either.** The card-owned placement capability layer **remains intentionally empty** until the
Child second surface provides reuse evidence.

**Defects fixed en route (all browser-certified on a prod build):**
- `fea89061b` — the pending skeleton planned `published-grid` while the body planned
  `published-lanes`: a real DOM+geometry swap on settle. Its guard test was red for an unrelated
  stale reason and masked it.
- `7ce9f23e3` — **Billing manufactured a blocked verdict** ("N items missing") from
  `billing_configured`/`tuition_rate_label`, which are read in 3 places and **written nowhere**.
- `b58fcc250` — the grid branched on `model.source` (documented "never branch on it"), which would
  have forced a Child-surface producer to name itself `drawer_vm`. Producers now declare `phase`.

## 3. ⚠️ The standing sweep this session earned

Two consecutive audits each found the **same defect class**: *a card asserting a business conclusion
from plumbing that was never wired* — Milestones (Step 1), then Billing (Step 3).

**Before closing any future card work, sweep: does this card read a field with no writer?**
```
grep -rn "<field>" --include=*.ts --include=*.tsx --include=*.sql . | grep -v node_modules
```
If every hit is a *reader*, the card is fabricating. This belongs in the `family_alerts` proving-card
step; it is not a separate task.

## 4. Next work — and why the order changed

Tracker priority says CP-1 next. **I reordered to PE-3, and the next session should confirm or
override that:**

- **CP-1** (enriched-VM post-hydration waterfall) is Critical and READY, but it requires the ≥5-option
  architecture challenge *before* implementation (§0 of the tracker), and its implementation is
  EEC-gated.
- **PE-3** (cold primary-usable ~6.5 s) is the headline remaining gap, is **not** EEC-blocked now that
  the prod build/browser loop works on this host, and needs no design gate — it starts with
  measurement. Known decomposition from earlier sessions: **auth 1977 ms · route-identity 2470 ms ·
  compose 2424 ms** (cold DB).

Then, per tracker: **B1-dedup** (prod trace already captured: `provisioning-answer ×4` sibling
prewarm storm at t=6210 ms; `drawer-recipients ×2` at t=6189/13224) → **BND-1** boundaries (unblocked
by Step 2) → **DG-1/2/3** → **TS-1** → **`family_alerts` proving card** → **Child second surface**.

**The Child second surface gates certification** and is now also the experiment that decides whether
*any* card-owned placement property exists, and whether the deferred-source contract and interaction
eligibility deserve to be separate concerns. Do not invent cross-surface abstractions before it.

## 5. Open, not blocking

- **R-07 / SEC-1 — `/dev` harness routes ship unguarded.** Only `household-card-verify` checks
  `NODE_ENV`; there is no `app/dev/layout.tsx`; `/dev` is outside `requiresOperatorSession`. Nothing
  in `next.config.ts`/`middleware.ts` excludes them; **infra-level exclusion is UNKNOWN from this
  repo**. Needs one deployment fact before any code change. Keep it out of runtime commits.
- **78 inherited test failures** — classified, not normalized. `TE-2` (portable fixtures) is the
  real fix.

## 6. Operating discipline (this is what produced the results above)

1. inventory → 2. authority/ownership audit → 3. consumer map → 4. implement → 5. browser cert →
6. test cert → 7. documentation → 8. tracker + score → 9. continue.

- **Measurement, not inference.** Prod build, real browser, real auth.
- **A concern that fails the registry's 5 criteria should be REJECTED, not built.** Two of three
  roadmap concerns were.
- **Never let a visually-successful change encode a semantic falsehood.**
- **Repair tests to the truthful contract; never normalize them to passing.** Five tests that
  encoded the Billing fabrication were rewritten to assert the honest behaviour.
- **Diagnostics caveat:** `window.__focusPanelLayoutSource` (the `docSource` tracer) is **dev-only**
  (`NODE_ENV === "production"` early-return). `data-fp-render-strategy` IS emitted in prod. A prior
  session misattributed the render source because of exactly this. **Firefly renders a
  TENANT-PUBLISHED doc**, not the code default — verify via the
  `/api/admin/entity-layouts/focus-panel-summary` network response in prod.
