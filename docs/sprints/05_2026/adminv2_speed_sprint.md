# AdminV2 speed sprint — measure first, optimize second

Prerequisites: [drawer shell pipeline](./adminv2_drawer_pipeline.md), [route shell pipeline](./adminv2_route_shell_pipeline.md).

## Critical rule

Do **not** reintroduce late composition, second shell owners, component swaps, or loading flashes. Optimize latency inside stable regions only.

## How to capture timings (local)

1. Open Chrome DevTools → Console.
2. Filter: `perf.speed.sprint` OR `perf.route.shell` OR `perf.drawer.first_paint` OR `wu-route-perf` OR `wu-bootstrap-perf` OR `drawer-primary-perf` OR `queue-summary-perf`.
3. After navigating a surface, run: `reportAdminV2SpeedSprint()` (dev only).
4. Inspect `window.__alloyPerf.marks` for raw marks.

Server (Vercel / local): `[wu-bootstrap-perf]`, `[dept-bootstrap-perf]`, `[drawer-primary-perf]`, `[queue-summary-perf]` when paths exceed thresholds (>250ms bootstrap, >100ms summaries, >200ms drawer_primary).

## Audit table (fill from local captures)

| Surface | Shell visible ms | Above-fold stable ms | Hydration complete ms | Bootstrap/primary ms | Payload bytes | Post-shell fetches | Slowest query | Main bottleneck | Optimization |
|---------|------------------|----------------------|------------------------|----------------------|---------------|-------------------|---------------|-----------------|--------------|
| Work-unit | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | Cards 3–4 below |
| Opportunity drawer | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | drawer_primary early path |
| Department | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | shared bootstrap in prep |
| Workspace | _measure_ | _measure_ | — | _measure_ | _measure_ | _measure_ | _TBD_ | _TBD_ | single WorkspaceRootShell |

---

## Card 3 — Payload slimming audit

| Payload | Field / group | Above fold? | Below fold? | Duplicate? | Can defer? | Risk | Action |
|---------|---------------|-------------|-------------|------------|------------|------|--------|
| WU `operational-bootstrap` (`defer_bundle=true`) | `kpi_placements` empty array | No | Yes (idle) | Was duplicate shape | Yes | Low | **Omitted** when defer_bundle — client uses `loadWuKpiPlacements` |
| WU bootstrap defer | `right_rail_actions` empty | No | Yes | Was empty stub | Yes | Low | **Omitted** when defer_bundle |
| WU bootstrap defer | `runtime.deferred` long list | No | No | — | Yes | Low | **Shortened** to 3 deferred keys |
| WU bootstrap | `department.metadata`, `work_unit.metadata` | Yes (attention buckets) | — | — | No | High | Keep — `resolveNeedsAttentionBucketsWithPrecedence` |
| WU bootstrap | `queue_definition` full JSON | Yes (tabs) | — | — | No | High | Keep |
| WU bootstrap | `primary_lane.items` | Yes | — | — | Yes (`rows_deferred`) | Low | Already deferred via `defer_bundle` |
| Opportunity `drawer_primary` | Full opportunity row (`select *`) | Partial | Below fold | full repeats | No | Medium | Keep row — contract; shells are slim |
| Opportunity `drawer_primary` | `_field_definitions` | No | full | — | Yes | Low | Already `[]` on visible builder |
| Opportunity `drawer_primary` | pipeline/discount/vertical/location FK labels | No | full | — | Yes | Low | **Removed** from primary path — early route skips 3 lookups |
| Opportunity `full` | `_inquiry_children` OCM graph | No | Yes | primary shells | No | High | Keep on full only |
| Opportunity `full` | `_field_definitions` + values | No | Yes | — | No | High | Keep on full |
| Dept bootstrap | `summaries.work_units[].queues` | Yes (tiles) | — | — | No | Medium | `include_previews=false` on page |
| Dept bootstrap | `kpi_placements` | Partial | Yes | WU-style defer possible | Future | Medium | Not removed — dept still bundles KPI |
| Workspace | departments list + tile stats | Yes | rollup refine | — | Partial | Low | Growth rollup stays background |

### Card 3 implementations (this pass)

1. **WU bootstrap** — When `defer_bundle=true`, response omits `kpi_placements` and `right_rail_actions` keys; slimmer `runtime.deferred`. Server logs `payload_kb` on `[wu-bootstrap-perf]`.
2. **Opportunity drawer_primary** — Early return via `buildOpportunityDrawerVisiblePayload` (same shell attaches as visible); avoids pipeline/discount/vertical/location parallel lookups that ran before fast-path return.

### Unsafe / not removed (documented)

- Trimming `metadata` or `queue_definition` on WU bootstrap (breaks attention + tab model).
- Omitting native opportunity columns on `drawer_primary` (drawer contract + pipeline keys on record).
- Dept KPI bundle removal without a defer flag (dept page expects optional `kpi_placements`).

---

## Card 4 — Query / queue bottleneck audit

