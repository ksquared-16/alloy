# AdminV2 Performance Rebuild Sprint — Phase 0 Audit

**Date:** 2026-05-16  
**Status:** Build Pass 1 complete (see summary below)  
**Primary surfaces:** `/adminV2/workspace`, dept, work-unit, `AdminEntityDrawer`

Regression context: a prior optimization pass broke basic navigation; navigation was restored with deliberate contracts (hard shell nav, drawer z-index, local queue tabs). This document records **current** behavior before any new perf work.

**Enforced contracts (tests):** `web/tests/admin/adminV2NavigationContracts.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts`, `web/tests/admin/adminV2WorkUnitLaneLocalState.test.ts`

---

## AdminV2 Performance Rebuild Audit

### Current navigation contracts

Navigation is **not uniform** across surfaces. Treat each row as a contract; changing one pattern without the others is a common regression source.

#### Shell navigation (sidebar, overview tabs, workspace/settings breadcrumbs)

| Surface | File | Mechanism | preventDefault | stopPropagation | replaceState | URL / drawer sync | Overlay risk |
|--------|------|-----------|----------------|-----------------|--------------|-------------------|--------------|
| Sidebar — Workspace, dept, work unit, Automations, Settings | `web/app/adminV2/components/Sidebar.tsx` | `AdminV2NavLink` → `<a href>` + click | Yes (primary click) | No | No | Closes drawer via `adminV2BeforeRouteNavigation` | No — sidebar `z-[100]` |
| Top nav — Overview | `web/app/adminV2/components/TopNavBar.tsx` | `AdminV2NavLink` | Yes | No | No | No | No — header in shell chrome |
| Top nav — Queue tab (on work-unit route) | `TopNavBar.tsx` | `<span>` no-op, `aria-current="page"` | N/A | N/A | No | No navigation when already on queue route | No |
| Top nav — Queue tab (elsewhere) | `TopNavBar.tsx` | `AdminV2NavLink` → `/adminV2/workspace` | Yes | No | No | No | No |
| Top nav — Sign out | `TopNavBar.tsx` | `router.push("/login")` + `router.refresh()` | No | No | No | No | No |
| Workspace breadcrumbs (dept / work-unit) | `web/components/admin/workspace/WorkspaceChrome.tsx` | `AdminV2NavLink` for non-terminal crumbs | Yes | No | No | No | No |
| Settings breadcrumbs | `web/app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx` | `AdminV2NavLink` for parent crumbs | Yes | No | No | No | Settings layout has no drawer provider |
| Hard navigation helper | `web/lib/adminV2/shellNavigation.ts` | `window.location.assign` | No (not on an event) | No | No | `closeDrawer` optional | Full page load — reliable |
| Nav link implementation | `web/app/adminV2/components/navigation/AdminV2NavLink.tsx` | Native `<a href>`, **not** `next/link` | Yes on primary click | No | No | Calls `adminV2CommitNavigation` | Modifier keys open in new tab (no preventDefault) |

**Shell contract summary:** Primary in-app route changes for workspace hierarchy use **full document navigation** (`location.assign`), not `router.push`, to avoid App Router soft transitions cancelled by heavy RSC work. Drawer closes before navigate when `AdminDrawerProvider` is present.

#### Workspace root — department cards

| Surface | File | Mechanism | preventDefault | stopPropagation | replaceState | URL sync | Overlay risk |
|--------|------|-----------|----------------|-----------------|--------------|----------|--------------|
| Department tiles | `web/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx` | Next.js `<Link href>` | No (soft nav) | No | No | Path only | No |
| Orientation rail (Forms, classic admin, work units) | `web/components/admin/workspace/WorkspaceRootShell.tsx` | `<Link prefetch={false}>` | No | No | No | Path only | No |

**Contract:** Workspace **root → dept** uses **soft** `<Link>` navigation with `prefetch={false}` (`shouldDisableAdminV2LinkPrefetch`) and `onClick={markWorkUnitNavigationStart}` for perf timing only — **does not** call `adminV2CommitNavigation`.

#### Department page — throughput / needs-attention cards

