# Work Unit Pill Switching Runtime (July 2026)

**Status:** Planned — not implemented.  
**Scope:** Pill switching on `/workspace/work-unit/:slug` should behave like Excel sheet tabs: swap queue rows + focus panel only; header/KPIs/shell/rails stay stable.

## Problem (current behavior diagnosis)

| Area | Current behavior | Gap vs target |
| --- | --- | --- |
| **Pill click** | `selectWorkView` in `useWorkUnitSurfaceRuntime.ts` calls `router.push(href)` to the view's label-derived slug | Full route navigation — not a local queue/focus swap |
| **Optimistic highlight** | `optimisticSelection` keyed to `routeSlug` until push resolves | Pill updates instantly, but page still navigates |
| **Auto-open first row** | `autoOpenDoneRef` is **one-shot** per mount — runs once after first queue settle | Does **not** re-open first row on pill switch |
| **Surface remount** | `WorkUnitSurface` keyed by `workUnitId` only (same-host view switches avoid remount) | Cross-host views remount; same-host may still flash queue via `ready` drop |
| **Header/KPIs** | `WorkUnitHeader` outside queue region; header config scoped to work unit | Should stay stable — verify no remount on pill switch |
| **Pill counts** | Active pill = `queue.totalCount`; inactive = `useWorkViewTotals` (rows API `limit=1`, exact count) | Refreshes on `queueRefreshNonce` from `OPPORTUNITY_QUEUE_UPDATED_EVENT` — verify convergence without manual refresh |
| **Focus panel stale** | Drawer store owns selection; view switch via route may leave prior record selected until new queue loads | Need explicit clear + first-row open on pill switch |

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

## Technical approach (planned)

- Prefer **in-page work view selection** over `router.push` when canonical location is the **same work unit**.
- Keep `router.push` only for cross-host work views (different work unit) — still minimize shell remount via Surface Hold.
- Reset/re-arm auto-open on work-view change (not one-shot).
- Clear drawer selection before opening first row of new view (avoid stale focus panel).
- Reuse `queueRefreshNonce` + `useWorkViewTotals` for count freshness — no new subscription system unless gap found.

## Tests (planned)

- Pill click does not remount Work Unit Header
- Pill click swaps only queue rows / focus panel
- First record auto-selects after pill switch
- Empty view → empty focus panel
- Pill counts update on mutation event
- Header KPIs stable during pill switch
- No full-page navigation reset for same-host pill switch

## Out of scope

- Work Unit Header / Surfaces builder changes
- New work-view system or parallel queue renderer
- Breaking deep links (`/workspace/work-unit/:slug/:recordId`)
