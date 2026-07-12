# AdminV2 Performance — Phase 2 Load-Path Architecture

**Date:** 2026-05-19  
**Status:** Architecture design (no implementation in this phase)  
**Authority:** Guides Phase 3 (shell/workspace/dept/work-unit), Phase 4 (drawer), Phase 5 (visual loading)

**Binding doctrine (unchanged):**
- [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md)
- Evidence: [`adminv2_performance_deep_dive_phase0_audit.md`](./adminv2_performance_deep_dive_phase0_audit.md), [`adminv2_performance_rebuild_audit.md`](./adminv2_performance_rebuild_audit.md)

**Contract tests (must pass after every implementation phase):**  
`web/tests/admin/adminV2NavigationContracts.test.ts`, `adminV2QueueRowClick.test.ts`, `adminV2WorkUnitLaneLocalState.test.ts`, `adminV2DrawerLoadingCoherence.test.ts`, `opportunityDrawerQueuePreviewSeed.test.ts`

---

## 1. Executive summary

### 1.1 What makes AdminV2 feel slow today

The workspace **feels** slow for structural reasons, not primarily because React is “heavy”:

1. **Hard navigation tax** — Shell and dept drill-ins use `adminV2CommitNavigation` → full document load. Each hop re-runs `workspace/layout.tsx` server work (`force-dynamic`) before any client data appears. This is **correct per Phase 1** but expensive.

2. **Server layout waterfall** — `getAdminAuth` → org name query → viewer TZ → operational TZ → `getAdminAccessContextCached` run **sequentially** in `web/app/adminV2/workspace/layout.tsx`. No page data is delivered from RSC; the client still waits for this bundle on every hard nav.

3. **Client-only data planes** — Workspace, dept, and work-unit **pages are client components**. All operational truth (departments, queues, rows, KPIs) arrives via `fetch` after hydration. RSC contributes auth/context only.

4. **Fan-out after first paint** — Each route schedules multiple parallel GET waves (summaries, attention, placements, pipeline probes, growth rollups). Dedupe helps in-flight collisions but not total work.

5. **Work-unit critical path depth** — Bootstrap needs WU + dept + queue list + primary lane rows before the queue feels “real.” Drawer adds a second stack (`drawer_visible` → `full`) on row click.

6. **Intentional cache gaps** — Dept session cache **refuses** to hydrate scope-sensitive summary counts (site filter safety). Revisit paths still refetch summaries.

7. **Visual phase mismatch** — Multiple resolver passes (baseline KPI → placement KPI; quick rollup → growth rollup) are gated with flags, but dept/WU still coordinate several skeleton→content transitions.

### 1.2 Target architecture (operator perception)

Operators should experience:

| Moment | Target feel |
|--------|-------------|
| Land on workspace/dept/WU after nav | **Immediate shell geometry** (title region, lane chrome, grid slots) with stable dimensions |
| Within ~1s | **Trustworthy structure** — department names, queue tabs, row shapes (even if counts refine) |
| Within ~2s | **Actionable queue** — primary lane rows clickable; drawer opens with recognizable header |
| Background | KPI refinement, automation strip, adjacent lane prefetch, drawer `full` — **no layout jump** |

Achieved by: **narrow blocking boundaries**, **continuity layers** (session shell seed, row buffer, preview seed), **classified deferral**, and **no new route/state competition** — not by more spinners.

### 1.3 What must remain unchanged (Phase 1)

| Domain | Frozen |
|--------|--------|
| Navigation classes | Hard / soft / local-state matrix |
| Work-unit URL | One-shot `readWorkUnitInitialLocationParams`; no post-mount lane URL sync |
| Drawer close | Pathname change only; backdrop `pointer-events-none` |
| Queue row open | `open_record` before registry; `openWorkUnitQueueRecord` + preview seed |
| Shell z-index | Chrome 100 > drawer panel 70 > backdrop 60 |
| Queue tabs | Local `selectedQueueKey`; no `scheduleWorkUnitLaneUrlSync` on work-unit page |

Phase 3–5 may **reduce latency** and **improve continuity** only inside these boundaries.

---

## 2. Load-path map by route

Legend: **B** = blocking first paint, **D** = deferred, **Dup** = duplicate risk, **RSC** = server component work, **Hydr** = requires client hydration.

### 2.1 Shared: `AdminV2Shell` + workspace layout

| Item | Current | Notes |
|------|---------|-------|
| **RSC** | `web/app/adminV2/layout.tsx` — font + shell wrapper only | No auth |
| **RSC** | `web/app/adminV2/workspace/layout.tsx` — auth bundle | **B** for entire workspace subtree |
| **Client** | `AdminV2Shell.tsx` — sidebar, TopNav (`Suspense`), site filter, AI command surface | Persistent in AdminV2 layout |
| **Client** | `AdminV2WorkspaceClientProviders.tsx` — providers + `AdminEntityDrawer` mount | Drawer always in tree |
| **Fetch (sidebar expanded)** | `GET /api/admin/departments`, `GET /api/admin/work-units` | **D**; **Dup** with page fetches via `dedupeAdminFetch` |
| **Hydr** | Full provider stack before page `useEffect` runs | Pages cannot fetch until hydrated |

