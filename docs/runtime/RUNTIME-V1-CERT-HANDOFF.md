# Runtime V1 Certification — Session Handoff (START HERE)

**Date:** 2026-07-27 · **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-polish` · **Branch:** `agent/claude/3-runtime-v1-polish` (71 ahead of `origin/staging`, **committed-not-pushed**, nothing on staging) · **Proving slice:** the Work Unit surface (`/workspace/work-unit/new-leads`).

**Read this, then `docs/runtime/RUNTIME-V1-CERTIFICATION-SPRINT.md` for full detail** (every measured number, decision log D-001..D-014, the extensibility audit, the migration ledger, and the cold decomposition all live there).

---

## 1. What is CERTIFIED (accepted facts — do NOT reopen unless a new measurement contradicts)

Production-verified on a local prod build (`next build` + `next start`):
- **Warm primary usable 1851 ms** (was 2566) — **under the <2 s target**.
- **"Loads as one" — spread 0 ms** (all primary cards appear in the same frame; prod + video).
- **Record switch 46 ms**; **tab-open 389 ms** (responsive); hydration ~50 ms (NOT the bottleneck).
- The "12 s deferred detail" is **background prefetch, not operator latency** — the operator never waits on it.
- Kernel (`lib/runtime/kernel/*`) and Surface Host (`lib/experience/surfaceHost/*`) are **card-key-agnostic** (grep-clean — platform layers are not leaked into).

**Closed investigations (do not redo):** hydration is not the prod bottleneck; SSR-of-commit-critical-frame does not win (built, measured, reverted); compose was NOT near its floor (−60% achieved); reveal timing is correct; the DB round-trip (~350 ms) is not the warm gate.

---

## 2. Environment & how to run/measure (the operational unlock)

**Dev server (fast iteration; DB-bound phase timings here == prod):**
```bash
alloy-dev-start wt3-runtime-v1-polish     # NEVER bare `next dev` (loads no trusted env)
# logs: ~/.local/state/alloy-dev/logs/wt3-runtime-v1-polish.log
```

**Production build + run (the EEC is CLEARED — it works when the host is quiet, no competing tsc/build):**
```bash
cd /Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-polish/web
set -a; . ./.env.local.agent; . /Users/Kelly/Alloy/web/.env.local; set +a   # trusted env into process only, NEVER persisted/printed
SKIP_BUILD_TYPECHECK=1 NODE_OPTIONS="--max-old-space-size=8192" ./node_modules/.bin/next build
# free the port FIRST (avoids EADDRINUSE serving a stale build):
lsof -ti tcp:3013 | xargs kill -9 2>/dev/null
PORT=3013 ./node_modules/.bin/next start -p 3013
```
Gotchas: `next build` overwrites `.next`, so a prod build clobbers the dev server (rebuild dev after). `timeout` is not on macOS. Auth for Playwright = `PLAYWRIGHT_STORAGE_STATE=$HOME/.local/state/alloy-dev/auth/slot3/storage-state.json`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3013`.

**Server-phase instrumentation pattern (proven):** add temporary `console.info("[TAG]", JSON.stringify({phase_ms}))` in the layout/resolver, RESTART the server (a restart is required — turbopack keeps a stale module otherwise), navigate authed via Playwright, grep the tag from the server log, then REVERT the instrumentation before committing. DB-round-trip-bound phases are the same dev/prod (same remote DB), so iterate in dev and confirm the aggregate on a prod build.

---

## 3. MEASUREMENT DISCIPLINE (non-negotiable — this is why the work is trustworthy)

- **Only controlled same-process A/Bs** are trustworthy on this host (window-flag toggled via `window.name` in `page.addInitScript`, interleaved, ≥5–6 runs, median + range). Cross-session medians and `route.abort()` suppression both MISLEAD (see memory `runtime-perf-ab-methodology`). Deferral ≠ suppression.
- Every retained change: **before/after, median, range, ≥5 runs, cold + warm, same build, +0 new test failures (stash-verified), loads-as-one intact, record-switch intact.** One optimization at a time. **Keep or revert.** No batching.
- Report the **aggregate** improvement, not merely the duration of removed work (a phase hidden under a concurrent one won't move htmlEnd until the concurrent one is also cut).

---

## 4. GUARDRAILS — do not regress
- warm primary usable **< 2 s** · primary settled **< 3 s** · loads-as-one **spread ~0** · record switch **~46 ms** · singular ownership · no stale-subject / wrong-record flash · no new central coordinator.

---

## 5. Committed arc

**Prior session (14 commits, `agent/claude/3-runtime-v1-polish`):** Compose −60%: `4ac13b5b2`, `006aca55c`. Server-loads: `99fd9017a` (viewer-tz orgId dedup), `225b3771a` (route-identity 3 reads→1), `dcde9e163` (viewer-tz 60s-cache reuse). Registry: `c7b739f2b` (CardDefinition + titles) + design-law commit. Docs/cert: prod waterfall, cold decomposition, loads-as-one cert, Workstream B waterfall, Workstream C/D audit, registry ledger + design law.

**Session 2026-07-28 (EEC active — host memory-saturated; EEC-free work only, prod A/B batched):**
- **`fcce804a0` — Workstream A dead-weight removal:** moved the landing-only `lifecycleCards` seed OUT of the shared `/workspace` layout INTO the landing route (`page.tsx` async server component + `WorkspaceLandingRouteVmBridge`). Work-unit routes no longer load a ~600 ms landing-only N+1 seed they never read. Cert: +0 new test failures (stash-verified 12=12), incremental tsc clean on the 4 files, both routes compile. **Honest scope:** this is a wasted-work/architecture win, NOT a work-unit primary-usable win — that phase is HIDDEN under the child `composeAndMeta` (measurement discipline §3). The same is true of the `orgName` twin (367 ms, also hidden). **The real work-unit levers remain the child critical chain — `resolveWorkUnitRouteIdentity` (1040 warm / 2470 cold), auth (1977 cold), compose — whose aggregate confirmation needs a PROD build (batched until the host quiesces).**
- **Workstream C/D — registry concern 2 (`lifecycle`) extracted** (commit pending tsc): see §6 C/D.

---

## 6. WHAT'S LEFT — next actions by workstream (Runtime V1 Certification is Alloy-wide, not Work-Unit-only)

**Scope law:** separate every finding into DOMAIN-specific (opportunity projection, stage-work, work-unit route identity, opportunity cards) vs PLATFORM-wide (Surface Host, Kernel, focus commit, provisioning/registration/placement/reveal contracts, diagnostics, cache ownership, TS boundaries). Domain knowledge must NOT leak into platform layers.

### Workstream A — Cold path (cold primary usable 6465 ms; decomposed)
Named prod phases (COLD→WARM): **auth 1977→338 · route-identity ~2470→~700 · compose 2424→715**; bundle (cold, hidden): viewerTz 757 / operTz 756 / lifecycleCards 601 / orgName 367. Root cause: cold DB connections + empty caches (~2.5–3× slower cold). Cleanest first fixes: **(A) delete/defer `lifecycleCards` on work-unit routes** (601 ms, dead weight per its own comment — needs a parent/child-layout refactor since it's loaded in the shared parent layout); **(B) reuse canonical `orgName`** from auth/bootstrap instead of a fresh read (367 ms); then **(E) instrument+reduce auth** (1977 ms cold — challenge repeated token verify / duplicated org resolution); structural: **warm the DB connection pool at server startup**. One at a time, keep/revert, measure cold+warm.

### Workstream B — Deferred detail (measured; fixes pending)
Real background waste to trim: **dedup 3 duplicate requests** (`communications/drawer-recipients`, `communications/family-workspace`, `queue-view-totals` each fire ×2 — find the two callers each); **re-evaluate the 4× sibling-view `provisioning-answer` prefetch** (measure record/view-switch latency WITH vs WITHOUT — it's ~20 s cumulative background DB work). Give each deferred surface its own waterfall.

### Workstream C/D — Declarative surface / registry extraction (STARTED)
**Audit verdict: FAIL** — adding a card = 6–8 central edits across 13 files. **Approved approach: incremental, non-breaking, one concern at a time, keep/revert-verified.** Registry established: `web/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry.ts`.
- **DESIGN LAW (Kelly, platform contract):** COMPOSE SMALL, INDEPENDENTLY-EVOLVABLE CONCERN CONTRACTS — do NOT grow a god-schema. A card = IDENTITY composed with the concern contracts it opts into (placement · lifecycle · loadingPolicy · dependencies · permissions · diagnostics · render), EACH a small separately-typed contract OWNED BY ITS OWN runtime composer. No single coordinator knows all concerns. Every property must satisfy: (1) runtime needs it, (2) multiple cards use it, (3) multiple surfaces use it, (4) removes orchestration, (5) NO new central coordinator. Scale test on every decision: at 300 cards × 40 products, easier or harder to extend? Optimize for easier.
- **DONE concern 1/N = `identity.title`** (split into `CardIdentity` contract; migrated `FOCUS_PANEL_CARD_TITLES` 1:1 → `cardTitle(key)`).
- **DONE concern 2/N = `lifecycle`** (`CardLifecycle`, owned by `focusPanelCoordinationModel`): `ownsOperationalTruth`/`ownsWorkCompletion` replace the `OPERATIONAL_TRUTH_CARDS`/`WORK_OWNING_CARDS` membership sets; `isOperationalTruthCard`/`isWorkOwningCard` now read the registry (type-only import edge, no runtime cycle). Added the missing `scheduling` registry entry. Parity locked by `focusPanelCardLifecycleRegistry.test.ts` (5/5); +0 new failures (stash-verified 79=79 across `tests/adminV2/runtime/`).
- **NEXT concerns (each its own contract + composer, in the module that owns that concern):** placement (replaces `SUMMARY_GRID`/`WORK_GRID_*` + default doc — but it's a per-MODE grid composition, not per-card data: needs a real composer, not a flat field) · loadingPolicy (folds in `COMMIT_CRITICAL_CARD_SPECS` — the proven seed; NOTE it entangles `isKnowable` with the domain `build` fn, so extract `isKnowable` as loadingPolicy and defer `build`) · dependencies · permissions · diagnostics · render (renderer if-chain → default ArchetypeCardBody + opt-in bespoke) · archetype (needs expanding the registry to all 22 keys) · catalog.
- **2 domain→platform leaks to fix** (both in provisioning, not kernel/host): `workUnitProvisioningAnswer.ts:178` (`FocusPanelSubjectSnapshot` embeds Household/Children card shape) + `focusPanelWorkModeModelFromProvisioningAnswer.ts:66` (hardcoded domain truth keys).
- **Endpoint:** re-run the "add `family_alerts`" test to certify PASS (target: one array entry + one component, 0 central edits).

### Workstream E — Runtime boundaries (NS)
Certify Initial Panel / Deferred Detail / Kernel / Provisioning / View Models / Composition / Surface Host — each with clear ownership, dependency direction, public contracts, bounded imports, no circular knowledge.

### Workstream F — TypeScript architecture (NS)
First justified Runtime project-reference/package boundary (agent D found the eager graph is 1098 modules; the substrate ≈240; Seam B comms/16-importers + Seam D drawer-Tier-3-already-lazy are the low-blast first cuts). Measure cold/warm typecheck + RSS before/after (baseline: cold tsc 229 s / 4.17 GB / 5,671 files). Enforce import direction. Delete obsolete orchestration as the registry replaces it.

### Workstream G — Runtime diagnostics (NS)
Make every optimization permanently observable: compose phases, reveal phases, card timings, deferred timings, cache hit/miss, request counts, duplicate work, surface composition, runtime dependency graph. Future regressions diagnosable in minutes.

### Cross-surface certification (NS — GATES certification)
Before declaring Runtime V1 certified: extract the contracts from Work Unit, then validate against a **second, meaningfully different real Alloy surface** (different entity/grain, card set, permissions, dependencies, placement, ≥1 deferred interaction). PASS = domain cards/composers added + registration/placement declared, with Kernel/Surface-Host/reveal/central-orchestration UNCHANGED. FAIL = any central switch edited or kernel learns the new entity type. Do not build speculative abstraction — extract from the proving slice first, then validate.

---

## 7. Housekeeping notes
- 5 untracked `web/playwright/tests/zz-runtime-polish-*.spec.ts` are **pre-existing** harnesses from before this session (not this session's work) — left untracked.
- Dev server is currently running on `:3013`; the prod `.next` build is stale (overwritten by dev). Rebuild prod (§2) for the next aggregate measurement.
- Scoreboard (updated): Performance A−, Critical Path A−, Documentation A−, Extensibility D+ (from F), Runtime Architecture A− (holds; extensibility debt offsets), TS Arch C+, Dep Graph B, Testing C, Scalability C, Diagnostics F. Overall ~60%.
