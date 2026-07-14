---
owner: runtime
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

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

**Canonical totals are batched into ONE request.** `POST /api/admin/queue-view-totals` resolves the
counts for every pill in a single request: authorization, record scope, and viewer timezone are
prepared once; each distinct work unit's access check and department metadata are memoized per
request; each distinct `(workUnitId, queueKey)` lane is fetched once; and every requested view's
count is computed from that one base page by `aggregateWorkViewTotals` → `computeOperationalProjection`
— the SAME predicate evaluator (`filterQueueRowsForWorkView`) the single queue route uses, so counts
are identical by construction (verified by parity tests). Include-all views use the lane's exact
count; a capped base page marks a filtered count `known:false` (shown as no badge, never a wrong
number). The browser therefore issues **one** totals request regardless of pill count (1/5/20 views
→ 1 request), and internal DB work is one base fetch per distinct lane, not one per view.

The client seeds these from the session cache on return (0 requests), fresh-skips a very recent
return/prefetch, and falls back to the bounded per-view path (capped to
`WORK_VIEW_TOTALS_FETCH_CONCURRENCY`) only if the grouped endpoint fails — so counts are never lost.
Count parity against real data still needs deployed certification before the per-view fallback is
removed.

**Prefetch convergence.** Every Work Unit navigation affordance (sidebar links, shell soft-nav, Work
View pills) calls one shared prewarm — `warmOperatorWorkUnitNavEntry` — which warms both the route
identity/bootstrap and the PRV2 surface session, keyed by the live workspace scope published through
`currentWorkspaceScope`. No affordance retains an obsolete prewarm path.

## Selected-record composition (record surface first paint)

The deployed trace showed the selected-record view model (`composeOpportunityDrawerViewModel`)
dominating record-open at ≈2520ms vs ≈1370ms for queue rows. The record surface is authoritative
(the queue row is preview only), so its first paint must be a single coherent reveal, not phased
assembly. Two structural moves, both reusing the existing first-paint contract — **no new tier type,
no streaming**:

- **Communications preview is deferred off the blocking compose.** `activity.communicationsPreviewVm`
  is only an *initial seed* for the Activity embedded workspace, whose runtime already fetches on
  demand and idle-prewarms (`focusPanelActivityPrewarm`). The workspace VM route now passes
  `deferCommunicationsPreview` (opt out with `?comms_preview=1`), so the record-open critical path no
  longer waits on `resolveFamilyCommunicationWorkspacePreview` (`activity_comms_preview_ms` leaves the
  path) and no redundant comms request rides record-open. The consumer is null-safe by construction.
- **The Tier-1 boundary is the above-fold render model.** `buildOpportunityDrawerViewModelAboveFold`
  is computed *before* `projectStageWorkRuntime` / `resolvePublishedStageInputsForCurrentWork`, so the
  header, status control, lifecycle rail, and above-fold sections never depend on stage-work runtime.
  That is the seam for a future thin Tier-2: a fetch keyed by the already-resolved
  `{opportunityId, departmentId, stageKey}` (carried on the Tier-1 VM) — **not** a second full compose,
  which would recompute Tier-1 prep and violate "no unnecessary runtime work." Until that lands,
  stage-work stays in the first response; deferring it requires gating the Focus Panel Current-Work
  card behind a pending state so it never flips from "No active work" to real content (the same
  fake-value rule the header KPIs now follow — see below).

## Work View change: swap, never blank

Switching Work View must never blank the record area. `selectWorkView` no longer calls
`closeDrawer()` (tearing the subject to null dropped the held-prior payload and flashed the empty
placeholder). Instead the prior record stays on screen and the first-row auto-open **swaps** the
subject once the new lane settles — `holdPriorPayload` (true while `displayVm.entity.id !== drawer.id`)
spans the swap, so the previously-composed record grid holds until the new record resolves. The
auto-open effect clears the drawer only when a force-switched lane settles genuinely empty (no
openable rows); an initial mount / deep-link never force-clears an operator's open record.

## Header KPI reveal: real value or a stable loading slot

