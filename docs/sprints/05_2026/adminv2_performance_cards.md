# AdminV2 Performance + Premium UX Sprint — Step 3 Card Breakdown

**Date:** 2026-05-19  
**Status:** Execution-ready (implementation not started)  
**Authority:** [`adminv2_performance_scope_lock.md`](./adminv2_performance_scope_lock.md)

**Card ID prefix:** `PERF-*`  
**Total cards:** 17 (16 implementation + 1 baseline-only)

---

## 1. Epic / card hierarchy

```
SPRINT: AdminV2 Performance + Premium UX
├── LANE F — Regression & baselines
│   └── PERF-F-00  Perf baselines capture (pre-implementation)
│   └── PERF-F-01  Contract test extensions (rolling)
│   └── PERF-F-02  Sprint closeout QA + baseline comparison
├── LANE A — Loading vocabulary & geometry
│   └── PERF-A-01  Shared geometry + loading vocabulary lock
│   └── PERF-A-02  Dept route loader ↔ client seed alignment
│   └── PERF-A-03  Work-unit route loader ↔ quiet lane alignment
│   └── PERF-A-04  Animation & pulse budget
├── LANE B — Dept operational stability
│   └── PERF-B-01  Throughput shape lock (pre-reveal)
│   └── PERF-B-02  Oper + attention unified reveal
│   └── PERF-B-03  Dept revisit & site-scope calm revalidation
├── LANE C — Work-unit queue discipline
│   └── PERF-C-01  WU identity stale queue purge
│   └── PERF-C-02  Primary lane single visible fetch cycle
│   └── PERF-C-03  Tab, badge, and row quiet transitions
├── LANE D — Drawer premium choreography
│   └── PERF-D-01  Opportunity drawer stable header chrome
│   └── PERF-D-02  Opportunity compact bootstrap body
│   └── PERF-D-03  Secondary surfaces + tab-local loading
└── LANE E — KPI & revisit calmness
    └── PERF-E-01  Dept + WU KPI strip phase stabilization
    └── PERF-E-02  Workspace root rollup + tile refinement calmness
    └── PERF-E-03  Automation strip false-zero elimination
```

---

## 2. Sequencing order (sprint execution)

| Order | Card | Lane |
|------:|------|------|
| 0 | PERF-F-00 | F |
| 1 | PERF-A-01 | A |
| 2 | PERF-A-02 | A |
| 3 | PERF-A-03 | A |
| 4 | PERF-A-04 | A |
| 5 | PERF-B-01 | B |
| 6 | PERF-B-02 | B |
| 7 | PERF-B-03 | B |
| 8 | PERF-C-01 | C |
| 9 | PERF-C-02 | C |
| 10 | PERF-C-03 | C |
| 11 | PERF-D-01 | D |
| 12 | PERF-D-02 | D |
| 13 | PERF-D-03 | D |
| 14 | PERF-E-01 | E |
| 15 | PERF-E-02 | E |
| 16 | PERF-E-03 | E |
| 17 | PERF-F-01 | F (parallel from order 5+) |
| 18 | PERF-F-02 | F |

---

## 3. Dependencies (DAG summary)

```text
PERF-F-00 → (all implementation cards reference baselines)
PERF-A-01 → PERF-A-02, PERF-A-03, PERF-A-04, PERF-D-01, PERF-D-02
PERF-A-02 → PERF-B-01, PERF-B-02, PERF-B-03
PERF-A-03 → PERF-C-01, PERF-C-02, PERF-C-03
PERF-B-01 → PERF-B-02
PERF-B-02 → PERF-B-03 (soft — revisit builds on stable oper reveal)
PERF-C-01 → PERF-C-02 → PERF-C-03
PERF-D-01 → PERF-D-02 → PERF-D-03
PERF-B-02, PERF-C-02 → PERF-E-01 (KPI gates assume stable oper/queue surfaces)
PERF-E-01 → PERF-E-02
PERF-A-04 ⊥ PERF-E-02 (soft — both touch workspace.css; sequence A-04 before E-02)
(all) → PERF-F-02
```

---

## 4. Batch together vs never batch

### Safe to batch (one PR)

| Batch | Cards | Rationale |
|-------|-------|-----------|
| **A-foundation** | A-01 + A-02 | Geometry constants used immediately by dept loaders |
| **A-WU-loaders** | A-03 + A-04 | WU `loading.tsx` + CSS pulse budget; low coupling |
| **B-dept-core** | B-01 + B-02 | Same page (`dept/page.tsx`); single reveal story |
| **D-drawer-open** | D-01 + D-02 | Same component region (header + bootstrap body) |
| **E-KPI-dept-wu** | E-01 + E-03 | KPI strip + automation zeros if both touch dept/WU shells only |
| **F-rolling** | F-01 tests alongside each lane PR | Extend contracts in the PR that changes behavior |

