# AdminV2 speed sprint — measure first, optimize second

Prerequisites: [drawer shell pipeline](./adminv2_drawer_pipeline.md), [route shell pipeline](./adminv2_route_shell_pipeline.md), [reveal doctrine](./adminv2_reveal_doctrine.md).  
**Phase closeout (May 2026):** [completed/adminv2_performance_closeout.md](./completed/adminv2_performance_closeout.md) — UX fixes, production-grade summary, next-phase roadmap (broad sprint paused).

## Critical rule

Do **not** reintroduce late composition, second shell owners, component swaps, or loading flashes. Optimize latency inside stable regions only.

## How to capture timings (local)

1. Open Chrome DevTools → Console.
2. Filter: `perf.speed.sprint` OR `perf.route.shell` OR `perf.drawer.first_paint` OR `wu-route-perf` OR `wu-bootstrap-perf` OR `drawer-primary-perf` OR `queue-summary-perf`.
3. After navigating a surface, run: `reportAdminV2SpeedSprint()` (dev only).
4. Inspect `window.__alloyPerf.marks` for raw marks.

Server (Vercel / local): `[wu-bootstrap-perf]`, `[dept-bootstrap-perf]`, `[drawer-primary-perf]`, `[queue-summary-perf]` when paths exceed thresholds (>250ms bootstrap, >100ms summaries, >200ms drawer_primary).

## Admin context + shell data cache (this pass)

Filter staging logs: `[admin-context-cache]`, `[admin-context-perf]`, `[entity-labels-perf]`, `[admin-timing]`.

| Path | Before (staging) | After expected (warm) | Cache used | Risk | Invalidation |
|------|------------------|----------------------|------------|------|--------------|
| `resolveAdminAccessCore` (shell) | 450–700ms cold | &lt;50ms hit | `adminShellContextCache` 120s per userId | Stale scope within TTL | TTL; `invalidateAdminShellContextCache(userId)` |
| GET `/api/admin/departments` | ~871ms (ctx ~429) | &lt;250ms warm | shell + request `cache()` | Wrong dept list if scope stale | TTL + scope key in logs |
| GET `/api/admin/work-units` | ~952ms (ctx ~493) | &lt;250ms warm | shell + request `cache()` | same | same |
| GET `/api/admin/entity-labels` | 829–894ms | &lt;250ms warm | shell + `entityLabelsOrgCache` 5m | Stale labels after edit | `invalidateEntityLabelsOrgCache` on PUT/DELETE |
| GET `/api/admin/workspace/site-filter` | context-bound | near-instant warm | shell | site list stale rare | TTL |
| Queue rows GET | auth ~357ms | ↓ with shell hit | `loadAdminRouteGate` → shell | Must keep WU/dept scope checks | row-level checks unchanged |
| Entity labels resolve | ~477ms | &lt;20ms hit | org TTL cache | override not visible until invalidation | PUT/DELETE invalidate |

### Route audit (navigation burst)

| Route | Context method (after) | Before ms (staging) | Full context? | Light / gate OK? | Shell cache? | Risk |
|-------|------------------------|---------------------|---------------|------------------|--------------|------|
| GET `/api/admin/departments` | `loadAdminRouteGate` | ~871 (ctx 429) | No | Yes | Yes | Low |
| GET `/api/admin/work-units` | `loadAdminRouteGate` | ~952 (ctx 493) | No | Yes | Yes | Low |
| GET `/api/admin/entity-labels` | `loadAdminRouteGate` + labels cache | 829–894 | No | Yes | Yes + org labels | Low |
| GET `/api/admin/workspace/site-filter` | `loadAdminRouteGate` | — | No | Yes | Yes | Low |
| GET `/api/admin/operational-tasks` | entity-scoped (unchanged) | — | Partial | — | Client nav cache | — |
| GET `/api/admin/queues/...` | `loadAdminRouteGate` | auth 357 | No | Yes | Yes | Medium — row scope |
| GET `.../operational-bootstrap` | `loadAdminRouteGate` | improved | Partial | Yes | Yes | Low |
| Drawer primary/full | `loadAdminRouteGate` | — | Partial | Yes | Yes | Low |
| PUT/DELETE entity-labels | `getAdminContextCached` | — | **Yes** (admin) | No cache on auth | N/A | None |

## True-speed table (staging log baselines — May 2026)

Source: Vercel/staging server logs (`[wu-bootstrap-perf]`, `[perf.queue.rows]`, `[dept-bootstrap-perf]`, `[admin-context-perf]`). Re-measure after deploy.

