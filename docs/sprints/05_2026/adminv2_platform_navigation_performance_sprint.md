# AdminV2 Platform Navigation + Performance Sprint

**Date:** 2026-05-22  
**Status:** Card 3A complete — **work-unit shell-first loading**  
**Scope:** `/adminV2/workspace`, `/adminV2/workspace/dept/[departmentId]`, `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]` — navigation transitions and page runtime only  
**Out of scope:** Drawer open/hydrate sprint ([`adminv2_drawer_performance_hardening_phase0.md`](./adminv2_drawer_performance_hardening_phase0.md)) except shared loading primitives that do not change drawer lifecycle  

**Related (read-first):**

| Doc | Role |
|-----|------|
| [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md) | Hard / soft / local nav matrix — **binding** |
| [`adminv2_performance_phase2_load_path_architecture.md`](./adminv2_performance_phase2_load_path_architecture.md) | Load-path map, blocking vs deferred |
| [`adminv2_dept_runtime_closeout_handoff.md`](./adminv2_dept_runtime_closeout_handoff.md) | Locked `/dept` runtime reference |
| [`adminv2_work_unit_runtime_cards_1_3_plan.md`](./adminv2_work_unit_runtime_cards_1_3_plan.md) | WU bootstrap parity plan |
| [`adminv2_performance_scope_lock.md`](./adminv2_performance_scope_lock.md) | Premium UX north star |
| [`docs/system/workspace-system.md`](../system/workspace-system.md) | Queue truth boundary |

**Contract tests (must stay green):** `adminV2NavigationContracts`, `adminV2QueueRowClick`, `adminV2WorkUnitLaneLocalState`, `adminV2DrawerLoadingCoherence`, `adminV2LoadingGeometry`, `workUnitOperationalBootstrap`

---

## 1. Executive summary

AdminV2 workspace hierarchy has **strong server patterns** on `/dept` (single `operational-bootstrap`, oper-region-only loader, shell-first) and **partial parity** on `/work-unit` (bootstrap exists; blocking gates and route `loading.tsx` still cause framed skeleton churn). The **workspace root** and **workspace → dept transition** are the weakest links: mixed navigation classes, no outgoing transition affordance on the source page, and a **full-page cold shell** on first load.

The product goal for this sprint:

> Click → source stays stable → intentional loading message → destination data pre-resolved where practical → route commits when the destination core frame can render **without framed skeleton churn**.

Today, **route commit often precedes operational readiness**, and **region-by-region reveal** (KPI strip, oper panels, queue lane, automations) still reads as multiple load phases. Closing the gap is primarily **orchestration + a unified transition contract**, not new APIs or architecture.

---

## 2. Audit findings

### 2.1 How does each page currently load?

#### Shared: `workspace/layout.tsx` (every hard nav + first soft nav)

| Step | Owner | Blocking? |
|------|--------|-----------|
| `getAdminAuth()` | RSC | Yes |
| Parallel bundle: org name, viewer TZ, operational TZ, `getAdminAccessContextCached`, entity labels map | RSC | Yes (improved vs Phase 2 doc — now `Promise.all`) |
| `AdminV2WorkspaceClientProviders` + `AdminV2Shell` (sidebar, TopNav `Suspense`, site filter, drawer mount) | Client | Hydration before page `useEffect` |

**Note:** Page bodies are **100% client components**; RSC delivers auth/context only.

#### `/adminV2/workspace` (`workspace/page.tsx`)

| Phase | Mechanism | API / source |
|-------|-----------|--------------|
| Cache hydrate | `useLayoutEffect` → `readWorkspaceRootCache` | sessionStorage |
| Critical path | `useEffect` parallel | `GET /api/admin/departments`, `GET /api/admin/work-units` |
| First paint | `buildWorkspaceQuickRollup` (WU counts + rollup lines) | client |
| Background | `loadWorkspaceRollup` per growth dept (concurrency 3) | `opportunity-lifecycle-kpis` + `pipeline-exact-count` × N |
| Background | KPI placements | `GET /api/admin/workspace-kpi-placements?surface=workspace` |
| Gate | `loading === true` → entire page = `WorkspaceRootColdShell` | full replace |

**No** `workspace/loading.tsx` (intentionally removed per dept closeout — avoids root flash on revisit).

#### `/adminV2/workspace/dept/[departmentId]` (`dept/.../page.tsx` + `loading.tsx`)