**Server layout sequential work (`workspace/layout.tsx`):**

1. `getAdminAuth()` → `getCachedAuthUser` + `loadAdminAccessBundleCached` (React `cache()` per request)
2. `createAdminClient` → `orgs.name`
3. `loadAdminViewerTimezoneBootstrap(userId)`
4. `loadOperationalOrgTimezoneIana(orgId)`
5. `getAdminAccessContextCached()` → `accessScopeFingerprint`

**Visual risk:** TopNav `Suspense` 48px fallback; no page content until client page runs.

---

### 2.2 `/adminV2/workspace`

**Files:** `workspace/page.tsx`, `workspace/loading.tsx` → `WorkspaceRootColdShell`, `WorkspaceRootShell`, `WorkspaceRootDepartmentGrid`

| Phase | Data | API / source | B/D | Dup |
|-------|------|--------------|-----|-----|
| RSC layout | Auth, orgName, TZ, fingerprint | layout | B | — |
| `useLayoutEffect` | Shell seed | `readWorkspaceRootCache` | B* | — |
| Critical | Departments list | `GET /api/admin/departments` | B | Sidebar if expanded |
| Critical | Work units list | `GET /api/admin/work-units` | B | Sidebar |
| First paint | Quick tile rollup | client `buildWorkspaceQuickRollup` | B | — |
| Background | Growth dept lifecycle KPIs | `GET .../opportunity-lifecycle-kpis` × N | D | — |
| Background | Growth pipeline exact | `GET .../pipeline-exact-count` × N | D | — |
| Background | KPI placements strip | `GET /api/admin/workspace-kpi-placements?surface=workspace` | D | — |

\*Cache hit skips cold shell; network still runs.

**Hydration dependencies:** `WorkspaceOrgContext` (orgId, fingerprint) → page `useEffect`.

**Visual risks:** KPI strip skeleton → resolved numbers (`workspaceKpiPlacementPending`); rollup opacity lift (`workspaceRollupRefined`); empty→tile only when no cache.

**RSC vs client:** **100% client** for workspace body.

---

### 2.3 `/adminV2/workspace/dept/[departmentId]`

**Files:** `dept/[departmentId]/page.tsx`, `dept/.../loading.tsx` → `DepartmentWorkspaceColdShell`, `DepartmentWorkspaceBridgeShell`, `DeptPairedOperQueuesSkeleton`

| Phase | Data | API | B/D | Dup |
|-------|------|-----|-----|-----|
| RSC layout | Same as §2.1 | layout | B | — |
| `useLayoutEffect` | Dept + WU list seed | `readDepartmentPageCache` | B* | — |
| Critical | Department row | `GET /api/admin/departments/:id` | B | — |
| Critical | Work units for dept | `GET /api/admin/work-units?department_id=` | B | WU list on WU page if navigated |
| Shell ready | `setDeptLoading(false)` | after dept+WU | B | — |
| Post-shell | Queue summaries | `GET .../work-unit-queue-summaries?...` (+ site) | D† | — |
| Post-shell | Attention preview | `GET .../opportunity-attention-preview` | D | — |
| Post-shell | Pipeline exec surface | `resolveDeptPipelineExecSurface` → WU GET + queues GET per candidate | D | Up to 4 concurrent WU probes |
| Parallel effect | KPI placements | `GET .../workspace-kpi-placements?surface=department` | D | TTL 8s |
| Idle | Workflow automation | `fetchWorkflowAutomationWorkspacePanels` | D | — |
| Enrollment | Right rail actions | `fetchWorkspaceRightRailResolvedActions` (3 surfaces) | D | WU page if same dept/WU |

†Summaries block **paired panel content** (`deptThroughputOperReady`) but not dept title shell.

**Hydration:** `departmentId` from `useParams`; site filter from `WorkspaceSiteFilterContext`.

**Visual risks:** Paired skeleton until throughput + attention ready; KPI strip undefined → skeleton; summary count pulse on cards.

**Session cache rule:** Summaries **not** read from cache on hydrate (scope-safe); geometry only.

---

### 2.4 `/adminV2/workspace/dept/.../work-unit/[workUnitId]`

**Files:** `work-unit/[workUnitId]/page.tsx` (~3156 LOC), `WorkUnitWorkspace`, `QueueBlock`, `readWorkUnitInitialLocationParams`