| Surface | File | Mechanism | preventDefault | stopPropagation | replaceState | URL sync | Overlay risk |
|--------|------|-----------|----------------|-----------------|--------------|----------|--------------|
| Work unit cards, pipeline lane cards, attention bucket cards | `DeptOperConsoleQueueRow` in `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` | `<a href>` + click | Yes | No | No | `?queue=` / `?attention_bucket=` on drill-in href | `z-[1]`, `pointer-events-auto` on card |
| Dept header / right-rail actions | `ActionsBlock` in `web/app/adminV2/components/workspace/blocks/ActionsBlock.tsx` | `<button onClick>` → `onAction` | No | No | No | Handler-dependent | No |
| Registry / enrollment actions | dept `page.tsx` | `applyRegistryResolvedActionClient` | Varies | No | No | May `router.push` for some intents | No |

**Contract:** Dept drill-in to work-unit uses **hard** nav (`adminV2CommitNavigation`) with drawer close — same as sidebar.

#### Work-unit page — queue lanes and header actions

| Surface | File | Mechanism | preventDefault | stopPropagation | replaceState | URL sync | Overlay risk |
|--------|------|-----------|----------------|-----------------|--------------|----------|--------------|
| Queue tab chips / lane selector | `work-unit/[workUnitId]/page.tsx` — `handleQueueTabChange` | Local React state (`selectedQueueKey`, `laneUnmappedOnly`) | No | No | **No** — `scheduleWorkUnitLaneUrlSync` **not** called from page | Initial read once: `readWorkUnitInitialLocationParams()` | No |
| Attention bucket filter | `handleAttentionBucketSelect` | Local state + `fetchQueueItems` | No | No | No | No post-mount URL sync | No |
| Queue row (card / keyboard) | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | `role="button"` + `onClick` / `onKeyDown` | Yes on Space/Enter only | Quick-action buttons use **stopPropagation** | No | Dispatches `open_record` | `adminv2-ws-wu-queue-card-interactive` — stays clickable during refresh |
| Queue row → drawer | `work-unit/page.tsx` — `openWorkUnitQueueRecord` | `openDrawer({ type: "opportunities" \| "jobs" \| "schedules" })` | No | No | No | `opportunityWorkspaceContext` when from WU | Drawer panel `pointer-events-auto`; backdrop **none** |
| Right-rail / back actions | `onAction` — `actions.block` | `window.location.href` for back, needs-attention, settings | No | No | No | Hard URL jumps | No |
| Registry navigate result | `onAction` | `router.push(er.href)` (logged, not hard commit) | No | No | No | Soft nav — exception path | No |

**Contract:** Queue **tabs are local state only** after mount (tests forbid `useSearchParams`, `popstate`, `scheduleWorkUnitLaneUrlSync` on work-unit page). Deep links work via **initial** `?queue=` read on load only. Browser back/forward across work-unit **routes** works; back/forward for tab changes within the same work-unit URL is **not** synced to UI after mount.

#### Legacy dept queue sub-routes (jobs / schedules)

| Surface | File | Mechanism | Notes |
|--------|------|-----------|-------|
| `/dept/:id/unassigned`, `scheduled-today`, `needs-attention` | `DepartmentQueueRouteShell` → `DepartmentJobsQueuePage` | Breadcrumbs: `AdminV2NavLink`; rows: `openDrawer`; some actions: `router.push` | Uses `useSearchParams` for needs-attention exception filter only |

#### Settings navigation

| Surface | File | Mechanism | preventDefault | Notes |
|--------|------|-----------|----------------|-------|
| Settings hub cards | `web/app/adminV2/settings/page.tsx` | Next `<Link prefetch={false}>` | No | **Soft** App Router nav — differs from sidebar `AdminV2NavLink` |
| Settings child pages (some) | e.g. `layouts/page.tsx`, `KpiPlacementsSettingsClient.tsx` | Native `<Link>` | No | Same soft-nav family |
| Settings breadcrumb parents | `SettingsHierarchyBreadcrumb.tsx` | `AdminV2NavLink` | Yes | Hard nav for “Settings” parent |

**Risk:** Settings **sidebar** uses hard nav; settings **hub tiles** use soft `<Link>`. Both must keep working; do not “fix” one by breaking the other.

#### Drawer open / close / tabs

