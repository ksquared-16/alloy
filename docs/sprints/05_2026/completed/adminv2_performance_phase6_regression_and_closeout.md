# AdminV2 Performance — Phase 6 Regression, Metrics, and Closeout

**Date:** 2026-05-19  
**Status:** Closeout (documentation + process; no further product optimization in this phase)  
**Authority:** Completes the AdminV2 performance deep-dive sprint (Phases 0–5)

**Binding doctrine (frozen):**
- [`adminv2_performance_deep_dive_phase0_audit.md`](./adminv2_performance_deep_dive_phase0_audit.md)
- [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md)
- [`adminv2_performance_phase2_load_path_architecture.md`](./adminv2_performance_phase2_load_path_architecture.md)
- [`adminv2_performance_phase5_visual_loading.md`](./adminv2_performance_phase5_visual_loading.md)

**Implementation references:**
- Phase 3–4–5 code under `web/app/adminV2/`, `web/components/admin/`, `web/lib/perf/`, `web/lib/admin/`

---

## 1. Summary of what changed (Phases 3–5)

Phases 0–2 were **docs-only** (audit, navigation contracts, load-path architecture). Phases 3–5 were **implementation** inside Phase 1 boundaries (no navigation class changes, no work-unit URL sync, no drawer-in-URL).

### Phase 3 — Shell and page load paths

| Card | What shipped | Primary files |
|------|----------------|---------------|
| **3A** | Parallel server bundle after auth in workspace layout (`org name`, viewer TZ, operational TZ, access context) | `web/app/adminV2/workspace/layout.tsx` |
| **3B** | Workspace KPI placements fetch overlaps critical deps | `web/app/adminV2/workspace/page.tsx` |
| **3C** | Dept page: KPI placements in main load effect; pipeline exec surface cache; workflow panels dedupe | `dept/[departmentId]/page.tsx`, `resolveDeptPipelineExecSurface.ts`, `fetchWorkflowAutomationWorkspacePanels.ts` |
| **3D** | Work-unit: dept/WU list overlap with bootstrap; workflow helper reuse; KPI dedupe; `needs_attention` WU id from key | `work-unit/[workUnitId]/page.tsx` |

**Intent:** Reduce blocking waterfalls and duplicate GETs without changing route ownership or queue tab behavior.

### Phase 4 — Drawer load path

| Card | What shipped | Primary files |
|------|----------------|---------------|
| **4A** | Expanded queue preview seed (title, subtitle, status, location, value, urgency, record hint) | `opportunityDrawerQueuePreviewSeed.ts`, `AdminEntityDrawer.tsx`, work-unit `openWorkUnitQueueRecord` |
| **4B** | Earlier comms prefetch on drawer open; `dedupeAdminFetch` on member graph; intent-time `drawer_visible` + `record_header` actions | `AdminEntityDrawer.tsx`, `opportunityDrawerIntentPrefetch.ts` |
| **4C** | Row `mousedown` / click intent prefetch (bounded, deduped) | `QueueBlock.tsx`, work-unit page |
| **4D** | Drawer phase perf: `row_click_to_drawer_visible`, `drawer_visible_to_primary_ready`, `drawer_visible_to_full_hydrated` | `adminV2DrawerPerf.ts`, `AdminEntityDrawer.tsx` |

**Intent:** Faster perceived drawer open; preview-backed header while `drawer_visible` → `full`; measurable phase boundaries.

### Phase 5 — Visual loading / skeleton coherence

| Card | What shipped | Primary files |
|------|----------------|---------------|
| **5A–B** | Shared loading geometry constants; exact-size placeholders | `adminV2LoadingGeometry.ts`, `KpiStripSkeleton.tsx` |
| **5C** | Queue-preview bootstrap: compact drawer body; preview header skips workflow chrome skeletons; timeline height reserve | `AdminEntityDrawer.tsx` |
| **5D** | Dept attention lane row skeletons; WU queue skeleton count shared; “Refreshing …” copy on buffered tab switch | dept page, `QueueBlock.tsx`, work-unit page |