### Batch with caution (max 2 lanes, QA both paths)

| Batch | Cards | Condition |
|-------|-------|-----------|
| **B-revisit** | B-03 + E-01 | Only if revisit policy does not conflict with KPI strip gates — QA enrollment dept heavily |
| **C-discipline** | C-01 + C-02 | Same file; do if row-fetch changes are small and tested together |

### NEVER batch together

| Combination | Why |
|-------------|-----|
| **B-* + D-*** | Dept page + 13k-line drawer — blast radius, hard to bisect regressions |
| **C-* + D-*** | Queue fetch logic + drawer hydrate — confounds perf attribution |
| **Any card + navigation changes** | Phase 1 matrix — isolated PR only if nav must change (out of scope) |
| **B-03 + session numeric cache** | Scope lock forbids without amendment — do not sneak cache policy into revisit UX |
| **D-02 + unrelated entity tabs** | Opportunity-only bootstrap; jobs/contacts parity is separate QA, not same PR |
| **A-* + E-02** in one PR if both heavily edit `workspace/page.tsx` + CSS | Split for reviewability |
| **F-02 closeout + feature cards** | Closeout is verification-only PR |

---

## 5. High-risk cards

| Card | Risk level | Primary risk |
|------|------------|--------------|
| **PERF-B-01** | **High** | Wrong gate → oper panel never reveals or extra network for pipeline |
| **PERF-B-02** | **High** | Attention/throughput coupling → enrollment oper console blank or double reveal |
| **PERF-C-02** | **High** | Row-fetch authority → duplicate fetches, broken tab change, drawer open race |
| **PERF-D-02** | **High** | `AdminEntityDrawer` conditionals → inquiry overview flash or missing content |
| **PERF-D-01** | **Medium–High** | Header chrome / shell settled gates — title rail regression |
| **PERF-B-03** | **Medium** | Site-scope revisit — stale count display if policy wrong |
| **PERF-C-01** | **Medium** | Over-clearing queue state → empty lane on legitimate cache hit |

## 6. Fast validation cards

| Card | Why fast |
|------|----------|
| **PERF-F-00** | Doc + console capture only |
| **PERF-A-01** | Constants + tests; minimal runtime change |
| **PERF-A-04** | CSS-only pulse/fade reduction |
| **PERF-E-03** | Automation strip default KPI object — localized |
| **PERF-F-01** | Test-only increments per PR |

---

## 7. Recommended PR grouping

| PR # | Cards | Title (suggested) |
|------|-------|-------------------|
| PR-0 | F-00 | `docs: AdminV2 perf baselines (pre-sprint)` |
| PR-1 | A-01, A-02 | `perf(adminv2): loading geometry + dept loader alignment` |
| PR-2 | A-03, A-04 | `perf(adminv2): WU loader alignment + animation budget` |
| PR-3 | B-01, B-02 | `perf(adminv2): dept oper panel shape lock + unified reveal` |
| PR-4 | B-03 | `perf(adminv2): dept revisit calm revalidation` |
| PR-5 | C-01, C-02 | `perf(adminv2): WU stale queue purge + single lane fetch` |
| PR-6 | C-03 | `perf(adminv2): WU tab/badge quiet transitions` |
| PR-7 | D-01, D-02 | `perf(adminv2): opportunity drawer stable chrome open` |
| PR-8 | D-03 | `perf(adminv2): drawer tab-local secondary loading` |
| PR-9 | E-01, E-03 | `perf(adminv2): KPI strip + automation calm (dept/WU)` |
| PR-10 | E-02 | `perf(adminv2): workspace root rollup refinement calmness` |
| PR-11 | F-02 | `docs: AdminV2 perf sprint closeout + QA signoff` |

Adjust if team prefers smaller PRs: split PR-3, PR-5, PR-7.

---

## 8. Recommended QA flow

### Per-PR smoke (5–8 min)

1. Run contract test bundle (see card **F-01** list).
2. `npx tsc --noEmit` in `web/`.
3. One hop: sidebar → affected surface only.

### Lane QA (after PR-3, PR-6, PR-7)

| After PR | Focus |
|----------|-------|
| PR-2 (A complete) | Cold hard-nav to dept + WU: same reserve family, no row-skeleton → blank box swap |
| PR-3 (B core) | Enrollment dept: oper panels once, no lane list morph |
| PR-5–6 (C) | WU A→B nav, tab switch, drawer open from row |
| PR-7–8 (D) | Opportunity drawer open/close, comms tab, sidebar still clickable |

### Sprint exit (F-02) — full matrix

Execute scope lock §7.4 manual QA on **staging** with baselines table:

1. Full navigation chain + browser back  
2. Enrollment dept oper stability  
3. Dept revisit  
4. WU tab / URL stability  
5. Drawer dismiss + shell clicks  
6. Site filter scope  
7. Drawer save → queue refresh without empty lane  

Record `[perf.*]` phase **count** per action (before/after), not only ms.

---

## 9. Suggested sprint execution order (calendar-friendly)

**Week rhythm (example):**

- **Day 0:** F-00 baselines  
- **Days 1–2:** Lane A (PR-1, PR-2)  
- **Days 3–4:** Lane B (PR-3, PR-4) + F-01 tests in PR-3  
- **Days 5–6:** Lane C (PR-5, PR-6)  
- **Days 7–8:** Lane D (PR-7, PR-8)  
- **Day 9:** Lane E (PR-9, PR-10)  
- **Day 10:** F-02 closeout  

Lanes B and C can overlap **after A** if two implementers — do not start B before A-02 merges.

---

## 10. Card specifications

---

### PERF-F-00 — Perf baselines capture (pre-implementation)

| Field | Content |
|-------|---------|
| **Lane** | F |
| **Goal** | Record staging `[perf.*]` / `__WS_PERF_DEBUG__` phase timings and counts before code changes. |
| **Problem** | No objective before/after for “fewer visible phases” success metric. |
| **Files / surfaces** | None (runtime capture); append results to this doc or `adminv2_performance_scope_lock.md` closeout section. |
| **Constraints** | No code changes except optional dev-only doc table. |
| **Acceptance criteria** | Table exists for: workspace load, dept load (enrollment dept id noted), WU load, opportunity drawer open — each with phase tags observed. |
| **Regression risks** | None. |
| **Suggested tests** | None. |
| **Dependencies** | None (blocks nothing; referenced by all). |
| **Rollout** | Complete before PR-1 merges. |

---

### PERF-F-01 — Contract test extensions (rolling)

| Field | Content |
|-------|---------|
| **Lane** | F |
| **Goal** | Extend static/source contracts when reveal or geometry behavior changes. |
| **Problem** | Phase 1 tests do not cover all sprint outcomes (shape lock, stale WU purge). |
| **Files / surfaces** | `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts`, `adminV2LoadingGeometry.test.ts`, new snippets in lane PRs as needed. |
| **Constraints** | No runtime E2E required; prefer source-contract pattern used today. |
| **Acceptance criteria** | Each implementation PR adds or updates tests proving its gate; full bundle green. |
| **Regression risks** | Over-constraining implementation — tests assert outcomes, not internal ref names. |
| **Suggested tests** | `vitest run tests/admin/adminV2NavigationContracts.test.ts tests/admin/adminV2QueueRowClick.test.ts tests/admin/adminV2WorkUnitLaneLocalState.test.ts tests/admin/adminV2DrawerLoadingCoherence.test.ts tests/admin/opportunityDrawerQueuePreviewSeed.test.ts tests/admin/adminV2LoadingGeometry.test.ts` |
| **Dependencies** | Shipped incrementally with A–E cards. |
| **Rollout** | CI gate on every PR. |

---

### PERF-F-02 — Sprint closeout QA + baseline comparison

| Field | Content |
|-------|---------|
| **Lane** | F |
| **Goal** | Sign off sprint exit criteria; file before/after perf phase table. |
| **Problem** | Without closeout, partial lane merges ship without holistic operator validation. |
| **Files / surfaces** | Sprint docs; optional `adminv2_performance_phase6_regression_and_closeout.md` update. |
| **Constraints** | No new features; doc + QA evidence only. |
| **Acceptance criteria** | Scope lock §7.1 global checklist complete; §7.4 manual QA passed; phase count ≤ baseline or documented exception. |
| **Regression risks** | None (verification). |
| **Suggested tests** | Full contract bundle + `tsc`. |
| **Dependencies** | All PERF-A through PERF-E merged. |
| **Rollout** | Final PR; no further perf cards without new sprint. |

---

### PERF-A-01 — Shared geometry + loading vocabulary lock

| Field | Content |
|-------|---------|
| **Lane** | A |
| **Goal** | Centralize oper panel, KPI band, drawer body **height/row** tokens; document single loading vocabulary in sprint appendix. |
| **Problem** | `DepartmentPairedOperQueuesSkeleton` vs `DeptPairedOperQuietReserve` vs drawer bootstrap use divergent geometry. |
| **Files / surfaces** | `web/lib/ui-v2/adminV2LoadingGeometry.ts`, sprint doc appendix reference. |
| **Constraints** | Extend existing module only; no new loader framework. |
| **Acceptance criteria** | One exported geometry for dept oper quiet reserve height, paired panel min-height, drawer compact body max height; unit test asserts constants used by A-02+ targets. |
| **Regression risks** | Wrong min-heights → CLS or clipped content. |
| **Suggested tests** | `adminV2LoadingGeometry.test.ts` extensions. |
| **Dependencies** | F-00 optional first; blocks A-02, A-03, D-02. |
| **Rollout** | PR-1 first commit; safe alone. |

