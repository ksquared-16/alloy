# Handoff — Runtime V1 Platform Polish & Responsiveness

**Read this first, then `docs/platform/governance/managed-sprint-operations.md`.**

## Where you are

| | |
|---|---|
| Root | `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-polish` — **managed-worktree, SANCTIONED** (verify with `alloy-root`) |
| Slot / port | 3 / **3013** (`http://127.0.0.1:3013`) |
| Branch | `agent/claude/3-runtime-v1-polish` |
| Base | `origin/staging @ 73efded9d` |
| State | **14 commits ahead / 43 behind. COMMITTED, NOT PUSHED. Do not push/merge without Kelly's explicit authorization.** |
| Sprint doctrine | This is **polish, NOT Runtime V2**. Enhance the canonical implementation; less code, clearer ownership; no new frameworks/loaders/caches/runtimes. |

Kelly's pace preference: move fast, terse status, bias to implementing, run verification in the background.

## What shipped (all committed, all typecheck-green)

Priority order Kelly set: 1 Focus Panel loading, 2 random reload, 3 nav responsiveness, 4 /organization transitions, 5 save, 6 consistency, 7 micro-interactions, 8 Thinking (done).

| Commit | Item | What |
|---|---|---|
| `21a7a36f6` | 8 | Calm continuous CSS "Thinking" breath (replaced 450ms stepping-ellipsis JS timer). |
| `e8c12542b` | 6 | Removed duplicated `QuoteModalProvider` in `app/layout.tsx`. |
| `81a8c8ee9`, `225b40dad` | 1/3 | Focus Panel reserved cells: unified settle-in-place + calm neutral hold (`motion-settle` on cell mount). |
| `da18e40cd`, `75061dcab` | 2 | Reload floor: 3s→**15s** (was guillotining slow-but-live navs) + explicit prior-timer cancellation + fire diagnostic. **14/14 unit tests** incl. Kelly's scenarios. |
| `5f3421c15` | 3 | **Left-nav instant acknowledgement** — `AdminV2NavLink` now consumes the nav-transition pending snapshot (was only the workspace tiles). Clicked item highlights immediately. |
| `37df95f67` | D/6 | Memoized `WorkspaceOrg` / `AdminVertical` / `EntityLabels` provider values (reduce re-render churn). |
| `52e6c0de7` | B/save | Immediate pending+disabled acknowledgement on command-rail action buttons (shared `useCommandRailActionPending` hook) — prevents double-submit. |
| `649106bee` | 1 | Not-applicable / never-produced Focus Panel cards render RESOLVED-empty (once `model.source === "drawer_vm"`), not a forever-loading hold. Fixed a stuck `milestones` card. |
| `139cc7b8d` | — | **REVERT** of `811f1fb58` (fast-reveal/atomic-gate drop) — it caused a "Loading current work…" flicker; traded prod coherence for dev-only speed. |
| `8bcc36b0a` | 1/perf | **Defer speculative prewarm during the reveal** — see Performance below. |
| `41a40431f` | 1/perf | **Cap the workspace-landing N+1** off the shared work-unit critical path — see Performance below. |

## Certification status (auth is available — see "How to run")

- **Focus Panel timing (measured, cold localhost):** baseline 13.3s first-meaningful / 25.1s all → after both perf fixes **9.4s / 18.8s**. Prewarm storm 7+3 → 5+1 (deterministic).
- **/organization (definitive `page.on("load")` probe):** `hardLoads:0`, document + shell PERSIST across every sub-route → soft nav, no hard reload, no full "Loading settings…" reset. Immediate ack via `AdminV2NavLink`.
- **Reload floor:** 14/14 unit tests (second-destination cancels first timer, repeated clicks no double-reload, slow-succeeds no reload). Live 15s-fire on a genuine hang NOT spec-tested.
- **Save double-submit:** guard is structural (`disabled={isPending}`); browser spec skipped (command-rail actions collapse behind the "Actions" toggle for the default subject).

## The performance investigation (Focus Panel "20s localhost") — ENDPOINT B reached

Kelly escalated: isolate the exact source, targets warm<3s/cold<5s, no "prod probably faster."

**Root cause = repository amplification, NOT Supabase.** Direct isolation (`node --env-file=/Users/Kelly/Alloy/web/.env.local` from `web/`, using `createAdminClient` — a fresh PostgREST/HTTPS client per call to *remote* staging `ikaxilmwmrmbagoidedu.supabase.co`): **~350–800ms/query**, 5-parallel 778ms vs 5-sequential 1725ms. The 5–20s was **saturation** from a prewarm storm.

**Storm (before, one work-unit open):** ~7 provisioning-answer + 3 view-model + 3 stage-work concurrent with the SELECTED reveal — neighbour-subject prewarm (`prewarmSubjectDestination` in `useCommittedWorkUnitSurfaceRuntime`) + per-view provisioning (`warmDestination` loop in `useWorkspaceSurfaceRuntime`). The `drawerVmPrewarmScheduler`'s reveal-window guard ("prewarm must never compete with the primary reveal") was **DEAD CODE — 0 callers**.