| Phase | Data | API | B/D | Dup |
|-------|------|-----|-----|-----|
| RSC layout | Same | layout | B | — |
| `useLayoutEffect` | WU + dept metadata seed | `readWorkUnitPageCache` | B* | — |
| Bootstrap | Initial URL | `readWorkUnitInitialLocationParams()` once | B | — |
| Critical parallel | Work unit | `GET /api/admin/work-units/:id` | B | Pipeline probe may dup |
| Critical parallel | Department | `GET /api/admin/departments/:id` | B | — |
| Critical parallel | Queue summaries list | `GET /api/admin/work-units/:id/queues?...` | B | Dept summaries route differs |
| Critical (early) | Primary lane rows | `fetchQueueItems` → `GET /api/admin/queues/:wu/:key` | B | May start before WU JSON completes |
| Post WU ready | Opportunity queue meta | `GET .../opportunity-queue` or `opportunity-attention-queue` | D | — |
| Deferred idle | `loadWorkUnitDeferredSupplement` | actions queue_row, right rail, workflow KPIs, WU list (NA id), KPI placements | D | — |
| Tab change | Lane rows | `fetchQueueItems` | interaction | LRU 90s + stale refresh 45s |
| Adjacent idle | Prefetch lanes | `fetchQueueItems(..., { prefetchOnly: true })` | D | After `primaryLaneRowsSettledOnceRef` |
| Site change | Summaries + rows force | `fetchQueueSummaries` + `fetchQueueItems` force | interaction | — |

**`fetchQueueItems` owner:** `page.tsx` — uses `queueRowClientCacheRef`, `queueRowLogicalCacheKey(viewScopeFingerprint, ...)`, `dedupeAdminFetch`.

**Hydration:** Large model build `queueModel` → `WorkUnitWorkspace` → `QueueBlock`.

**Visual risks:** Queue tab pill placeholders; `rowsLoading` with prior buffer; KPI strip suppressed per queue def (`shouldSuppressWorkUnitKpiStrip`).

**RSC vs client:** **100% client** for body.

---

### 2.5 `AdminEntityDrawer` (workspace-mounted)

**Files:** `AdminEntityDrawer.tsx`, `Drawer.tsx`, `AdminDrawerContext.tsx`, `web/lib/admin/opportunityEntityRecord.ts` (server enrich)

| Phase | Data | API | B/D |
|-------|------|-----|-----|
| Open (immediate) | Queue preview seed | client `opportunityQueuePreviewSeed` from row buffer | B (header) |
| Primary fetch | Opportunity visible shell | `GET /api/admin/entity/opportunities/:id?surface=drawer_visible` | B |
| Background | Full hydrate | same path `?surface=full` | D |
| Overlay | Member person graph | `?surface=relationship_member_persons` | D |
| Tab first visit | Communications, notes, related, activity, … | tab-scoped routes | D |
| Jobs | Entity GET | `?surface=drawer` or `full` | varies |

**State gates:** `opportunityDrawerShellSettled`, `opportunityRecordHydrationPending`, `opportunityFullHydratePending`, `postDrawerVisibleKey` (2× rAF).

**Not on critical path for workspace land** — only after row click.

---

### 2.6 Shell / sidebar / top nav (cross-route)

| Surface | Blocking for page? | Fetch |
|---------|-------------------|-------|
| Collapsed sidebar | No | None |
| Expanded sidebar tree | No | departments + work-units (**Dup**) |
| TopNav | Suspense only | None |
| Site filter | Affects API URLs | Context read; may trigger WU refresh |

---

## 3. Data classification matrix

| Data | Class | Blocking? | Owner | Staleness tolerance |
|------|-------|-----------|-------|---------------------|
| Auth session, orgId, role | shell-critical | Yes (RSC) | `workspace/layout.tsx` | None |
| Access scope fingerprint | shell-critical | Yes (RSC) | layout → `WorkspaceOrgProvider` | None |
| Viewer + operational TZ | shell-critical | Yes (RSC) | layout | Low |
| Org display name | shell-critical | Yes (RSC) | layout | Low |
| Sidebar collapse | shell-critical | No | `AdminV2Shell` local | N/A |
| Department list (root) | page-critical | Yes | `workspace/page.tsx` | Medium |
| Work unit counts (root tiles) | page-critical | Yes (quick) | workspace page | Medium |
| Growth rollup / pipeline exact | tertiary/deferable | No | workspace page | High |
| Workspace KPI placements | tertiary/deferable | No | workspace page | Medium (TTL 8s ok) |
| Dept identity + WU list | page-critical | Yes | dept page | Medium |
| Dept queue summaries | interaction-critical | No (shell yes) | dept page | Low — site scoped |
| Attention buckets | interaction-critical | No | dept page | Medium |
| Pipeline exec lanes | interaction-critical | No | `resolveDeptPipelineExecSurface` | Medium |
| Dept KPI placements | tertiary/deferable | No | dept page | Medium |
| Dept workflow KPIs | background-only | No | idle | High |
| Enrollment dept right rail | drawer-primary (actions) | No | dept page | Medium |
| WU + dept records | page-critical | Yes | work-unit bootstrap | Low |
| WU queue summary list | page-critical | Yes | work-unit bootstrap | Low |
| Primary lane row payload | interaction-critical | Yes | `fetchQueueItems` | Low (90s cache) |
| Queue tab counts | interaction-critical | No | summaries on WU | Medium |
| Adjacent lane rows | tertiary/deferable | No | prefetch | High |
| Queue row quick actions | tertiary/deferable | No | deferred supplement | Medium |
| WU right rail actions | tertiary/deferable | No | deferred supplement | Medium |
| WU KPI placements | tertiary/deferable | No | deferred supplement | Medium |
| Opportunity drawer visible | drawer-primary | Yes (on open) | `AdminEntityDrawer` | None |
| Opportunity drawer full | drawer-secondary | No | background effect | Low |
| Drawer tab payloads | tertiary/deferable | No | per-tab effects | Medium |
| Entity labels | shell-critical (settings) | Settings layout only | `settings/layout.tsx` | Not loaded on workspace layout today |