---

### PERF-A-02 — Dept route loader ↔ client seed alignment

| Field | Content |
|-------|---------|
| **Lane** | A |
| **Goal** | `dept/loading.tsx` and `DepartmentWorkspaceColdShell` use **same oper-panel geometry** as cache-seeded `DeptPairedOperQuietReserve`. |
| **Problem** | Hard nav shows row skeletons; revisit shows blank reserves — operators see two different dept loaders. |
| **Files / surfaces** | `dept/[departmentId]/loading.tsx`, `DepartmentWorkspaceColdShell.tsx`, `DepartmentPairedOperQueuesSkeleton.tsx` (demote or align), `WorkspaceQuietLoadingReserve.tsx`. |
| **Constraints** | Do not change dept data effects; visual only. |
| **Acceptance criteria** | Cold nav and seeded revisit use quiet paired reserve (or row skeleton **matching final row height** from A-01 — pick one, not both); contract test references shared constant. |
| **Regression risks** | Cold shell feels “less detailed” — acceptable per philosophy. |
| **Suggested tests** | Extend `adminV2DrawerLoadingCoherence` dept paired panel tests or new `adminV2DeptLoadingGeometry.test.ts`. |
| **Dependencies** | A-01. |
| **Rollout** | PR-1 with A-01. |

---

### PERF-A-03 — Work-unit route loader ↔ quiet lane alignment

| Field | Content |
|-------|---------|
| **Lane** | A |
| **Goal** | WU `loading.tsx` matches in-page `WorkspaceQuietQueueLaneReserve` geometry. |
| **Problem** | Route loader vs client blocking load use different queue lane chrome. |
| **Files / surfaces** | `work-unit/[workUnitId]/loading.tsx`, `WorkspaceQuietLoadingReserve.tsx`, WU page blocking branch. |
| **Constraints** | No change to `workUnitQueueRevealReady` logic in this card (C lane). |
| **Acceptance criteria** | Same min-height / shell class family for RSC loading and client `workUnitPageBlockingLoad`. |
| **Regression risks** | Taller reserve wastes space — tune via A-01 constants. |
| **Suggested tests** | Source contract on shared constant between loading.tsx and page. |
| **Dependencies** | A-01. |
| **Rollout** | PR-2 with A-04. |

---

### PERF-A-04 — Animation & pulse budget

| Field | Content |
|-------|---------|
| **Lane** | A |
| **Goal** | At most one subtle motion per workspace surface; remove stacked page fade + soft-reveal + pulse on same region. |
| **Problem** | `adminv2-ws-page-fade-in`, `adminv2-ws-soft-content-reveal`, `skeleton-pulse` stack reads as sluggish. |
| **Files / surfaces** | `web/app/adminV2/components/workspace/workspace.css`, selective removal of `adminv2-ws-soft-content-reveal` on oper panels if B-02 adds single reveal. |
| **Constraints** | Respect `prefers-reduced-motion` if already present; no new animations. |
| **Acceptance criteria** | Dept oper reveal uses ≤1 transition; WU queue tab badges not pulsing concurrently with lane reserve pulse. |
| **Regression risks** | UI feels flat — acceptable per stable > animated. |
| **Suggested tests** | CSS grep contract or snapshot of class list on dept throughput slot (light). |
| **Dependencies** | A-01; coordinate with B-02 (avoid re-adding reveal wrappers). |
| **Rollout** | PR-2; may need follow-up tweak after B-02. |

---

### PERF-B-01 — Throughput shape lock (pre-reveal)

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | Decide pipeline lanes vs WU throughput rows **before** `deptOperPanelsRevealReady` — zero post-reveal structural morph. |
| **Problem** | `showPipelineLanes` replaces WU list after `deptPipelineExecSurface` resolves — primary enrollment pain. |
| **Files / surfaces** | `dept/[departmentId]/page.tsx`, `resolveDeptPipelineExecSurface.ts` (gate only, no extra probes). |
| **Constraints** | Keep parallel pipeline resolution; no new API; enrollment_pipeline fast-path may use existing enroll detail in probe. |
| **Acceptance criteria** | Enrollment dept: first oper paint shows pipeline lanes OR stable WU rows — never switches row model after reveal; panel title stable. |
| **Regression risks** | Longer wait before oper reveal if gate waits on pipeline — mitigate with quiet reserve, not extra skeleton type. |
| **Suggested tests** | Source contract: `deptOperPanelsRevealReady` implies `showPipelineLanes`/`showWuThroughputRows` mutually exclusive and stable; no render path that maps WU rows then replaces with lanes after reveal flag true. |
| **Dependencies** | A-02. |
| **Rollout** | PR-3 core; **high-risk** — QA enrollment dept first. |