| Phase | Mechanism | API / source |
|-------|-----------|--------------|
| Route transition | Next `loading.tsx` → `DepartmentWorkspaceColdShell` | immediate on soft nav |
| Cache hydrate | `useLayoutEffect` → `readDepartmentPageCache` (dept + WU list only; **not** summaries) | sessionStorage |
| Happy path | Single bootstrap | `GET .../departments/{id}/operational-bootstrap` |
| Bootstrap bundles | dept, work_units, summaries, attention, pipeline_surface, kpi_placements, right_rail_actions | one `loadAdminRouteGate` |
| Legacy fallback | Parallel dept + WU GET, then summaries + attention + pipeline probe fan-out | multiple routes |
| Shell gate | `deptLoading` false after bootstrap → `WorkspaceChrome` + bridge shell | |
| Oper gate | `deptOperationalRegionReady` (throughput + attention both settled) | replaces `DeptOperationalRegionLoader` |
| Deferred | Workflow panels, extra KPI fetch if bootstrap omitted placements | `scheduleAdminV2BackgroundWork` |

#### `/adminV2/workspace/dept/.../work-unit/[workUnitId]` (`work-unit/.../page.tsx` + `loading.tsx`)

| Phase | Mechanism | API / source |
|-------|-----------|--------------|
| Route transition | `loading.tsx` → breadcrumb stub + `WorkUnitRouteSkeletonBody` | immediate |
| Lane reset | `useLayoutEffect` clears queue state; may seed dept+WU from `readWorkUnitPageCache` | sessionStorage |
| Happy path | `operational-bootstrap` | `GET .../work-units/{id}/operational-bootstrap` |
| Bootstrap bundles | dept, work_unit, queue summaries, primary_lane rows, attention metadata, kpi_placements, right_rail_actions | |
| Authority gate | `wuQueueLaneAuthorityReady` before leaving blocking skeleton | |
| Blocking UI | `workUnitPageBlockingLoad` = (`loading && !shellReady`) **or** `operLanePending` | full `WorkUnitRouteSkeletonBody` |
| Post-reveal | KPI strip placeholder, automation footer after `workUnitQueueRevealReady` | deferred |
| Legacy fallback | WU + dept parallel, summaries, right rail, optional legacy opportunity-queue GET | sequential branches |

---

### 2.2 Where are skeletons being used?

| Location | Component / pattern | When shown |
|----------|---------------------|------------|
| Workspace root (cold) | `WorkspaceRootColdShell` → `departmentsPending` tile skeletons, `kpiStripPlaceholder` | `loading && !cache` |
| Workspace root (warm) | `deptTileStatsPending` inline skeleton on tile stats line | until rollup + placements |
| Workspace root KPI | `KpiStripSkeleton` / placeholder via `WorkspaceRootShell` | `workspaceKpiPlacementPending` |
| Dept route `loading.tsx` | `DepartmentWorkspaceColdShell` | Next transition (before client bootstrap) |
| Dept oper region | `DeptOperationalRegionLoader` (spinner over quiet panel reserves) | `!deptOperationalRegionReady` |
| Dept KPI | `WorkspaceQuietKpiReserve` | `!deptTopSummaryReady` |
| Dept rail | `WorkspaceActionsRailPlaceholder` | `!deptRailReady` |
| Dept throughput row totals | inline `skeleton-pulse` on count | `totalPending` on oper cards |
| WU route `loading.tsx` | `WorkUnitRouteSkeletonBody` (+ breadcrumb `…`) | Next transition |
| WU page blocking | same `WorkUnitRouteSkeletonBody` | `workUnitPageBlockingLoad` |
| WU queue lane | row skeletons / lane reserve (`adminV2LoadingGeometry`) | tab switch, initial row load |
| WU KPI | `kpiStripPlaceholder` on `WorkUnitWorkspace` | after queue reveal, placements pending |
| **Exists but unused on routes** | `AdminV2RouteLoadingState` + `WsRouteLoadingRibbon` | drawer-adjacent vocabulary only |

**Framed skeleton churn hotspots:** WU route `loading.tsx` + page blocking skeleton (double beat on hard nav); workspace → dept soft nav swaps entire main column to `DepartmentWorkspaceColdShell`; dept oper panel transitions from spinner reserve → real cards (acceptable if shell stable, but paired with route cold shell on entry).

---

### 2.3 Where do we transition before destination data is ready?

| Transition | Route commits when | Core frame ready when | Gap |
|------------|-------------------|------------------------|-----|
| Workspace → dept | **Immediately** (Next `<Link>` soft nav) | After bootstrap (~1s+); route `loading.tsx` shows cold shell first | Source page unmounts; destination shows full cold shell before bootstrap |
| Dept → work unit | **Immediately** (`adminV2CommitNavigation` hard nav) | After bootstrap + `wuQueueLaneAuthorityReady` | Full document reload + `loading.tsx` skeleton; layout server bundle reruns |
| Sidebar → dept/WU | Hard nav | Same as above | Same reload tax |
| Workspace root (first visit) | Already on route | After departments + WU list | Full `WorkspaceRootColdShell` until fetch completes |
| Dept revisit (cache) | Immediate | Shell from cache; oper region waits for bootstrap | Bridge shell visible with oper spinner — **good pattern** |
| WU revisit (cache) | Immediate | Metadata seeded; **still** blocking skeleton until lane authority | Cache does not skip `WorkUnitRouteSkeletonBody` |