---

## 4. Blocking boundary redesign

### 4.1 Principles

1. **Block only what defines layout geometry and first operator action.**
2. **Never block shell chrome on page/network data.**
3. **Never block primary lane rows on deferred rails, workflow strip, or drawer full hydrate.**
4. **Prefer continuity over blanking** — show prior buffer / session seed / preview seed while refreshing.

### 4.2 Proposed blocking gates (target)

| Route | MAY block UI | MUST NOT block UI |
|-------|--------------|-------------------|
| **Layout** | Auth redirect, org missing | Dept names, queue rows |
| **Workspace** | Cold shell until dept list OR cache seed | Growth rollup, placements, refined rollup lines |
| **Dept** | Cold shell until dept+WU identity OR cache seed | Attention buckets, pipeline probe, workflow strip, placements |
| **Dept panels** | Coordinated skeleton until throughput **structure** known (WU list OR pipeline lanes) | Exact counts (use pulse/deferred) |
| **Work-unit** | Cold shell until WU+dept OR cache seed | Row actions, right rail, workflow, adjacent prefetch |
| **Work-unit queue** | Lane chrome + row **slots** (skeleton or buffer) | Tab badge exact counts, KPI placements |
| **Drawer open** | Panel + header slots (preview seed OK) | Full hydrate, non-overview tabs |

### 4.3 Server layout blocking redesign (Phase 3 candidate)

**Current:** 5 sequential awaits.  
**Target:** Single “workspace bootstrap” server read OR `Promise.all` of independent reads:

```text
Parallel bundle (proposal):
  getAdminAuth (required first for orgId)
  → Promise.all([
      org name,
      viewer TZ bootstrap,
      operational TZ,
      access context + fingerprint,
    ])
```

**Risk:** Low if outputs unchanged; measure `[admin-context-perf]` warnings.

**Out of scope:** Moving dept/WU lists to RSC (large behavior change; Phase 3+ only with API design).

---

## 5. Fetch ownership plan

| Fetch / helper | Owner today | Current timing | Proposed timing | Cache / dedupe | Risk |
|----------------|-------------|----------------|-----------------|----------------|------|
| `getAdminAuth` | `workspace/layout.tsx` | RSC sequential | Parallel after auth id known | React `cache()` | Low |
| `readWorkspaceRootCache` | `workspace/page.tsx` | `useLayoutEffect` | Same | sessionStorage v4 + fingerprint | Low |
| `GET /api/admin/departments` | workspace page, Sidebar | mount / sidebar expand | mount; sidebar uses same dedupe | `dedupeAdminFetch` | Low |
| `GET /api/admin/work-units` | workspace page, Sidebar | mount | same | dedupe | Low |
| Growth KPI pair | `loadWorkspaceRollup` | background | background; optional server aggregate Phase 3+ | dedupe + concurrency 3 | Med |
| `workspace-kpi-placements` | workspace page | parallel w/ rollup | after quick paint OR parallel | TTL 8s | Low |
| `readDepartmentPageCache` | dept page | layout effect | same | no summaries on read | Low |
| `work-unit-queue-summaries` | dept page | post shell | parallel w/ attention; **optional** shape-only session cache Phase 3 | network authoritative | **Med** (scope) |
| `opportunity-attention-preview` | dept page | post shell | parallel | — | Low |
| `resolveDeptPipelineExecSurface` | dept page | post shell | parallel; cancel on unmount | per-WU dedupe | Low |
| `fetchWorkflowAutomationWorkspacePanels` | dept + WU | idle 2s | idle after shell | — | Low |
| `readWorkUnitPageCache` | WU page | layout effect | same | metadata only | Low |
| `fetchQueueItems` | WU page | bootstrap + tab | same; tune stale refresh | `queueRowClientCache` 90s | Med |
| `buildWorkUnitQueuesListRoute` | WU bootstrap | parallel w/ WU+dept | same | site in URL | Low |
| `loadWorkUnitDeferredSupplement` | WU page | idle after WUD ready | same; optionally split workflow further | TTL on actions | Low |
| `fetchWorkspaceRightRailResolvedActions` | dept + WU deferred | idle | idle | TTL 1.5s × 3 surfaces | Low |
| `openWorkUnitQueueRecord` | WU `onAction` | sync | same | preview from buffer | Low |
| Entity `drawer_visible` | `AdminEntityDrawer` | on open | same | dedupe | Med |
| Entity `full` | `AdminEntityDrawer` effect | after visible | same | merge in place | Med |
| `dedupeAdminFetch` | shared | in-flight | extend to any new GET | clone per consumer | Low |
| `dedupeAdminFetchWithTtl` | placements, actions | mount/defer | keep | 8s / 1.5s | Low |