| Path | Current ms | Current KB | Bottleneck | Fix (this sprint) | Expected improvement |
|------|------------|------------|------------|-------------------|----------------------|
| WU `operational-bootstrap` | total 1339–1552; loader 908–1068 | 41.6 | `primary_lane_rows_ms` 524–684; `queue_summaries_ms` ~262 | `getWorkUnitQueuePreviewRows` (`queue_reveal`), cap 10 rows, right-rail TTL cache, dept metadata preload | ↓ primary rows ms + payload KB |
| Queue rows GET | total 1427; service 565; auth 295 | 54.7 (19 rows) | `enrichment_ms` 249; duplicate auth | `loadAdminRouteGate` only; `row_mode=preview` → `queue_reveal` | ↓ auth + enrichment on preview fetches |
| Dept `operational-bootstrap` | total 1314–1796 | up to **305.8** | `attention_ms` 691–829; `department_attention_preview` items | `bundle_mode=prefetch` + slim attention (buckets only) | ↓ prefetch payload (target &lt;80 KB) |
| Admin context | 450–700 per call | &lt;250 warm | `resolveAdminAccessCore` cold | **Cross-request** `adminShellContextCache` + `loadAdminRouteGate` on shell GETs; entity labels org cache | ↓ repeated auth_ms on navigation burst |

Reveal gates unchanged: `[wu-reveal-gate]`, `[dept-reveal-gate]`, `[workspace-reveal-gate]`.

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
| `[admin-context-cache]` | Shell access bundle hit/miss + entity labels org cache |
| `[admin-context-perf]` | Cold `resolveAdminAccessBundle` >400ms |

---

## Changes made (Cards 1–6 cumulative)

| Card | Change |
|------|--------|
| 1–2 | Speed sprint trace, route fetch timing, queue summary skip, shared bootstrap cache |
| 3 | WU defer_bundle payload omit empty bundles; drawer_primary early payload path |
| 4 | Shared bootstrap parallel prep (WU/dept); queue-summary + drawer-primary perf logs |
| 5 | Opportunity drawer shell compile cache (layout + field keys) |
| 6 | Memoized `OpportunityInquirySummaryRightColumn`; fixed right-column geometry |
| — | Micro-jank: single task skeleton, handoff slot on first paint, stable scroll gutter |

## Card 5 — Prefetch / cache (this pass)

| Target | Status | Invalidation |
|--------|--------|--------------|
| `prefetchOpportunityDrawerOnRowIntent` (bootstrap + `drawer_primary` + full) | Existing — queue row hover / WU page | TTL on primary cache (8s); coordinator dedupes open |
| `drawer_primary` in-flight map | Existing | Per-opportunity promise; evicted after TTL |
| Shared queue bootstrap (45s org TTL) | Card 2 | Org-scoped TTL in `QueueService` |
| **Opportunity drawer shell compile cache** | **Added** | Key = `layout_version` + sorted visible field keys; `clearOpportunityDrawerShellCompileCache()` for layout saves / tests |

No new child-owned prefetch owners. Intent prefetch unchanged; shell compile avoids repeat section derivation on reopen with same layout + registry.

## Card 6 — Hydration / render cost (this pass)

| Area | Change |
|------|--------|
| `OpportunityInquirySummaryRightColumn` | `React.memo` with slot-state equality (tasks/reminders/handoff only) |
| Right column geometry | Single-row task skeleton; shared `opportunityInquiryRightColumnGeometry` constants |
| `OpportunityOperationalCompactStrip` | Atomic path: fixed handoff slot on first paint; attention banner suppressed above-fold to avoid vertical push |
| Admin drawer scroll | `[scrollbar-gutter:stable]` on `data-adminv2-record-modal-scroll` (V2) |

## Micro-jank fix — inquiry summary right column (Part A)

**Root cause (Chen drawer):**

1. **Tasks** — two `TaskRowSkeleton` rows (~3.5rem) collapsed to one chip row (`1.75rem`) on settle.
2. **Reminders** — empty state used a shorter `<p>` than skeleton chip row; outer `min-h` did not lock body row.
3. **BOS handoff** — card mounted only when `globalAssistant` context was ready (late mount / height jump).
4. **Shell min-heights** — parent `min-h-[8rem]` vs column `min-h-[10rem]` mismatch.
5. **Scheduled-send attention banner** — appeared after fetch in atomic column and pushed reminders/children down.
6. **Scrollbar** — optional horizontal shift when scroll gutter appeared (V2 drawer body).

