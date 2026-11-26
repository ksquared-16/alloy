# Closeout — Selected-Record Pre-Fetch Gap Investigation

**Branch:** `agent/claude/3-runtime-v1-polish` (slot 3 / wt3, port 3013)
**Base:** `origin/staging` (15 ahead / 47 behind at closeout)
**Status:** COMMITTED-NOT-PUSHED. Optimization work only — the architectural correction (Runtime V1 Realization) is explicitly deferred to a dedicated session.
**Read first for the runtime doctrine:** `HANDOFF-runtime-v1-polish.md` (prior session), then this file.

---

## 1. Mandate

Reopen the Focus Panel performance question with one focused objective: explain why **selected-record requests do not start until ~9–12s after navigation**, decompose the 0→first-request window, and — the mandatory step the prior session skipped — **measure a local production build** (`next build` + `next start`) against `next dev` to separate dev-only tax from repo-owned cost.

Decision rule: if the prod build is fast and the delay is dev-only → close with evidence; if the prod build still delays materially → fix the repo-owned hydration/fetch-start path.

---

## 2. Discoveries (what is now proven, not inferred)

1. **The prior "ENDPOINT B / localhost is dev-hydration-bound / no material avoidable repository delay remains" conclusion is WRONG.** The production build still materially delays the first selected-record request.

2. **The first request is hydration-gated, and hydration is bundle-gated.** In every production run, the first `provisioning-answer` fires ~10ms *after the last JS chunk finishes downloading*. The eager client bundle is literally on the critical path to the first request.

3. **`next/dynamic` cannot decouple it in this stack.** Next 16 + Turbopack (App Router) loads the route's lazy chunks during the initial navigation — `dynamic(ssr:false)` defers *render/hydration*, not *download*. Code-splitting the Activity/Communications cockpit, tab panes, Documents, and 3 action modals moved **~0.3% of critical bytes** and removed **zero** chunks from the pre-first-request set.

4. **The wall-clock is dominated by server compose on the serial critical path, not the bundle.** Warm-prod decomposition: provisioning compose ~3.9s → enriched VM compose ~6.5s → stage-work ~2s, all serial, all gated behind bundle+hydrate (~3.6s).

5. **Two real prewarm-amplification sources compete with the primary reveal** (both fire *into* the enriched-VM window): the Activity **communications prewarm** (~4.6s, 2 remote hops) and **4 concurrent sibling work-view `provisioning-answer` composes**. Neither is caught by the existing reveal gate. BUT — eliminating them did **not** move first-card/all-cards, because contention is not the bottleneck; the enriched compose's own server time is. (See §6.)

6. **The server does not know the default/selected subject before the client hydrates.** `[recordId]/page.tsx` returns `null` and never reads `params.recordId`; the default subject is resolved only *inside* the client-triggered provisioning-answer handler — even though the server already owns the resolution helpers (`composeWorkUnitProvisioningAnswer`, `resolveWorkUnitByRouteSlug`).

---

## 3. Root causes

| Symptom | Root cause |
|---|---|
| First request starts ~5–9s after nav | Fired by a post-hydration client `useEffect` in `lib/experience/surfaceHost/SurfaceHostContext.tsx` (`kernel.attention.hydrate` on cold load). It cannot run until React hydrates the full provider stack + Focus Panel tree. |
| Hydration is slow | ~1.82 MB / 65–67 route chunks must download + evaluate before hydration completes. Next loads them all up front regardless of `next/dynamic`. |
| Slow TTFB (~1.3–1.5s warm) | Two stacked `force-dynamic` RSC layouts: `adminV2/layout.tsx` (`await getAdminAuth()`) + `workspace/layout.tsx` (a **second** `getAdminAuth()` + a `Promise.all` of six server loads). |
| First card ~7.6s | Household comes from the provisioning snapshot, which only lands after the client Request-A round-trip (~3.9s compose) that itself waits for hydration. |
| All cards ~16s | Enriched VM (~6.5s server compose, remote Supabase) + stage-work (~2s), serial after the subject commits. |
| Prewarm storm | `prewarmSubjectDestination` neighbor warm is gated, but the **sibling work-view** prewarm (`prefetchWorkView` → `prepareOperationalDestination`) and the **Activity comms** prewarm are not; both idle-schedule *into* the reveal window (the main thread is idle during the network-bound reveal). |

---

## 4. Measured improvements (production build, warm)