**Intent:** Reduce CLS, wrong-size skeletons, and header/body flash without changing fetch ownership.

---

## 2. Performance budgets (from Phase 1 §8)

Governance targets for **staging / demo org**. Measure p75 unless noted. Adjust only with written rationale in sprint docs.

### 2.1 Route transitions

| Journey | Metric | p75 target | Instrumentation |
|---------|--------|------------|-----------------|
| Hard nav: sidebar → dept | `shell_ready` | < 600ms | `[perf.dept.load]` |
| Hard nav: dept → work-unit | First useful queue row | < 1.5s | `alloyPerfSet`, `[perf.queue.rows]` |
| Soft nav: workspace → dept | Interactive dept shell | < 1.2s | `[perf.dept.load]` |
| Full document reload | Layout auth + client shell | < 800ms (server + client) | `critical_deps`, layout dev logs |

### 2.2 Queue interactions

| Interaction | p75 target | Instrumentation |
|-------------|------------|-----------------|
| Tab switch (warm cache) | < 300ms | `[perf.queue.rows]` `client_cache_hit=true` |
| Tab switch (cold) | < 1.2s | `client_cache_hit=false` |
| Row click → drawer panel visible | < 100ms perceived | UX + `[perf.drawer.phase]` `row_click_to_drawer_visible` |
| Row click → `drawer_visible` API | < 500ms | `[timing][opportunity-api-visible]`, `[perf.drawer.phase]` |

### 2.3 Drawer timing

| Phase | p75 target | Instrumentation |
|-------|------------|-----------------|
| visible → primary_ready | < 800ms | `[perf.drawer.phase]` `drawer_visible_to_primary_ready` |
| open → fully_hydrated | < 2.5s | `[perf.drawer.full_hydrate]`, `[perf.drawer.phase]` `drawer_visible_to_full_hydrated` |
| Deferred tab first paint | < 1.5s after tab select | Per-tab (future tagging) |

### 2.4 Shell stabilization & reliability

| Surface / metric | Target |
|------------------|--------|
| Workspace `critical_deps` | p75 < 800ms |
| Workspace tiles interactive | p75 < 1.2s from nav start |
| Dept paired panels | No major CLS on lane reveal |
| KPI strip | No baseline→placement number flash (`kpiPlacementPending` honored) |
| First-click navigation failure | **0 / 20** manual hops |
| Dead queue row during refresh | **0** |
| Sidebar blocked with drawer open | **0** |

### Phase 2 exit criteria (still apply for sign-off)

| Phase | Exit |
|-------|------|
| 3 | p75 `critical_deps` / `shell_ready` ≥15% improvement **or** documented; contract tests green |
| 4 | p75 drawer visible < 500ms, full < 2.5s; manual drawer checklist |
| 5 | No major CLS on KPI/paired panels; manual visual checklist |

**Note:** Staging **baselines were not captured in-repo** before Phase 3. Phase 6 requires a first baseline run using §4 before claiming % improvements.

---

## 3. Manual QA checklist

Run on **staging** after any AdminV2 perf/nav/drawer/queue PR. Copy into PR description when relevant.

### Navigation (Phase 1)

- [ ] **Sidebar** — Workspace, dept, work unit, Settings, Automations: first click navigates
- [ ] **Settings** — Hub card (soft) and sidebar entry (hard): first click works
- [ ] **Workspace root** — Dept tile (soft `Link`): first click lands dept
- [ ] **Dept page** — Throughput / Needs Attention cards: first click lands work-unit with expected initial `?queue=` / `?attention_bucket=` from href
- [ ] **Work-unit** — Queue tab switch: **no** address-bar query churn; rows stay clickable during refresh
- [ ] **Browser back/forward** — workspace → dept → work-unit restores sensible pages
- [ ] **Overlay** — No full-screen invisible blocker; AI command bar usable; drawer backdrop does not block shell clicks