### 5.1 Duplicate elimination opportunities (Phase 3)

| Duplicate | Mitigation |
|-----------|------------|
| Sidebar + page both fetch departments/work-units | Already `dedupeAdminFetch`; ensure **identical URL** (no stray query differences) |
| Pipeline probe WU GET vs bootstrap WU GET | Share WU JSON in memory ref when `id` matches (`bootstrapWuRef` already exists — extend probe to read ref first) |
| Dept summaries vs WU queue list | Different routes; cannot merge — accept |
| `fetchWorkflowAutomationWorkspacePanels` dept + WU | Dedupe summary URL in helper (add if not keyed) |
| Layout auth + API route auth | Server-side only; not a client dup |

---

## 6. Shell persistence strategy

### 6.1 Stays mounted (identity preserved)

| Region | Component | On hard nav |
|--------|-----------|-------------|
| AdminV2 layout wrapper | `AdminV2Layout` / `AdminV2Shell` | Remounts (full document) |
| Workspace providers | `AdminV2WorkspaceClientProviders` | Remounts; drawer state cleared |
| Drawer component | `AdminEntityDrawer` | Remounts; closed on pathname effect |
| Sidebar collapse | `AdminV2Shell` useState | **Resets** on hard nav — acceptable |

### 6.2 May refresh (data revalidated)

| Region | Strategy |
|--------|----------|
| Page body | Network always runs; session seed masks cold shell |
| Site filter scope | Force summary + row refresh (`viewScopeFingerprint`) |
| Sidebar tree | Refetch on expand only |
| TopNav | Suspense re-resolve |

### 6.3 Must never blank

| Region | Continuity mechanism |
|--------|----------------------|
| Shell chrome (sidebar, top nav) | Fixed z-index; no `loading && null` |
| Work-unit queue row list | `queueRowsBufferRef` / keep prior `queueItems` during `queueItemsLoading` |
| Drawer header title | `opportunityQueuePreviewSeed` until entity row matches |
| Dept/WU title region | Cache seed dept/WU names |
| KPI strip area | Reserved height via skeleton — not removed |

### 6.4 Prior-state continuity layers

| Layer | Key | Invalidation |
|-------|-----|--------------|
| Session shell | `adminV2WorkspaceSessionCache.ts` keys include `orgId`, `principalUserId`, `accessScopeFingerprint` | Scope/org change |
| Queue row LRU | `queueRowClientCache.ts` | WU change, `force`, fingerprint, TTL 90s |
| In-flight dedupe | `workspaceAdminFetchDedupe.ts` | Per URL, request end |
| Drawer preview seed | `AdminDrawerContext.opportunityQueuePreviewSeed` | Entity switch |

---

## 7. Queue load-path strategy

### 7.1 Queue tab behavior (frozen)

- Tabs = `selectedQueueKey` + `laneUnmappedOnly` + `attentionBucketKey` (local).
- Tab change → `fetchQueueItems` (lease/sig skip if unchanged).
- **No** URL updates post-mount (Phase 1).

### 7.2 Row preview seed strategy

| Step | Behavior |
|------|----------|
| Row click | `findQueuePreviewItemById` on `queueDisplayItemsRef` / `queueRowsBufferRef` |
| Seed build | `opportunityDrawerSeedFromQueueItem` (`web/lib/admin/opportunityDrawerQueuePreviewSeed.ts`) |
| Drawer | `openDrawer({ opportunityQueuePreviewSeed })` |
| Header | Drawer uses seed until `entityDataMatchesDrawer` |

**Phase 4:** Expand seed fields only if header slots exist — no new navigation.

### 7.3 Row click → drawer timing (target)

| Milestone | Owner | Target (p75) |
|-----------|-------|----------------|
| Click handler | `QueueBlock` → `onAction` | < 16ms |
| `openDrawer` dispatch | `openWorkUnitQueueRecord` | < 50ms |
| Panel visible | `Drawer` mount | < 100ms |
| `drawer_visible` response | `AdminEntityDrawer` | < 500ms |

### 7.4 Cache continuity

