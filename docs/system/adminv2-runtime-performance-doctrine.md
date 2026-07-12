---
owner: runtime
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# AdminV2 runtime performance doctrine

**Path:** `docs/system/adminv2-runtime-performance-doctrine.md`  
**Status:** **Locked baseline** (June 2026). Implementation detail for reveal/queue/drawer gates.  
**Platform summary:** **`platform-performance-doctrine.md`** (Passes 1–3, sidecar deferral).  
**Supplements:** `docs/archive/2026-06-superseded-system/workspace-system.md`, `docs/archive/2026-06-superseded-system/record-system.md`, `docs/system/drawer-doctrine.md`, `docs/execution/operating-doctrine.md`  
**Historical context:** `docs/sprints/archive/05_2026/adminv2_reveal_doctrine.md`, `docs/sprints/archive/05_2026/completed/adminv2_performance_closeout.md`  
**Sprint closeout:** `docs/sprints/archive/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`  
**Next phase (backend only):** `docs/sprints/archive/06_2026/adminv2_backend_query_payload_optimization_phase.md`

---

## Purpose

AdminV2 should feel like **one continuous operating surface**. Loading, reveal, cache ownership, and known-empty semantics are **infrastructure** — not styling. UI and configuration work must not regress them.

**Before changing any AdminV2 UI component that affects drawer, queue, route, tabs, layout, or actions**, read this doctrine. Do not alter reveal behavior unless the task is explicitly a runtime/performance task.

---

## Runtime doctrine (platform)

| Principle | Meaning |
|-----------|---------|
| **Composed reveal over staged reveal** | Above-fold surfaces mount together after a coordinated gate — not section-by-section assembly. |
| **Payload-first drawer opening** | Drawers open from composed payload readiness (`drawer_primary` / composed person payload), not empty frame + late section fetch. |
| **Known-empty doctrine** | A completed lookup that found nothing is **ready**; missing data is **not ready**. Never treat `null` as empty. |
| **Cache-first warm navigation** | Session caches, prefetch inflight reuse, and bootstrap snapshots may accelerate warm paths; they must not change reveal contracts. |
| **Request ownership / stale response guards** | Every async apply path carries a request signature or generation token; stale responses are ignored. |
| **Queue lane hold doctrine** | While a lane is loading or rows are held, suppress false empty states. |
| **No false empty state doctrine** | “No records” appears only after the **current** lane request settles empty. |
| **Prefetch is allowed; partial reveal is not** | Background prefetch and idle hydrate are fine; above-fold partial paint is not. |
| **Loading/performance is infrastructure** | Reveal gates, cache keys, and readiness predicates are protected — not incidental UI details. |

Code anchors: `web/lib/adminV2/*RevealGate.ts`, `web/lib/admin/drawer/composedDrawerPayload/`, `web/lib/adminV2/runtime/contract/`, `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts`, `web/components/presentation/workUnit/QueueRegion.tsx`.

---

## Route doctrine

**Canonical operator URLs (browser):** `/workspace`, `/workspace/work-unit/:workUnitSlug`, `/workspace/work-unit/:workUnitSlug/:recordId` — see **`routing-doctrine.md`**.

**Internal filesystem:** `app/adminV2/workspace/**` (rewrites serve canonical URLs).

**Compat (removed in PRV2):** former `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]` page and `QueueBlock` — replaced by Presentation Runtime V2 (`WorkUnitSurface`, `QueueRegion`). See **`docs/platform/governance/runtime-ownership-migration-map.md`**.

### Allowed

- Coordinated loading gate (`*PageLoadingGate`) until above-fold contract is ready.
- Composed route reveal — shell + above-fold body together.
- Quiet below-fold refinement after reveal (KPI values, deferred counts, idle prefetch).
- Sticky valid data during refresh (stale-while-revalidate).

### Forbidden on warm navigation

- Shell-first, body-later assembly (header/actions/queue appearing in waves).
- Clearing valid current data before replacement data is ready.
- Section-owned above-fold skeletons replacing composed content.
- Independent oper-region spinner → panel swap on above-fold.