---

### PERF-B-02 — Oper + attention unified reveal

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | Single operator-visible oper phase: throughput + Needs Attention lists appear together. |
| **Problem** | `deptThroughputPanelReady` and `deptAttentionPanelReady` are independent — attention can feel like second load. |
| **Files / surfaces** | `dept/[departmentId]/page.tsx` (`deptOperPanelsRevealReady`, attention fetch timing). |
| **Constraints** | Do not remove `fetchDeptAttentionPreview` network call — adjust gates only; attention may start after WU list (unchanged fetch order OK if UI hidden until paired ready). |
| **Acceptance criteria** | No attention-only panel update after throughput visible; empty/error states still paired. |
| **Regression risks** | Slower oper reveal if attention slower than summaries — acceptable if reserve stable. |
| **Suggested tests** | Extend dept oper panel contract in `adminV2DrawerLoadingCoherence.test.ts`. |
| **Dependencies** | B-01. |
| **Rollout** | PR-3 with B-01. |

**PR-4.5 tighten (PERF-B-02):** `deptOperationalSurfaceReady` = throughput body + attention body + locked presentation; no `—` placeholder rows; attention empty only when `deptAttentionBuckets !== null`.

**PR-4.6+ (dept loading reset + oper-region loader):** Split readiness: `deptShellReady` / `deptTopSummaryReady` / `deptRailReady` / `deptOperationalRegionReady`. Bridge shell renders when shell ready; only paired oper region uses `DeptOperationalRegionLoader` until throughput+attention authoritative. Pipeline probe sets `deptPipelineExecLoading(true)` before WU commit; presentation may upgrade `wu_summaries` → `pipeline_lanes` before reveal; `enrollment_pipeline` excluded from WU summary rows.

#### Settled dept UX contract (do not regress)

| Phase | Operator sees |
|-------|----------------|
| 1 | Chrome / bridge shell quickly (`deptShellReady`) |
| 2 | Today's Focus quiet reserve → values (`deptTopSummaryReady`, independent of oper region) |
| 3 | Actions rail placeholder → actions (`deptRailReady`, **after** `deptOperationalRegionReady`) |
| 4 | `DeptOperationalRegionLoader` in paired oper region only |
| 5 | Pipeline / Work Unit Queue + Needs Attention reveal **together** when authoritative |

**Never:** blank oper panel bodies, `Total —`, wrong enrollment WU row, stale prior-dept content, full-page oper blocker.

**`deptOperationalRegionReady` only:** dept + work units resolved, pipeline probe settled, throughput presentation locked, throughput body ready, attention body ready (not KPI placements, not workflow summary, not right-rail actions).

---

### PERF-B-05 — Workspace → dept nav request prioritization

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | ~2× faster perceived workspace → dept by reducing request competition on the oper critical path. |
| **UX contract** | Unchanged — shell-first, oper-region loader, paired oper reveal (see settled contract under PERF-B-02). |
| **Deferred (idle / post-ready)** | Sidebar tree (`/departments` + all `/work-units`), entity-labels client refresh (server-hydrated first), verticals, AI capabilities (×2), agent activity strip, operational-tasks summary, communications unread-count, KPI placements (short fallback), right-rail actions (after oper region). |
| **Critical (dept oper)** | `dept` + scoped `work-units`, `work-unit-queue-summaries`, `opportunity-attention-preview`, pipeline probe, then oper-region reveal. |
| **Mechanisms** | `scheduleAdminV2BackgroundWork`, `dedupeAdminFetchWithTtl`, server `loadEntityLabelsMapForUser` in workspace layout. |
| **Files** | `adminV2DeferBackgroundWork.ts`, workspace layout, shell providers/components, `dept/page.tsx` (placement defer only). |

---

### PERF-B-04 — Dept oper-region critical path trim

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | Cut perceived oper-region wait ~50% without changing settled UX contract above. |
| **Changes** | Start `opportunity-attention-preview` + `work-unit-queue-summaries` **before** `Promise.all(dept, work-units)`; single shared `workspaceDataFetchInit()` per effect; extract `runDeptPipelineProbe`; defer `fetchWorkspaceRightRailResolvedActions` until `deptOperationalRegionReady`; actions TTL 8s via existing dedupe helper. |
| **Critical path (enrollment pipeline)** | `max(work-units, attention-preview, pipeline-probe)` — summaries **not** on oper reveal path when `pipeline_lanes`. |
| **Files** | `dept/[departmentId]/page.tsx`, `fetchWorkspaceRightRailResolvedActions.ts` (TTL only). |
| **Out** | Server auth dedupe, combined API, drawer/WU changes. |
| **Status** | Superseded for primary nav by **PERF-B-06**; keep parallel-start pattern in legacy fallback only. |