- **Hit:** `peekFreshQueueRowCache` → instant row paint + optional `quietStaleRefresh` / `stale_refresh` after 45s.
- **Tab switch:** Prefer buffer + cache hit; network in background.
- **Invalidation:** Site filter → `force: true` on summaries + active lane; registry actions per contract.

### 7.5 Background refresh ownership

| Event | Owner action |
|-------|--------------|
| Tab change | `fetchQueueItems` |
| Site filter | `fetchQueueSummaries` + active lane force |
| Stale row cache | `shouldStaleBackgroundRefresh` inside `fetchQueueItems` |
| Drawer mutation | Entity drawer refetch — **not** full queue wipe unless action requires |
| Workflow refresh event | `refreshWorkflowPanels` only |

**Forbidden:** Global invalidation of all lanes on single row action.

---

## 8. Drawer load-path strategy

### 8.1 Payload stages (opportunity)

| Stage | Surface param | Server module | Client gate |
|-------|---------------|---------------|-------------|
| Visible shell | `drawer_visible` | `opportunityEntityRecord.ts` parallel minimal enrich | `drawer_visible_ready`, header seed |
| Primary ready | visible + record chrome | `opportunityDrawerShellSettled` | Tab strip appears |
| Full hydrate | `full` | background `dedupeAdminFetch` | `mergeOpportunityFullHydrate` |
| Member graph overlay | `relationship_member_persons` | optional third fetch | overlay merge |
| Deferred | tab APIs | per-tab `useEffect` | after `postDrawerVisibleKey` |

Jobs: `surface=drawer` vs `full` — keep job modal path separate.

### 8.2 Reserved layout rules (Phase 4)

- Header grid slots fixed before `primary_ready`.
- Tab strip: empty array until `opportunityDrawerShellSettled` — no wrong tabs flash.
- Body: single scroll; no full-body unmount between visible and full.
- Use placeholders for relationship blocks while `opportunityFullHydratePending`.

### 8.3 No-flash / no-reshuffle constraints

| Constraint | Implementation anchor |
|------------|-------------------------|
| No second loading shell | Staged merge; `setLoading(false)` after visible |
| No title flash empty | `opportunityQueuePreviewSeed` |
| No tab strip flash | `drawerTabStripKeys` gated |
| No section reorder on full | `mergeOpportunityFullHydrate` in place |
| Full hydrate failure | `opportunityFullHydrateFailed` — degraded placeholders, not reset |

### 8.4 Deferred surfaces (allowed after `deferred_ready`)

Activity signal, deletion check, communications (prefetch on intent), notes, related entities, documents, financials — **tab-local** loading only.

---

## 9. Skeleton and visual loading replacement strategy

### 9.1 Remove / reduce (Phase 5)

| Current | Replacement |
|---------|-------------|
| Generic “Loading…” copy in dept attention empty state during load | Fixed-height lane placeholder matching card geometry |
| Duplicate skeleton phases on WU (queue loading model + row skeleton) | Single row-slot strategy when buffer empty |
| KPI strip appearing/disappearing | Always reserve strip height when placements may exist |

### 9.2 Exact-size placeholders (allowed)

| Component | Rule |
|-----------|------|
| `DeptPairedOperQueuesSkeleton` | `DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT` (=5) both panels |
| `KpiStripSkeleton` | Match strip cell count from placement config when known |
| `WorkUnitQueueCompactRowSkeletonList` | Match default page size (20) or visible viewport rows |
| Drawer header skeleton | Until `opportunityDrawerShellSettled` only |

### 9.3 Prior-state persistence (prefer over skeleton)

| Surface | Mechanism |
|---------|-----------|
| Workspace/dept/WU revisit | sessionStorage shell seed |
| Queue tab switch | row buffer + client cache |
| Drawer header | preview seed |
| KPI numbers | `kpiPlacementPending` / don't render baseline numbers that will swap |

### 9.4 Opacity / fade (prefer over swap)

- `adminv2-ws-soft-content-reveal` on dept panels — keep.
- Workspace `workspaceRollupRefined` opacity lift — keep.
- **Avoid** opacity on interactive queue rows during refresh (blocks perceived clickability).

### 9.5 Loading UI forbidden

| Context | Forbidden |
|---------|-----------|
| Queue tab change | Full-list spinner replacing all rows |
| Drawer visible → full | Full-panel spinner |
| Shell chrome | Overlay blocking sidebar |
| Hard nav transition | Blank white main area without cold shell |
| Work-unit | `useSearchParams` suspense boundary |

---

## 10. Safe implementation sequence

### Phase 3 — Shared shell + workspace + dept + work-unit load paths

**Goal:** Reduce blocking time and duplicate fetches **without** navigation/drawer/URL changes.

