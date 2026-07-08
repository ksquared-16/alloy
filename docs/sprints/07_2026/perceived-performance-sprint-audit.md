# Alloy OS — Perceived Performance Sprint

**Worktree:** `/Users/Kelly/Alloy/.worktrees/perceived-performance-sprint`
**Branch:** `feat/perceived-performance-sprint`
**Base:** `origin/staging` @ `392c84437` (rebased 2026-07-07)
**Status:** Phase 1 merged into staging. Phase 1.5 first-load boot shell complete on rebased branch.

> **Worktree isolation:** All sprint work lives in the dedicated worktree above so other sessions on `/Users/Kelly/Alloy` cannot disturb this branch.

---

## Preservation Gate (summary)

Extend existing owners only — do not replace Presentation Runtime, Motion Runtime, Surface Host, Queue Hold, Surface Hold, Soft Navigation, Reload Floor, Work Unit Surface Controller, or configurable headers.

---

## Phase 1.5 — First-load branded shell (complete)

### Problem

Cold workspace entry could paint a blank page or generic `Loading…` while auth, layout bootstrap, or `useSearchParams` Suspense resolved.

### Initial-load audit — root causes

| Layer | File / owner | What the operator saw |
|-------|----------------|----------------------|
| **Primary** | `AdminV2Shell.tsx` Suspense fallback | Centered generic `Loading…` on white background |
| **Server streaming gap** | No `app/adminV2/loading.tsx` | Blank white page during auth + layout parallel fetch |
| **Org bootstrap edge** | `workspace/layout.tsx` | Plain `Loading context…` text |
| **PRV2 surface skeleton** | `WorkspaceSurface.tsx` | Generic `Loading workspace` aria-label (copy only; skeleton geometry OK) |
| **Legacy shell path** | `AdminV2Shell` non-v2 branch | TopNav Suspense `Loading…` ribbon (non-workspace routes only) |
| **Not in scope** | `app/adminV2/settings/loading.tsx` | Settings-only reserve (already structure-neutral) |
| **Not used** | `AdminV2RouteLoadingState` | Route transitions — not first paint |
| **Deferred** | Work-unit / dept `loading.tsx` | Return `null` by design — page-owned cold shells |

### Implementation

| File | Change |
|------|--------|
| `components/admin/workspace/AlloyOperationalBootShell.tsx` | **New** — branded workspace-v2 shell frame (sidebar rail, top nav, content reserve, command-rail column) + BOS `Preparing workspace` loader |
| `app/adminV2/loading.tsx` | **New** — streaming fallback while AdminV2 layout resolves |
| `app/adminV2/components/AdminV2Shell.tsx` | Suspense fallback → `AlloyOperationalBootShell` |
| `app/adminV2/workspace/layout.tsx` | Org-missing gate → boot shell (replaces `Loading context…`) |
| `lib/adminV2/navigation/adminV2RouteLoadingVocabulary.ts` | Workspace copy → `Preparing workspace` / `Assembling organization context…` |
| `components/presentation/workspace/WorkspaceSurface.tsx` | Skeleton aria-label → `Preparing workspace` |
| `tests/admin/alloyOperationalBootShell.test.tsx` | **New** — shell markers, no generic Loading text |

No new runtime. Extends existing BOS identity + AdminV2 shell geometry.

### Cold-load browser validation (2026-07-07, localhost:3001, 3 runs)

Artifact: `docs/sprints/07_2026/perceived-performance-boot-shell-validation.json`

| Metric | Median | Pass? |
|--------|--------|-------|
| Branded boot shell visible | **1880 ms** | Yes — shell before meaningful content |
| Workspace meaningful content | **21532 ms** | Yes — header/tiles resolve (cold dev compile) |
| Blank screen observed | **0 / 3 runs** | Yes |
| Generic `Loading…` / `Loading...` text | **0 / 3 runs** | Yes |
| Layout shift (CLS) | **0** | Yes |

**Before (pre-change):** blank white gap and/or centered `Loading…` during shell Suspense and server layout wait.

