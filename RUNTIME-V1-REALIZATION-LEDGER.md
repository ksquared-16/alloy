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
| Phase 2 — server compose overlaps client delivery | serial (hydrate → fetch → compose) | bundle+compose serial | stream the answer promise across the RSC boundary | not started | F3 |
| Phase 3 — serial critical chain | provisioning→enriched→stage-work serial | — | classify each dependency; reduce only proven-avoidable | not started | — |
| Phase 4 — monolith ownership | ~15k-line Work Unit graph | noncritical modes on initial graph | responsibility map + extract real boundaries | not started | — |
| Phase 5 — TS/workstation perf | 4×8GB tsc storm, swap thrash | — | one canonical bounded typecheck path | not started | closeout §9 |

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

## Change ledger (kept / reverted / deferred)

- **KEEP** — `composeProvisioningAnswerForRoute` shared helper + API route delegates to it (pure refactor, one resolver for HTTP + seed).
- **KEEP** — `seedProvisioning` on the existing K2 cache (accepts a streamed nullable promise; rejects non-committable → K2 falls open).
- **KEEP** — blocking layout seed with RESOLVED answer (iter 3): `layout.tsx` awaits compose (concurrent with route-meta) + `ProvisioningAnswerSeed` writes the resolved answer. **Certified win** (see table).
- **REVERTED** — streamed RSC-promise prop (iter 2): crashes hydration in this Next 16 setup.
- **REVERTED** — blocking page-segment seed (iter 1): self-defeating + page output discarded by the layout.
- **DEFER (Phase 3)** — duplicate resolution: layout runs `loadWorkUnitSlugRouteMetaServer` AND `composeProvisioningAnswerForRoute`, each doing a gate + slug resolve. Runs concurrently now; dedup candidate.