### Drawer

- [ ] **Queue row** — First click opens drawer; shell immediate
- [ ] **Preview header** — Title/subtitle/status/location from queue row when available; no generic “Inquiry” flash
- [ ] **Hydrate** — Body does not reset to full-page spinner between `visible` and `full`
- [ ] **Close** — Button, outside mousedown (shell still clickable), Escape
- [ ] **Drawer + shell** — With drawer open, sidebar hard-nav works on first click

### Visual loading (Phase 5)

- [ ] **Workspace / dept / WU cold load** — Skeleton geometry matches final cards/rows
- [ ] **Dept attention** — Row-shaped skeletons, not text-only loading panel
- [ ] **WU tab switch** — Prior rows stay visible with shimmer; status shows “Refreshing …” not “Loading …” when buffered
- [ ] **KPI strip** — Reserved height; no large number swap when placements arrive
- [ ] **Drawer** — Compact body reserve on queue open; no oversized workflow block before hydrate

---

## 4. Staging measurement protocol

### 4.1 Environment

- Staging URL with representative org (growth dept + enrollment-style work unit + opportunity queue).
- Chrome DevTools: **Performance** panel optional; **Console** required (filter `perf.`).
- Optional: `localStorage.setItem('__WS_PERF_DEBUG__', '1')` for verbose workspace timing (dev/staging only).
- Run **3–5 iterations** per scenario; record **p75** manually (median of worst two of five is acceptable for small samples).

### 4.2 Scenarios (in order)

| # | Scenario | Actions | Primary tags |
|---|----------|---------|--------------|
| S1 | Workspace land | Hard nav to `/adminV2/workspace` (or reload) | `[perf.workspace.load]` phases: `shell_seed`, `critical_deps`, `kpi_placements_ready` |
| S2 | Dept land | Sidebar → dept (hard) | `[perf.dept.load]` `shell_ready`, `summaries_ready` |
| S3 | Work-unit land | Dept oper card → work-unit (hard) | `alloyPerfSet` `work_unit_detail_req` → first row; `[perf.queue.rows]` |
| S4 | Queue tab warm | Switch lane tab twice (return to prior) | `[perf.queue.rows]` `client_cache_hit=true`, `total_ms` / `age_ms` |
| S5 | Queue tab cold | New lane never loaded | `[perf.queue.rows]` `client_cache_hit=false` |
| S6 | Drawer open | Click opportunity row (growth WU) | `[perf.drawer.phase]` ×3, `[timing][opportunity-api-visible]`, `[perf.drawer.full_hydrate]` |
| S7 | Drawer intent | Mousedown then click same row | Prefetch should dedupe; second open same tags, lower or cache-hit network |

### 4.3 Layout server (Phase 3)

- In **dev**, watch server log for `layout_parallel_bundle_ms` (if enabled) on workspace layout.
- Compare before/after only after capturing baseline in §7 template.

### 4.4 Optional Web Vitals

- Lighthouse on dept page (paired panels) and work-unit page (queue list): note **CLS** on KPI strip and oper panels.
- Not a merge gate unless CLS regression > 0.1 on a standard scenario.

---

## 5. Required console / perf tags to capture

All tags emit via `console.warn` from `web/lib/perf/adminV2PerfLog.ts` (structured object second argument).

### 5.1 Core tags

| Tag | When | Key fields |
|-----|------|------------|
| `[perf.workspace.load]` | Workspace root phase complete | `phase`, `total_ms`, `source`, `client_cache_hit`, `org_id` |
| `[perf.dept.load]` | Department page phase | `phase`, `total_ms`, `department_id`, `client_cache_hit` |
| `[perf.queue.rows]` | Queue fetch / cache event | `phase`, `work_unit_id`, `queue_key`, `client_cache_hit`, `age_ms` |
| `[timing][opportunity-api-visible]` | Server/client visible shell | `opportunity_id`, `total_ms`, `enrich_phases_ms` |
| `[perf.drawer.full_hydrate]` | Full entity merge applied | `opportunity_id`, `total_ms`, `drawer_full_hydrate_ms`, `phase` |
| `[perf.drawer.phase]` | Drawer UX boundaries (Phase 4) | `phase`: see below |

