# Operational Runtime Topology

> **⚠️ Partially superseded — Runtime Simplification sprint CLOSED (June 2026).** The work-unit and queue sections below describe the pre-simplification runtime. Implemented and landed: workspace reveal owned by the server Route VM (loading gate / reveal-readiness layer / Surface VM deleted); work-unit sibling switching is now **navigation, not in-page state** (`activeWorkUnitId` removed); work-unit context, perspective, and queue fetch + state are owned by canonical runtime modules (`useWorkUnitQueueRuntime`, `useWorkUnitRuntimePerspective`, Work-Unit Route VM); plus runtime QA fixes (instant tile click, no "Preparing operational surface…" over a loaded queue, KPI header skeleton, TTL-deduped sibling/summary fetches). **The canonical record is [`work-unit-runtime-simplification-closeout.md`](./work-unit-runtime-simplification-closeout.md)** — completed/remaining domains, runtime score, lessons, and the runtime principles. Remaining: queue summaries/bootstrap, queue lane ownership, reveal coordination, KPI ownership, settings runtime.

**Status:** Canonical engineering blueprint (Track 2 — June 2026). **Descriptive, not prescriptive: this is how Alloy works *today*, literally.** No optimization, no targets — those live in the doctrine and the phase docs.
**Companion analysis:** [`../../sprints/06_2026/runtime-topology-phase1.md`](../../sprints/06_2026/runtime-topology-phase1.md) (complexity scores, paint analysis, top-25 violations/simplifications, implementation order).
**Governs against:** [`operational-runtime-doctrine.md`](./operational-runtime-doctrine.md) (the 10 laws). **Evidence base:** [`../../sprints/06_2026/operational-runtime-doctrine-phase-1.md`](../../sprints/06_2026/operational-runtime-doctrine-phase-1.md), Sprint 01/02 audits.

**Measurement note.** Static counts (LOC, `useState`/`useEffect`/`useMemo`, `fetch`/`dedupeAdminFetch`, `router.refresh`, Suspense boundaries, cache modules, API endpoints) are **measured** via `grep`/`wc` at `origin/staging` `fa83113a6` (+ Phase 2 Slice 1). Paint/commit *sequences* are **modeled from code structure** (state-commit points + reveal gate); exact wall-clock RUM paint counts require capturing the existing perf marks (`perfWorkspaceLoad`, `[workspace-reveal-gate]`, `[wu-reveal-gate]`) in a browser and are flagged `NEEDS_RUM` where used.

---

## 1. The runtime layer stack (every operational route passes through this)

```
Browser URL  ( /workspace , /workspace/work-unit/:slug )
  │  next.config.ts rewrite → /adminV2/workspace[...]
  ▼
[L0] app/adminV2/layout.tsx ............ mounts AdminV2Shell (Sidebar + TopNavBar + chrome)   [server shell anchor]
  ▼
[L1] app/adminV2/components/AdminV2Shell.tsx ... 5 Suspense boundaries; workspace-v2 branch    [top chrome owner]
  ▼
[L2] app/adminV2/workspace/layout.tsx .. force-dynamic; Promise.all(server bundle: org/tz/access/labels)  [server data]
  ▼
[L3] AdminV2WorkspaceClientProviders ... Auth/Vertical/Labels/Timezone/Org/OperationalMode + <AdminEntityDrawer/>  [client providers]
  ▼
[L4] route surface:
     /workspace        → page.tsx (client, 746 LOC) → composeWorkspaceSurfaceViewModel → WorkspaceRootShell
     /work-unit/:slug  → [slug]/layout.tsx → WorkUnitSlugRouteHost (135 LOC) → AdminV2OpportunityWorkUnitPage (compat, 7,780 LOC)
  ▼
[L5] Surface ViewModel + Reveal Gate ... reveal.canCommit = single commit decision        [reveal owner]
  ▼
[L6] Section owners (KPI strip, lifecycle grid, QueueBlock, Focus Panel) render from VM    [render owners]
  ▼
[L7] Cross-cutting: 60 cache modules · 31 prefetch/warm utils · custom-event invalidation  [state/cache owners]
```