### Cache key scope

Preserve cache keys by **org / department / work-unit / queue / view scope**. Changing a cache key requires updating determinism tests (see § Required tests).

| Surface | Gate module | Console filter |
|---------|-------------|----------------|
| Workspace | `workspaceRevealGate.ts` | `[workspace-reveal-gate]` |
| Department | `deptRevealGate.ts` | `[dept-reveal-gate]` |
| Work unit | `workUnitRevealGate.ts` | `[wu-reveal-gate]` |

---

## Queue doctrine

Work-unit queue lanes (**Presentation Runtime V2:** `QueueRegion` + `useWorkUnitSurfaceRuntime`).

| Rule | Contract |
|------|----------|
| Unloaded queue rows never mean empty | No rows + loading = cold load or hold; only settled zero rows mean empty. |
| “No records” timing | Shown only after `queueRegionRenderState` resolves to `"empty"` (settled zero-row lane). |
| Queue-lane hold | Prior rows stay visible during refetch (`queueRegionRenderState` → `"rows"` while `loading && hasRows`). |
| Cold first load | Row skeleton only when `loading && !hasRows` (`"cold-loading"`). |
| Stale lane responses | Ignored via `queueRequestSeq` apply guard in `useWorkUnitSurfaceRuntime`. |
| Active lane beats prefetch | User-selected Work View / queue key wins over background refresh. |
| Work View switch under loaded lane | Must not flash row skeleton when prior rows exist (queue-lane hold). |

Selection authority: Work View pill strip + `useWorkUnitSurfaceRuntime` queue key resolution — URL `?queue=` (+ bucket aliases) → API `focus_queue` → bootstrap ownership → active pill. Legacy: `web/lib/adminV2/workUnitQueueSelection.ts`.

---

## Drawer doctrine

Surfaces: opportunity (parent/lead), person (parent), child person, job, and registered drawer entities via **`AdminEntityDrawerLegacy`** (shell router: `AdminEntityDrawer.tsx` → dynamic legacy import). Focus Panel / Presentation Runtime V2 owns inline record surfaces on work-unit hosts.

### Composed reveal

- Drawer frame, header, and above-fold body reveal **together** — not section-owned stagger.
- Above-fold sections must declare a **runtime contract** (`web/lib/adminV2/runtime/contract/`).
- An above-fold section may:
  - **block reveal** until its contract is satisfied,
  - **be hidden** until below-fold / lazy,
  - **render from complete payload** on first paint.
- Above-fold sections may **not** independently skeleton, resize, or flip values after first paint.

### Header and navigation stability

- Header / action rail remains stable across tabs and back navigation.
- **Back to Lead / Edit on Lead** must restore enriched opportunity snapshot immediately (stack restore / snapshot cache — do not cold-fetch empty header).
- Person drawer readiness is **context-aware**: person id + surface + required sections (`evaluateComposedPersonDrawerPayload`).

### Entity expectations (current baseline)

| Drawer | Opens |
|--------|--------|
| Opportunity (lead) | Composed — bootstrap + `drawer_primary` + coordinated above-fold model |
| Person (parent) | Composed — composed person payload + section requirements |
| Child person | Composed — same pipeline with child surface requirements |

Prefetch (`prefetchOpportunityDrawerOnRowIntent`, `prefetchPersonDrawerSnapshot`) may warm caches; it must not weaken composed readiness gates.

---

## Known-empty doctrine

Distinguish **lookup completed** from **has content**.

| Signal | Meaning |
|--------|---------|
| Key **missing** / `undefined` | Not loaded — not ready for known-empty completion |
| Key **present**, value `[]` | Loaded and empty — **ready** |
| Key **present**, value `false` | Loaded and false — **ready** |
| Domain confirmed absent on full payload | **Ready** (e.g. no medical surface exists) |

### Examples (valid completion)

- Empty household links — ready once household lookup completed.
- Empty addresses — ready once address lookup completed.
- No medical data — ready once full payload confirms no medical domain.

### Anti-patterns