---

### PERF-B-06 — Dept operational runtime hardening (bootstrap)

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | Major step on workspace → dept: fewer HTTP round trips, one auth pass, no client pipeline HTTP fan-out. |
| **UX contract** | Unchanged (see PERF-B-02 settled contract). |
| **Before (browser)** | ~5–7 parallel requests × auth: dept, work-units, summaries, attention, pipeline probe (+ optional enroll WU GET + queue GET per candidate). |
| **After (browser)** | **1** `operational-bootstrap` request (+ deferred P2/P3). Server runs dept + WU list once; parallel summaries + attention + `resolveDeptPipelineExecSurfaceServer`. |
| **APIs** | `GET .../operational-bootstrap`; `loadAdminRouteGate`; `loadDeptOperationalBootstrap`; `getDepartmentWorkUnitQueueSummaries({ workUnitIds })`; legacy routes unchanged for refresh/fallback. |
| **Files** | `operational-bootstrap/route.ts`, `loadDeptOperationalBootstrap.ts`, `resolveDeptPipelineExecSurfaceServer.ts`, `loadDeptAttentionPreviewServer.ts`, `adminRouteGate.ts`, `dept/page.tsx`, `QueueService.ts`, `opportunity-attention-preview/route.ts` |
| **Tests** | `web/tests/workspace/deptOperationalBootstrap.test.ts` |
| **Perf phase** | `[perf.dept] bootstrap_ready` |
| **Next target** | Work-unit page: single bootstrap for queue summaries + primary lane rows. |

#### Critical-path diagram

```text
BEFORE (client):
  [auth] dept ─┐
  [auth] work-units ─┤ parallel storm
  [auth] summaries ─┤
  [auth] attention ─┤
  [auth] WU detail + [auth] queues … pipeline probe

AFTER (client):
  [auth] operational-bootstrap ──► apply dept + wu + summaries + attention + pipeline_surface
        + kpi_placements + right_rail_actions (server parallel)
  (idle) sidebar, labels, AI, tasks, workflow, …
  (UI) oper reveal uses prefetched rail; KPI strip uses placements + synthesized summaries
```

---

### PERF-B-07 — Dept closeout (KPI strip + template lock) — **DONE**

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | Lock `/dept` as canonical runtime template; fix Today's Focus `—` when bootstrap has oper data. |
| **Root cause of KPI `—`** | Enrollment bootstrap skips per-WU queue summaries; `resolveKpisForDepartment` still read `deptWorkUnitSummaries` → missing keys → `—`. |
| **Fix** | `synthesizeDeptKpiWorkUnitSummaries` merges attention `total` + pipeline lane counts into KPI summary map after bootstrap apply. |
| **Right rail** | `right_rail_actions` in bootstrap; `enrollmentRightRailPrefetchRef`; `GET /api/admin/actions/right-rail-bundle` fallback only. |
| **Docs** | `adminv2_performance_scope_lock.md` — dept closeout + work-unit replication table. |
| **Tests** | `synthesizeDeptKpiWorkUnitSummaries.test.ts`, navigation contracts. |
| **Ready for** | Work-unit replication sprint (no WU code in this card). |

---

### PERF-B-03 — Dept revisit & site-scope calm revalidation

| Field | Content |
|-------|---------|
| **Lane** | B |
| **Goal** | Cache revisit: instant shell + **one** count refresh phase; site filter change without org-wide stale flash. |
| **Problem** | `setDeptQueueSummariesLoading(true)` on every seed + summary refetch reads as second full load. |
| **Files / surfaces** | `dept/page.tsx`, `adminV2WorkspaceSessionCache.ts` (read policy only — **no numeric hydrate** unless scope amended). |
| **Constraints** | Scope-safe: no sessionStorage totals; UI may show muted “updating” on counts or keep prior cells with aria-busy on KPI region only. |
| **Acceptance criteria** | Back-nav to dept: no `DeptPairedOperQueuesSkeleton` if quiet reserve path; site filter: counts never show pre-filter org totals. |
| **Regression risks** | Displaying stale counts — must clear or mask when `selectedSiteId` changes. |
| **Suggested tests** | Contract on cache seed clearing summaries + loading flag; manual site filter in QA. |
| **Dependencies** | B-02; A-02. |
| **Rollout** | PR-4 alone for bisect. |

---

### PERF-C-01 — WU identity stale queue purge