Five layers (L0–L3) are **shared chrome** that should commit once and persist. L4–L6 are **per-route surface**. L7 is the **continuity substrate** (caches/prefetch) that is supposed to make navigation seamless.

---

## 2. Transition flows (literal, step-by-step)

### 2.1 Cold `/workspace` load (no cache, first visit)
```
URL /workspace → rewrite → server: layout.tsx Promise.all(org name, viewer tz, operational tz, access, entity labels)  [5 server awaits, block SSR]
→ client mount AdminV2Shell (chrome paints: Sidebar, TopNavBar[Suspense fallback "Loading…"], BreadcrumbBar)
→ page.tsx mount: useState×23; lifecycleCards = peekOperatorLifecycleLandingCards() ?? []  (empty cold)
→ useLayoutEffect: readWorkspaceRootCache → miss → returns early (loading stays true)
→ PAINT 1: WorkspacePageLoadingGate ("Preparing departments, counts, and orientation…")   ← LOADING GATE
→ useEffect: loadOperatorLifecycleLandingCards() [GET /api/admin/lifecycle-catalog + /work-units + /departments → build → enrich enrollment surfaces (per-dept summaries)]
→ useEffect: dedupeAdminFetch(/api/admin/departments) [blocks shell_ready] + /api/admin/work-units + /api/admin/workspace-kpi-placements
→ lifecycle cards resolve → surface_snapshot_committed=true → reveal gate above_fold_ready
→ PAINT 2: WorkspaceRootShell (header + KPI snapshot slot + lifecycle tiles; quick-rollup counts only)
→ background (idle 2500ms): growth rollup (per-dept lifecycle-kpis + pipeline-exact-count) → patch KPI values
→ background: OIP warm metrics → patch KPI values
→ PAINT 3..n: KPI value patches (counts → growth → OIP)   ← value patches into a slot the header reserves
→ idle: prefetchVisibleDepartmentAboveFoldBundles (warm dept routes)
→ Ready
```

### 2.2 Warm `/workspace` return (session/module cache present)
```
→ page.tsx mount: lifecycleCards = peekOperatorLifecycleLandingCards() (module hit) OR useLayoutEffect peekWorkspaceLifecycleCardsForRestore (session hit)
→ useLayoutEffect readWorkspaceRootCache hit (departments present) → setDepartments/metrics/kpiStrip; setLoading(false)
→ PAINT 1: WorkspaceRootShell committed from snapshot (no gate)   ← reveal once
→ background: main fetch effect still re-runs (revalidate departments), growth/OIP patch quietly
→ Ready
```

### 2.3 Click `/workspace` → work-unit (warm, lifecycle tile prewarmed)
```
hover/idle on tile → warmWorkUnitSlugRoute(slug) [GET /api/admin/work-units/by-slug/:slug] + warmWorkUnitBootstrapFromSlugEntry (operational bootstrap)
→ click → adminV2NavigationTransition (commitFirst) → router push /workspace/work-unit/:slug
→ server [slug]/layout.tsx (param extract only) → WorkUnitSlugRouteHost mount
→ peekWorkUnitSlugRouteCache hit → slug metadata present → mount compat page in WorkUnitSlugRouteProvider
→ compat page: readWorkUnitPageCache hit → seededFromCache → coordinated reveal
→ PAINT 1: work-unit surface (context + KPI snapshot + pills + condensed queue + Focus Panel shell) committed together
→ background: OIP live KPIs, right-rail workflow KPIs, queue row VM prewarm
→ Ready
```