**Fixes made (`8bcc36b0a`, `41a40431f`):**
1. `useCommittedWorkUnitSurfaceRuntime` — `beginWorkUnitPrimaryReveal()` when a Work Unit COMMITS (before the storm) + skip `prewarmSubjectDestination` while active.
2. `useWorkspaceSurfaceRuntime` — skip/hold per-view `warmDestination` while a reveal is active.
3. `useRecordWorkRuntime` — `endWorkUnitPrimaryReveal()` when the selected VM applies (every path + cleanup).
4. Workspace layout — `withTimeoutOrDefault(loadOperatorLifecycleLandingCardsServer, 600ms, [])` — the landing-only N+1 no longer gates the shared work-unit route (client refinement fills the landing).

**No material avoidable repository delay remains.** Children-orientation (`lib/admin/opportunityEntityRecord.ts:755-884`) is ALREADY optimal (batched `.in()`, `Promise.all` overlays, concurrent contacts; `batch→overlay→draft` is a genuine data-dependency chain). `proxy.ts` in dev logs = Next dev-server internal (~1.1s DEV tax, not app code).

**Why localhost still can't hit <5s (external, proven):** `next dev` client hydration alone is **~5–7s** (unminified bundle + dev React) + remote-Supabase ~350–800ms/hop × the inherent sequential chain (layout → provisioning-resolves-default-subject → enriched → stage-work). **PRODUCTION IS UNVERIFIED (no access)** — structurally should be far faster; do NOT close on "probably faster."

## Open / deferred / architectural

- **PROD Focus Panel measurement** — the target must be MEASURED, not inferred; localhost is dev-hydration-bound. Establish a warm/pooled-DB or prod measurement path.
- **/organization true prior-content HOLD** — ARCHITECTURAL: the content slot is a Next route segment; no route-content-hold primitive exists; removing `settings/loading.tsx` bubbles to `AdminV2SettingsClientProviders`' own "Loading settings…" Suspense = worse full reset. The strongest V1 solution (immediate ack + stable shell + calm reserve + no reset/reload) is already in place. True hold would need a competing content-ownership runtime (out of scope).
- **Focus Panel two-phase reveal** — structural (commit-critical answer → enriched VM), mitigated (calm reserve + not-applicable fix + storm defer), not eliminated. Prefetch (`prewarmRecordWork`) already warms the default subject; the phase visibility scales with round-trip time.
- Save acknowledgement covers COMMAND-RAIL actions only, NOT the Focus Panel "What's Next" buttons (Message/Schedule tour/etc.) — a separate action path, unaudited.
- Deeper server-compose split (timeout+background-warm on `attention_bundle`/`header_actions` in `resolveOpportunityDrawerFirstPaintDependencies.ts`) — not done.

## How to run (this worktree)

- **Dev server:** `alloy-dev-start wt3-runtime-v1-polish` (NEVER bare `next dev`). Server is memory-heavy; the host caps at `ALLOY_MAX_RUNNING_SERVERS=3` and OOM-crashes at 4 — free a slot by stopping a sibling only with Kelly's OK. Do NOT raise the cap.
- **Auth (for browser cert):** already captured via `alloy-agent-login 3` (QA identity `qa-slot3-performance@example.com`), storage-state at `~/.local/state/alloy-dev/auth/slot3/storage-state.json`. Supabase session expires ~1h — re-run `alloy-agent-login 3` if `alloy-agent-verify 3 authenticated-home` fails.
- **Cert harnesses (UNTRACKED, in `web/playwright/tests/zz-runtime-polish-*.spec.ts`):** run with
  `cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3013 PLAYWRIGHT_STORAGE_STATE="$HOME/.local/state/alloy-dev/auth/slot3/storage-state.json" npx playwright test playwright/tests/zz-runtime-polish-focus-panel-waterfall.spec.ts --reporter=line`.
  The waterfall spec prints `WATERFALL_NET/PHASES/CARDS` (network timeline + server `phases_ms` + per-card meaningful times). **Do NOT run the 8GB typecheck concurrently — it confounds timings.** Compare warm-server runs only (first hit after restart pays route compile).
- **Typecheck:** slow one-shot (`npm run typecheck`, ~7min cold) — each cold `tsc` re-parses ~15k files. For an active loop, run a single persistent `tsc -p tsconfig.build.json --noEmit --watch` (seconds/edit). Tests need `arch -arm64` + node22; the wt3 npm install pulled the x64 rolldown binding under emulation — `arch -arm64 npm install --no-save @rolldown/binding-darwin-arm64@1.0.0-rc.12` is applied.
- **Supabase isolation diag:** put a `.mjs` inside `web/` (for node_modules resolution) and `node --env-file=/Users/Kelly/Alloy/web/.env.local ./x.mjs`.

## Do-not-repeat gotchas
- The prewarm reveal-window guard is now WIRED — don't re-add speculative prewarm without gating on `isWorkUnitPrimaryRevealActive()`.
- Running the typecheck watcher + dev server + Playwright together OOM-crashed the dev server. Keep concurrency low.
- Don't stop sibling dev servers (wt1/3011, wt5/3015, wt6/3020) — they're other active sprints.
