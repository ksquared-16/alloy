# AdminV2 Performance — Phase 5 Visual Loading / Skeleton Coherence

**Date:** 2026-05-19  
**Status:** Implemented (visual-only)  
**Authority:** Phase 0–2 docs; Phase 3–4 load-path work unchanged

## Scope

Visual and placeholder coherence only — no navigation, routing, drawer lifecycle, fetch ownership, or canonical data rule changes.

## Changes

| Area | Fix |
|------|-----|
| Shared geometry | `web/lib/ui-v2/adminV2LoadingGeometry.ts` — queue row count, KPI cells, drawer body/timeline reserves |
| Opportunity drawer | Queue-preview bootstrap: compact body skeleton; preview-backed header skips workflow chrome skeletons; timeline height reserve |
| Dept attention lane | Compact row skeletons replace “Loading operational buckets…” text block |
| Work-unit queue | Shared row skeleton count; lane status “Refreshing …” during buffered tab switch |
| KPI strip | Optional `cellCount` on `KpiStripSkeleton` when placement rows are known (WU) |

## Validation

- `npx tsc --noEmit`
- Contract tests + `adminV2LoadingGeometry.test.ts` + drawer loading coherence extensions

## Remaining visual debt

- Workspace root tile KPI opacity lift (intentional refinement pass)
- Drawer tab-local spinners on communications/notes (deferred surfaces)
- Dept KPI strip cell count when placements resolve mid-session (defaults to 5 until known)