**Fix:**

- `web/lib/admin/drawer/opportunityInquiryRightColumnGeometry.ts` — fixed `h-[1.75rem]` task/reminder bodies, `h-[7.25rem]` handoff slot, `min-h-[16rem]` column root; parent shell `min-h-[16rem]`.
- One task skeleton row; empty tasks/reminders use `INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS` (chip-row height).
- Handoff renders in fixed slot on `drawer_primary` with disabled button until assistant context binds.
- Attention banner skipped in atomic right column (chips still show urgency).
- V2 drawer scroll: `scrollbar-gutter: stable`.

## Work-unit critical path isolation

Capture locally: hard refresh `/work-unit` → DevTools `reportWorkUnitCriticalPathLanes()` or filter `[perf.wu.critical_path]`. Aggregate via `reportAdminV2SpeedSprint()` (`work_unit_lanes`).

| Lane | Placeholder visible ms | Real data ms | Data source | Blocking dependency | Can join bootstrap? | Can prefetch? | Fix |
|------|------------------------|--------------|-------------|---------------------|---------------------|---------------|-----|
| shell_chrome | _measure_ | _measure_ | `operational-bootstrap` dept+wu or page cache | URL ids | yes | partial (page cache) | Placeholder until bootstrap; identity on return |
| header_chips | _measure_ | _measure_ | `bootstrap.queue.summaries` | shell_chrome | yes | partial | Reveal with summaries; removed oper-lane gate on picker |
| queue_rows | _measure_ | _measure_ | `bootstrap.primary_lane` inline or queue items GET | summaries + selectedQueueKey | partial | yes | Row skeleton in-lane; authority on summary apply |
| actions_rail | _measure_ | _measure_ | `bootstrap.right_rail_actions` (enrollment) | shell_chrome | yes | no | **Sync apply** on bootstrap (was idle-deferred) |
| kpi_or_summary | _measure_ | _measure_ | `kpi_placements` / `loadWuKpiPlacements` | queue reveal (deferred) | partial | no | Class C — quiet KPI reserve until placements |

**Bottleneck (typical):** `queue_rows` when `rows_deferred` — measure `since_origin` on `wu_lane_queue_rows_real`.

**Before:** shell → oper-region spinner → header hidden → chips from def placeholders → actions idle-defer → row skeletons with Total → rows.

**After:** shell placeholder → coordinated above-fold (chips + actions + row skeletons) → rows hydrate in place; KPI/footer deferred.

### Atomic above-fold render model (WU)

`WorkUnitAboveFoldRenderModel` — `header`, `actions_rail`, `queue_lane` slots always visible (`skeleton` | `ready`). Page + `WorkUnitWorkspace` render from one model (drawer-style); removed independent `headerQueuePicker`, `operLaneLoading` region swap, and empty Actions card → buttons reveal.

Capture: `reportWorkUnitCriticalPathLanes()` after hard refresh.

### Work-unit above-fold reveal gate (page-ready, then speed)

**Product:** No progressive section reveal on `/work-unit`. One controlled loading surface (`WorkUnitPageLoadingGate`) until `work_unit_above_fold_ready`, then the full above-fold page (chips, actions rail, first queue rows or deliberate empty).

**Gate:** `WorkUnitRevealGate` — `shell_ready`, `summaries_ready`, `actions_ready`, `rows_ready`, `above_fold_ready`, `reason_if_blocked`. Console: filter `[wu-reveal-gate]` for `gate_start`, phase marks, `reveal_wait_ms`.

**Data ownership (typical path):**

| Contract | Owner |
|----------|--------|
| Summaries + shell + primary rows + right rail | `operational-bootstrap` with `defer_bundle=false` (canonical client URL) |
| Primary rows (legacy / defer) | Gate holds loading until client row GET settles |
| Dept → WU intent | `prefetchWorkUnitOperationalBootstrapFromDeptHref` on dept oper console pointer/click |
| KPI / automation footer | Still below-fold after reveal (`workUnitQueueRevealReady`) |

**Dept:** `deptRevealGate.ts` + `DeptPageLoadingGate` — gate includes KPI strip + oper region + enrollment rail. Filter `[dept-reveal-gate]`.

**Canonical doctrine:** [adminv2_reveal_doctrine.md](./adminv2_reveal_doctrine.md).

### Workspace reveal gate + preload (this pass)