| Order | Work item | Files (primary) | Doctrine check |
|-------|-----------|-----------------|----------------|
| 3.1 | Parallelize `workspace/layout.tsx` server awaits | `workspace/layout.tsx` | No nav change |
| 3.2 | Instrument layout phases (`performance.mark` optional) | layout, `adminV2PerfLog.ts` | Dev-only |
| 3.3 | WU GET reuse for pipeline probe | `resolveDeptPipelineExecSurface.ts`, `bootstrapWuRef` | No URL sync |
| 3.4 | Ensure sidebar/page dept URLs identical for dedupe | `Sidebar.tsx`, pages | Dedupe only |
| 3.5 | Dept: optional session cache for **non-count** summary shape (if tested) | `adminV2WorkspaceSessionCache.ts`, dept page | **Med** — scope review |
| 3.6 | Work-unit: tighten stale-refresh / adjacent prefetch idle timing | `page.tsx`, `queueRowClientCache.ts` | Local state only |
| 3.7 | Server aggregate API for workspace growth rollup (optional, larger) | new API route, `workspace/page.tsx` | No nav |
| 3.8 | Baseline capture vs §12 metrics | staging | — |

**Exit:** p75 `critical_deps` / `shell_ready` improved ≥15% or documented; zero contract test failures.

### Phase 4 — Drawer load path

**Goal:** Faster `visible` → `primary_ready` → `fully_hydrated` without lifecycle rewrite.

| Order | Work item | Files | Doctrine check |
|-------|-----------|-------|----------------|
| 4.1 | Expand preview seed fields for header slots | `opportunityDrawerQueuePreviewSeed.ts`, drawer header | No open path change |
| 4.2 | Batch header actions API (if backend exists) | `AdminEntityDrawer`, API | Staged hydrate kept |
| 4.3 | Comms prefetch on intent only | existing prefetch helper | Non-blocking |
| 4.4 | Defer member graph until after full unless pending flag | `AdminEntityDrawer` effects | — |
| 4.5 | Perf tags for `primary_ready` boundary | `adminV2PerfLog.ts` | — |

**Exit:** p75 `drawer_visible` < 500ms, `full` < 2.5s; manual drawer checklist pass.

### Phase 5 — Visual loading system

**Goal:** CLS and phase mismatch reduction.

| Order | Work item | Files |
|-------|-----------|-------|
| 5.1 | Audit skeleton vs final dimensions per route | cold shells, skeleton components |
| 5.2 | Unify WU queue loading to buffer-first | `page.tsx`, `QueueBlock` |
| 5.3 | KPI strip reservation on dept/WU | `KpiStripSkeleton`, placement gates |
| 5.4 | Remove redundant loading copy | dept attention, WU queue model |
| 5.5 | Web Vitals CLS sample on staging | Lighthouse |

**Exit:** No major CLS on KPI/paired panels; manual checklist pass.

---

## 11. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Navigation regression from soft-nav “fix” | Med | Critical | Phase 1 matrix; contract tests; no URL sync on WU |
| R2 | Stale queue counts in session cache | Med | High | Never cache scope-sensitive totals; fingerprint keys |
| R3 | Over-caching row payloads after mutation | Med | Med | `force` on known mutations; conservative TTL |
| R4 | Queue truth boundary — preview seed ≠ entity | Low | Med | Seed is cosmetic; actions gate on `entityRowReady` |
| R5 | Drawer hydrate merge bug | Med | High | `mergeOpportunityFullHydrate`; failure path; tests |
| R6 | RLS/auth context wrong org | Low | Critical | layout redirect; API org scoping unchanged |
| R7 | Parallel layout race on auth failure | Low | High | Keep auth first; parallel only after orgId known |
| R8 | Dedupe returns shared Response body | Low | High | Already clones — never remove clone |
| R9 | Adjacent prefetch competes with active lane | Med | Low | Idle gate `primaryLaneRowsSettledOnceRef` |
| R10 | Over-Suspense on workspace pages | Med | Med | Phase 1 §6 — TopNav only |
| R11 | Hard nav hides soft-nav regressions | Low | Med | Test both sidebar (hard) and root tile (soft) in QA |
| R12 | Instrumentation noise in prod | Low | Low | `emitAdminV2Perf` at phase boundaries only |

---

## 12. Acceptance metrics

Targets inherit Phase 1 §8 budgets. Phase completion requires **staging p75** measured via `[perf.*]`, `alloyPerfSet`, and manual checklist.

### 12.1 Phase 3 targets (shell + pages)

| Metric | Baseline (capture first) | Phase 3 target |
|--------|------------------------|----------------|
| Layout server total | TBD | p75 −15% vs baseline |
| `[perf.workspace.load]` `critical_deps` | TBD | p75 < 800ms |
| `[perf.dept.load]` `shell_ready` | TBD | p75 < 600ms |
| WU `first_useful_paint` (`alloyPerfSet`) | TBD | p75 < 1.5s from nav start |
| Duplicate dept GET (sidebar+page) | 2 in flight max | 1 deduped round-trip |
| First-click nav failures | 0 / 20 | 0 / 20 |

### 12.2 Phase 4 targets (drawer)