| Path | Bottleneck | Evidence | Fix | Risk | Test |
|------|------------|----------|-----|------|------|
| WU bootstrap route | Sequential shared bootstrap after prep | Code: two await phases | **Parallel** `buildQueueSummariesSharedBootstrap` in prep `Promise.all` | Low | `speedSprintCards34.test.ts` |
| WU loader | Summaries ∥ attention | `summaries_attention_parallel` in perf | Already parallel | — | existing loader tests |
| Dept bootstrap route | Duplicate shared bootstrap (route + loader) | Code path | **Pass** `sharedBootstrap` from route prep; loader sets `shared_bootstrap_reused` | Low | `speedSprintCards34.test.ts` |
| `drawer_primary` | Full FK parallel block before fast path | Code audit | **Early** `buildOpportunityDrawerVisiblePayload` branch | Low | `speedSprintCards34.test.ts` |
| `buildQueueSummariesSharedBootstrap` | Re-fetch status defs / oper day per request | Code | 45s org TTL cache (Card 2) | Stale defs rare | `queueSummariesSharedBootstrapCache.test.ts` |
| `getWorkUnitQueueSummaries` | Per-queue counts + enrichment | `[queue-summary-perf]` when >100ms | Instrumented | — | server logs |
| Dept batch summaries | N× WU summary calls | `[queue-summary-perf]` batch tag | Preload `queue_definition`; concurrency pool | — | server logs |
| Opportunity full | Inquiry OCM + option labels | `[perf.drawer.full_hydrate]` segments | No change this pass | — | EXPLAIN follow-up |
| Needs-attention lane | Candidate fetch + resolver | `attention_*_ms` in wu-bootstrap-perf | No change | — | index audit when slow |

### Card 4 implementations (this pass)

1. WU + dept operational-bootstrap: shared queue bootstrap resolved during route prep (parallel with scope/timezone).
2. `drawer_primary` / `drawer_initial`: dedicated early handler (5 parallel queries vs 8+ on old path).
3. `[queue-summary-perf]` helper for WU + dept batch summary paths (>100ms).
4. `[drawer-primary-perf]` with `payload_kb` when >200ms.

### Index / EXPLAIN follow-up (not implemented)

- Opportunity queue filters for needs-attention candidate queries — run EXPLAIN when `[wu-bootstrap-perf].attention_query_ms` >100ms locally.
- No migration in this pass without measured slow queries.

---

## Duplicate fetch map (updated)

| Request | Work-unit | Drawer | Dept | Workspace |
|---------|-----------|--------|------|-----------|
| operational-bootstrap | 1× page (`defer_bundle`) | — | 1× | — |
| shared queue bootstrap (status defs + oper day) | 1× in prep (cached 45s org TTL) | — | 1× in prep (reused in loader) | — |
| queue summaries list | 0–1× (skip if bootstrap loaded) | — | in bootstrap | — |
| queue items lane | 1× after shell (`rows_deferred`) | — | — | — |
| entity drawer_visible | — | 1× (coordinator) | — | — |
| entity drawer_primary | — | 1× early path | — | — |
| entity full | — | 1× background | — | — |
| kpi_placements (WU) | deferred → `loadWuKpiPlacements` | — | in bootstrap | deferred |
| right_rail (WU) | deferred → separate fetch | — | optional in bootstrap | — |
| departments list | — | — | — | 1× |

---

## Instrumentation map

| Prefix | Events |
|--------|--------|
| `[perf.speed.sprint]` | `reportAdminV2SpeedSprint()` snapshot |
| `[perf.route.shell]` | Route shell / hydration / post-shell fetch |
| `[perf.drawer.first_paint]` | Drawer above-fold / hydrate wave |
| `[wu-route-perf]` | Client bootstrap owner |
| `[wu-bootstrap-perf]` | Server WU bootstrap phases + `payload_kb` + `defer_bundle` |
| `[dept-bootstrap-perf]` | Server dept bootstrap phases + `payload_kb` |
| `[drawer-primary-perf]` | Server drawer_primary ms + `payload_kb` |
| `[queue-summary-perf]` | Server summary paths >100ms |

---

## Changes made (Cards 1–4 cumulative)

| Card | Change |
|------|--------|
| 1–2 | Speed sprint trace, route fetch timing, queue summary skip, shared bootstrap cache |
| 3 | WU defer_bundle payload omit empty bundles; drawer_primary early payload path |
| 4 | Shared bootstrap parallel prep (WU/dept); queue-summary + drawer-primary perf logs |

## Remaining bottlenecks

1. Opportunity **full hydrate** graph (inquiry children, persons, field registry) — measure `[perf.drawer.full_hydrate]`.
2. **Primary queue row fetch** after WU shell when `rows_deferred` — client `[perf.route.shell] queue_items_fetch_ms`.
3. **Workspace growth rollup** — background per-dept refinement.
4. **Dept KPI bundle** in bootstrap — candidate for defer flag (same pattern as WU).
5. DB indexes on needs-attention — after local `[wu-bootstrap-perf]` attention_query_ms capture.

## Acceptance checklist

- [x] Payload slimming audit table
- [x] Two+ low-risk payload reductions (WU defer keys, drawer_primary FK skip)
- [x] Two+ query optimizations (early drawer_primary, shared bootstrap prep parallel)
- [x] Duplicate fetch map updated
- [x] Shell doctrine unchanged
- [x] Tests for Cards 3–4 wiring
- [ ] Local before/after payload bytes in audit table (operator)

## Suggested commit message

```
AdminV2 speed sprint Cards 3–4: payload trim and targeted query paths

Omit deferred WU bootstrap bundles, route drawer_primary before full FK
fan-out, parallelize shared queue bootstrap in WU/dept prep, add summary and
drawer-primary perf logs, and document payload/query audit tables.
```