Metric legend: **critBytes** = JS transferred before the first provisioning request (the low-variance, bundle-attributable metric); **1st req** = first `provisioning-answer` start; **1st card** = household meaningful; **all** = every card meaningful. Card times carry high remote-Supabase variance.

| Build | critBytes | chunks (crit/total) | 1st req | 1st card | all cards |
|---|--:|--:|--:|--:|--:|
| `next dev` cold | — | 102 | 7.4s | 11.9s | 26.1s |
| `next dev` warm | — | 102 | 5.4s | 9.6s | 19.2s |
| **prod, pre-split** | 1,822,714 | 65 / 65 | 3.9–4.5s | 7.3–8.4s | ~17s |
| **prod, code-split (final)** | 1,817,485 | 67 / 67 | 3.5–3.8s | 6.7–7.0s | ~16s |

**Net of the shipped code-split: marginal (~0.3–0.8s), from `ssr:false` components skipping hydration — NOT from a smaller download.** The bundle is essentially unchanged and every chunk still loads before the first request. The production build is only modestly faster than warm dev, and *dramatically* different from the "dev-only" story the prior session told.

### Final prod build (code-split only, 3 runs) — the answer to the decision point

| Run | critBytes | chunks (crit/total) | chunks done | 1st req | 1st card | all cards |
|---|--:|--:|--:|--:|--:|--:|
| cold process | 1,817,485 | 67 / 67 | 7,194ms | 7,206ms | 11,469ms | 21,165ms |
| warm | 1,817,485 | 67 / 67 | 3,605ms | 3,611ms | 6,854ms | 15,588ms |
| warmest | 1,817,485 | 67 / 67 | 3,387ms | **3,395ms** | 6,655ms | 15,453ms |

**The first selected-record request is STILL fundamentally hydration-gated.** In every run `criticalTransferBytes` == total (all 67 chunks download before the first request), and the first request fires **8ms after the last chunk lands** (warmest: chunks done 3,387ms → 1st req 3,395ms). Completing the safe code-split did not change this.

Per the mandate's decision rule, this is the trigger condition: *"If, after those changes, the first selected-record request is still fundamentally hydration-gated, then we'll begin a new dedicated Runtime V1 Realization session."* → **That condition is met. The lower-risk optimization work is exhausted; the remaining fix is architectural (see §7).**

---

## 5. What shipped vs. what was reverted (clean baseline)

