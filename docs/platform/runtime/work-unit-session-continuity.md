# Work Unit Session Continuity (implemented)

Status: implemented (Workspace Trust Closure, July 2026). This documents the shipped contract, not a
proposal. It refines — does not replace — the Loading & Reveal Contract and the Operational
Navigation Contract; it introduces no competing performance doctrine.

## The rule

Work Unit runtime state belongs to the **workspace session**, not to the disposable route component.
The Surface Host unmounts the Work Unit runtime on any non-work-unit navigation; its heavy
composition (config bundle, queue rows, lane summaries, per-view counts, right-rail actions) is
therefore held in a session cache above the route so a return renders from memory.

## Canonical cache

`web/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache.ts` is the single home. Entries are
keyed by the deterministic **org / department / work-unit / user / scope / queue / view** scope
(`buildWorkUnitViewModelCacheKey`) — org id is part of every key, so a read can never cross tenants.
There is one cache, not per-component caches. Resources:

| Resource | Key scope | Fresh window | TTL | Mutation invalidation |
|---|---|---|---|---|
| config bundle (dept meta, queue def, sibling units, row layout) | org/dept/wu/user/scope | 60s | 20m | config-publish only |
| queue rows (per lane) | + queue key + view + site | 15s | 20m | any row mutation |
| lane summaries | + site | 15s | 20m | any row mutation |
| canonical Work View totals | + population fingerprint | 15s | 20m | any row mutation |
| right-rail resolved actions | org/dept/wu/user/scope | 60s | 20m | config-publish only |

Header surface config and OIP metrics already persist in their own module warm caches; identity
persists in `workUnitSlugRouteCache`.

## Semantics

- **Fresh** — render from cache; do not refetch this navigation.
- **Stale (within TTL)** — render from cache immediately, revalidate in the background (SWR). SWR
  **never** blanks retained state: `queueSettledOnce` is monotonic, so a background refetch cannot
  lower `coldCompositionReady`.
- **Missing / expired** — the coherent first-entry boundary (one skeleton), deduped across consumers.
- **Failed revalidation** — retain the last usable rows (queue-lane hold); never masquerade as empty.

## Synchronous return

The runtime seeds `useState` initializers synchronously from the cache on mount
(`computeWorkUnitSurfaceInitialSeed`), before any effect runs. A return renders the prior composition
in the first commit with zero blocking refetch. Cross-tenant/user/scope reads are impossible (the key)
and a failure shell is never cached (the config `ok` flag).

## Atomic reveal

`WorkUnitReadiness.coldCompositionReady` gates the reveal on the primary queue having settled, so cold
entry holds one boundary until header + pills + counts + rows are established together. A seeded return
reveals immediately from `retainedCompositionReady`; header KPIs settle into reserved slots without
holding the boundary. No region-by-region reveal.

## Prefetch

Pointer/keyboard intent warms the **same** cache keys the runtime seeds from
(`warmWorkUnitSurfaceSession`, via the shared `fetchWorkUnitSurfaceConfigBundle`). A prefetched
navigation consumes the entry and the fresh-skip means it launches no duplicate config or rows
request. Prefetch is bounded (in-flight guard, fresh short-circuit) and never a blocking dependency.

## Mutations

The smallest correct scope: a record/queue mutation drops only the **data** projections (rows /
summaries / counts) for that work unit and refetches the active lane in place (write-back fresh) — the
config and right-rail actions are retained. A configuration publish drops the full surface cache. No
`router.refresh` / route reconstruction is used anywhere in the runtime. A return can never resurrect
pre-mutation rows.

## Retained operator context

The selected Work View is retained per org + work unit and restored on return (an explicit route view
wins). Not restored: open records / Focus Panel (URL-owned; a stale record is not resurrected), partial
mutation forms, destructive confirmations, transient errors.

## Guardrails

- Reload remains the recovery floor — never deleted.
- Cross-browser-reload (sessionStorage) persistence is **not** implemented here; it stays behind the
  unapproved Navigation Runtime doctrine and must be flag-gated if pursued.