| Surface | File | Mechanism | preventDefault | stopPropagation | replaceState | Sync |
|--------|------|-----------|----------------|-----------------|--------------|------|
| Open from queue | `AdminDrawerContext.openDrawer` | React state | No | No | No | Stack push when switching entities |
| Close on route change | `AdminDrawerContext.tsx` | `useEffect` on `pathname` | No | No | No | Skips initial mount; **ignores** shallow `replaceState` (pathname unchanged) |
| Close button / Escape | `web/components/admin/Drawer.tsx` | `onClose` | No | No | No | No |
| Backdrop (sidebar + modal) | `Drawer.tsx` | `pointer-events-none` on dim layer | N/A | N/A | No | **Does not** intercept workspace clicks — by design |
| Drawer tabs (overview, communications, notes, …) | `AdminEntityDrawer.tsx` | `<button onClick={() => setDrawerTab(tab)}>` | No | No | No | **Local state only** — not in URL |
| Focus communications (header intent) | `AdminEntityDrawer.tsx` | `setDrawerTab("communications")` on custom event | No | No | No | Event: `adminv2:opportunity-focus-comms` |
| Drawer z-index | `Drawer.tsx` | Backdrop z=60, panel z=70; shell chrome z=100 | | | | Sidebar/settings remain clickable with drawer open |

#### Prefetch policy

| File | Behavior |
|------|----------|
| `web/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch.ts` | `prefetch={false}` for workspace, settings, workflows, forms, legacy admin paths |
| `AdminV2NavLink` | Does not use Next prefetch (plain `<a>`) |

---

### Current loading bottlenecks

Instrumentation already exists (`web/lib/perf/adminV2PerfLog.ts`, `alloyPerfSet`, `__WS_PERF_DEBUG__`). Tags: `[perf.workspace.load]`, `[perf.dept.load]`, `[perf.queue.rows]`, `[perf.drawer.full_hydrate]`, `[timing][opportunity-api-visible]`.

#### `/adminV2/workspace` (`web/app/adminV2/workspace/page.tsx`)

| Phase | What loads | Notes |
|-------|------------|-------|
| SSR layout | Auth, org name, viewer TZ, access scope fingerprint | `workspace/layout.tsx` — server round-trips before client |
| `shell_seed` | `readWorkspaceRootCache` (sessionStorage) | Skips skeleton if hit |
| `critical_deps` | Parallel: `GET /api/admin/departments`, `GET /api/admin/work-units` | Deduped via `dedupeAdminFetch` |
| First paint | `buildWorkspaceQuickRollup` — tile counts without per-dept growth APIs | KPI strip may show skeleton |
| `rollup_refined` (background) | Per growth-slice dept: `opportunity-lifecycle-kpis` + `pipeline-exact-count` | N× dept fan-out for growth departments |
| KPI placements | `dedupeAdminFetchWithTtl` placement resolver | After rollup; avoids number swap via `workspaceKpiPlacementPending` |

**Bottlenecks:** Growth department rollup fan-out; KPI placement fetch after rollup; duplicate department/work-unit lists if sidebar also expanded (sidebar fetches same APIs independently).

#### `/adminV2/workspace/dept/:departmentId` (`dept/[departmentId]/page.tsx`)

| Phase | What loads | Notes |
|-------|------------|-------|
| `shell_seed` | `readDepartmentPageCache` — dept + work units, **not** numeric summaries | Summaries always refetched (scope-safe) |
| Critical path | Parallel: dept + work-units; then `work-unit-queue-summaries` | Site filter appended to summary URL |
| Deferred | `requestIdleCallback` workflow KPI panels | Off critical path |
| Parallel (enrollment) | Attention buckets, pipeline exec surface, per-WU summary refresh, KPI placements, right-rail resolved actions | Multiple competing requests after shell |
| Per-WU pipeline | Can fetch each work-unit JSON for pipeline lane extraction | Extra calls when pipeline surface enabled |

**Bottlenecks:** Summary + attention + pipeline + placements + actions overlap; session cache intentionally skips summary hydration (always shows loading for counts on revisit).

#### `/adminV2/workspace/dept/:id/work-unit/:workUnitId` (`work-unit/[workUnitId]/page.tsx`)