### 2.4 Work-unit cold entry (deep-link, no warm slug/bootstrap)
```
→ WorkUnitSlugRouteHost: state.phase="loading"
→ PAINT 1: WorkUnitWorkspaceColdShell (title + KPI quiet reserve + WorkUnitOperationalLaneLoader)   ← COLD SHELL
→ useEffect warmWorkUnitSlugRoute(slug) [GET /api/admin/work-units/by-slug/:slug] (CLIENT waterfall)
→ slug resolves → mount compat page → queue summaries + primary-lane rows + bootstrap + KPI snapshot
→ reveal gate resolveWorkUnitPageContentReady (shell + critical bundle + coordinated + operational surface)
→ PAINT 2: coordinated work-unit reveal
→ background: OIP, right-rail
→ Ready
```

### 2.5 Work-unit → `/workspace` back (continuity)
```
→ work-unit DOM unmounts; /workspace mounts fresh (separate layout — no shared persistent surface)
→ if module cache populated & hydrated → peekOperatorLifecycleLandingCards → reveal once (no gate)
→ if module cache empty/needs-hydration → SESSION snapshot (Phase 2 Slice 1: seeded by work-unit revalidation) → reveal once
→ if neither warm (fast bounce < idle window on cold session) → WorkspacePageLoadingGate   ← residual gate (Slice 1 remaining race)
→ departments/KPI revalidate + patch
```

### 2.6 Queue row click → Focus Panel
```
row hover → prefetchOpportunityDrawerOnRowIntent (bootstrap + drawer_primary) ; pointerdown → prefetchOpportunityDrawerFullOnRowIntent
→ click → openDrawerModelSwap (AdminDrawerContext) → applyDrawerTargetNavigation at swap start (synchronous subject commit)
→ Focus Panel shell subject = clicked-row seed (opportunityQueuePreviewSeed)  ← seed-first header, no empty frame
→ AdminEntityDrawer router → OpportunityDrawerVmRuntime (or PersonsDrawerVmRuntime) inside EntityDrawerOperatingShell
→ VM cards hydrate inside the already-switched shell (stale requests ignored; latest click wins)
→ Ready
```

### 2.7 Save (drawer operating sections)
```
edit → drawerOperatingSaveCoordinator: registers sections (isDirty/save/applyOptimistic/rollbackOptimistic)
→ Save-All: optimistic patch → parallel server confirms → rollback on failure   [GOOD: optimistic, event-driven]
   BUT legacy paths: AdminEntityDrawerLegacy fires router.refresh() ×30 (mark_completed, archive, contact/schedule create, ...)  ← FULL REMOUNT
   non-drawer saves: UsersRoles, dept update, ProfileMenu, WorkspaceRootActionsRail, JobDrawerV2 → router.refresh()
```

### 2.8 Browser back/forward, hard refresh, cache restore
```
soft back/forward → same as 2.3/2.5 (depends on module/session cache warmth; not BFCache-state driven)
hard refresh → module cache lost → cold path (2.1 / 2.4); session cache (sessionStorage) survives same-tab
cache restore order on /workspace: module cachedCards → session lifecycleCards → session root (departments) → network
```

---

## 3. Runtime ownership map (every visible region, every role)

Roles: **Render** (paints it), **Fetch** (loads its data), **Cache** (stores it), **Update** (patches it post-reveal), **Destroy** (tears it down). C=canonical, L=legacy, T=temporary.

