# Work Unit Pill Switching Runtime (July 2026)

**Status:** Implemented (July 2026).  
**Scope:** Pill switching on `/workspace/work-unit/:slug` behaves like Excel sheet tabs: swap queue rows + focus panel only; header/KPIs/shell/rails stay stable.

## Problem (diagnosis — resolved)

| Area | Was | Now |
| --- | --- | --- |
| **Pill click** | `selectWorkView` always `router.push(href)` | Same-host → `localWorkViewId` in-page swap via `resolveSelectWorkViewAction`; cross-host still navigates |
| **Auto-open first row** | `autoOpenDoneRef` one-shot per mount | `autoOpenedForViewRef` + `forceAutoOpenViewRef` re-arm per view |
| **Focus panel stale** | Prior record could linger until new queue loaded | `closeDrawer()` immediately on pill switch |
| **Pill counts** | `queueRefreshNonce` on `OPPORTUNITY_QUEUE_UPDATED_EVENT` | Unchanged — verified by guard tests |

## Key files (investigation targets)

- `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` — pill intent, queue fetch, auto-open, counts
- `web/components/presentation/workUnit/WorkUnitSurface.tsx` — surface hold, remount key
- `web/components/presentation/workUnit/WorkViewPillStrip.tsx` — pill UI
- `web/components/presentation/workUnit/QueueRegion.tsx` — queue swap
- `web/components/presentation/workUnit/FocusPanelSurface.tsx` — focus panel subject
- `web/lib/presentation/runtime/useWorkViewTotals.ts` — inactive pill counts
- `web/lib/admin/opportunityQueueRefreshEvent.ts` — mutation refresh nonce

## Target UX

1. Pill click → update selected work view **in place** (same work unit host when possible).
2. Swap **queue rows only** + **focus panel** (first row auto-open if rows exist; empty state if not).
3. **Preserve** header, KPIs, BOS rail, actions rail, nav, page shell.
4. Pill counts update automatically when source counts change (existing refresh event / totals hook).

## Implementation

- `web/lib/presentation/runtime/workUnitPillSwitching.ts` — pure same-host / cross-host decision helpers
- `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` — `localWorkViewId`, `closeDrawer` on switch, per-view auto-open
- Tests: `web/tests/presentation/runtime/workUnitPillSwitching.test.ts`, `useWorkUnitSurfaceRuntimePillSwitching.test.ts`

## Out of scope

- Work Unit Header / Surfaces builder changes
- New work-view system or parallel queue renderer
- Breaking deep links (`/workspace/work-unit/:slug/:recordId`)