| Field | Content |
|-------|---------|
| **Lane** | C |
| **Goal** | On `workUnitId` / `departmentId` change, clear queue summaries, rows, buffers even when session shell seeds WU metadata. |
| **Problem** | `preserveShell` skips clearing queue state — A’s rows flash on B. |
| **Files / surfaces** | `work-unit/[workUnitId]/page.tsx` (`useLayoutEffect`, bootstrap `preserveShell` branch). |
| **Constraints** | May keep dept/wu names from cache; must not show wrong queue keys. |
| **Acceptance criteria** | A→B navigation never renders A’s `selectedQueueKey` rows/summaries; cache hit still clears lane state before fetch. |
| **Regression risks** | Over-clearing causes flicker on same-WU remount — scope to id change only. |
| **Suggested tests** | New source contract: `preserveShell` path resets `queueSummaries`/`queueItems`/buffers when ids change. |
| **Dependencies** | A-03. |
| **Rollout** | PR-5 first half. |

---

### PERF-C-02 — Primary lane single visible fetch cycle

| Field | Content |
|-------|---------|
| **Lane** | C |
| **Goal** | One **visible** primary row-load per navigation; consolidate URL kick, `resolveNavTimeRowQueueKey`, and `deriveSelectedQueueKeyFromSummaries` into single authority. |
| **Problem** | Up to 3 `fetchQueueItems` kicks per land; operators see loading cycles. |
| **Files / surfaces** | `work-unit/page.tsx` bootstrap + `selectedQueueKey` effect; `fetchQueueItems` lease/sig. |
| **Constraints** | Keep `omit_total_count`, row cache, quiet stale refresh; no remove `adminv2:opportunity-updated` invalidation. |
| **Acceptance criteria** | Perf log or debug counter: ≤1 non-prefetch row fetch with UI loading state per navigation; tab change uses buffer + quiet refresh copy. |
| **Regression risks** | Wrong initial queue; drawer open before rows — test deep link `?queue=`. |
| **Suggested tests** | `adminV2WorkUnitLaneLocalState.test.ts` extended; manual `?queue=` QA. |
| **Dependencies** | C-01. |
| **Rollout** | PR-5 with C-01; **high-risk**. |

---

### PERF-C-03 — Tab, badge, and row quiet transitions

| Field | Content |
|-------|---------|
| **Lane** | C |
| **Goal** | Tab switch keeps prior rows visible; badge counts update without spinner storm; `QueueBlock` refresh subtle. |
| **Problem** | `queueItems` null during lane change; badge pulse reads as reload. |
| **Files / surfaces** | `work-unit/page.tsx`, `QueueBlock.tsx`, `workspace.css` (`adminv2-ws-wu-queue-card-interactive`). |
| **Constraints** | Preserve pointer-events on rows during refresh. |
| **Acceptance criteria** | Tab click: no empty lane; at most one pulse region (badges OR lane status text); row cards stay clickable. |
| **Regression risks** | Stale row content shown too long — acceptable vs empty flash. |
| **Suggested tests** | `adminV2QueueRowClick.test.ts`; `workUnitQueueCompactRowSkeleton` if skeleton still used. |
| **Dependencies** | C-02. |
| **Rollout** | PR-6. |

---

### PERF-D-01 — Opportunity drawer stable header chrome

| Field | Content |
|-------|---------|
| **Lane** | D |
| **Goal** | Header frame, title area, tab strip slot stable on first drawer frame; preview seed title without workflow chrome skeleton flicker. |
| **Problem** | `opportunityDrawerShellSettled` gates large header regions; title rail jumps when actions resolve. |
| **Files / surfaces** | `AdminEntityDrawer.tsx` (header, `opportunityDrawerShellSettled`, title rail). |
| **Constraints** | No backdrop/pointer-events changes; `opportunityHeaderActionsPending` stays decoupled from shell settled per existing tests. |
| **Acceptance criteria** | Open from queue row: stable title from seed; header height unchanged through `drawer_visible`; ≤2 perceived beats to readable overview (with D-02). |
| **Regression risks** | Jobs/contacts header regression — smoke only. |
| **Suggested tests** | `adminV2DrawerLoadingCoherence.test.ts` header blocks. |
| **Dependencies** | A-01 geometry for header reserves. |
| **Rollout** | PR-7 with D-02. |

---

### PERF-D-02 — Opportunity compact bootstrap body

| Field | Content |
|-------|---------|
| **Lane** | D |
| **Goal** | Replace giant `DrawerOpportunityQueueBootstrapBodySkeleton` white region with compact chrome-led reserve per A-01. |
| **Problem** | `opportunityDrawerPreOverviewShell` shows large fake panel — feels broken. |
| **Files / surfaces** | `AdminEntityDrawer.tsx`, drawer skeleton components, `adminV2LoadingGeometry.ts`. |
| **Constraints** | Keep `opportunityDrawerOverviewRevealReady` gate; no remove staged `full` hydrate. |
| **Acceptance criteria** | Bootstrap body ≤ geometry max height; no >~30% viewport blank on 1440×900; overview reveal still gated on full hydrate cancel. |
| **Regression risks** | **High** — inquiry layout clipped or double skeleton. |
| **Suggested tests** | Coherence tests for bootstrap body component; no reintroduce full-width `min-h` white blocks in source. |
| **Dependencies** | D-01, A-01. |
| **Rollout** | PR-7. |