**Kept (this session's product change = code-split only):**
- `components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` — Activity cockpit `dynamic(ssr:false)` (renders only in Activity mode).
- `components/admin/focusPanel/FocusPanelCardRenderer.tsx` — `OpportunityDrawerVmTabPanes` dynamic (drill-only content).
- `components/admin/vmDrawer/OpportunityDrawerVmTabPanes.tsx` — `CommunicationsDrawerSection` + `EntityDocumentsSection` dynamic (tab-gated).
- `lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx` — 3 conditionally-rendered modals (incl. the 958-line enrollment-packet builder) dynamic.

All behavior-preserving (every split target was already interaction/mode-gated). Marginal measured benefit; kept because it is safe and completes the "finish safe code splitting" directive.

**Reverted (belongs in the Realization sprint, not here):**
- Prewarm-storm gating (routing the Activity-comms + sibling-view prewarms through the reveal scheduler). It touches the reveal lifecycle (runtime ownership), and — because `beginWorkUnitPrimaryReveal` clears the queue on the *second* begin (enriched-start) — it *disables* rather than *defers* those prewarms. It also did not move wall-clock. Documented here instead of shipped.

**Not attempted (measurement predicts no safe win):**
- Provider-scope narrowing: the workspace provider stack (auth, entity labels, timezones, org, operational mode, route VM, **runtime kernel**, surface host) is genuinely shared by both the Workspace and Work Unit surfaces, and the kernel/host **must** wrap both for retention. Not safely narrowable, and would not reduce the first-paint graph.

---

## 6. Why the shipped work is honestly marginal

The investigation ruled out the two things that are *not* the bottleneck:
- **Bundle size** — code-split can't decouple the download from hydration in this Turbopack App Router setup (framework fact, proven by flat critBytes).
- **Prewarm contention** — eliminating the sibling-view + comms storms left first-card/all-cards unchanged, because the enriched VM's ~6.5s server compose dominates.

The remaining delay is **structural**: the critical selected-record data path is gated behind (a) full client bundle download + hydration, then (b) a serial server-compose chain (provisioning → enriched → stage-work). Neither is addressable by optimization within the current runtime boundary.

---

## 7. Remaining architectural gap → Runtime V1 Realization sprint

The frozen Runtime V1 contract says: *the route owns one above-fold Surface ViewModel; subject identity is available synchronously; critical selected-subject work is not gated behind the full client bundle.* The shipped implementation violates all three: the subject is resolved by a post-hydration client round-trip, so the Surface VM is neither server-composed nor synchronously available.

**Recommended correction (design already scoped, NOT built this session):**
- Reuse `composeWorkUnitProvisioningAnswer` (existing resolver) in the route bootstrap; seed the existing client provisioning cache (`consumeFreshProvisioning`) — **no new endpoint, no second Surface Host, no VM-contract change.**
- Critically: a naive "resolve in RSC and block" is net-neutral (it just moves ~3.9s from after-hydration to before-HTML — serial reorder). The win requires **RSC streaming**: stream the shell + subject identity at ~1.5s, compose provisioning (+enriched) server-side *overlapping* the client bundle download, stream the VM in. Projected: **first card ~5.4s (from ~7.6s), all cards ~12s (from ~16s), shell+subject visible ~1.5s.**
- Cert bar (from the mandate): subject identity immediate with the committed shell; no subject flicker; no wrong-record flash; latest-click-wins; no partial false-empty; Activity/action code loads only when needed.

**Secondary items for that sprint (diagnosed here):**
- Prewarm-storm proper fix: mark the reveal active at the **kernel commit** (`RuntimeKernelContext.onCommitCompleted`), not in a presentation `useEffect` — so child prewarm effects (which run before parent effects) see the reveal active and *defer-then-drain* instead of firing into the reveal. Also fix the double-`beginWorkUnitPrimaryReveal` queue-clear so deferred prewarms drain after the reveal instead of being dropped.
- TTFB: collapse the double `getAdminAuth()` across the two `force-dynamic` layouts.

---

## 8. Branch-delta accounting (+441k / −127k)

**This is not churn this branch introduced.** The number is a comparison against `main`:
- vs **`main`**: 6,140 files, **+515k / −135k** (≈ the +441k/−127k figure) — but the branch is **1,467 commits ahead of main**, virtually all of it inherited **staging** history (the whole team's features, refactors, the tracked `backend/.venv` Python binaries, hero images `web/public/hero/*.jpeg` up to ~9.5 MB each, and archived sprint PNGs under `docs/sprints/archive/`).
- vs **`staging`** (the true base): **21 files, +577 / −254** — the actual branch contribution (all prior-session polish) + this session's 4-file code-split.

**Action:** this branch's PR should target **staging**, not main. Against staging there is no unnecessary churn; `.next` and `node_modules` are not tracked; the only working-tree changes are the 4 intentional code-split files.

---

## 9. Reproduce (this worktree)

- **Fast measurement build** (skip the ~7-min typecheck; chunk output identical): `SKIP_BUILD_TYPECHECK=1 npx next build`. Incremental Turbopack rebuilds are ~1 min. Validate types out-of-band before promotion (`tsc --noEmit` / a full `next build`). NEVER use the skip flag for CI/promotion.
- **Serve prod with trusted env:** the toolkit two-tier env is reused via `scripts` — source the toolkit lib and load `alloy_load_trusted_server_env_exports`, then `next start -p 3013`. (Helper used this session: a wrapper that sources `lib/common.sh`+`lib/verify.sh`, runs `alloy_load_config` + `alloy_load_trusted_server_env_exports`, execs the command. 22 trusted vars, no secrets printed.)
- **Harness:** `web/playwright/tests/zz-runtime-polish-prefetch-gap.spec.ts` (UNTRACKED). Anchors on Navigation Timing (navigationStart=0), reports `PREFETCH_NAV/CHUNKS/APIS/FIRST_PROVISIONING/CARDS`, and separates `criticalTransferBytes` (bytes before first provisioning) from total. Run: `cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3013 PLAYWRIGHT_STORAGE_STATE="$HOME/.local/state/alloy-dev/auth/slot3/storage-state.json" npx playwright test playwright/tests/zz-runtime-polish-prefetch-gap.spec.ts --reporter=line --timeout=150000`.
- **Host is memory-constrained:** a full-typecheck `next build` (4× 8 GB tsc workers) drove swap to 11.4 GB / 12 GB and thrashed; the prod server OOM-crashed under repeated Playwright runs. Keep concurrency low, reap Chromium between runs, use `SKIP_BUILD_TYPECHECK=1`.