| Region | Render owner | Fetch owner | Cache owner | Update owner | Destroy owner | Competing? |
|---|---|---|---|---|---|---|
| Top chrome (sidebar/topnav/breadcrumb) | `AdminV2Shell` (C) | Sidebar nav VM + badge hooks | sessionStorage badge caches | reactive count hooks | route unmount | SystemCanvas branch (unreachable for /workspace) |
| Workspace surface | `WorkspaceRootShell` (C) | `page.tsx` client effects | `adminV2WorkspaceSessionCache` + module `cachedCards` | client effects (growth/OIP) | route unmount | — |
| Workspace tiles | `WorkspaceRootLifecycleGrid` (C) | `loadOperatorLifecycleLandingClient` | module cache + session `lifecycleCards` | rollup merge (stable order) | route unmount | dept grid (passed, unused) |
| Workspace KPI band | `WorkspaceCommandHeader`/`MetricPlacementRenderer` (C) | placements + growth rollup + OIP | `metricRenderBundleCache` + OIP warm cache | value patch (snapshot slot) | route unmount | OIP inline strip (flag-off) |
| Work-unit shell | `WorkUnitSlugRouteHost` → compat page (C+T) | slug resolve + bootstrap | `workUnitSlugRouteCache` + `CachedWorkUnitPage` | reveal coordinator | route unmount | compat page is the body |
| Work-unit context/banner | `WorkUnitSlugRouteProvider` (C) | slug resolve | slug route cache | — | route unmount | — |
| Work-unit KPI | snapshot `buildDefaultWorkUnitKpis` → OIP (C) | OIP warm | OIP warm cache | value patch | route unmount | — |
| Queue frame | `QueueBlock` (C) | bootstrap summaries | session cache | reveal | route unmount | — |
| Queue rows | `CompressedQueueRow` (C) | queue rows fetch | `queueRowClientCache` (LRU48/TTL) | row apply guards | route unmount | `LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview` (crm-less only) |
| Focus Panel frame | `EntityDrawerOperatingShell`≡`FocusPanelShell` (C) | bootstrap + drawer_primary | drawer VM warm caches | seed→VM swap | drawer close | legacy `Drawer` title block (flag-off) |
| Focus Panel body | `OpportunityDrawerVmRuntime`/`PersonsDrawerVmRuntime` (C) | composed payload | VM cache | card hydrate | drawer close | `AdminEntityDrawerLegacy` (kill-switch / legacy entities) |

---

## 4. Runtime fetch map (primary-route inventory)

Distinct `/api/admin/*` endpoints in the workspace tree: **10** (measured). Key ones:

| Endpoint | Originates | Owner | Payload | Server-side-able? | Mergeable? | Should exist? |
|---|---|---|---|---|---|---|
| `/api/admin/departments` | workspace page client effect (also 6 other sites) | scattered | dept rows | **Yes** (move to layout server bundle) | with work-units | yes, but server-seed |
| `/api/admin/work-units` | workspace + work-unit + drawer + settings | scattered (6 sites) | work-unit rows | Yes | with departments | yes, dedupe |
| `/api/admin/lifecycle-catalog` | lifecycle landing client loader | `loadOperatorLifecycleLandingClient` | catalog entries | **Yes** (server-build tiles) | with the 3-fetch tile build | yes, server-seed |
| `/api/admin/workspace-kpi-placements` | workspace page | page | KPI placements | Yes (or prewarm) | with rollup | yes, gate on hasPlacements |
| `/api/admin/work-units/by-slug/:slug` | `WorkUnitSlugRouteHost` client useEffect | host | slug→metadata | **Yes** (resolve in `[slug]/layout.tsx`) | — | yes, but server-side |
| `/api/admin/work-units/:id/queues` | compat page | page | summaries | partially | with rows | yes |
| `/api/admin/queues/:wu/:queue` | compat page | page | queue rows | no (interactive) | — | yes |
| `/api/admin/layout-runtime/opportunity-queue-layout` | `useOpportunityQueueLayoutRuntime` | hook | layout doc | — | — | **only for crm-less rows** (Sprint 01 gated) |
| `/api/admin/metrics/resolve` | OIP | OIP warm | resolved metrics | yes (prewarm) | — | yes, deferred |
| `/api/admin/actions[/execute]` | command surface | platform | action envelope | — | — | yes |

**Cross-cutting fetch facts:** `dedupeAdminFetch`/`dedupeAdminFetchWithTtl` exist but adoption is **uneven** — `AdminEntityDrawerLegacy` (172 `fetch(` sites) and `AgentConfigLabClient` issue raw `fetch`; layout-runtime endpoints have no shared cache. `/api/admin/departments` is fetched from **7** sites, `/work-units` from **6**.

---

