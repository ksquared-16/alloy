# Runtime V1 Realization — Ledger

**Branch:** `agent/claude/3-runtime-v1-polish` (slot 3 / wt3, port 3013)
**Base:** `origin/staging` @ `31c710068` (17 ahead / 47 behind at session start)
**Mission:** correct the shipped selected-subject critical path to faithfully realize the frozen Runtime V1 architecture. No new runtime / reveal engine / cache / endpoint / parallel ownership path.
**Baseline (accepted):** warmest local-prod — critBytes 1,817,485 / 67 of 67 chunks · first req 3,395 ms (8 ms after last chunk) · first card 6,655 ms · all cards 15,453 ms. First selected-record request is hydration+bundle gated.

---

## Phase 0 — Reorientation (COMPLETE)

- Managed worktree confirmed: `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-polish`, slot 3, branch `agent/claude/3-runtime-v1-polish`, HEAD `07ae34dad` (closeout) atop `f54603806` (code-split) — the mission's two starting commits. Tree clean except the 5 documented untracked `zz-runtime-polish-*.spec.ts` harness files.
- Wrong-base guard passed: the Cowork cwd (`lead-enrollment-product-afac85`, `claude/runtime-v1-critical-path-ceb314`) is **unmanaged, 209 behind staging, scheduling merge-base, none of the Runtime work** — NOT used. Similarly-named `agent/claude/3-runtime-realization` (wt3-runtime-continuity) is a red herring (2026-07-17, 479 behind, already merged PR #227, lacks the code-split).
- Operator chose: **reuse slot-3 polish worktree** (build Realization on the polish tip).

### Ownership map (verified, file:line)

| Seam | Owner | Note |
|---|---|---|
| Server route (bare) | `app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx` | returns `null` — **insertion point** |
| Server route (record) | `.../[workUnitSlug]/[recordId]/page.tsx` | returns `null`, ignores `params.recordId` — **vestigial (see finding F1)** |
| Server layout (queue identity) | `.../[workUnitSlug]/layout.tsx` → `loadWorkUnitSlugRouteMetaServer` → `WorkUnitSlugRouteHost` | **already** server-seeds queue identity via a client `useMemo` module-cache write — the template to mirror |
| Server resolver (the one answer) | `lib/runtime/provisioning/workUnitProvisioningAnswer.ts` `composeWorkUnitProvisioningAnswer(req)` | pure async; accepts `requestedSubjectId`; composes rows + recordOfAttention + focusPanelStageWork + subjectSnapshot(household/children) + summaryDoc + presentation + actionsProjection |
| HTTP seam (K2 target) | `app/api/admin/work-units/[id]/provisioning-answer/route.ts` | gate → slug→view resolve → compose. **Compose uses resolved key; cache key is RAW slug** |
| Client consume cache | `lib/runtime/kernel/workUnitProvisioningPrefetch.ts` `consumeFreshProvisioning(url)` / `provisioningAnswerUrl(target,lens,subject)` | URL-keyed `Map<string, Promise<ProvisioningAnswer>>`, one-shot, 60 s TTL — **the seed target** |
| Client entry (K2) | `lib/runtime/kernel/workUnitEntryResourceClient.ts` | `url=provisioningAnswerUrl(ref.target,ref.lens,ref.subject)`; tries `consumeFreshProvisioning(url)` first, else `fetchProvisioningEntryDeduped` |
| Cold-load hydrate | `lib/experience/surfaceHost/SurfaceHostContext.tsx:54-65` | post-hydration `useEffect` → `attentionFromUrl(location)` → `kernel.attention.hydrate` — **the bundle gate** |
| URL projection / parse | `lib/runtime/kernel/attention.ts` `urlFromAttention:350-356` / `attentionFromUrl:316-347` | subject is a **query param `?subject_id=`**, symmetric; path `:recordId` NOT read (F1) |
| K3 commit | `lib/runtime/kernel/focus.ts` `onPreparationTerminal:201-253` | atomic commit; snapshot frozen into `focus.current.snapshot`; `onCommitCompleted:251` |
| Reveal lifecycle | `lib/adminV2/runtime/preload/drawerVmPrewarmScheduler.ts` begin/end + `useCommittedWorkUnitSurfaceRuntime.ts:104` (commit) + `useRecordWorkRuntime.ts:211` (enriched-start) | double-begin bumps epoch + clears queue |
| Enriched VM (all-cards cost) | `useRecordWorkRuntime.ts` → `loadOpportunityDrawerViaViewModel` → `GET /api/admin/view-models/drawer/opportunity/{id}` | ~6.5 s server compose AFTER commit — the all-cards bottleneck |
| Latest-click-wins | `lib/runtime/kernel/provisioning.ts:167-171,215-221` + `focus.ts:211-213` + `useRecordWorkRuntime.ts` `fetchGenRef` + prewarm `epoch` | 3 cooperating generation guards — seeding does not touch these |

### Findings

- **F1 — the `[recordId]` path segment is vestigial.** `urlFromAttention` projects `?subject_id=` (query), `attentionFromUrl` reads `?subject_id=` (query); the path `:recordId` is never generated and never parsed. The mission's "route B = `/work-unit/:slug/:recordId`" does not match the code's actual URL contract. **Realization therefore seeds within the real contract (query subject), covering bare AND `?subject_id` deep links from the one `[workUnitSlug]/page.tsx` (which receives `searchParams`).** A path-positional canonical deep link would be a kernel URL-contract change (attention parse + projection) — out of the seed's scope; flagged for operator decision, not implemented speculatively.
- **F2 — seed key must use the RAW route slug, not the resolved work-unit key.** K2 keys `consumeFreshProvisioning` on `ref.target` = raw pathname slug; the compose internally resolves it to the host key. Seed under `provisioningAnswerUrl(rawSlug, lens, subject)` or K2 will miss.
- **F3 — blocking RSC compose is a serial reorder (net-neutral/possibly worse TTFB); the wall-clock win requires streaming the answer promise so server-compose overlaps client bundle download.** Confirmed by closeout §7; staged as Phase 1 (blocking, correctness) → Phase 2 (streamed promise, speed).
- **F4 — all-cards (~15.5 s) is the post-commit enriched drawer VM** (`/api/admin/view-models/drawer/opportunity/{id}`), separate from the K2 provisioning answer. Improving all-cards needs this compose to overlap too (Phase 2/3).

---

## Realization ledger

| Requirement (frozen law) | Current implementation | Disconnect | Planned correction | State | Evidence |
|---|---|---|---|---|---|
| L2 subject identity commits synchronously, not gated on full client graph | subject resolved only inside post-hydration client K2 fetch | first req fires 8 ms after last chunk | server-compose the answer + seed `consumeFreshProvisioning` so K2 resolves warm | **completed (warm)** | iter-3: primary provisioning absent (seed consumed); first card 6655→**3610** ms |
| L3 one above-fold Surface VM owns readiness | `ProvisioningAnswer` already is that VM, but produced client-side | VM neither server-composed nor synchronously available | reuse `composeWorkUnitProvisioningAnswer` in RSC; no new VM | **completed** | seed carries the whole answer; no new VM |
| L5 authoritative detail via existing provisioning/record/VM paths | correct paths, wrong trigger (post-hydration) | trigger is bundle-gated | move trigger to server via seed; keep client consume seam | **completed** | K2 warm-hit consumes the seed unchanged |
| L2/L6 no partial reveal / wrong-record / stale flash | boot-shell "Thinking…" until atomic K3 commit | (preserved) | seed feeds the SAME atomic commit — no partial identity pre-reveal | not started | cert gate |
| L7 latest click wins | 3 generation guards | (preserved) | seed only warms cache; K2 supersede logic unchanged | not started | provisioning.ts guards |
| Phase 2 — server compose overlaps client delivery | compose runs server-side before any client chunk (iter-3) | — | the client-armed-deferred + Suspense-resolved-client-component design was slower → reverted (F5); Phase 1 seed is best certified | **reverted** | Phase-2 table below |
| Phase 3 — serial critical chain | provisioning→enriched→stage-work serial | — | classify each dependency; reduce only proven-avoidable | not started | — |
| Phase 4 — monolith ownership | initial static path = 1,279 files / 206,506 lines (Agent A) | noncritical modes eagerly on the initial graph | dynamic-split evidenced noncritical modes; delete proven-dead code | **safe wins done; 3/3b/4 documented residual** | commits `5dac324fa`, `97a740a31` |

### Phase 4 — initial-path ownership (Agent A evidence map)

Initial static import path from `ProvisionedWorkUnitSurface`/`InlineOpportunityFocusPanel`: **1,279 files / 206,506 lines**. No barrel drags noncritical modules (ruled out). Ranked eager-noncritical (lines removable from the initial graph):

| # | Noncritical mode | ~lines/files off initial graph | Site | Safe | Status |
|---|---|--:|---|---|---|
| 1 | Create Lead command surface (proc-identity engine + intake extract + its modals) | 19,214 / 129 | `CreateLeadEventHost.tsx:13` (renders null until event) | yes | **split** |
| 2 | Communications composer + FormDelivery + tour modal | 6,314 / 36 | `CurrentWorkActionPanel.tsx:5-8` (behind `surface===` branches) — re-drag of a prior split | yes | **split** |
| 3 | Registry action modals static deps | 4,677 / 25 | `useOpportunityDrawerVmRegistryModals.tsx` | uncertain (hook wires callbacks) | pending |
| 3b | `workflowRun.ts` (2,645) + lifecycle automation engine | — | 2 static entry paths | uncertain | pending |
| 4 | Non-core Focus Panel cards (SchedulingCard 1,033 standout) | 2,674 / 13 | `FocusPanelCardRenderer.tsx` per-key switch | uncertain (sync inline) | pending |
| Phase 5 — TS/workstation perf | incremental typecheck already single-process 15.1s/1.15GB (healthy); storm is `next build`'s in-build checker only | not a config defect — graph SIZE is the cost | shrink the tsc graph via dead-code + eager-dep cleanup (converges w/ Phase 4); keep SKIP_BUILD_TYPECHECK loop convention | in progress | `time -l npm run typecheck` |

### Phase 5 — TS execution path (measured)

| Path | time | peak RSS | procs | note |
|---|--:|--:|--:|---|
| incremental typecheck (`npm run typecheck`, warm tsbuildinfo) | 15.1 s | 1.15 GB | 1 | HEALTHY — no storm |
| cold full typecheck (no tsbuildinfo) | **156 s** | **3.27 GB** | 1 (single `tsc -p`) | not 7 min; single process; incremental-cached so rarely paid |
| `next build` in-build typecheck | — | ~4×8 GB (closeout) | N | the actual storm — avoided by `SKIP_BUILD_TYPECHECK=1` in the loop; expected in CI (more RAM) |

Config is sound: single `tsconfig.build.json`, no project references (no `tsc -b` fan-out), `incremental: true` + `skipLibCheck: true`, tsbuildinfo present. **No config restructure needed.** The lever is graph size.

**Phase 5 after (post 26-file deletion):** incremental typecheck 14.1 s, single process, clean — healthy, maintained; 26 files off the tsc graph. Cold-typecheck re-measure skipped (2,793 lines ≈ 1.4% of the graph — below measurement noise; not worth the memory-tight cold run).

## Behavioral certification matrix (local prod, authed slot3) — PASS, no regressions

Specs (UNTRACKED): `zz-realization-cert-matrix.spec.ts`, `zz-realization-cert-gaps.spec.ts`. Every case: 0 console errors, 0 hydration warnings.

| Case | Result |
|---|---|
| bare Work Unit cold load | ✓ seed consumed (0 primary provisioning reqs), "Wenc Family" visible, reveal completes |
| explicit selected-subject deep link `?subject_id=` | ✓ committed subject + URL + active row all = Kurzman |
| queue-row click | ✓ single click switches subject (Wenc→Kurzman) |
| rapid switching ×5 + latest-click-wins | ✓ final click (Wenc) wins |
| wrong-record / stale flash | ✓ NONE — only one distinct subject `h2` sampled through the whole rapid switch |
| warm revisit | ✓ faster first-card than cold (2491 vs 3701) |
| back / forward | ✓ subject switches are `replaceState` by design (URL is a projection); forward restores, no error |
| Activity mode | ✓ renders + comms fetch fires |
| Communications composer (dynamic split) | ✓ loads + opens |
| Create Lead launch (dynamic split, 19k lines) | ✓ loads + modal opens on event |
| Form Delivery (dynamic split) | ✓ `form_delivery` surface renders |
| tour action surface (dynamic split) | ✓ `inline_form` surface renders |
| no-data / failed-compose (bad slug) | ✓ honest error surface, no blank crash |
| Workspace→Work Unit entry (click) | ~ not exercised (tiles expose no `<a href>` locator); TARGET (bare load) certified by C1; intent-prefetch click path untouched by these changes |
| Previous / Next | ~ not exercised (control not located); same `attention.move(SUBJECT)` mechanism as the certified queue-row switch |
| save → refresh → retained subject | ~ not exercised (save control not located); save/refresh path untouched by these changes |

Inspected per case: subject identity, wrong/stale flash, dup provisioning/VM requests, hydration warnings, console errors, reveal state, URL/subject sync, cache consumption, latest-click-wins. **No regression found.**

## Phase 3 — serial-path reduction (map + targeted fixes)

Warm full-panel path (after Phase 1), classified per step:

| Step | Owner | Server timing (warm) | Classification |
|---|---|---|---|
| route gate / auth / context | `loadAdminRouteGate` → `loadAdminAccessBundleCached` | request-memoized | genuine, already deduped |
| slug / work-view resolution | `resolveWorkUnitByRouteSlug` via layout | ~2 DB reads | **was duplicated** (route-meta + provisioning) → fixed (A) |
| server provisioning seed | `composeProvisioningAnswerForRoute` (blocking, cold) | TTFB ~1.8 s warm | genuine; carries commit-critical Focus Panel |
| enriched VM composition | `/api/admin/view-models/drawer/opportunity/{id}` | ~6 s | genuine Settlement; some re-reads (C) |
| stage-work | `completeVmWithStageWork` → `/stage-work` | ~2 s serial | re-fetch of data the provisioning answer already carries (D) |
| reveal commit | K3 `onPreparationTerminal` | — | genuine |

- **A — dedup slug→identity resolution. DONE (`5148c9708`).** `resolveWorkUnitRouteIdentityCached` (React `cache()`) shared by the route-meta seed and the provisioning seed → one resolution per request instead of two. Neutral wall-clock (the two ran in parallel — this halves DB load, not the serial path); no regression (C1/C2/C3/C7 re-certified).
- **B — repeated `getAdminAuth`/context. NO CHANGE NEEDED.** Already request-memoized via `loadAdminAccessBundleCached` under `loadAdminRouteGate`; the double call only repeats cheap in-memory transforms.
- **C — enriched VM vs Provisioning Answer (MAPPED, residual).** The enriched VM (`resolveOpportunityDrawerFirstPaintDependencies`) re-reads `inquiry_children` from the record metadata — the SAME source the provisioning answer's `focusPanelSubjectSnapshot` already used — plus the subject's primary contact. Reusing it would require handing the provisioning-composed data to the SEPARATE post-commit enriched-VM request (a contract change / cross-request plumbing). The mandate forbids merging VM contracts; deferred as documented residual (the enriched VM's deeper reads — full family, emergency contacts, addresses, per-child detail — are genuinely new and must stay).
- **D — stage-work sequencing (MAPPED, residual).** The provisioning answer already carries `focusPanelStageWork` for the committed (default) subject, yet `completeVmWithStageWork` re-fetches `/stage-work` client-side (~2 s serial on the all-cards path). On a cold load (committed == default subject) the client could reuse the answer's `focusPanelStageWork` instead of re-fetching, removing one serial request. Genuine reuse, but it touches the enriched-VM/Settlement client path (`useRecordWorkRuntime`) — moderate risk; deferred as documented residual (the all-cards ~12.7 s lever).

## Phase 4/5 residual set (documented — NOT done, evidence attached)

- **Finding 3 — registry action modals (~4.6k lines).** The 7 still-static modals in
  `useOpportunityDrawerVmRegistryModals.tsx` are ALWAYS-mounted with an `open` prop (unlike the 3 already-
  dynamic siblings, which are conditionally mounted `{open ? … : null}`). `dynamic` alone won't defer an
  always-mounted component — each would need converting to conditional-mount too, a modal-lifecycle change
  (exit animation / internal state reset) requiring per-modal interaction cert. Deferred (needs care).
- **Finding 3b — `workflowRun.ts` (2,645) + lifecycle automation engine.** Reached via TWO static entry
  paths (tour-booking refresh + `emitStatusChangedEvent`); action-time code eagerly on first paint. A real
  win but a multi-edge refactor, not a single dynamic wrap. Deferred.
- **Finding 4 — non-core Focus Panel cards (SchedulingCard 1,033 + config subtree).** Cards render
  synchronously inline in `FocusPanelCardRenderer`'s per-key switch; not on the lead first-paint (scheduling
  is outside the lead composition), so the win is graph-only, and making it dynamic adds a visible pop-in
  for scheduling contexts I cannot cert against `new-leads` this session. Deferred.
- **Deeper ownership** (narrow effects/state/providers/refresh; small explicit module contracts;
  `InlineOpportunityFocusPanel`'s ~40-import hub) — structural refactors beyond the evidence-safe pass.

States: not started · in progress · blocked · completed · reverted · deferred(reason)

---

## FINAL SUMMARY (session close)

### Commits (this session, atop polish closeout `07ae34dad`)
| # | Commit | What |
|---|---|---|
| 1 | `d1314bb57` | Phase 1 — server-compose + seed the Provisioning Answer (first card 6.7→3.6 s warm, −46%) |
| 2 | `7e7ea0cb6` | Phase 2 finding (streamed overlap slower → reverted; F5) |
| 3 | `5dac324fa` | Phase 4 — split Create Lead + Communications composer off the initial graph (−49.5 KB) |
| 4 | `97a740a31` | Phase 4 — delete 26 dead files / 2,793 lines |
| 5 | `5148c9708` | Phase 3-A — dedup slug→identity resolution (`cache()` shared resolver) |
| + | ledger docs | cert matrix, Phase 2 wording, Phase 3 map |

### Kept / reverted / deleted file ledger
**Kept (new/changed):** `[workUnitSlug]/layout.tsx` (seed), `[workUnitSlug]/page.tsx` (anchor), `[id]/provisioning-answer/route.ts` (delegates), `composeProvisioningAnswerForRoute.ts` (new, shared), `workUnitProvisioningPrefetch.ts` (`seedProvisioning`), `ProvisioningAnswerSeed.tsx` (new), `resolveWorkUnitRouteIdentityCached.ts` (new), `loadWorkUnitSlugRouteServer.ts` (shared resolver), `CreateLeadEventHost.tsx` + `CurrentWorkActionPanel.tsx` (dynamic splits).
**Reverted:** Phase 2 streamed overlap (armSeed/resolveSeed/ProvisioningSeedArm + Suspense) — slower (F5). Iter-1 blocking page-seed, iter-2 crashing RSC-promise prop.
**Deleted:** 26 files / 2,793 lines (orphaned singular Person/Child VM drawer cluster + hard-cutover shims + unused focus-panel/drawer components + 2 dead barrels).

### Before / after
| Metric | Baseline (staging polish) | After (this session) |
|---|--:|--:|
| first card (warm) | 6,655 ms | **3,610–4,800 ms** (seed; run-variance) |
| first card (cold) | 11,469 ms | 7,370 ms |
| all cards (warm) | 15,453 ms | ~12,700 ms |
| bundle transfer | 1,817,485 B | **1,767,948 B** (−49.5 KB) |
| initial-path graph | +25k noncritical lines eager | Create Lead + Comms composer split out |
| dead code | — | −2,793 lines (26 files) |
| slug resolution / layout render | 2× (duplicate) | **1×** (`cache()` shared) |
| incremental typecheck | 15 s / 1.15 GB / 1 proc | 15–22 s / 1.15–2.0 GB / 1 proc (healthy) |
| cold typecheck | 156 s / 3.27 GB / 1 proc | ~same (26 files lighter) |
| net vs staging | — | **−1,764 lines** (deletions > additions) |

### Residual ownership map (documented, NOT done)
- Phase 3-C: enriched VM re-reads `inquiry_children`/primary contact the provisioning snapshot has — cross-request contract change, deferred.
- Phase 3-D: stage-work re-fetched despite the answer carrying `focusPanelStageWork` — reuse on cold load would trim ~2 s off all-cards; touches Settlement client path, deferred.
- Phase 4 Findings 3/3b/4: registry action modals (always-mounted → need conditional-mount+dynamic), `workflowRun.ts` automation engine (2 entry paths), SchedulingCard (sync inline). Behavior-nuanced, deferred.
- The 4 sibling-view `provisioning-answer` prewarms (the reveal-window "storm") — a known reveal-lifecycle residual, out of this scope.
- Cold-load TTFB +~2 s (blocking compose on cold config cache) — offset by faster cold first-card; Phase 2 streaming can't remove it (F5).

### Branch cleanliness & staging base
- Branch `agent/claude/3-runtime-v1-polish`, base `origin/staging`. **Committed, NOT pushed.**
- Working tree clean except untracked `zz-*` investigation/cert specs (per prior-session convention).
- Net vs staging: 60-odd files, deletions > additions (**−1,764 lines**).

### Promotion recommendation
Promotable to **staging** as a coherent unit: Phase 1 (certified first-card win) + Phase 4 (bundle/ownership + dead-code) + Phase 3-A (dedup), all behind a passing behavioral cert matrix (0 console errors, 0 hydration warnings, latest-click-wins, no wrong-record flash). PR should target **staging** (not main). Suggested pre-promotion: a human spot-check of Workspace→tile entry + a save→refresh (the two cert cases not automatable here — both architecturally untouched). Awaiting operator approval to push/PR.

---

## Phase 1 iteration log

**Iter 1 — blocking page-segment seed (REVERTED).** Composed the answer with a blocking `await` in
`[workUnitSlug]/page.tsx` + seeded from a page-level client component. Measured (cold prod, `new-leads`):
TTFB **regressed** 1.5 s → **3925 ms**, and the primary `provisioning_answer` STILL fired as a network
request at 6927 ms (8 ms after last chunk) — **the seed was not consumed.** Two co-causes, both proving
the approach is wrong by construction:
1. The layout renders `<WorkUnitSlugRouteHost/>` and **discards `children`**, so a page-segment seed
   component is never mounted/hydrated.
2. Even if mounted, blocking the compose delays the page past the shell's Surface Host, which fires K2's
   cold consume first — the seed loses the race to the very compose meant to feed it.

**Iter 2 — streamed layout seed (REVERTED — crashed).** Seed co-located with `WorkUnitSlugRouteHost`,
compose **not awaited**, the pending RSC promise passed as a client prop to stream-overlap the bundle.
Measured: seed WAS consumed (`firstProvisioning = -1`) but the surface **hard-crashed** —
`[pageerror] TypeError: Cannot read properties of undefined (reading 'catch')`, `bodyLen` stuck at 127,
`surfaceSlot=null`, no grid ever. **Passing an unawaited RSC promise as a client-component prop is fatal
in this Next 16 / Turbopack setup** (React never streams a stored-but-un-`use()`d promise's resolution
cleanly, and the serialization path throws). The streamed-promise primitive is not viable here as-is.
Confirmed `SurfaceHostProvider` is an ANCESTOR (`AdminV2WorkspaceClientProviders.tsx:126`), so the seed
must land in the same initial flush as the shell — which requires the whole response to flush together.

**Iter 3 — blocking layout seed, RESOLVED answer (current).** Layout `await`s the compose (concurrently
with route-meta) and passes the RESOLVED answer (plain serializable object, same shape the D1 route
returns — no promise, no crash). This route has no intermediate Suspense boundary, so the whole response
flushes together at ~compose time; the child-layout seed hydrates in the same pass as the ancestor shell,
before K2. Expected: seed consumed + surface renders, wall-clock ~net-neutral (serial reorder — the
"blocking is net-neutral" prediction from closeout §7). If confirmed, this proves Phase 1 CORRECTNESS;
the wall-clock win (Phase 2) needs compose→bundle OVERLAP, which requires a viable streaming mechanism
(raw promise props are out — candidates: RSC `<Suspense>` + `use()` on a dedicated consumer, or an
inline-JSON bootstrap the ancestor reads). _Measuring iter 3._

## Phase 2 (streamed overlap) — ATTEMPTED, REVERTED

Client-armed deferred: a client component `armSeed`s a pending promise in the K2 cache before K2 fires;
a `<Suspense>`-wrapped async RSC composes and streams a resolved plain answer that `resolveSeed`s it —
no promise crosses the RSC boundary (so no iter-2 crash). It builds and renders (no crash, seed consumed).
But it is **slower**, and the reason is a hard architectural limit:

| | iter-3 warm | Phase-2 warm | iter-3 cold | Phase-2 cold |
|---|--:|--:|--:|--:|
| TTFB | 1417 | 2156 | 3607 | 3587 |
| first card | **3610** | 5462 | **7370** | 7652 |

**F5 — the specific streaming design tested was slower and was reverted (scope-limited finding).** The
design tried: a client-armed deferred (`armSeed` a pending promise in the K2 cache before hydration) +
a `<Suspense>`-wrapped async RSC that composes and streams a **resolved client component**
(`ProvisioningAnswerSeed`) to fulfil it. Measured result: first card 5,462 ms vs iter-3's 3,610 ms —
**slower**. Mechanism: that resolve is a client component, so it can only run after the client bundle
hydrates; it **cannot deliver the K2 answer before client hydration**, and it hydrates in a *later* pass
than the main shell, adding latency. iter-3's resolved server seed already delivers the answer at the main
hydration pass, so this design cannot improve on it. **Reverted.** Phase 1's resolved server seed is the
current best certified implementation.

Scope note (do not over-generalize): this refutes THIS design (client-armed deferred + Suspense-resolved
client component) under Next 16 / Turbopack here. It is NOT a proof that no server→client streaming
scheme could ever help — only that any scheme whose delivery depends on hydrating a client component is
bounded below by "answer ready at hydration," which Phase 1 already reaches. A scheme that delivered the
answer to K2 without a client-component hydration step was not found and is not attempted here.

## Before / after (local prod, `new-leads`, DOM-meaningful)

| Metric | Baseline warm | **iter-3 warm** | Baseline cold | **iter-3 cold** |
|---|--:|--:|--:|--:|
| TTFB | ~1.4 s | 1417 ms | ~1.5 s | 3607 ms ↑ |
| first card (household) | 6655 | **3610 (−46%)** | 11469 | **7370 (−36%)** |
| all cards | 15453 | 12654 (−18%) | 21165 | 15797 (−25%) |

Warm chunks `firstStart 1421 → lastEnd 3456`; household commits at 3610 (~150 ms after hydrate) with the
primary `provisioning_answer` **absent** — seed consumed, round-trip removed from the first-card path.
**Trade-off:** cold TTFB +~2 s (blocking compose precedes HTML when the config cache is cold), fully
offset by a ~4 s faster cold first-card. Phase 2 (compose↔bundle overlap) would remove the cold TTFB cost.

**Phase 1 acceptance:** correct subject visible with the committed shell ✓ · no wrong-record/stale flash
(boot shell holds to the atomic K3 commit; seed feeds that same commit — no partial pre-reveal) ✓ · no
hydration mismatch (seed is a client cache write, renders null) ✓ · direct URL ✓ · latest-click-wins
(3 generation guards untouched; seed only warms K2's consume) ✓(architectural) · Prev/Next (subject move
within committed surface, unaffected) ✓(architectural) · queue-row selection unaffected (click path uses
intent-prefetch→K2, never the cold-load layout seed) — spot-check recommended.

## Phase 2 iteration log

**Iter 4 — client-armed deferred streaming overlap (REVERTED).** `armSeed` (client, pre-K2) + a
`<Suspense>` async RSC that composes and `resolveSeed`s a plain answer — no promise across the boundary.
No crash, seed consumed, surface renders. But first-card **regressed** to 5462 ms warm (vs iter-3 3610),
because the resolve component hydrates in a later pass than K2 fires — this design's composed answer
cannot reach the client before the bundle hydrates, and iter-3 already delivers it at that moment. F5:
this specific streaming design cannot beat the resolved server seed; reverted to iter-3. (Not a universal
impossibility claim — see F5.)

## Change ledger (kept / reverted / deferred)

- **KEEP** — `composeProvisioningAnswerForRoute` shared helper + API route delegates to it (pure refactor, one resolver for HTTP + seed).
- **KEEP** — `seedProvisioning` on the existing K2 cache (accepts a streamed nullable promise; rejects non-committable → K2 falls open).
- **KEEP** — blocking layout seed with RESOLVED answer (iter 3): `layout.tsx` awaits compose (concurrent with route-meta) + `ProvisioningAnswerSeed` writes the resolved answer. **Certified win** (see table).
- **REVERTED** — streamed RSC-promise prop (iter 2): crashes hydration in this Next 16 setup.
- **REVERTED** — blocking page-segment seed (iter 1): self-defeating + page output discarded by the layout.
- **REVERTED** — Phase 2 streamed overlap (armSeed/resolveSeed/ProvisioningSeedArm + Suspense): builds & runs but slower (5,462 vs 3,610); this design can't deliver the K2 answer before client hydration (F5). Phase 1 resolved server seed remains best certified. Working tree returned to committed iter-3.
- **KEEP** — Phase 4 code-splits (Findings 1+2): Create Lead + Communications-composer surfaces → `next/dynamic`. Bundle 1,817,485 → 1,767,948 bytes (−49.5 KB); ~25k lines off the initial static graph. Committed `5dac324fa`. tsc+build green, surface renders.
- **KEEP (pending final cert)** — dead-code deletion: 26 verified-0-importer files, 2,793 lines (orphaned singular Person/Child VM drawer cluster + superseded hard-cutover shims + unused focus-panel/drawer components + 2 dead barrels). Validated by tsc+build+browser cert.
- **DEFER (Phase 3)** — duplicate resolution: layout runs `loadWorkUnitSlugRouteMetaServer` AND `composeProvisioningAnswerForRoute`, each doing a gate + slug resolve. Runs concurrently now; dedup candidate.
- **DEFER (uncertain, needs care)** — Phase 4 Findings 3/3b/4: registry-modal static deps, `workflowRun.ts` automation engine (2 entry paths), non-core Focus Panel cards (SchedulingCard 1,033). Higher risk (hook callbacks / sync inline render); assess after the safe wins land.
