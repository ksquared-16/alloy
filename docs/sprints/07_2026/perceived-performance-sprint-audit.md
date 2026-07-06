# Alloy OS — Perceived Performance Sprint

**Worktree:** `/Users/Kelly/Alloy/.worktrees/perceived-performance-sprint`
**Branch:** `feat/perceived-performance-sprint`
**Base:** `origin/staging` @ `a5b8f66d88dd8e3e1681eced8454375661a3047f` (PR #90, 2026-07-06)
**Status:** Phase 1 implemented in isolated worktree. Phases 2–3 pending.

> **Worktree isolation:** All sprint work lives in the dedicated worktree above so other sessions on `/Users/Kelly/Alloy` cannot disturb this branch. Open that path (or `cursor-app-control` move) for sprint edits.

---

## Preservation Gate (summary)

Extend existing owners only — do not replace Presentation Runtime, Motion Runtime, Surface Host, Queue Hold, Surface Hold, Soft Navigation, Reload Floor, Work Unit Surface Controller, PR #87 pill switching, or configurable headers.

Phase 1 touches: `perceivedPerf.ts` (new wrapper), `perfNamespaceLog.ts` (namespace), instrumentation on existing hold/ack boundaries, and wiring dead `prefetchRecord` warm on main queue rows + `pointerdown`.

---

## Phase 1 (done in worktree)

| Change | Owner extended | Not a rewrite because |
|--------|----------------|----------------------|
| `web/lib/perf/perceivedPerf.ts` | `emitPerf` + `alloyPerfSet` | Thin logging wrapper; no new runtime |
| `perfNamespaceLog.ts` | Perf namespace enum | Adds `"perceived"` + safe keys |
| `WorkUnitSurface.tsx` | Surface Hold | Reads existing `mode`; effect only |
| `QueueRegion.tsx` | Queue Hold | Reads existing `renderState`; effect only |
| `WorkViewPillStrip.tsx` | Motion ack + `prefetchWorkView` | Marks existing warm/ack edges |
| `CondensedQueueRow.tsx` | `prefetchRecord` | Same warm fn; adds pointerdown + main-row warm |
| `InlineOpportunityFocusPanel.tsx` | `resolveFocusPanelSubjectReveal` | Marks seed/resolved boundary |

Kill switch: `NEXT_PUBLIC_PERF_PERCEIVED_MARKS=0`

---

## Phase 2 candidates (deferred)

C3 same-host pill queue prefetch, E1 seed placeholders, A3 warm-cache Surface Hold, C2 pill focus continuity, H1 back navigation hold. Surface Host Phase 2 exchange remains separate epic.

---

## Validation

```bash
cd /Users/Kelly/Alloy/.worktrees/perceived-performance-sprint/web
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run test -- tests/presentation/workUnit/queueRegionHold.test.ts \
  tests/presentation/runtime/workUnitPillSwitching.test.ts \
  tests/presentation/workUnit/workUnitSurfaceHold.test.ts
```

Browser: filter console `[perf:perceived]` during operator path.