**Root cause:** Next.js route `loading.tsx` and page-level `*BlockingLoad` flags key off **fetch completion**, not a unified “transition overlay on source → commit when ready” orchestrator. Soft nav cannot delay pathname change without intercepting navigation.

---

### 2.4 Where are fetches sequential that could be parallel?

| Path | Sequential chain | Parallelization opportunity |
|------|------------------|----------------------------|
| Workspace root | departments+WU parallel ✓; then **per growth dept** lifecycle + pipeline (batched concurrency 3) | Already partial; could defer all growth rollups post-first-paint (already background) |
| Dept legacy fallback | bootstrap fail → attention fetch ∥ summaries fetch, but dept+WU await summaries promise attachment oddly | Remove legacy path or gate behind feature flag |
| Dept legacy pipeline | `runDeptPipelineProbe` after shell_ready — probes multiple WUs | Folded into bootstrap `pipeline_surface` on happy path ✓ |
| WU legacy fallback | WU+dept parallel ✓; summaries; then row fetch; then optional legacy `opportunity-queue` | Happy path bootstrap already parallelizes |
| WU deferred supplement | runs after bootstrap | intentional |
| Layout (every hard nav) | Auth bundle parallel ✓ | Consider lighter layout for child-only navigations (out of scope without routing change) |
| Sidebar expanded | departments + work-units | Dedupes with page via `dedupeAdminFetch` ✓ |

**Highest ROI:** Ensure **bootstrap happy path** on WU (avoid legacy fan-out); reduce **hard nav frequency** only where Phase 1 allows (workspace → dept is the main candidate for orchestrated soft nav + prefetch).

---

### 2.5 Where are we duplicating fetches?

| Data | Consumers | Dedupe? |
|------|-----------|---------|
| `GET /api/admin/departments` | Workspace page, Sidebar (expanded), legacy dept fallback | `dedupeAdminFetch` in-flight |
| `GET /api/admin/work-units` | Workspace page, Sidebar, dept legacy | same |
| Dept operational data | bootstrap vs `work-unit-queue-summaries` vs attention-preview | bootstrap should win; legacy duplicates |
| WU queue summaries | bootstrap vs `.../queues` list route | bootstrap should win |
| KPI placements | bootstrap vs deferred `workspace-kpi-placements` | bootstrap bundles on dept/WU; workspace still separate |
| Entity labels | layout server hydrate + `EntityLabelsContext` refresh | refresh suppressed during oper nav window |
| Growth lifecycle + pipeline | Once per growth dept on workspace | N+2 calls per workspace load |

---

### 2.6 Region-by-region loading (visual churn)

| Page | Independent regions | Churn pattern |
|------|---------------------|---------------|
| Workspace | KPI strip, dept tiles (rollup opacity), tile stats lines | strip skeleton → numbers; stats quick → refined |
| Dept | KPI quiet reserve, oper paired panels, actions rail, automations KPIs | oper spinner → lanes; KPI reserve → cells; rail placeholder → actions |
| Work unit | Breadcrumbs/title, full-body skeleton, queue pills, row list, KPI strip, automations footer | route skeleton → workspace shell → KPI placeholder; lane tab switch row skeleton |

**Violates target contract:** WU still uses **full framed** `WorkUnitRouteSkeletonBody` while dept uses **oper-region-only** loader inside stable bridge shell — inconsistent premium feel.

---

### 2.7 Likely bottlenecks (click → trustworthy UI)

| Bottleneck | Est. impact | Evidence |
|------------|-------------|----------|
| Hard navigation document reload | High on dept→WU, sidebar hops | `adminV2CommitNavigation` → layout RSC + hydration |
| Next `loading.tsx` immediate swap | High on workspace→dept, any segment with loading file | Shows cold shell before client cache/bootstrap |
| Client-only data planes | Medium | No RSC payload for oper data |
| Workspace growth rollup wave | Medium on orgs with many growth depts | 2×N dept API calls |
| WU `workUnitPageBlockingLoad` includes lane authority | Medium | Extends skeleton after shell metadata known |
| Queue row fetch after bootstrap (legacy path) | Medium | Extra round trip when bootstrap partial |
| Session cache scope rules | Low–medium on revisit | Dept summaries not cached; WU cache does not skip skeleton |

---

### 2.8 Fix now vs defer