### 5.2 `[perf.drawer.phase]` phases

| `phase` value | Meaning |
|---------------|---------|
| `row_click_to_drawer_visible` | Row click → visible shell applied (DOM) |
| `drawer_visible_to_primary_ready` | Visible → shell settled (tabs/chrome) |
| `drawer_visible_to_full_hydrated` | Visible → full hydrate applied |

### 5.3 Performance API marks (`alloyPerfSet`)

Use DevTools → Performance → User timing, or:

```js
performance.getEntriesByType('mark').filter(m => m.name.includes('drawer') || m.name.includes('workspace'))
```

Notable marks: `drawer_row_click_at`, `drawer_opportunity_visible_applied`, `drawer_primary_ready_at`, `drawer_opportunity_full_applied`, `workspace_start`, `workspace_ready`, `work_unit_detail_req`, `summaries_req`.

### 5.4 Debug flags

| Flag | Purpose |
|------|---------|
| `window.__WS_PERF_DEBUG__` | Verbose workspace timing |
| `localStorage alloy_click_debug` | Click routing debug (opt-in; do not leave on in prod) |

---

## 6. Before / after comparison template

Copy for each staging baseline or release candidate.

```markdown
## AdminV2 perf snapshot — {date} — {env} — {org name/id}

**Git:** `{sha}`  
**Tester:**  
**Browser:**

### Route loads (p75 ms)

| Metric | Baseline | After | Δ | Pass? |
|--------|----------|-------|---|-------|
| Workspace `critical_deps` | | | | < 800 |
| Dept `shell_ready` | | | | < 600 |
| WU first useful row | | | | < 1500 |

### Queue (p75 ms)

| Metric | Baseline | After | Δ | Pass? |
|--------|----------|-------|---|-------|
| Tab switch warm | | | | < 300 |
| Tab switch cold | | | | < 1200 |

### Drawer (p75 ms)

| Metric | Baseline | After | Δ | Pass? |
|--------|----------|-------|---|-------|
| `row_click_to_drawer_visible` | | | | |
| `[timing][opportunity-api-visible]` | | | | < 500 |
| `drawer_visible_to_primary_ready` | | | | < 800 |
| `drawer_visible_to_full_hydrated` | | | | < 2500 |

### Reliability (counts)

| Check | Result |
|-------|--------|
| First-click nav failures / 20 | /20 |
| Dead queue rows during refresh | |
| Sidebar blocked with drawer open | |

### Visual / CLS

| Surface | CLS / notes |
|---------|-------------|
| Dept paired panels | |
| WU KPI strip | |
| Drawer header on queue open | |

### Notes

- 
```

---

## 7. Regression test matrix

Run on every AdminV2 perf/nav/drawer/queue PR and before release.

| Suite | Path | Guards |
|-------|------|--------|
| Navigation contracts | `web/tests/admin/adminV2NavigationContracts.test.ts` | Hard nav, `AdminV2NavLink`, no `next/link` in shell nav |
| Queue row click | `web/tests/admin/adminV2QueueRowClick.test.ts` | `open_record` ordering, drawer open path |
| Work-unit lane local state | `web/tests/admin/adminV2WorkUnitLaneLocalState.test.ts` | No post-mount URL sync on WU page |
| Drawer loading coherence | `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` | Backdrop, outside click, skeleton contracts |
| Queue preview seed | `web/tests/admin/opportunityDrawerQueuePreviewSeed.test.ts` | Seed shape from queue VM |
| Drawer intent prefetch | `web/tests/admin/opportunityDrawerIntentPrefetch.test.ts` | Deduped prefetch URLs |
| Loading geometry | `web/tests/admin/adminV2LoadingGeometry.test.ts` | Placeholder constants |
| Perf primitives | `web/tests/perf/adminV2PerfPrimitives.test.ts` | Queue cache key helpers |
| Dept pipeline surface | `web/tests/workspace/resolveDeptPipelineExecSurface.test.ts` | Exec surface cache (Phase 3) |

