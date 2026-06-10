# Platform performance doctrine

**Path:** `docs/system/platform-performance-doctrine.md`  
**Status:** **Canonical** (June 2026 freeze). Platform-level performance model for operator workspace, queues, and drawers.  
**Implementation detail (locked):** **`adminv2-runtime-performance-doctrine.md`** — do not weaken reveal gates without explicit performance task.  
**Instrumentation:** `web/lib/perf/platformSurfacePerfTrace.ts`, `NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG`, Vercel relay via `/api/admin/debug/platform-perf-trace`

---

## Purpose

Alloy operator surfaces must feel like **one continuous workspace**, not a sequence of loading phases. Performance is **infrastructure**: reveal gates, cache keys, prefetch contracts, and sidecar deferral — not incidental UI polish.

---

## Core principles

| Principle | Meaning |
|-----------|---------|
| **Single reveal** | One loading shell, then the full above-fold surface together |
| **Atomic reveal** | Header, KPI strip, selected queue lane, and actions rail reveal as one coordinated bundle (Pass 3) |
| **No phased loading** | Forbidden: header first, then actions, then queue appearing in waves |
| **Queue remains mounted** | Pill switches hold prior rows or show lane hold — not full-page remount |
| **Sidebar remains mounted** | App shell and sidebar stay mounted across work-unit navigation |
| **Warm navigation** | Session caches, bootstrap inflight reuse, slug-route shell seed |
| **Drawer prefetch** | Row intent/hover warms opportunity VM; visible-row prefetch after reveal |
| **VM prewarm** | `prepareDrawerViewModelDeduped`, `warmQueueRowOpportunityVm` before `openDrawer` |
| **Hold prior payload** | Linked drawer navigation keeps displayed VM until next VM ready |
| **URL sync without route remount** | Drawer open/close via `replaceState`, not Next.js page transition |

---

## Sidecar deferral (critical path diet)

Non-critical network work **must not** compete with work-unit first paint:

| Deferred until after primary reveal | Examples |
|-------------------------------------|----------|
| Inbox warm load | `scheduleInboxWarmLoad` (idle after shell settle) |
| Nav tree prefetch | `prefetchWorkspaceNavTree` |
| AI capability probes | `fetchAdminV2Sidecar('workflow_assist_capabilities')` |
| Agent activity strip | `fetchAdminV2Sidecar('agent_activity')` |
| Workflow automation panels | `fetchWorkflowAutomationWorkspacePanels` |
| Sibling lifecycle lane prefetch | `workUnitLanePrefetchTargets({ includeLifecycleSiblings: false })` |
| Legacy-admin link prefetch | `prefetch={false}` on workspace root actions rail |

**Gate:** `isAdminV2SidecarNetworkBlocked()` until `wu_reveal_above_fold_ready` perf mark clears primary surface pending (`adminV2PrimarySurfaceGate.ts`).

---

## Performance stabilization passes (June 2026)

### Pass 1 — Cache and prefetch discipline

**Goal:** Stop canonical routes from paying legacy and duplicate fetch tax.

- Work-unit slug route session cache (`workUnitSlugRouteCache.ts`)
- Sidebar lifecycle catalog cache
- Gate legacy drawer prefetch on non-canonical hosts
- Platform perf trace namespaces (`[perf:work-unit]`, `[perf:drawer]`, …)
- BOS drawer geometry stability fixes

**Commit anchor:** `86c70e01` (staging)

### Pass 2 — Entry prewarm and observability

**Goal:** Faster perceived work-unit entry; persistent perf logs.

- Lifecycle/sidebar **hover prewarm** (`operatorWorkUnitEntryWarm.ts`)
- Cold shell loading shimmer (`WorkUnitWorkspaceColdShell`, lifecycle-style card)
- Drawer swap micro-hold (`adminv2-drawer-panel--swap-hold`)
- Client perf buffer + optional Vercel `[PLATFORM_PERF]` relay
- `window.__alloyPlatformPerf` debug API

**Commit anchor:** `0cf7c4a5` (staging)

### Pass 3 — Atomic reveal and critical path diet

**Goal:** No visible phased work-unit load; slim first network path.

- **`workUnitPageContentReady`** waits for full **`workUnitAboveFoldPageReady`** (shell + summaries + actions + rows + KPI)
- Sidecar gate clears on **`wu_reveal_above_fold_ready`** (not primary lane alone)
- Bootstrap **`summary_mode: initial`** (priority lanes only on first fetch)
- No lifecycle sibling lane prefetch on entry; cap neighbor prefetch
- Legacy-admin **`prefetch={false}`**; `/legacy-admin` in heavy-route list
- Workspace KPI styling aligned with work-unit; lifecycle tile premium accent

**Commit anchor:** `0fcf5203` (staging)

---

## Known remaining bottlenecks (June 2026)

| Area | Observation | Next phase |
|------|-------------|------------|
| Queue row GET | `lifecycle_lead` lane ~800–1000ms server time for small sets | Backend query/payload optimization (`adminv2_backend_query_payload_optimization_phase.md`) |
| Opportunity VM compose | ~1s+ cold compose on drawer open | VM cache hit rate, compose parallelization, defer non-first-viewport deps |
| Operational bootstrap | Still fetches dept/WU metadata on entry | Continue deferring non-critical bootstrap bundles |
| Legacy drawer hosts | Non-VM entities via `AdminEntityDrawerLegacy` | Convergence per entity; not performance-critical for enrollment path |

---

## Debugging

| Flag / API | Use |
|------------|-----|
| `NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG=1` | Client `[perf:*]` traces |
| `NEXT_PUBLIC_ALLOY_PLATFORM_PERF_SERVER_LOG=1` + `PLATFORM_PERF_SERVER_LOG=1` | Vercel `[PLATFORM_PERF]` lines |
| `localStorage ALLOY_PLATFORM_PERF_DEBUG=1` | Enable without redeploy |
| `window.__alloyPlatformPerf.dump()` | Buffered events (survives DevTools clear) |
| `ADMIN_PERF_TRACE=1` | Server `[ADMIN_PERF]` + client surface-ready timings |
| Console filters | `[wu-reveal-gate]`, `[perf:work-unit]`, `[perf:drawer]`, `[PLATFORM_PERF]` |

---

## Required tests (when touching runtime-sensitive files)

See **`adminv2-runtime-performance-doctrine.md`** § Required tests and `.cursor/rules/adminv2-runtime-performance.mdc`.

Pass guard tests: `web/tests/adminV2/viewModel/platformSurfacePerfStabilizationPass{1,2,3}.test.ts`.

---

## Related docs

- **`adminv2-runtime-performance-doctrine.md`** — locked reveal/queue/drawer contracts
- **`routing-doctrine.md`** — URL sync without remount
- **`drawer-doctrine.md`** — VM warm open
- **`repository-state-2026-06.md`** — current platform snapshot

---

## When this doc must be updated

New performance passes, changes to sidecar gating, reveal gate semantics, or documented bottleneck resolution.
