# Workspace Trust Closure — Baseline & Certification Runbook

Branch: `perf/workspace-trust-closure` (from `origin/staging` @ `4b642a92e`).

This runbook is how the **live baseline** and the before/after comparison are captured against
**staging** (dev-only numbers do not certify — dev compile dominates cold timings). The
instrumentation that makes it possible ships in Commit 1; it is dev/staging-gated and killable with
`NEXT_PUBLIC_PERF_PERCEIVED_MARKS=0`.

## What was instrumented (Commit 1)

- `web/lib/perf/workspaceNavGraph.ts` — a per-navigation recorder: nav mode
  (`cold | warm | prefetched | return`), the four timing markers (`shell_visible`,
  `coherent_content`, `interaction_ready`), request count, duplicate-request count, in-flight joins,
  and cache outcomes (`hit | stale_hit | miss | dedup_inflight`).
- `web/lib/workspace/workspaceAdminFetchDedupe.ts` — every `dedupeAdminFetch` / TTL-cache read is
  recorded into the active navigation (request URL, duration, whether it joined an in-flight GET or a
  TTL cache hit).
- `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` — opens a nav record on each work-unit
  identity change and stamps the three composition markers:
  - `shell_visible` — identity resolved, the shell frame can render;
  - `coherent_content` — shell + primary **queue rows** composed as one (the atomic-reveal point);
  - `interaction_ready` — rows **and** the action rail settled.

The pre-PRV2 `reportWorkUnitCriticalPathLanes()` tool measured a bootstrap architecture whose lane
marks now have no callers, so it reports nulls against the current runtime. Use the two globals below
instead.

## Capturing a baseline

Open the browser console on a staging work-unit surface. Two globals are exposed in dev/staging:

```js
__alloyWorkspaceBaseline()      // §3/§15 table across recent navigations + the live one
__alloyWorkspaceNavRequests()   // per-request waterfall for the most recent navigation
```

`__alloyWorkspaceBaseline()` also `console.table`s the rows. Copy the JSON return value into the
comparison table below after each scenario.

### Scenario matrix (sprint §3)

Run each and record one baseline row. Repeat 3× per scenario; report p75 for cold/warm.

| # | Scenario | How to reproduce | Expected nav `mode` |
|---|----------|------------------|---------------------|
| 1 | Cold entry | Fresh browser context → open a populated work-unit URL directly | `cold` |
| 2 | Warm nav | From `/workspace`, click into a work unit | `warm` |
| 3 | Return (A→elsewhere→A) | Open A, go to `/workspace`, return to A | `return` |
| 4 | Switch (A→B→A) | Open A, open B, return to A | `return` on the return legs |
| 5 | Lane switch | Inside a WU, click Work View pills | (same nav; watch request count) |
| 6 | Focus Panel open/close | Click a row, close it | (no new nav; queue stays mounted) |
| 7 | Action → back to queue | Execute a supported action | (watch for full reconstruction) |
| 8 | Browser back/forward | Navigate, then back/forward | `return` |

Also vary WU population: empty queue, small queue, representative populated, enriched rows,
configured summary tiles, attention data, operational-intelligence data.

### Baseline comparison table (fill in from `__alloyWorkspaceBaseline()`)

| Scenario | mode | shell_visible_ms | coherent_content_ms | interaction_ready_ms | request_count | duplicate_request_count | cache_outcomes |
|----------|------|------------------|---------------------|----------------------|---------------|-------------------------|----------------|
| Cold populated | cold | | | | | | |
| Warm populated | warm | | | | | | |
| Return A→ws→A | return | | | | | | |
| Switch A→B→A | return | | | | | | |

### Budgets to certify against (sprint §14)

- **Return to visited WU:** cached workspace visible ≤ 100 ms; no full-page skeleton; background
  revalidation non-blocking. (`coherent_content_ms` should be ~0 on `return` with a warm cache.)
- **Warm prefetched nav:** coherent primary content ≤ 300 ms; interaction-ready ≤ 500 ms.
- **Cold nav:** stable shell ≤ 100 ms; coherent content ≤ 750 ms p75; interaction-ready ≤ 1000 ms p75.
- **Request behaviour:** no duplicate bootstrap/active-queue request per navigation
  (`duplicate_request_count` = 0); no unused fan-out to every queue on entry.

## Expected effect of Commit 2 (session cache)

On a **return** navigation, `coherent_content_ms` should collapse toward ~0 and `request_count`
should drop from a full config→layout→summaries→rows waterfall to at most the background
stale-while-revalidate reads. `cache_outcomes` should show `surface_config` and `queue_rows`
`hit`/`stale_hit` rather than `miss`. If a `return` still shows a full waterfall with all `miss`, the
cache is not being consumed — investigate before certifying.

## Playwright certification (sprint §17)

A spec skeleton lives at `web/playwright/tests/workspace-trust-closure.spec.ts` (added in a later
commit). It requires an authenticated staging session; run it with your staging base URL and auth
storage state. It captures the request waterfall + timing markers for Scenarios A–E and asserts the
return-navigation budget.