**After:** immediate branded Alloy OS frame with `Preparing workspace` copy; no blank screen; no generic loading text.

---

## Phase 1 (merged into staging @ `b8560c7ac`)

| Change | Owner extended |
|--------|----------------|
| `web/lib/perf/perceivedPerf.ts` | `emitPerf` + `alloyPerfSet` |
| `perfNamespaceLog.ts` | `"perceived"` namespace |
| Surface Hold / Queue Hold / pill ack / row prefetch / focus panel marks | Existing runtime owners |

Kill switch: `NEXT_PUBLIC_PERF_PERCEIVED_MARKS=0`

Browser validation artifact: `docs/sprints/07_2026/perceived-performance-browser-validation-results.json`

---

## Phase 2 — C3 same-host pill queue prefetch (complete, browser-limited)

**Branch:** `feat/perceived-performance-phase-2`

### Validation path

`/workspace/work-unit/new-leads` — 6 Work View pills (New Leads, Active Pipeline, Registration, Waitlist, Tours, All Leads). New Leads has records.

### Implementation

| File | Change |
|------|--------|
| `sameHostPillQueueWarm.ts` | Pure plan mirrors `resolveSelectWorkViewAction` |
| `useWorkUnitSurfaceRuntime.ts` | Same-host hover warms queue rows via existing `dedupeAdminFetchWithTtlMeta` (30s); active rows GET shares TTL; cross-host keeps entry warm |
| `perfNamespaceLog.ts` | Safe key `warm_result` |
| `sameHostPillQueueWarm.test.ts` | Unit coverage for noop / same-host queue / cross-host entry plans |
| `runC3PillPrefetchValidation.mjs` | Browser harness (3× before/after on multi-pill path) |
| `probeMultiPillWorkUnits.mjs`, `probeSameHostPills.mjs`, `probeWorkViewHosts.mjs` | Path discovery helpers |

### Validation summary

**Unit tests prove same-host planning and warm behavior.** `resolveSameHostPillQueueWarmPlan` and `prefetchWorkView` are covered for noop, `same_host_queue`, and `cross_host_entry` paths; pill switching, queue hold, and surface hold regressions pass.

**Demo tenant did not contain a browser-visible same-host pill pair.** On the Firefly enrollment demo, inactive pills on `/workspace/work-unit/new-leads` resolve to cross-host navigation (`resolveSelectWorkViewAction` → `navigate`). No inactive pill on that path produced `warm_seam: same_host_queue` marks in browser runs.

**Browser validation therefore proved no regression, not same-host warm hits.** Before/after runs on the multi-pill path show stable pill ack, queue hold, and cross-host entry warm marks. C3 same-host queue warm hits were not observable in browser because the demo tenant lacks a same-host inactive pill pair — not because the seam is untested (unit coverage covers it).

**Final timed-out rerun excluded as dev-server flake.** One post-C3 AFTER rerun timed out waiting for Work View pills (60s). Earlier successful AFTER runs and unit tests are authoritative; the timed-out rerun is excluded from the validation record.

Browser validation artifacts:
- `docs/sprints/07_2026/perceived-performance-c3-validation-before.json`
- `docs/sprints/07_2026/perceived-performance-c3-validation-after.json`
- `docs/sprints/07_2026/perceived-performance-c3-validation-after-c3.json`

### Remaining Phase 2 candidates (not started)

E1 seed placeholders, A3 warm-cache Surface Hold, C2 pill focus continuity, H1 back navigation hold.

---

## Validation commands

```bash
cd /Users/Kelly/Alloy/.worktrees/perceived-performance-sprint/web
npm run test -- tests/presentation/runtime/sameHostPillQueueWarm.test.ts \
  tests/presentation/runtime/workUnitPillSwitching.test.ts \
  tests/presentation/workUnit/queueRegionHold.test.ts \
  tests/presentation/workUnit/workUnitSurfaceHold.test.ts
npx tsx scripts/runC3PillPrefetchValidation.mjs   # requires dev server on :3001
```
