# Admin V2 — hardening & production-readiness audit

**Last updated:** 2026-05-02  
**Scope:** `/adminV2/workspace`, department page, opportunity work-unit page, opportunity drawer, shared APIs.

## Current state by surface

| Surface | Shell-first | Session revisit cache | Deduped critical GETs | Normalized perf logs | Notes |
|--------|-------------|----------------------|-----------------------|---------------------|-------|
| **Workspace root** | Yes — KPI strip reserved (`WorkspaceKpiOrientationCrossfade`). | Yes — `sessionStorage` keyed by org (`adminV2WorkspaceSessionCache`). | `/departments`, `/work-units` via `dedupeAdminFetch`; KPI placements `dedupeAdminFetchWithTtl`. | `[perf.workspace.load]` via `adminV2PerfLog`. | Growth rollup + placements are **background** (`source: "background"`). |
| **Department** | Yes — dept + work units unblock shell; queue summaries follow. | Yes — dept page cache keyed by org + department. | Deduped dept detail, dept-scoped work units, summaries route; KPI placements TTL-dedupe. | `[perf.dept.load]` phases: `shell_seed`, `shell_ready`, `summaries_ready`, `kpis_ready`, `actions_ready`. | Workflow KPI block deferred via `requestIdleCallback`. Enrollment rail placeholder reserved. |
| **Work-unit** | Yes — shallow `history.replaceState` for queue/filter (`queue` URL param without full RSC nav). | In-memory queue row LRU (`queueRowClientCache`) + TTL stale refresh. | Queue definition cached server-side (`QueueService`); client cache logs under `[perf.queue.rows]` (`phase`). | Server: `[perf.queue.rows]` `phase: server_request`; client phases: hit / miss / prefetch / stale_refresh. | Prefetch must not preempt foreground fetch (existing request sequencing). |
| **Opportunity drawer** | `surface=drawer_visible` fast path vs `full` background merge. | Comms prefetch module; work-unit JSON `fetchAdminWorkUnitDrawerJson` in-flight dedupe. | Drawer verticals/actions use TTL dedupe in `AdminEntityDrawer`. | `[timing][opportunity-api-visible]`, `[perf.drawer.full_hydrate]` normalized via `adminV2PerfLog`. | Inquiry summary layout stabilization (prior pass); keyed remounts avoided where noted. |

## Known remaining bottlenecks

1. **`GET /api/admin/entity/opportunities/:id`** — full hydrate remains the dominant server cost (field registry, OCM batches, enrichment). Targets assume it stays **non-blocking** for visible shell.
2. **Queue row path** — `getWorkUnitQueueItems` still pays DB + optional status-def resolution + enrichment; server log breaks out `queue_def_cache_hit`, `status_defs_cache_hit`, timings.
3. **First-load cold** — no HTTP cache on dynamic admin routes; “cold” targets assume warm edge/DB pools.
4. **AI / activity widgets** — if added to workspace chrome, they must stay off the shell critical path (not wired in core paths at audit time).

## Acceptable latency targets

| Checkpoint | Warm | Cold |
|------------|------|------|
| Workspace shell | < 800 ms | < 1500 ms |
| Department shell | < 900 ms | < 1500 ms |
| Work-unit shell | < 1000 ms | < 1600 ms |
| Queue rows (paint-ready data) | < 600 ms | < 1000 ms |
| Drawer visible (`drawer_visible`) | < 800 ms | < 1200 ms |
| Drawer full hydrate | Background; ideally < 1000 ms warm / < 1800 ms cold | Same |

Warm = repeat visit with dedupe/session/client cache favorable; cold = empty caches, first navigation in session.

## Open risks

| Risk | Mitigation / follow-up |
|------|-------------------------|
| **Stale session cache** after mutating dept/WU/registry | Export `invalidateAdminV2WorkspaceSessionCache` / `invalidateAdminV2DepartmentSessionCache` and call from mutation success handlers (explicit hooks TBD per feature). |
| **Shared URL dedupe + abort** | Do not attach `AbortSignal` to URLs shared with Sidebar/hooks (`/departments`, `/work-units` list); use cancel flags or unique URLs when abort needed. |
| **Log volume** | Perf helpers only at phase boundaries; production still gates some drawer logs behind `NODE_ENV` or ms thresholds inside `opportunityEntityRecord`. |
| **Prefetch vs foreground** | Work-unit page must continue to sequence `touchUiPerf` network vs `prefetchOnly` (regression tested where possible). |

## Follow-up checklist

- [ ] Wire **session cache invalidation** from work-unit PATCH, queue registry, and KPI placement saves.
- [ ] Add dashboard panels filtered by `surface` / `phase` / `org_id` on normalized `[perf.*]` lines.
- [ ] Optionally lower `timingOpportunityApiVisible` threshold in production once baseline is trusted.
- [ ] Extend RTL tests for shallow queue tabs (heavy); keep unit tests for cache keys + drawer fetch dedupe.
- [ ] Document “expected log sequence” for support (workspace → dept → rows → drawer).

## Log schema (canonical)

All use `console.warn` for staging visibility unless otherwise noted.

- **`[perf.workspace.load]`** — `surface`, `route`, `phase`, `total_ms`, `source`, `org_id`, optional `client_cache_hit`.
- **`[perf.dept.load]`** — same + `department_id`.
- **`[perf.queue.rows]`** — `phase`: `server_request` (API) or client event (`hit` | `miss` | `prefetch` | `stale_refresh`); `org_id`, `work_unit_id`, `queue_key`, `total_ms` / cache flags / service breakdown.
- **`[perf.drawer.full_hydrate]`** — `entity_id`, `opportunity_id`, `org_id`, `work_unit_id`, `total_ms` (route), `enrichment_total_ms`, nested diagnostics (unchanged).
- **`[timing][opportunity-api-visible]`** — `drawer_visible` aligned fields: `total_ms`, `server_route_ms`, ids, `enrich_phases_ms`.