| Metric | Phase 4 target |
|--------|----------------|
| `[timing][opportunity-api-visible]` | p75 < 500ms |
| `drawer_visible_ready` → shell settled | p75 < 800ms from open |
| `[perf.drawer.full_hydrate]` | p75 < 2.5s from open |
| Header title empty flash | 0 when seed present |

### 12.3 Phase 5 targets (visual)

| Metric | Phase 5 target |
|--------|----------------|
| CLS workspace/dept/WU | < 0.1 on primary flows |
| KPI strip layout shift | 0 visible jumps |
| Dept paired panel row count mismatch | 0 |

### 12.4 Manual checklist (every phase)

- [ ] Sidebar links — first click
- [ ] Settings hub + sidebar settings — first click
- [ ] Workspace dept tile — first click (soft)
- [ ] Dept oper card — first click (hard)
- [ ] Work-unit queue tab — no address-bar churn
- [ ] Queue row — first click opens drawer
- [ ] Drawer close / outside mousedown / Escape
- [ ] Sidebar navigates with drawer open
- [ ] Browser back/forward across routes
- [ ] No overlay blocks shell clicks

### 12.5 Instrumentation (no new product behavior)

Existing tags (`web/lib/perf/adminV2PerfLog.ts`, `alloyPerfGlobal.ts`, `__WS_PERF_DEBUG__`):

| Tag | Phase |
|-----|-------|
| `[perf.workspace.load]` | 3 |
| `[perf.dept.load]` | 3 |
| `[perf.queue.rows]` | 3 |
| `[timing][opportunity-api-visible]` | 4 |
| `[perf.drawer.full_hydrate]` | 4 |
| `first_useful_paint`, `queue_tab_rows_ready` | 3 |

Optional Phase 3 addition (dev-only): `performance.mark('layout:auth')` etc. in `workspace/layout.tsx` — **not required** for Phase 2 completion.

---

## Appendix A — RSC vs client responsibility summary

| Concern | RSC (server) | Client |
|---------|--------------|--------|
| Authentication / org gate | ✅ `workspace/layout.tsx` | — |
| Operational lists (depts, WUs, queues, rows) | ❌ not today | ✅ page `useEffect` |
| Drawer entity | ❌ | ✅ `AdminEntityDrawer` fetch |
| Site filter query append | — | ✅ `appendWorkspaceSiteToUrl` |
| Session shell seed | — | ✅ `adminV2WorkspaceSessionCache` |
| KPI resolver | — | ✅ `resolveKpisFor*` client |

**Future (out of Phase 3 unless explicitly scoped):** Partial RSC streaming of dept/WU **read-only** snapshots would require new server loaders and careful hydration boundaries — not default recommendation.

---

## Appendix B — Key file index

| Area | Files |
|------|-------|
| Layout / auth | `web/app/adminV2/workspace/layout.tsx`, `web/lib/adminAuth.ts`, `web/lib/admin/getAdminAccessContext.ts` |
| Providers | `web/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx` |
| Shell | `web/app/adminV2/components/AdminV2Shell.tsx`, `Sidebar.tsx`, `TopNavBar.tsx` |
| Workspace page | `web/app/adminV2/workspace/page.tsx` |
| Dept page | `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` |
| Work-unit page | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` |
| Queue UI | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` |
| Drawer | `web/components/admin/AdminEntityDrawer.tsx`, `web/contexts/AdminDrawerContext.tsx`, `web/components/admin/Drawer.tsx` |
| Fetch dedupe | `web/lib/workspace/workspaceAdminFetchDedupe.ts` |
| Session cache | `web/lib/workspace/adminV2WorkspaceSessionCache.ts` |
| Row cache | `web/lib/workspace/queueRowClientCache.ts` |
| Initial URL | `web/lib/adminV2/workUnitInitialLocation.ts` |
| Lane URL (frozen off page) | `web/lib/adminV2/workUnitLaneQueryUrl.ts` |
| Entity enrich | `web/lib/admin/opportunityEntityRecord.ts` |
| Perf | `web/lib/perf/adminV2PerfLog.ts`, `web/lib/perf/alloyPerfGlobal.ts` |

---

## Phase 2 exit criteria

- [x] Executive summary with frozen Phase 1 constraints
- [x] Load-path map per route (§2)
- [x] Data classification matrix (§3)
- [x] Blocking boundary redesign (§4)
- [x] Fetch ownership plan (§5)
- [x] Shell persistence strategy (§6)
- [x] Queue load-path strategy (§7)
- [x] Drawer load-path strategy (§8)
- [x] Skeleton / visual strategy (§9)
- [x] Phase 3/4/5 implementation sequence (§10)
- [x] Risk register (§11)
- [x] Acceptance metrics (§12)
- [ ] Staging baseline numbers captured (Phase 3 entry)

**Next:** Phase 3 implementation — start with §10.3.1 (layout parallelization) only; one PR per work item where possible.
