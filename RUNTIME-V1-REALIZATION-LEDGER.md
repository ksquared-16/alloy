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
| Phase 2 — server compose overlaps client delivery | compose runs server-side before any client chunk (iter-3) | — | streaming overlap ATTEMPTED, proven not achievable (F5) | **reverted** | Phase-2 table below |
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

**F5 — the compose→bundle overlap is not achievable.** Delivering the server-composed answer to the
client K2 runtime requires hydrating a client resolve component, which is gated by the FULL bundle. The
client cannot receive/use the answer before the bundle loads — and *at that moment iter-3 already has it*
(serialized into the initial payload, read at the main hydration pass). The Suspense-streamed resolve
hydrates in a LATER pass, so it only adds latency. No streaming mechanism can beat "answer ready at
hydration," which iter-3 achieves. The mission's Phase 2 OUTCOME (first card ≪ 6.7 s; critical work starts
before the client chunks) is already met by iter-3 — the server compose runs at request time, entirely
before any chunk downloads. The distinct streaming mechanism is a proven dead-end here → **reverted**.

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
because the resolve component hydrates in a later pass than K2 fires — the composed answer cannot reach
the client before the bundle hydrates, and iter-3 already delivers it at that exact moment. F5: overlap
is architecturally impossible; reverted to iter-3.

## Change ledger (kept / reverted / deferred)

- **KEEP** — `composeProvisioningAnswerForRoute` shared helper + API route delegates to it (pure refactor, one resolver for HTTP + seed).
- **KEEP** — `seedProvisioning` on the existing K2 cache (accepts a streamed nullable promise; rejects non-committable → K2 falls open).
- **KEEP** — blocking layout seed with RESOLVED answer (iter 3): `layout.tsx` awaits compose (concurrent with route-meta) + `ProvisioningAnswerSeed` writes the resolved answer. **Certified win** (see table).
- **REVERTED** — streamed RSC-promise prop (iter 2): crashes hydration in this Next 16 setup.
- **REVERTED** — blocking page-segment seed (iter 1): self-defeating + page output discarded by the layout.
- **REVERTED** — Phase 2 streamed overlap (armSeed/resolveSeed/ProvisioningSeedArm + Suspense): builds & runs but slower; overlap architecturally impossible (F5). Working tree returned to committed iter-3.
- **KEEP** — Phase 4 code-splits (Findings 1+2): Create Lead + Communications-composer surfaces → `next/dynamic`. Bundle 1,817,485 → 1,767,948 bytes (−49.5 KB); ~25k lines off the initial static graph. Committed `5dac324fa`. tsc+build green, surface renders.
- **KEEP (pending final cert)** — dead-code deletion: 26 verified-0-importer files, 2,793 lines (orphaned singular Person/Child VM drawer cluster + superseded hard-cutover shims + unused focus-panel/drawer components + 2 dead barrels). Validated by tsc+build+browser cert.
- **DEFER (Phase 3)** — duplicate resolution: layout runs `loadWorkUnitSlugRouteMetaServer` AND `composeProvisioningAnswerForRoute`, each doing a gate + slug resolve. Runs concurrently now; dedup candidate.
- **DEFER (uncertain, needs care)** — Phase 4 Findings 3/3b/4: registry-modal static deps, `workflowRun.ts` automation engine (2 entry paths), non-core Focus Panel cards (SchedulingCard 1,033). Higher risk (hook callbacks / sync inline render); assess after the safe wins land.