| Phase | What loads | Notes |
|-------|------------|-------|
| `shell_seed` | `readWorkUnitPageCache` — dept + work unit metadata | Queue rows not cached in session snapshot |
| Bootstrap | Parallel: work-unit, department, queue list route | Sets `selectedQueueKey` from **initial** URL only |
| Primary lane | `fetchQueueItems` per selected queue | Client row cache + lease dedupe; timeout path `wuPrimaryLaneTimedOut` |
| Deferred (idle) | Workflow KPIs, queue row actions, right-rail actions, adjacent lane prefetch | Gated on first row settle |
| Tab change | Refetch queue rows (skippable via sig/lease) | `pendingQueueTabPerfRef` for timing |
| Drawer open | Entity GET surfaces (`drawer_initial`, `full`, comms prefetch) | Separate from queue row API |

**Bottlenecks:** Large client page (~3k LOC); queue row fetch on every tab change; drawer full hydrate after `drawer_initial`; bootstrap + summaries + rows sequential pressure on first land.

#### `AdminEntityDrawer` (`web/components/admin/AdminEntityDrawer.tsx`)

| Phase | What loads | Notes |
|-------|------------|-------|
| Open | Resolver / `drawer_initial` surface | Opportunity: workspace context primes header actions |
| Tab switch | Lazy loads per tab (`drawerTab` effects) | Related, documents, activity, etc. fetch on first visit |
| Communications / notes | `CommunicationsDrawerSection`; tab keys `communications`, `notes` | Prefetch helpers in `communicationsDrawerPrefetch` |

**Bottlenecks:** Very large component; tab-scoped fetches; full hydrate vs visible shell timing.

#### Cross-cutting

- **Sidebar tree:** When expanded, fetches `/api/admin/departments` and `/api/admin/work-units` again (deduped, but still work on expand).
- **Site filter:** Appends query params to workspace APIs; may invalidate client cache keys (`workspaceViewCacheFingerprint`).
- **Soft vs hard nav:** Workspace root uses soft `<Link>`; shell uses hard assign — different RSC cancellation profiles.

---

### Safe optimization candidates

Ordered low-risk first. Each must preserve the navigation contracts above.

1. **Extend `dedupeAdminFetch` / TTL dedupe** — Sidebar, workspace root, and dept page already share dedupe keys for departments/work-units; ensure new fetches use the same helpers and cache keys (including site scope fingerprint).

2. **Parallelize independent dept-page fetches** — After dept+WU resolve, batch attention buckets + summaries + placement config where responses do not depend on each other; keep summaries authoritative over session cache.

3. **Work-unit adjacent-lane prefetch** — Already gated (`queueAdjacentPrefetchTokenRef`, `primaryLaneRowsSettledOnceRef`); tune idle timing/cancel tokens only, do not re-enable URL sync on tab change.

4. **Stable skeletons** — Dept paired-panel skeleton (`DeptPairedOperQueuesSkeleton`), `AdminV2RouteLoadingState`, `KpiStripSkeleton` already exist; extend consistently before data arrives (avoid layout swap).

5. **Session cache seeding** — Continue pattern: shell geometry from cache, numbers from network; consider caching **non-scope-sensitive** queue summary shape for work-unit (not row payloads) if tests allow.

6. **Drawer staged hydrate** — Prefer existing `drawer_initial` → visible → `full` pipeline; prefetch communications on intent (`invalidateCommunicationsDrawerPrefetch`) without blocking open.

7. **Instrument before/after** — Use existing `emitAdminV2Perf` / `__WS_PERF_DEBUG__`; gate temporary logs behind flags; do not leave render-loop loggers.

8. **Growth rollup throttling** — Workspace root: cap concurrent growth dept KPI calls or batch server-side (product-dependent).

9. **Settings hub alignment (optional, careful)** — If soft `<Link>` causes cancelled transitions, migrate **settings cards** to `AdminV2NavLink` one group at a time with regression checks — do not change workspace root dept tiles without explicit decision (soft nav is intentional there today).

---

### Risky code to avoid / rewrite

Do **not** reintroduce blindly:

| Risk | Why it broke or threatens navigation | Current safe pattern |
|------|--------------------------------------|----------------------|
| `router.push` / soft `<Link>` for shell workspace hierarchy | Cancelled transitions under heavy RSC | `adminV2CommitNavigation` / `AdminV2NavLink` |
| `useSearchParams()` on work-unit page for queue tabs | RSC churn, tab fights URL | Local `selectedQueueKey`; one-shot `readWorkUnitInitialLocationParams` |
| `scheduleWorkUnitLaneUrlSync` / `popstate` listeners on work-unit page | Shallow URL fights drawer close effect; back button confusion | Removed from page (helpers remain in `workUnitLaneQueryUrl.ts` for tests only) |
| `useLinkStatus` / pending link UI on heavy routes | False “stuck” states | Not used in AdminV2 |
| Viewport `prefetch={true}` on workspace/settings links | Background RSC competes with active nav | `adminV2HeavyRoutePrefetch` + `prefetch={false}` |
| Drawer backdrop `pointer-events: auto` full-screen | Blocked sidebar/settings clicks | Backdrop `pointer-events-none`; panel only receives events |
| Overlay z-index below shell chrome | Clicks hit dim layer | Shell `z-[100]`, drawer backdrop 60 / panel 70 |
| Queue row `pointer-events: none` during refresh | Rows felt dead | `adminv2-ws-wu-queue-card-interactive` in CSS |
| Reordering `open_record` after registry execute | Drawer never opened | Test: `open_record` branch before `action_registry` |
| `preventDefault` on `adminV2BeforeRouteNavigation` | Breaks modifier-key behavior | Never add preventDefault there |
| Uniform hard-nav everywhere without analysis | Breaks native middle-click, back stack expectations on `<Link>` tiles | Keep explicit matrix: shell=hard, root tiles=soft, dept cards=hard |
| Caching scope-sensitive queue totals in sessionStorage | Stale org-wide counts when site filter narrows | Dept cache clears summaries on hydrate |

**Files to treat as contract sources (read before editing):**

- `web/lib/adminV2/shellNavigation.ts`
- `web/app/adminV2/components/navigation/AdminV2NavLink.tsx`
- `web/contexts/AdminDrawerContext.tsx`
- `web/components/admin/Drawer.tsx`
- `web/lib/adminV2/workUnitInitialLocation.ts`
- `web/tests/admin/adminV2NavigationContracts.test.ts`

---

## Phase 0 exit criteria

- [x] Navigation/click surfaces documented with mechanism and URL/drawer behavior
- [x] Loading phases and bottlenecks identified per primary route
- [x] Safe candidates and risky patterns listed
- [ ] Baseline timings captured in staging (manual — use `[perf.*]` console tags or `__WS_PERF_DEBUG__`)

**Next phase:** Staging baseline timings; optional Build Pass 2 (server-side rollup consolidation, drawer header action batching API).

---

## Build Pass 1 Summary

### Files changed