## 5. Runtime cache map (60 cache modules total)

| Cache | Kind | Owns | Invalidated by | Restores | Survives nav? | Duplicates? |
|---|---|---|---|---|---|---|
| `adminV2WorkspaceSessionCache` (root/dept/work-unit) | sessionStorage | workspace/dept/wu snapshots | `alloy:workspace-departments-changed`, dept-change | useLayoutEffect | yes (same tab) | overlaps module `cachedCards` |
| module `cachedCards` (lifecycle) | module memory | lifecycle landing cards | `invalidateOperatorLifecycleLandingCache` | `peek...()` synchronous | yes (SPA session) | overlaps session `lifecycleCards` |
| `queueRowClientCache` | memory (LRU48 + TTL ~20m) | queue rows per lane | TTL / pill switch | lane switch | yes | — |
| `metricRenderBundleCache` | memory | KPI placement render items | analytics-v2-snapshots-updated | mount seed | yes | — |
| OIP warm cache (`oipWorkspaceWarmCache`) | memory (90s TTL, SWR) | resolved OIP metrics | TTL | subscribe | yes | partial w/ metricRenderBundleCache |
| `workUnitSlugRouteCache` | memory | slug→metadata | — | peek | yes | — |
| `workUnitBootstrapClientSession` | memory | operational bootstrap | — | ownership key | yes | summaries fetched again by page |
| badge caches (inbox/tasks nav) | sessionStorage + memory TTL | nav counts | reactive hooks | hooks | yes | — |
| dedupe TTL cache (`workspaceAdminFetchDedupe`) | memory (50-entry TTL) | in-flight GET coalescing | TTL | — | per session | — |

**Overlaps flagged:** lifecycle cards live in **two** caches (module + session) with independent reads; KPI rows in dept session cache + page state; OIP warm vs metricRenderBundle partially overlap; dept/work-unit summaries fetched by **both** dept and work-unit pages with no shared key.

---

## 6. Runtime reveal map

| Surface | Reveal decision | Blocks reveal | Paints before reveal | Paints after (value patch) |
|---|---|---|---|---|
| `/workspace` | `workspaceSurfaceVm.reveal.canCommit` = `workspaceRevealGate.above_fold_ready` | `shell_ready` (cold: lifecycle cards OR departments resolved) | cold: `WorkspacePageLoadingGate`; warm: nothing | KPI counts→growth→OIP; resume/health/pulse/rail |
| work-unit | `resolveWorkUnitPageContentReady` (shell + critical bundle + coordinated + operational surface) | slug metadata (client), queue rows, operational-surface coherence | cold: `WorkUnitWorkspaceColdShell` | OIP KPI, right-rail workflow KPIs, Focus Panel cards |
| Focus Panel | seed-first (synchronous subject) then VM payload | subject selected (seed makes it instant) | seed header | VM cards |
| Commands/actions rail | deferred (not in first-paint bundle) | — | — | loads after above-fold |
| Settings (later scope) | `ConfigurationPatternPlaceholder` + per-hub legacy client self-skeleton | each legacy client | own skeletons | — |
| Analytics (later scope) | OIP renderers | per-renderer | — | — |

**Reveal anomalies:** workspace cold reveal can wait on a **client** departments fetch (`shell_ready`); work-unit cold reveal waits on a **client** slug-resolve waterfall; operational-surface coherence can stall the whole work-unit surface on a slow subject (`NEEDS_RUM` to quantify).

---

## 7. How to extend this topology (for future modules)

Every future operational module (Billing, Attendance, Scheduling, Processing, Parent Portal, Staff) inherits L0–L3 chrome + L5 Surface VM + L7 caches. A new module is topology-conformant when: it composes **one** Surface VM over the shared loader/cache (no new shell), reveals once via `reveal.canCommit`, declares each region's 5 ownership roles (§3), reuses the dedupe/prefetch/save primitives (§4–5, no new ones), and adds no client-side first-paint fetch that could be server-seeded.