- Treating `null` queue rows as “no records”.
- Showing empty UI while fetch in flight.
- Confusing “has content” with “lookup completed”.
- Section-local “No records” before composed payload evaluation finishes.

Modules: `evaluateComposedDrawerPayload`, `evaluateComposedPersonDrawerPayload`, `composedDrawerPayload/sectionRequirements.ts`, opportunity drawer section registries.

---

## Cursor / AI guardrail

### UI changes **may** alter

- spacing, typography, labels
- section order (below-fold or non-contract sections)
- visible fields (config-driven)
- component styling

### UI changes **may not** alter

- payload readiness predicates
- request ownership / apply guards
- cache keys
- stale response guards
- route reveal gates
- drawer composed reveal gates
- queue empty-state semantics
- known-empty predicates

### When touching runtime-sensitive files

1. Read this doctrine and `docs/sprints/archive/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`.
2. Run the **required test suite** (§ below).
3. Do not merge UI-only PRs that change reveal timing without explicit runtime task approval.

Enforced in repo: `.cursor/rules/adminv2-runtime-performance.mdc`.

---

## Runtime-sensitive files (protected)

Changes to these files require doctrine review and the runtime test suite:

| Area | Paths |
|------|--------|
| Drawer shell router | `web/components/admin/AdminEntityDrawer.tsx` |
| Drawer runtime owner | `web/components/admin/AdminEntityDrawerLegacy.tsx` |
| Entity drawers | `web/components/admin/entity/*Drawer*` |
| Opportunity drawer UI | `web/components/admin/opportunity/*` |
| Work-unit surface (PRV2) | `web/components/presentation/workUnit/WorkUnitSurface.tsx` |
| Queue region (PRV2) | `web/components/presentation/workUnit/QueueRegion.tsx` |
| Work-unit runtime hook | `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` |
| Composed payload | `web/lib/admin/drawer/composedDrawerPayload/*` |
| Drawer reveal | `web/lib/admin/drawer/*Reveal*` |
| Runtime contract | `web/lib/adminV2/runtime/contract/*` |
| Queue workspace | `web/lib/workspace/*Queue*` |
| Opportunity drawer open | `web/lib/admin/opportunityDrawer*` |
| Person prefetch | `web/lib/admin/prefetchPersonDrawerSnapshot.ts` |

Related (often co-changed): `web/lib/adminV2/*RevealGate.ts`, `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`, `web/lib/workspace/adminV2WorkspaceSessionCache.ts`, `web/lib/admin/opportunityDrawerOpenCoordinator.ts`, `web/lib/admin/opportunityDrawerIntentPrefetch.ts`.

---

## Required tests

Run when touching runtime-sensitive files:

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

Also recommended for broader drawer/queue edits:

- `tests/admin/opportunityDrawerOpenCoordinator.test.ts`
- `tests/admin/opportunityDrawerIntentPrefetch.test.ts`
- `tests/admin/prefetchPersonDrawerSnapshot.test.ts`
- `tests/adminV2/workUnitRevealGate.test.ts`
- `tests/adminV2/runtime/adminV2RuntimeContract.test.ts`

Before merge on TypeScript changes: `cd web && npm run typecheck`. When tests or scripts change, also run `npm run typecheck:tests`. See `docs/platform/governance/typescript-performance.md`.

---

## Instrumentation (do not remove)

Dev perf marks and console filters are part of the contract:

- `[wu-reveal-gate]`, `[dept-reveal-gate]`, `[workspace-reveal-gate]`
- `[wu-bootstrap-perf]`, `[drawer-primary-perf]`, `[prefetch.adminv2]`
- `web/lib/perf/adminV2PerfLog.ts`

Use these to diagnose regressions — not to mask partial reveal.

---

## Sprint closeout summary

- **Runtime consistency is demo-ready.** Workspace → dept → work-unit and drawer open paths behave as one composed surface.
- **Drawer and queue behavior are stable** enough to move forward on product/configuration work.
- **Remaining work is backend query and payload optimization**, not core runtime architecture (see next-phase backlog).
- **Future UI changes must preserve this doctrine.**