- `web/lib/workspace/mapWithConcurrency.ts` (new)
- `web/lib/workspace/resolveDeptPipelineExecSurface.ts` (new)
- `web/lib/admin/opportunityDrawerQueuePreviewSeed.ts` (new)
- `web/contexts/AdminDrawerContext.tsx`
- `web/app/adminV2/workspace/page.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/page.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
- `web/components/admin/AdminEntityDrawer.tsx`
- `web/tests/workspace/mapWithConcurrency.test.ts` (new)
- `web/tests/admin/opportunityDrawerQueuePreviewSeed.test.ts` (new)

### Performance improvements implemented

| Surface | Changes |
|---------|---------|
| **Workspace** | Growth-dept rollup uses `dedupeAdminFetch` + bounded concurrency (3); KPI placement fetch runs **in parallel** with rollup (not after). |
| **Dept** | Queue summaries + Needs Attention preview load **in parallel** after shell; pipeline lane discovery **parallel** via `resolveDeptPipelineExecSurface` (replaces sequential WU probe loop). |
| **Work-unit** | Bootstrap loads work unit + department **in parallel**; critical GETs use `dedupeAdminFetch` (WU, dept, summaries, queue rows, summaries refresh). |
| **Drawer** | Entity `drawer_visible` / `full` hydrates use `dedupeAdminFetch`; queue row preview **seeds** drawer title/subtitle while entity GET is in flight. |
| **Shared** | `mapWithConcurrency` utility; opportunity queue preview seed types on drawer context. |

### Navigation contracts preserved

- No changes to `AdminV2NavLink`, `adminV2CommitNavigation`, work-unit tab URL sync, drawer backdrop `pointer-events`, or `open_record` ordering.
- Department tiles remain Next `<Link>` soft nav.
- `scheduleWorkUnitLaneUrlSync` still not used on work-unit page.
- Session dept cache still **does not hydrate** numeric summaries on revisit.

### Deferred risky optimizations

- Converting settings hub `<Link>` cards to hard `AdminV2NavLink` (soft nav retained).
- Server-side combined workspace growth rollup endpoint (still N dept calls, now concurrent + deduped).
- URL sync for work-unit queue tabs after mount.
- Caching queue row payloads in sessionStorage (client row LRU unchanged).

### Tests run

- `cd web && npx tsc --noEmit`
- `cd web && npx vitest run tests/admin/adminV2NavigationContracts.test.ts tests/admin/adminV2QueueRowClick.test.ts tests/admin/adminV2WorkUnitLaneLocalState.test.ts tests/workspace/mapWithConcurrency.test.ts tests/admin/opportunityDrawerQueuePreviewSeed.test.ts`

### Manual QA checklist for human

- [ ] Sidebar → workspace → dept → work unit: each hop navigates once; browser back works.
- [ ] Dept throughput + Needs Attention cards open correct work-unit + initial queue (deep link `?queue=` on first land only).
- [ ] Work-unit queue tab switches: prior rows stay visible during refresh; no URL churn in address bar after tab clicks.
- [ ] Queue row opens opportunity drawer with **stable title** (not generic “Loading…” flash) when preview data exists.
- [ ] Drawer open: sidebar/settings links still clickable; close drawer; navigate away — page clicks work.
- [ ] Communications / Notes tabs lazy-load without breaking overview.
- [ ] Site filter change: dept summary counts refresh (no stale session numbers on first paint).

---

## Drawer + Loading Coherence Fix Pass

### Issues addressed

| Issue | Fix |
|-------|-----|
| Drawer backdrop blocked command bar / shell | Dim layer stays `pointer-events-none`; outside **mousedown** on `Drawer` (adminV2 only) closes drawer while ignoring drawer panel + AI command bar/surface |
| Dept paired skeleton row mismatch (4 vs 3) | Shared `DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT = 5` for both throughput and Needs Attention panels |
| Work-unit KPI / queue picker visual noise | Grouped `KpiStripSkeleton` until placements **and** queue summaries settle; queue tab count badges use pulse bars instead of per-pill spinners |
| Fragmented opportunity drawer header load | Workflow subtitle, timeline, title-rail actions, and secondary header actions stay in skeleton until `opportunityDrawerShellSettled` (tab strip gate skeleton unchanged) |

### Files changed

- `web/lib/adminV2/drawerOutsideClick.ts` (new)
- `web/components/admin/Drawer.tsx`
- `web/components/admin/AdminEntityDrawer.tsx`
- `web/components/admin/workspace/DepartmentPairedOperQueuesSkeleton.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
- `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` (new)
- `docs/sprints/archive/05_2026/adminv2_performance_rebuild_audit.md`

### Navigation contracts preserved

- No change to hard/soft nav matrix, work-unit tab local state, URL sync, or `AdminV2NavLink` implementation.
- Drawer backdrop z-index and shell chrome `z-[100]` unchanged.
- No full-screen clickable overlay; outside dismiss is document mousedown only with explicit ignore selectors.

### Remaining deferred polish

- Communications/Notes section still lazy-load with local loading UI inside the hydrated drawer body.
- Command-surface thread panel has its own loading states (not part of record drawer gate). Thread restore from `sessionStorage` is client-only after mount — see **`agent_interaction_layer_v1.md`** (SSR / hydration contract).
- Server-side combined workspace rollup endpoint (unchanged from Pass 1).

### Tests run

- `cd web && npx tsc --noEmit`
- `cd web && npx vitest run tests/admin/adminV2NavigationContracts.test.ts tests/admin/adminV2QueueRowClick.test.ts tests/admin/adminV2WorkUnitLaneLocalState.test.ts tests/admin/opportunityDrawerQueuePreviewSeed.test.ts tests/admin/workUnitQueueCompactRowSkeleton.test.ts tests/admin/adminV2DrawerLoadingCoherence.test.ts`