---

### PERF-D-03 — Secondary surfaces + tab-local loading

| Field | Content |
|-------|---------|
| **Lane** | D |
| **Goal** | Communications/notes/related load inside tab content box; `opportunityDrawerSecondaryReady` does not resize whole drawer. |
| **Problem** | Secondary surfaces mount after 2 rAF — drawer body height jumps. |
| **Files / surfaces** | `AdminEntityDrawer.tsx`, `CommunicationsDrawerSection`, tab content wrappers. |
| **Constraints** | Tab-local spinners allowed; no whole-drawer loading shell on tab switch. |
| **Acceptance criteria** | Switch to Communications: drawer width/header stable; loading contained in tab panel. |
| **Regression risks** | Tab fetch on first visit slower — acceptable. |
| **Suggested tests** | Source contract on tab panel `min-height` reserve; manual comms tab QA. |
| **Dependencies** | D-02. |
| **Rollout** | PR-8 separate from D-01/02 for bisect. |

---

### PERF-E-01 — Dept + WU KPI strip phase stabilization

| Field | Content |
|-------|---------|
| **Lane** | E |
| **Goal** | KPI strip appears once with stable cell count; values use `—` or reserve until summaries+placements ready — no strip disappear/reappear. |
| **Problem** | `deptPlacementRows === undefined` → empty strip; `deptQueueSummariesLoading` → `—` then digits; WU `workUnitKpiStripPlaceholder` late. |
| **Files / surfaces** | `dept/page.tsx`, `work-unit/page.tsx`, `lib/kpi/resolver.ts`, `WorkUnitWorkspace.tsx`, `KpiStripSkeleton`. |
| **Constraints** | Do not change metric definitions. |
| **Acceptance criteria** | When placements known, skeleton cell count matches final strip; no empty `KPIBlock` flash between phases on dept. |
| **Regression risks** | Hiding KPIs too long — reserve must show. |
| **Suggested tests** | Resolver unit tests if value gating changes; coherence tests for `workUnitKpiMetricsPending`. |
| **Dependencies** | B-02, C-02 (stable oper/queue). |
| **Rollout** | PR-9. |

---

### PERF-E-02 — Workspace root rollup + tile refinement calmness

| Field | Content |
|-------|---------|
| **Lane** | E |
| **Goal** | Workspace dept tiles and KPI crossfade refine without layout collapse; `workspaceRollupRefined` opacity-only. |
| **Problem** | Quick → refined rollup changes tile stats after first paint. |
| **Files / surfaces** | `workspace/page.tsx`, `WorkspaceRootDepartmentGrid.tsx`, `workspace.css` (`adminv2-ws-kpi-orient-crossfade`). |
| **Constraints** | No server rollup API; client concurrency unchanged. |
| **Acceptance criteria** | Tile grid geometry stable; KPI strip uses crossfade not empty→strip swap when session seed present. |
| **Regression risks** | Growth dept tiles show wrong interim numbers — use `—` or seed policy. |
| **Suggested tests** | Light source contract on crossfade layers; manual workspace load. |
| **Dependencies** | A-04; E-01 patterns. |
| **Rollout** | PR-10 alone. |

---

### PERF-E-03 — Automation strip false-zero elimination

| Field | Content |
|-------|---------|
| **Lane** | E |
| **Goal** | Automation KPI strip never shows `0` as operational truth before fetch completes. |
| **Problem** | `DEFAULT_WF_KPIS` with zeros in cold shells and dept page before idle workflow load. |
| **Files / surfaces** | `DepartmentWorkspaceColdShell.tsx`, `dept/page.tsx`, `work-unit/page.tsx`, `AutomationWorkflowsBlock.tsx`. |
| **Constraints** | Non-fatal workflow errors still silent. |
| **Acceptance criteria** | Before `workflowKpisLoading` false, display `—` or skeleton cells, not `0` runs/failures. |
| **Regression risks** | Low. |
| **Suggested tests** | Props contract on `AutomationWorkflowsBlock` when `kpisLoading`. |
| **Dependencies** | Can ship with E-01 in PR-9. |
| **Rollout** | PR-9. |

---

## Document control

| Step | Artifact |
|------|----------|
| Step 2 | Scope lock |
| **Step 3** | **This card breakdown** |
| Step 4+ | Implementation per PR groups above |

**Suggested commit message:** `docs: AdminV2 perf sprint card breakdown (step 3)`