| Fix now (this sprint) | Defer |
|----------------------|-------|
| Unified transition contract across workspace → dept → WU | Server-combined workspace growth rollup endpoint |
| Workspace outgoing navigation stability (pressed state + overlay) | Replacing hard nav globally (Phase 1 P0) |
| Align WU blocking gate with dept oper-region-only pattern | RSC streaming oper payloads |
| Wire or extend `AdminV2RouteLoadingState` for **transition** messaging (not drawer) | DB indexes for attention SQL |
| Reduce WU double-skeleton (route `loading.tsx` vs page gate) | Full `router` transition without pathname change |
| Click acknowledgment on dept oper cards + workspace tiles | Middleware-level prefetch of bootstrap |
| Parallel bootstrap prefetch on intent (hover/focus) before nav | Sidebar fetch elimination |
| Document + test acceptance criteria | Drawer surface=drawer_primary work |

---

## 3. Recommended transition / loading contract

### 3.1 Navigation behavior (target)

Applies to workspace → dept → work unit drill-in (not drawer, not queue tab local state).

```txt
1. pointerdown / click → clicked control enters pressed/loading state (aria-busy on control)
2. source page remains mounted and visually stable (no blank main column)
3. global or in-column transition indicator: "Loading department…" / "Loading work unit…"
4. destination bootstrap prefetch starts immediately (same URLs as post-nav bootstrap)
5. route commits when minimum core frame data is available (see §3.3)
6. destination renders bridge shell + real chrome; only non-core regions may use quiet reserves
```

**Phase 1 alignment:** Do **not** silently revert dept→WU to soft `router.push` without contract test + QA updates. **Preferred sequencing:**

| Hop | Current | Sprint target |
|-----|---------|---------------|
| Workspace → dept | Soft `<Link>` | **Orchestrated soft nav:** intercept primary click → prefetch dept bootstrap → `router.push` when shell seed ready; fallback to today’s Link if prefetch fails timeout |
| Dept → WU | Hard `adminV2CommitNavigation` | Keep hard nav **or** prefetch bootstrap on card intent then hard nav (smaller win but safe); minimize `loading.tsx` mismatch |
| Sidebar / breadcrumbs | Hard `AdminV2NavLink` | Optional prefetch on intent; unchanged commit mechanism |

**Clicked-element feedback:** Add shared `adminV2NavigationIntent` helper (pending href, label, startedAt) consumed by grid/cards and optional shell ribbon — **Card 1**.

### 3.2 Loading UI contract

| Allowed | Forbidden |
|---------|-----------|
| Source-page overlay or top ribbon (`WsRouteLoadingRibbon`) with explicit label | Full main-column swap to unrelated cold layout while source could stay visible |
| Destination: stable `WorkspaceChrome` + bridge shell with reserved geometry | Large shimmer blocks inside oper panels **after** oper reveal |
| Oper-region-only spinner (`DeptOperationalRegionLoader` pattern) | `WorkUnitRouteSkeletonBody` covering KPI + queue chrome after shell metadata known |
| Quiet KPI reserves (non-pulsing height holders) | 0 → real count jumps without reserved cells |
| Compact queue row skeleton **inside** lane only during tab refresh | Dept/WU route `loading.tsx` that disagrees with hydrated bridge shell geometry |

**Messaging vocabulary (reuse `AdminV2RouteLoadingState` defaults):**

- Workspace: "Loading workspace…"
- Department: "Loading department…"
- Work unit: "Loading work unit…"

Drawer continues to use `AdminV2DrawerLoadingState` — **do not merge** drawer and route contracts in implementation.

### 3.3 Data readiness contract

#### Workspace (minimum before replacing cold shell / showing real grid)

| Class | Data | Rule |
|-------|------|------|
| **Blocking / core** | Active departments list; per-dept work unit counts | Required for department grid |
| **Blocking / core** | Org chrome title (from context) | Already in layout |
| **Deferred** | Growth lifecycle + pipeline exact per dept | May refine tile lines after paint |
| **Deferred** | Workspace KPI placement strip | Quiet reserve until resolved |
| **Preview-only** | Rollup text lines on tiles | Quick rollup OK; refined rollup may fade in |
| **Refreshable** | All of the above | Silent revalidate on revisit |

#### Department (minimum before route commit / oper reveal)

| Class | Data | Rule |
|-------|------|------|
| **Blocking / core** | Department row + dept-scoped work unit list | Shell title + structure |
| **Blocking / core** | Throughput presentation decision + attention buckets settled | Single oper reveal (both panels) |
| **Blocking / core** | Pipeline lanes **or** per-WU summary totals (per dept config) | No morph after reveal |
| **Deferred** | KPI placement-resolved strip | Quiet reserve OK |
| **Deferred** | Right rail resolved actions | Placeholder rail OK until oper ready |
| **Deferred** | Workflow automation panels | Always background |
| **Preview-only** | Queue summary counts on cards | Exact counts from bootstrap |
| **Refreshable** | Summaries on site filter change | Full re-bootstrap |

#### Work unit (minimum before route commit / queue frame)