- Deterministic cache keys are protected primitives — changing key scope requires updating the
  determinism tests.

## Instrumentation

Dev/staging only (`NEXT_PUBLIC_PERF_PERCEIVED_MARKS`): `window.__alloyWorkspaceBaseline()` returns the
per-navigation report (mode cold/warm/prefetched/return, shell/coherent/interaction markers, request &
duplicate counts, cache outcomes); `window.__alloyWorkspaceNavRequests()` returns the request
waterfall (including the captured `Server-Timing` header per request). See
`docs/sprints/workspace-trust-closure-baseline-runbook.md` and
`web/playwright/tests/workspace-trust-closure.spec.ts`.

## Server critical path

Cold entry issues these server reads (client owner → route):

| Resource | Route | Notes |
|---|---|---|
| identity | `GET /api/admin/work-units/by-slug/:slug` | module-cached; server-seeded in the route layout |
| config bundle | `GET /api/admin/departments/:id`, `/work-units/:id`, `/work-units?department_id=`, `/queue-row-layout/:surfaceId` | one shared fetcher (`fetchWorkUnitSurfaceConfigBundle`); `ok` flag gates caching |
| lane summaries | `GET /api/admin/work-units/:id/queues` | fetch-sizing only; never a displayed count |
| active rows + count | `GET /api/admin/queues/:workUnitId/:queueKey?work_view_id=…&count_mode=exact` | one evaluation path for rows + active-view count |
| per-view totals | same rows route, one request per inactive view | the fan-out (see below) |
| right-rail actions | resolved-actions bundle | cached client-side |

**Server-Timing.** The queue rows/summaries routes emit a standard `Server-Timing` response header
(`web/lib/perf/queueRowsServerTiming.ts`) built from the service's existing breakdown — `auth`,
`prep`, `load_def`, `operational_day`, `base_query`, `count`, `status_defs`, `enrichment`,
`serialize`, `service_total`, `total`, plus a `cache` hit/miss marker. Durations only — no ids, SQL,
tenant identifiers, or record values. The client nav report captures it per request so a trace
correlates client and server time without extra round-trips.

**Row enrichment is batched, not N+1** (verified). `getWorkUnitQueueItems` collects the distinct
foreign keys across the loaded rows and issues **one bounded `IN (…)` query per entity class**
(persons, contacts, customers, locations, tour bookings, tasks, …) — enrichment query count is
bounded by entity class, never by row count; `queue_reveal` mode narrows the batch set further.
`enrichment_queries_run` names the plan. No per-row fetch loop exists.

**Canonical-total fan-out.** Per-view counts come from the rows route with each view's `work_view_id`
predicate (the only source that agrees with the rendered rows). This is inherently one evaluation per
view. It is bounded so it never dominates: cached (a return resolves every badge from memory, 0
requests), fresh-skipped on a very recent return/prefetch, excludes the active view (its count comes
from the rendered rows response), and **capped to `WORK_VIEW_TOTALS_FETCH_CONCURRENCY` in flight** so
a many-pill unit never bursts. Request count is bounded by inactive-view count, not row count.

**Designed next step (not yet implemented — needs deploy/DB verification):** a batched view-totals
endpoint that resolves auth/scope/dept-metadata once, fetches the shared base lane once per
`(workUnitId, baseQueueKey)` group, and applies each view's filter in memory
(`applyWorkViewFilterToQueueItemsResult`, the same pure function the single route uses, so counts
match by construction) — collapsing N per-view requests into one. Left as a follow-up because count
parity must be certified against real data before replacing the per-view path.

## Not implemented here (out of runnable reach)

- Database `EXPLAIN (ANALYZE, BUFFERS)`, index analysis, and query-plan tuning — require database
  access this environment does not have. The server-timing header makes the slow phases visible so
  these can be targeted next.
- Deployed browser certification (real cold/return/mutation timings) — requires an authenticated
  staging deploy. The Playwright harness is ready to run there.
