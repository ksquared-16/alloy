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
waterfall. See `docs/sprints/workspace-trust-closure-baseline-runbook.md` and
`web/playwright/tests/workspace-trust-closure.spec.ts`.