| Class | Data | Rule |
|-------|------|------|
| **Blocking / core** | Work unit + department rows | Header + breadcrumbs |
| **Blocking / core** | Queue definition validated; queue summaries | Lane pills with stable keys |
| **Blocking / core** | Primary lane rows **or** authoritative empty/error for lane | No full-page skeleton once shell known |
| **Deferred** | KPI placement strip | After `workUnitQueueRevealReady` |
| **Deferred** | Automation footer | After queue reveal |
| **Deferred** | Adjacent lane prefetch | Background |
| **Preview-only** | Queue row cells | Preview fields; drawer refetches truth |
| **Refreshable** | Row list on tab change | Buffered rows + quiet refresh |

### 3.4 Performance strategy (implementation phase)

1. **Intent prefetch:** On dept tile / oper card pointer intent, start `operational-bootstrap` fetch (deduped) before navigation commits.
2. **Parallelize:** Keep single bootstrap per page; delete or metric-guard legacy fan-out paths.
3. **Align WU gate with dept:** Replace `workUnitPageBlockingLoad` full skeleton with bridge shell + queue-lane-only reserve when `workUnit`+`dept` known (from cache or bootstrap).
3. **Route `loading.tsx`:** Match bridge shell geometry only (no second cold vocabulary) or replace with minimal ribbon if shell seeds from session.
4. **Workspace → dept:** Avoid immediate `DepartmentWorkspaceColdShell` on revisit when cache + prefetch ready.
5. **Caching display policy:** Extend session seed to include last-known oper counts where site scope matches (dept summaries remain scope-sensitive — follow existing doctrine).
6. **Background suppression:** Keep `isAdminV2OperNavigationActive` + `scheduleAdminV2BackgroundWork` during transitions.
7. **No client refetch** of data already in bootstrap payload (placements, right rail, primary_lane).
8. **Do not add** a second performance doctrine — extend Phase 1–2 contracts + this sprint doc.

### 3.5 Acceptance criteria (product)

- [ ] Workspace → dept → WU transitions feel **consistent** (same loading language, same “source stable” behavior).
- [ ] No **full framed skeleton churn** in the main oper/content column once bridge shell is visible.
- [ ] Clicked card/tile shows **immediate** pressed/loading acknowledgment until navigation completes or fails.
- [ ] Source page does not **blank** into an empty main column during transition.
- [ ] Destination opens with **meaningful structure** (titles, lanes, pills, panel frames) — not an empty white frame.
- [ ] Counts use reserves or `—` — no obvious **0 → real** flashes on KPI/oper totals where bootstrap provides numbers.
- [ ] Drawer sprint behavior **unchanged** (contract tests green).
- [ ] Phase 1 navigation matrix preserved or updated with tests in the same PR.

---

## 4. Proposed implementation cards

