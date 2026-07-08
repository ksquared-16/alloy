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

## Phase 2 candidates (deferred)

C3 same-host pill queue prefetch, E1 seed placeholders, A3 warm-cache Surface Hold, C2 pill focus continuity, H1 back navigation hold. **Do not start until Phase 1.5 merges.**

---

## Validation commands

```bash
cd /Users/Kelly/Alloy/.worktrees/perceived-performance-sprint/web
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run test -- tests/admin/alloyOperationalBootShell.test.tsx \
  tests/presentation/workUnit/queueRegionHold.test.ts \
  tests/presentation/runtime/workUnitPillSwitching.test.ts \
  tests/presentation/workUnit/workUnitSurfaceHold.test.ts
npx tsx scripts/runBootShellColdLoadValidation.mjs   # requires dev server on :3001
```