- `workspaceRevealGate.ts` + `WorkspacePageLoadingGate` on `/adminV2/workspace`.
- KPI after reveal: quiet reserve only (`kpiQuietReserveOnly`); growth rollup refines tile copy in place (no stats skeleton at reveal).
- Prefetch: `prefetchAdminV2AboveFold.ts` — dept pointer/click + idle visible cap (3); `[prefetch.adminv2]` logs.
- Cache contracts: `adminV2AboveFoldCacheContracts.ts`.

---

## Work-unit queue lane placeholder cleanup

**Root cause:** `WorkUnitQueueCompactRowSkeleton` reused dept paired-oper bucket tile markup (`adminv2-ws-paired-oper-queue-meta`) with hardcoded **Total** label — shown in the work-unit queue lane while `primaryQueue.rowsLoading` was true. In parallel, `KpiStripSkeleton` could pulse during the same phase (metric-card appearance above the lane).

**Fix:** `WorkUnitQueueLaneRowSkeleton` — CRM split-row geometry matching final `QueueBlock` cards; no Total copy; 5 rows max. `WorkUnitOperationalLaneLoader` and `QueueBlock` both use lane row skeletons. KPI zone uses quiet reserve while oper lane or queue rows are loading (`kpiUseQuietReserve`).

---

## True-speed sprint (this pass)

| Change | Effect |
|--------|--------|
| WU loader: summaries first; **attention deferred** when primary lane is not needs_attention | Cuts blocking `attention_*_ms` off enrollment/pipeline-primary paths |
| WU `primary_row_limit` default **10** (max 20) | Smaller reveal bundle on canonical bootstrap URL |
| **`getWorkUnitQueuePreviewRows` / `queue_reveal`** | Skips placement projection + tour/OCM optional fetches; uses `queue_preview` enrichment |
| **Right-rail actions TTL cache** (45s, org/dept/wu) | Cuts repeat `right_rail_actions_ms` 111–184 on warm navigations |
| **`bundle_mode=prefetch`** on dept bootstrap | Slim attention (bucket counts only, no candidate item rows) for idle prefetch |
| Queue rows route **`loadAdminRouteGate`** + `row_mode=preview` | One auth bundle per request; optional slim rows for client refresh |
| `dedupeAdminFetchWithTtlMeta` + **15s dept / WU TTL** | Prefetch → navigation `hit` / `inflight_join` via `[prefetch.adminv2]` |
| Dept idle **WU bootstrap prefetch** (visible throughput rows, cap 3) | Improves dept → WU warm reveal |
| WU idle **drawer_primary prefetch** (first 3 row ids after reveal) | Improves row open warm path |

## Admin context sprint implementations

| Change | Effect |
|--------|--------|
| `adminShellContextCache` (120s, per userId) | Warm navigation reuses `AdminAccessBundle` without `resolveAdminAccessCore` |
| `loadAdminRouteGate` checks `portalEligible` | Same portal gate as `getAdminContext` for shell GETs |
| GET departments / work-units / entity-labels / site-filter | Single `loadAdminRouteGate` (no double context) |
| `entityLabelsOrgCache` + `resolveEntityLabelsForOrgCached` | Warm labels skip industry/override DB fan-out |
| PUT/DELETE entity-labels | Still `getAdminContextCached`; invalidate org labels cache |

**Staging checks after deploy:** filter `[admin-context-cache] outcome:hit` on second navigation; `get_admin_context_ms` on departments/work-units/entity-labels should drop; queue rows `auth_ms` should fall when shell cache warm.

## WU warm path cache (this pass)

**Why `cache_hit: false` on staging:** Lane caches were process-only `Map`s (lost on each Vercel serverless invocation). Scope keys used `JSON.stringify(recordScopeConstraints)` (unstable). Prefetch/reveal URLs were already canonical via `workUnitBootstrapClientSession`.

**Fix:** `loadWorkUnitOperationalBootstrapCached` — Next `unstable_cache` (45s) + `globalThis` process layer; stable `buildWorkUnitQueueScopeCacheKey` (access fingerprint + view site); `[wu-bootstrap-cache]` logs with `cache_key_digest`. Right rail uses same pattern.

**Staging:** Repeat WU nav → `loader_cache_hit: true`, `queue_summaries_cache_hit: true`, `primary_lane_rows_cache_hit: true`, `right_rail_actions_cache_hit: true`.

## WU reveal closeout (this pass)