| Card | Title | Deliverable |
|------|-------|-------------|
| **0** | Audit + document | **This file** — no product code |
| **1** | Shared transition contract | ✅ **Done** — see [Card 1 closeout](#card-1-closeout-shared-transition-helper) |
| **2** | Workspace transition cleanup | ✅ **Done** — see [Card 2 closeout](#card-2-closeout-workspace--department-transition) |
| **3** | Department transition cleanup | Prefetch on oper card intent; align `loading.tsx` with bridge shell; ensure oper-only loader (no regressions to bootstrap) |
| **3A** | Work unit shell-first loading | ✅ **Done** — see [Card 3A closeout](#card-3a-closeout-work-unit-shell-first-loading) |
| **4** | Work unit transition cleanup (deferred) | Dept oper-card prefetch + `loading.tsx` parity if needed after 3A |
| **5** | Performance pass | Legacy path metrics; growth rollup deferral; confirm dedupe on prefetch; bootstrap-only happy path tests |
| **6** | Verification + closeout | Extend `adminV2NavigationContracts` / loading geometry tests; perf notes; remaining debt list |

**Explicit stop point:** **Do not start Cards 1–6 until this audit is reviewed.** Implementation PRs should cite this doc and Phase 1 contracts; any change to hard vs soft nav requires test updates called out in Card 1.

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| Breaking Phase 1 hard-nav reliability | Do not replace dept→WU hard nav without cancelled-transition QA; prefetch is additive |
| Site filter scope vs cached counts | Do not persist scope-sensitive totals against fingerprint rules |
| Double fetch on prefetch + post-nav | Use `dedupeAdminFetch` keys identical to page bootstrap |
| Orchestrated soft nav regressions (dead clicks) | Feature flag or timeout fallback to current `<Link>` behavior |
| `loading.tsx` / client gate drift | One geometry source (`DepartmentWorkspaceColdShell`, bridge shell, quiet reserves) |
| Drawer regression | No changes to `AdminEntityDrawer` reveal gates in Cards 2–5 |
| Increased bootstrap load from hover prefetch | Intent-only prefetch with TTL; respect `isAdminV2OperNavigationActive` |

---

## 6. Files likely to change (implementation)

| Area | Paths |
|------|-------|
| Sprint doc | `docs/sprints/05_2026/adminv2_platform_navigation_performance_sprint.md` |
| Transition helper | `web/lib/adminV2/navigationTransition.ts` (new), `web/lib/perf/markWorkUnitNavigationStart.ts`, `web/lib/perf/alloyPerfGlobal.ts` |
| Route loading UI | `web/components/admin/workspace/AdminV2RouteLoadingState.tsx`, `workspaceRouteSkeletons.tsx`, `WorkspaceQuietLoadingReserve.tsx` |
| Workspace | `web/app/adminV2/workspace/page.tsx`, `WorkspaceRootDepartmentGrid.tsx`, `WorkspaceRootColdShell.tsx`, `WorkspaceRootShell.tsx` |
| Department | `web/app/adminV2/workspace/dept/[departmentId]/page.tsx`, `dept/.../loading.tsx`, `DepartmentWorkspaceColdShell.tsx` |
| Work unit | `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx`, `work-unit/.../loading.tsx`, `WorkUnitWorkspace.tsx` |
| Navigation | `web/lib/adminV2/shellNavigation.ts`, `web/app/adminV2/components/navigation/AdminV2NavLink.tsx` |
| Cache | `web/lib/workspace/adminV2WorkspaceSessionCache.ts` |
| Shell | `web/app/adminV2/components/AdminV2Shell.tsx` (ribbon mount only) |
| Tests | `web/tests/admin/adminV2NavigationContracts.test.ts`, `adminV2LoadingGeometry.test.ts`, `workUnitOperationalBootstrap.test.ts` |
| CSS | `web/app/adminV2/components/workspace/workspace.css` (ribbon/overlay) |

**Not expected:** `AdminEntityDrawer.tsx`, drawer bootstrap routes, `QueueService` truth semantics, migrations.

---

## 7. Audit checklist (Card 0)

| # | Question | Answered in |
|---|----------|-------------|
| 1 | How does each page load? | §2.1 |
| 2 | Where are skeletons used? | §2.2 |
| 3 | Transition before data ready? | §2.3 |
| 4 | Sequential fetch chains? | §2.4 |
| 5 | Duplicate fetches? | §2.5 |
| 6 | Region-independent churn? | §2.6 |
| 7 | Bottlenecks? | §2.7 |
| 8 | Fix now vs defer? | §2.8 |

---

## 8. References inspected

**Docs:** `README.md`, `docs/README.md`, `docs/core/system-overview.md`, `docs/execution/operating-doctrine.md`, `adminv2_performance_phase1_navigation_and_interaction_contracts.md`, `adminv2_performance_phase2_load_path_architecture.md`, `adminv2_performance_phase5_visual_loading.md`, `adminv2_dept_runtime_closeout_handoff.md`, `adminv2_work_unit_runtime_cards_1_3_plan.md`, `adminv2_performance_scope_lock.md`, `docs/system/workspace-system.md`

**Code:** `web/app/adminV2/workspace/**`, `web/components/admin/workspace/**`, `web/lib/adminV2/shellNavigation.ts`, `web/lib/workspace/loadDeptOperationalBootstrap.ts`, `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`, `web/lib/workspace/adminV2WorkspaceSessionCache.ts`, route `loading.tsx` files, `AdminV2RouteLoadingState.tsx` (unused on routes by design today)

---

## Card 1 closeout — shared transition helper

**Date:** 2026-05-22  
**Status:** Complete — no workspace/dept/work-unit route wiring.

### Files changed

| File | Purpose |
|------|---------|
| `web/lib/adminV2/navigation/adminV2RouteLoadingVocabulary.ts` | Shared ribbon/title copy (workspace, department, work_unit, queue) |
| `web/lib/adminV2/navigation/adminV2NavigationTransition.ts` | Transition store + `runAdminV2NavigationTransition` orchestrator |
| `web/lib/adminV2/navigation/useAdminV2NavigationTransition.ts` | `useSyncExternalStore` hook for React consumers |
| `web/lib/adminV2/navigation/index.ts` | Public exports |
| `web/components/admin/workspace/AdminV2NavigationTransitionRibbon.tsx` | Shell ribbon seam (`WsRouteLoadingRibbon`) — **not mounted** |
| `web/components/admin/workspace/AdminV2RouteLoadingState.tsx` | Imports shared vocabulary (no visual change) |
| `web/tests/lib/adminV2/adminV2NavigationTransition.test.ts` | Unit tests |

### Transition helper contract

| API | Role |
|-----|------|
| `runAdminV2NavigationTransition(opts)` | Main entry: pending state → optional `prepare()` → `commit()` |
| `getAdminV2NavigationTransitionSnapshot()` | Read current intent (idle \| preparing \| committing) |
| `subscribeAdminV2NavigationTransition` | External store subscription |
| `useAdminV2NavigationTransition()` | React hook (Card 2+ pages / shell) |
| `isAdminV2NavigationItemPending(clickedKey)` | Click acknowledgement targeting |
| `adminV2NavigationClickedItemProps(clickedKey)` | `{ aria-busy, data-adminv2-nav-pending }` when pending |
| `AdminV2NavigationTransitionRibbon` | Shell-level ribbon component (unmounted) |

**`RunAdminV2NavigationTransitionOpts`:** `href`, `clickedKey`, `variant`, `commit`, optional `prepare`, `timeoutMs` (default **1500ms**), `commitOnPrepareFailure` (default **true**), optional message overrides.

### Timeout / fallback behavior

```text
prepare absent     → commit immediately (reason: no_prepare)
prepare resolves   → commit early (reason: prepare_ok)
prepare > timeout  → commit anyway (reason: timeout); slow prepare may continue in background
prepare throws     → commit anyway unless commitOnPrepareFailure === false (reason: prepare_failed | aborted)
second click while active → superseded (no duplicate commit)
```

Always calls `markWorkUnitNavigationStart()` unless `markNavigationStart: false`.

### Intentionally not wired (Card 2+)

- `WorkspaceRootDepartmentGrid` still uses plain `<Link>` — no `runAdminV2NavigationTransition`
- `DeptOperConsoleQueueRow` still uses `adminV2CommitNavigation` directly
- `AdminV2Shell` does not mount `AdminV2NavigationTransitionRibbon`
- No bootstrap prefetch in `prepare()` yet
- Route `loading.tsx` / page blocking gates unchanged
- Drawer behavior unchanged

### Tests

`web/tests/lib/adminV2/adminV2NavigationTransition.test.ts` — prepare ok, timeout, prepare failure, abort on `commitOnPrepareFailure: false`, clicked-key/aria-busy, cleanup, superseded second run.

### Next card recommendation (superseded by Card 2)

See Card 2 closeout below.

---

## Card 2 closeout — workspace → department transition

**Date:** 2026-05-22  
**Status:** Complete — first sprint behavior change (workspace → dept only).

### Files changed

| File | Purpose |
|------|---------|
| `web/lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap.ts` | Build + GET prefetch for dept `operational-bootstrap` |
| `web/lib/adminV2/navigation/index.ts` | Export prefetch helpers |
| `web/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx` | Orchestrated nav: `<a href>` + `runAdminV2NavigationTransition` + pending props |
| `web/components/admin/workspace/AdminV2NavigationTransitionRibbon.tsx` | Absolute-position overlay ribbon |
| `web/app/adminV2/components/AdminV2Shell.tsx` | Mount ribbon in workspace content chrome (both site-filter branches) |
| `web/app/adminV2/components/workspace/workspace.css` | Subtle pending tile affordance (`data-adminv2-nav-pending`) |
| `web/tests/lib/adminV2/prefetchDepartmentOperationalBootstrap.test.ts` | Prefetch URL + fetch tests |
| `web/tests/lib/adminV2/workspaceDeptNavigationTransition.test.ts` | Static + runtime transition tests |
| `web/tests/admin/adminV2NavigationContracts.test.ts` | Updated workspace tile contract |

### Behavior changed

- **Workspace → dept:** Primary click on department tiles runs `runAdminV2NavigationTransition` — pending tile + shell ribbon (“Loading department…”) while `prefetchDepartmentOperationalBootstrap` runs, then `router.push(href)`.
- **Accessibility:** Native `<a href>` preserved; modifier / non-primary clicks use browser default (new tab, etc.).
- **Fallback:** Prepare failure or **1500ms** timeout still commits via `router.push` (helper doctrine).
- **Source stability:** Workspace page stays mounted until `router.push`; ribbon overlays content (no main-column blanking from orchestration).

### Intentionally not changed

- Dept → work-unit still uses `adminV2CommitNavigation` (hard nav).
- Sidebar / breadcrumbs unchanged.
- Drawer behavior unchanged.
- Dept `loading.tsx` / `DepartmentWorkspaceColdShell` still shown by Next after route commit.
- `WorkspaceRootColdShell` cold-load gate on workspace index unchanged (no cache+prefetch defer yet).
- Work-unit routes untouched.

### Tests run

```bash
npm run test -- tests/lib/adminV2/prefetchDepartmentOperationalBootstrap.test.ts \
  tests/lib/adminV2/workspaceDeptNavigationTransition.test.ts \
  tests/lib/adminV2/adminV2NavigationTransition.test.ts \
  tests/admin/adminV2NavigationContracts.test.ts
```

**Result:** 36/36 passed.

### Risks / observations

- After `router.push`, Next may still show `dept/loading.tsx` cold shell until client bootstrap — orchestration reduces **pre-nav** churn, not necessarily post-commit segment loader.
- Second dept tile click while transition active returns `superseded` (no duplicate commit).
- Prefetch shares `dedupeAdminFetch` with dept page bootstrap when both run in quick succession.

### Next card recommendation

**Card 3 — Department transition cleanup** (per sprint plan) **or** prioritize **Card 4 — Work unit shell-first downgrade** if product wants the biggest visible skeleton win first. Card 4 aligns WU with dept oper-region-only loading; Card 3 adds dept oper-card intent prefetch + `loading.tsx` geometry parity.

---

---

## Card 3A closeout — work-unit shell-first loading

**Date:** 2026-05-22  
**Status:** Complete — visible skeleton reduction on work-unit destination.

### Audit summary (before changes)

| Gate | Before |
|------|--------|
| `workUnitPageBlockingLoad` | `(loading && !shellReady) \|\| operLanePending` — **full framed skeleton** until lane authority |
| `WorkUnitRouteSkeletonBody` | Used in `loading.tsx` + in-page blocking — shimmer cards, pills, row skeletons |
| `wuQueueLaneAuthorityReady` | Blocked entire `WorkUnitWorkspace` render |
| Session cache | `readWorkUnitPageCache` seeds dept + WU in `useLayoutEffect` but oper pending still forced full skeleton |
| Route `loading.tsx` | Breadcrumb stub + `WorkUnitRouteSkeletonBody` |

### Files changed

| File | Purpose |
|------|---------|
| `web/components/admin/workspace/WorkUnitWorkspaceColdShell.tsx` | **New** — bridge chrome + brief + quiet KPI + oper lane loader |
| `web/components/admin/workspace/WorkspaceQuietLoadingReserve.tsx` | **New** `WorkUnitOperationalLaneLoader` |
| `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx` | Shell-first gates; `operLaneLoading` prop |
| `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/loading.tsx` | `WorkUnitWorkspaceColdShell` (dept-aligned) |
| `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` | Oper-lane-only loader; quiet KPI during oper pending |
| `web/tests/admin/adminV2WorkUnitShellFirstLoading.test.ts` | Card 3A contract tests |
| `web/tests/admin/adminV2LoadingGeometry.test.ts` | Updated expectations |
| `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` | Updated WU loading coherence |

### Before / after behavior

| Moment | Before | After |
|--------|--------|-------|
| Hard nav lands on WU | Route `loading.tsx` → full `WorkUnitRouteSkeletonBody` | Route `loading.tsx` → `WorkUnitWorkspaceColdShell` (stable chrome, oper spinner) |
| Cache seeds dept+WU | Still full framed skeleton until `wuQueueLaneAuthorityReady` | `WorkspaceChrome` + real titles + `WorkUnitWorkspace` with `operLaneLoading` |
| No shell metadata yet | Framed skeleton | `WorkUnitWorkspaceColdShell` |
| Lane authority pending | Blocks entire page | In-region `WorkUnitOperationalLaneLoader` (“Loading work unit…”) |
| Tab refresh / row fetch | Row skeletons in lane | **Unchanged** — compact row skeletons only inside `QueueBlock` |

### Skeletons that remain (and why)

| Skeleton | When | Why |
|----------|------|-----|
| `WorkUnitRouteSkeletonBody` | Legacy / tests only | No longer on route or page blocking path |
| `WorkUnitQueueCompactRowSkeleton` | Lane tab refresh, `rowsLoading` with items empty | In-lane only; not full-page |
| `KpiStripSkeleton` | After queue reveal, placements pending | Deferred KPI strip |
| Dept cold shell / oper loader | Dept route | Unchanged |

### Intentionally not changed

- Dept → WU `adminV2CommitNavigation` (hard nav)
- Workspace → dept Card 2 orchestration
- Drawer, QueueService, bootstrap API contracts
- `wuQueueLaneAuthorityReady` data gate (still controls fetch + oper reveal)

### Tests run

```bash
npm run test -- tests/admin/adminV2WorkUnitShellFirstLoading.test.ts \
  tests/admin/adminV2LoadingGeometry.test.ts \
  tests/admin/adminV2DrawerLoadingCoherence.test.ts \
  tests/admin/adminV2NavigationContracts.test.ts \
  tests/lib/adminV2/workspaceDeptNavigationTransition.test.ts
```

### Next card recommendation

**Card 3 — Department transition cleanup:** oper-card intent prefetch + align `dept/loading.tsx` with revisit cache (optional polish). **Card 5 — Performance pass:** legacy fan-out metrics, growth rollup deferral.

---

**Next step:** Card 3 (dept polish) or Card 5 (performance pass).