Work Unit header KPIs settle into reserved slots without holding the reveal boundary — but they must
not show a placeholder value that then flips. `WorkspaceHeaderKpiVm` carries `pending` (true until a
metrics-resolve pass has produced values: `buildWorkspaceHeaderPresentation` sets it from
`resolved == null`). While pending, the tile renders a stable, value-height loading slot
(`data-kpi-pending`), not the "—" no-data glyph. Once resolved — even to genuine no-data — `pending`
is false and the real value (including a real "—") shows. The WU runtime coalesces a settled-but-null
resolve to `{}` so a failed warm prefetch settles to "—" rather than holding the slot forever. The
Workspace header never renders pending (its whole surface holds one skeleton until `signalsSettled`).

## Communications ownership (duplicate requests)

The Work Unit runtime resources (queue rows, config bundle, lane summaries, entity labels, grouped
totals) are each single-owned and deduped through `dedupeAdminFetch*` / the batched totals in-flight
map. Communications is a separate world of module warm caches; the on-surface duplicate was the
Family Communication Workspace SWR revalidate firing a `force:true` fetch that **bypassed the
in-flight guard** — two consumers served from the same warm entry each issued a network hit. Fixed:
the revalidate now coalesces onto an existing in-flight request
(`getDrawerFamilyWorkspaceInflight(params) ?? prefetchDrawerFamilyWorkspace(params, {force:true})`) —
`force` bypasses warm freshness, not in-flight dedup. Remaining (off the workspace critical path, on
the `/communications` route): status-options + audience metadata are fetched by both
`communicationsWorkspaceWarmCache` and `AnnouncementsWorkspace`; the warm cache should be the sole
owner and the component consume it (or fall through `dedupeAdminFetch`). Inbox threads likewise have
two owners (`inboxWarmLoadCache` vs `InboxPanel`) with divergent `limit`/`compact` URLs that defeat
coalescing.

## Workspace boot ownership

`/workspace` boot work, classified so everything possible stays off the shell-critical path:

| Class | Work | Where |
|---|---|---|
| **shell-critical** (before frame paint) | auth/role gate, org name, viewer + operational timezone, access context | `app/adminV2/workspace/layout.tsx` (awaited bundle); `useWorkspaceSurfaceRuntime` synchronous card seed |
| **landing-primary** (default content, gates reveal) | lifecycle landing cards (server + authoritative refine), process/header surface config, Work View totals (batched), OIP metric warm resolve | `layout.tsx` cards; `useWorkspaceSurfaceRuntime` (`processConfigLoaded`/`headerConfigLoaded`/`signalsSettled`/totals in the ready gate) |
| **secondary** (after landing) | workspace-root resolved right-rail actions | `fetchWorkspaceRootResolvedActions` — set independently, **not** in the ready gate |
| **interaction-triggered** | queue-updated cache-bust + refetch (Create Lead etc.) | `OPPORTUNITY_QUEUE_UPDATED_EVENT` listener |

Entity labels are landing-primary but already de-risked (150ms timeout, degrade to `{}`, background
warm) — see "Stop entity labels blocking first composition." The reveal holds one skeleton until
config + metrics + counts settle together (no default-header flash, no partial KPI morph).

## Queue payload reduction (compact projection)

Measured on a representative enriched case-grain row, `queue_list` (drawer-grade `_queue_row_context`
attached) vs `queue_reveal` (compact, case-grain row context omitted):

| Projection | Bytes | Properties (deep) |
|---|---|---|
| `queue_list` (before) | 2042 | 70 |
| `queue_reveal` (after) | 1063 | 32 |
| **saved / row** | **979 B (48%)** | **38** |

The drawer-grade `_queue_row_context` is the single largest per-row contribution; `queue_reveal` omits
it for case-grain rows (child/candidate grain still attach). Guarded by
`web/tests/perf/queueRevealPayloadReduction.test.ts`.

## Not implemented here (out of runnable reach)

- Database `EXPLAIN (ANALYZE, BUFFERS)`, index analysis, and query-plan tuning — require database
  access this environment does not have. The server-timing header makes the slow phases visible so
  these can be targeted next.
- Deployed browser certification (real cold/return/mutation timings) — requires an authenticated
  staging deploy. The Playwright harness is ready to run there.