**Goal:** Warm `/work-unit` nav near-instant; cold path logs what still blocks. Reveal doctrine unchanged (single gate, no section waves).

| Change | Effect on TTFB / reveal |
|--------|-------------------------|
| Route awaits **loader only** — KPI never in `Promise.all` | Removes ~130–170ms `kpi_placements_ms` from bootstrap JSON wait |
| Right rail **cache hit only** on route; miss → background warm + client async fetch | Enrollment reveal no longer waits on `right_rail_actions_ms`; `enrollmentActionsSettled` true immediately |
| Queue summaries **`summaryMode: priority`** + `priorityBudget: 6` | Cuts `queue_summaries_ms` vs counting all lanes; rest via `deferred_queue_keys` |
| Loader cache key includes `summariesModeKey: priority:6` | Prefetch/reveal share warm loader when scope matches |
| `[wu-bootstrap-perf]` `reveal_blocking_loader_ms` | Cold logs show loader-only blockers (summaries, primary rows, attention) |

**Staging verification**

1. Hard refresh → open dept → open WU (cold). Filter `[wu-bootstrap-perf]`: note `queue_summaries_ms`, `primary_lane_rows_ms`, `reveal_blocking_loader_ms`, `kpi_placements_deferred: true`.
2. Navigate away → return to same WU (warm). Filter `[wu-bootstrap-cache]` + perf: expect `loader_cache_hit: true` and lane hits when process/Next cache warm.
3. Enrollment WU: confirm `[wu-reveal-gate]` reaches `above_fold_ready` without waiting on right-rail network (rail may populate after reveal).

**Warm targets (operator — paste into true-speed table):** `total_ms` &lt;400, `reveal_blocking_loader_ms` &lt;150 when all lane caches hit.

## Final server hotspots (this pass)

| Hotspot | Fix | Staging signal |
|---------|-----|----------------|
| Entity labels ~450ms | `unstable_cache` (300s) + process TTL; `[entity-labels-cache]` hit/miss; `revalidateTag` on PUT/DELETE | `resolve_entity_labels_ms` &lt;50 warm |
| Dept prefetch attention ~525ms | `attentionDetailMode: deferred` — metadata buckets only, no candidate query | `attention_ms` near 0; `source: deferred_prefetch` |
| WU `queue_summaries_ms` / `primary_lane_rows_ms` | 30s lane cache (org/wu/scope); primary cap **8** | `queue_summaries_cache_hit`, `primary_lane_rows_cache_hit` |
| Drawer primary variance | `_drawer_primary_phase_ms` on payload + enrich log phases | `wu_dept_lookup_ms`, `primary_person_hydrate_ms`, etc. |

## Remaining bottlenecks

1. **`auth.session_resolve`** (112–189ms) — still per-request; cross-request session cache deferred (higher risk).
2. Opportunity **full hydrate** graph (inquiry children, persons, field registry) — measure `[perf.drawer.full_hydrate]`.
2. **Primary queue row fetch** after WU shell when `rows_deferred` — client `[perf.route.shell] queue_items_fetch_ms`.
3. **Workspace growth rollup** — background per-dept refinement.
4. **Dept KPI bundle** in bootstrap — candidate for defer flag (same pattern as WU).
5. DB indexes on needs-attention — after local `[wu-bootstrap-perf]` attention_query_ms capture.
6. **Local verify** — hard refresh → Chen drawer: confirm zero post-paint movement (operator).
7. **Operator timing table** — run cold/warm passes and paste measured ms into true-speed table above.

## Acceptance checklist

- [x] Payload slimming audit table
- [x] Two+ low-risk payload reductions (WU defer keys, drawer_primary FK skip)
- [x] Two+ query optimizations (early drawer_primary, shared bootstrap prep parallel)
- [x] Duplicate fetch map updated
- [x] Shell doctrine unchanged
- [x] Tests for Cards 3–4 wiring
- [x] Micro-jank geometry + structure tests
- [x] Card 5 shell compile cache + documented invalidation
- [x] Card 6 memo + render blast-radius reduction (right column)
- [ ] Local before/after payload bytes in audit table (operator)
- [ ] Local Chen drawer movement check (operator)

## Suggested commit message

```
AdminV2 speed sprint Cards 3–4: payload trim and targeted query paths

Omit deferred WU bootstrap bundles, route drawer_primary before full FK
fan-out, parallelize shared queue bootstrap in WU/dept prep, add summary and
drawer-primary perf logs, and document payload/query audit tables.
```
