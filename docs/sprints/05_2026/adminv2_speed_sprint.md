# AdminV2 speed sprint — measure first, optimize second

Prerequisites: [drawer shell pipeline](./adminv2_drawer_pipeline.md), [route shell pipeline](./adminv2_route_shell_pipeline.md).

## Critical rule

Do **not** reintroduce late composition, second shell owners, component swaps, or loading flashes. Optimize latency inside stable regions only.

## How to capture timings (local)

1. Open Chrome DevTools → Console.
2. Filter: `perf.speed.sprint` OR `perf.route.shell` OR `perf.drawer.first_paint` OR `wu-route-perf`.
3. After navigating a surface, run: `reportAdminV2SpeedSprint()` (dev only).
4. Inspect `window.__alloyPerf.marks` for raw marks.

Server: filter logs for `[wu-bootstrap-perf]` (bootstrap > 250ms).

## Audit table (fill from local captures)

| Surface | Shell visible ms | Above-fold stable ms | Hydration complete ms | Bootstrap/primary ms | Payload bytes | Post-shell fetches | Slowest query | Main bottleneck | Optimization |
|---------|------------------|----------------------|------------------------|----------------------|---------------|-------------------|---------------|-----------------|--------------|
| Work-unit | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | See §Implemented |
| Opportunity drawer | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | drawer_primary fast path |
| Department | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | operational-bootstrap |
| Workspace | _measure_ | _measure_ | — | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | single WorkspaceRootShell |

## Instrumentation map

| Prefix | Events |
|--------|--------|
| `[perf.speed.sprint]` | Aggregated snapshot via `reportAdminV2SpeedSprint()` |
| `[perf.route.shell]` | `route_shell_visible_ms`, `bootstrap_returned_ms`, `first_above_fold_stable_ms`, `hydration_complete_ms`, `queue_items_fetch_ms`, `post_shell_fetch` |
| `[perf.drawer.first_paint]` | `above_fold_stable`, `hydrate_wave`, post-open fetch budget |
| `[wu-route-perf]` | Bootstrap owner, primary lane ready |
| `[wu-bootstrap-perf]` | Server bootstrap phase breakdown (Vercel logs) |

## Card 1 — Measure (process)

1. Cold load work-unit (enrollment WU with queues).
2. Open opportunity from queue row (prefetch on intent if enabled).
3. Navigate dept → workspace round-trip.
4. Run `reportAdminV2SpeedSprint()` after each.
5. Network tab: count duplicate URLs; note largest JSON response.

## Card 2 — Duplicate fetch reductions (implemented)

| Domain | Owner | Change |
|--------|-------|--------|
| Work-unit bootstrap | `fetchWorkUnitOperationalBootstrapSession` | Single canonical URL; page-only owner; 15s TTL dedupe |
| Queue summaries refresh | `fetchQueueSummaries` | Skip GET when summaries already loaded for same route URL (force on invalidate) |
| Shared queue bootstrap | `buildQueueSummariesSharedBootstrap` | 45s in-memory org cache — fewer status-def / operational-day refetches across navigations |
| Opportunity drawer | Preload coordinator | Bootstrap + primary before mount; background full separate |

### Duplicate request map (audit targets)

| Request | Work-unit | Drawer | Dept | Workspace |
|---------|-----------|--------|------|-----------|
| operational-bootstrap | 1× page | — | 1× | — |
| queue summaries list | 0–1× (skip if bootstrap) | — | batch | — |
| queue items lane | 1× primary (+ cache) | — | per WU | — |
| entity drawer_primary | — | 1× | — | — |
| entity full | — | 1× background | — | — |
| departments list | — | — | — | 1× |
| workspace-kpi-placements | deferred | — | deferred | deferred |

## Card 3 — Payload slimming (audit + existing)

| Surface | Already slim | Further candidates |
|---------|--------------|------------------|
| Opportunity `drawer_primary` | `_field_definitions = []`; parallel shell attaches only | Audit enrich header size; trim `_identity` |
| Work-unit bootstrap | `defer_bundle=true` defers KPI, right-rail, primary rows | Primary row limit 20; omit_total_count |
| Queue rows | `omit_total_count=true` | Row preview field subset |

**Rule:** Do not remove above-fold contract fields (inquiry summary shell, persons shell, task preview).

## Card 4 — Query optimization (implemented)

- `buildQueueSummariesSharedBootstrap` org-level TTL cache (45s).
- Server logs `[wu-bootstrap-perf]` when total > 250ms — use for slowest-phase identification.

**Next:** EXPLAIN on `loadOpportunityNeedsAttentionRows` when attention lane slow; index review on opportunity queue filters.

## Card 5 — Prefetch / cache (existing + guardrails)

| Mechanism | Status |
|-----------|--------|
| `prefetchOpportunityDrawerOnRowIntent` | bootstrap + primary + full |
| Work-unit page cache | `readWorkUnitPageCache` seeds shell |
| Queue row client cache | LRU per lane |
| Dept tile prefetch | `prefetchDepartmentOperationalBootstrap` |
| Work-unit bootstrap prefetch | Suppressed at call sites (page owns) |

## Card 6 — Hydration cost (guardrails)

- No new loading components.
- Work-unit: single `WorkUnitWorkspace` tree; `operLaneLoading` only.
- Drawer: pipeline render model; no layout swap on full.

## Top 5 bottlenecks (code audit — validate with timings)

1. **Work-unit operational-bootstrap server time** — queue summaries ∥ attention ∥ primary lane.
2. **Primary queue row fetch** — after bootstrap when rows deferred.
3. **Opportunity drawer_primary server enrich** — parallel shell attaches (still one round trip).
4. **Workspace growth rollup** — background per-dept (deferred, but affects tile refinement).
5. **KPI placements** — deferred on bootstrap but still fetched on idle.

## Acceptance checklist

- [x] Instrumentation: `[perf.speed.sprint]` + route fetch timings
- [x] Duplicate fetch: queue summaries skip + shared bootstrap cache
- [x] Shell doctrine preserved (no second loaders)
- [ ] Before/after timings captured locally (operator)
- [ ] Query/index changes beyond shared-bootstrap cache

## Remaining for follow-up speed pass

- Dept/workspace route pipeline state builders (instrumentation only today).
- Server-side bootstrap payload trim (audit JSON keys).
- DB indexes from EXPLAIN on slow `[wu-bootstrap-perf]` phases.
- Opportunity drawer bootstrap payload byte logging on coordinator apply.