### CI command (required)

```bash
cd web && npx tsc --noEmit

cd web && npx vitest run \
  tests/admin/adminV2NavigationContracts.test.ts \
  tests/admin/adminV2QueueRowClick.test.ts \
  tests/admin/adminV2WorkUnitLaneLocalState.test.ts \
  tests/admin/adminV2DrawerLoadingCoherence.test.ts \
  tests/admin/opportunityDrawerQueuePreviewSeed.test.ts \
  tests/admin/opportunityDrawerIntentPrefetch.test.ts \
  tests/admin/adminV2LoadingGeometry.test.ts \
  tests/perf/adminV2PerfPrimitives.test.ts \
  tests/workspace/resolveDeptPipelineExecSurface.test.ts
```

Optional broader gate before merge to main:

```bash
cd web && npm run test -- tests/admin/adminV2
```

---

## 8. Navigation safety checklist (PR / release)

- [ ] Navigation class stated: **hard** / **soft** / **local-state**
- [ ] No new `useSearchParams` on work-unit queue page for lane selection
- [ ] No `scheduleWorkUnitLaneUrlSync` / `replaceWorkUnitBrowserSearch` on work-unit page after mount
- [ ] No `history.replaceState` for queue tabs
- [ ] `AdminV2NavLink` / `adminV2CommitNavigation` unchanged unless intentional + tests updated
- [ ] `open_record` runs before registry handlers on work-unit `onAction`
- [ ] Drawer closes on pathname change only (not query)
- [ ] Backdrop remains `pointer-events-none`
- [ ] Shell z-index > drawer panel > backdrop
- [ ] Contract tests §7 all pass

---

## 9. Drawer performance checklist

- [ ] Drawer opens on **first** queue row click
- [ ] `openDrawer` not blocked on `surface=full`
- [ ] `opportunityQueuePreviewSeed` passed from queue row (not canonical truth)
- [ ] Staged hydrate: `drawer_visible` then background `full`
- [ ] `mergeOpportunityFullHydrate` — no section reorder regression
- [ ] Intent prefetch uses `dedupeAdminFetch` / TTL helpers only
- [ ] No global per-row hover prefetch fan-out
- [ ] `[perf.drawer.phase]` lines appear once per open (no render-loop spam)
- [ ] Preview seed tests + drawer coherence tests pass

---

## 10. Visual loading / skeleton checklist

- [ ] Skeleton row count uses `ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT` (6) where applicable
- [ ] Dept attention uses compact row skeletons (not text-only loading)
- [ ] Queue tab switch keeps buffered rows (`rowsRefreshing` / buffer ref)
- [ ] No `loading && null` blanking of entire shell
- [ ] KPI strip reserved while `kpiPlacementPending` / `workUnitKpiMetricsPending`
- [ ] Drawer queue-bootstrap uses compact body reserve (not 18rem workflow grid)
- [ ] `adminV2LoadingGeometry.test.ts` + drawer coherence extensions pass

---

## 11. Known remaining debt

| Area | Item | Severity | Notes |
|------|------|----------|-------|
| Metrics | No in-repo staging baseline numbers | Med | Run §4 + §6 once on staging |
| Workspace | Growth rollup still N parallel client calls | Med | Phase 2 optional aggregate API not built |
| Workspace | Tile KPI opacity refinement pass | Low | Intentional second-phase UX |
| Drawer | Deferred tab surfaces (comms, notes, docs) use local spinners | Low | Tab-local loading OK per architecture |
| Drawer | Modal/classic opportunity paths not queue-bootstrap compact | Low | Sidebar/modal entry paths |
| Dept | KPI skeleton cell count fixed at 5 until placements known | Low | WU passes `cellCount` when known |
| Cache | Dept session cache refuses scope-sensitive counts | By design | Site filter safety |
| Perf | Deferred tab first-paint not tagged | Low | Future `[perf.drawer.tab]` |
| Process | Team sign-off on Phase 1 budgets | Process | §8 baselines pending |

---

## 12. Rules for future performance PRs

1. **Classify navigation** — Every PR touching workspace surfaces must state hard / soft / local-state (Phase 1 §1).
2. **Cite safe category** — Performance work must map to Phase 1 §10 (dedupe, parallel GET, seed, skeleton, prefetch, etc.).
3. **Avoid §9 patterns** — No shallow routing, URL↔tab sync on WU, backdrop capture, prefetch storms, or queue-as-truth without explicit exception doc.
4. **Tests required** — Run §7 matrix; add tests when changing contracts, seed shape, cache keys, or skeleton geometry.
5. **Metrics required** — Performance-only PRs include before/after §6 snapshot or “no measurable change expected” rationale.
6. **Visual changes** — Update `adminV2LoadingGeometry.ts` + tests if placeholder dimensions change.
7. **Drawer changes** — Never block `openDrawer` on full hydrate; preserve preview seed semantics.
8. **Docs** — Behavior changes update Phase 1 or active sprint doc in the same PR.
9. **No silent scope creep** — Aggregate APIs, new caches, or nav class changes need architecture note + contract update.

---

## 13. Recommendation: next work

### Sprint closeout status

| Phase | Status |
|-------|--------|
| 0 Audit | Complete |
| 1 Contracts | Complete (budget sign-off pending baselines) |
| 2 Architecture | Complete |
| 3 Load paths | Implemented |
| 4 Drawer | Implemented |
| 5 Visual loading | Implemented |
| 6 Regression process | **This document** |

### Recommended next steps (pick one track)

**Track A — Sign-off and baselines (recommended before new feature work)**  
1. One staging session using §4–§6 (assign owner).  
2. File p75 numbers in §6 template (can live in PR comment or internal sheet).  
3. Mark Phase 1 §8 “team sign-off” complete when budgets are met or exceptions documented.

**Track B — Short follow-up sprint (only if baselines fail budgets)**  
- Scoped items: workspace growth rollup aggregate API (Phase 2 §3.7), dept KPI `cellCount` from cached placements, optional `[perf.drawer.tab]` tagging.  
- Still **no** navigation or URL-sync changes.

**Track C — Return to module / product work**  
- AdminV2 performance deep-dive is **closed for implementation** unless Track B exceptions apply.  
- Use §12 rules on any future AdminV2 PRs touching queue, drawer, or shell.

**Recommendation:** **Track A**, then **Track C**. Run Track B only where §6 snapshot shows a budget miss >20% or a P0 UX regression (first-click, dead rows, blocked shell).

---

## Validation (Phase 6)

Phase 6 is documentation-only. Confirm:

```bash
cd web && npx tsc --noEmit
# Regression matrix (§7)
```

No product behavior changes are required for Phase 6 closeout.

---

## Appendix — Sprint doc index

| Doc | Role |
|-----|------|
| `adminv2_performance_deep_dive_phase0_audit.md` | Evidence map |
| `adminv2_performance_phase1_navigation_and_interaction_contracts.md` | Doctrine + budgets |
| `adminv2_performance_phase2_load_path_architecture.md` | Load-path design + phase sequence |
| `adminv2_performance_phase5_visual_loading.md` | Phase 5 implementation summary |
| `adminv2_performance_phase6_regression_and_closeout.md` | **This doc** — regression + closeout |
