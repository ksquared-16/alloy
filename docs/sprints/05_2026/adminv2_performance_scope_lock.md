# AdminV2 Performance + Premium UX Sprint — Step 2 Scope Lock

**Date:** 2026-05-19 (dept runtime **closed** 2026-05-20)  
**Status:** Locked for execution — **Lane B `/dept` runtime is the canonical reference implementation** (work-unit replication next; drawer deferred)  
**Prior step:** Step 0 operational audit (conversation + [`adminv2_performance_rebuild_audit.md`](./adminv2_performance_rebuild_audit.md), [`adminv2_performance_deep_dive_phase0_audit.md`](./adminv2_performance_deep_dive_phase0_audit.md))

**Binding governance (must not regress):**
- [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md)
- [`adminv2_performance_phase2_load_path_architecture.md`](./adminv2_performance_phase2_load_path_architecture.md)
- Queue / record doctrine in active `docs/system/workspace-system.md`, `docs/system/record-system.md`

**Contract tests (required green before merge of any lane):**  
`adminV2NavigationContracts`, `adminV2QueueRowClick`, `adminV2WorkUnitLaneLocalState`, `adminV2DrawerLoadingCoherence`, `opportunityDrawerQueuePreviewSeed`, `adminV2LoadingGeometry` (extend only when adding stable-geometry contracts)

---

## 1. Executive sprint definition

**Sprint name:** AdminV2 Performance + Premium UX  
**Sprint type:** Operational UX / perceived performance — **not** capability expansion.

**Problem statement:** AdminV2 architecture (deduped fetches, session shell cache, staged drawer hydrate, queue preview doctrine) is largely sound. Operators still experience **too many visible load phases**, **structural morphing** (especially enrollment dept throughput), **drawer assembly beats**, and **inconsistent loading vocabulary**. Trust erodes when surfaces feel like they are “hydrating in public.”

**Sprint outcome:** On primary operator paths — workspace → dept → work unit → record drawer — the product feels **calm, immediate, stable, and authoritative**. Async work may continue in the background; **boundaries must not read as repeated reloads or layout rewrites**.

**Design north star:** **Stable surfaces, fewer visible phases, quiet loading, hidden async boundaries.** Prefer **anchored chrome** (frames, borders, fixed reserves) over **giant unresolved content panels** or large fake white placeholder regions.

**Implementation posture:** **Orchestration discipline** and **reveal discipline** inside existing modules — no new frameworks, no AdminV2 redesign, no schema work.

---

## 2. Explicit IN scope

### 2.1 Surfaces (primary)

| Surface | Path / component | In-scope work |
|---------|------------------|---------------|
| Workspace root | `/adminV2/workspace` | KPI/rollup **reveal** calmness; tile refinement without flicker; loading vocabulary alignment |
| Department | `/adminV2/workspace/dept/[departmentId]` | **CLOSED — canonical runtime reference:** shell-first, no root skeleton flash, oper-region reveal, single `operational-bootstrap`, bundled KPI + right rail, deferred P2 shell, nav-aware poll suppression, no duplicate queue/resolver work, synthesized KPI when summaries skipped — see Appendix closeout |
| Work unit | `.../work-unit/[workUnitId]` | Single-authority queue load; stale-state prevention; tab/badge stability; row refresh quietness |
| Record drawer | `AdminEntityDrawer` + `Drawer.tsx` | Open choreography; **stable chrome** load philosophy; opportunity-first premium path; reduce resize/shift |
| Shared workspace chrome | `WorkspaceChrome`, paired oper panels, quiet reserves, `workspace.css` | Geometry alignment; animation simplification; one loading vocabulary |

### 2.2 Behavioral themes (all in)

1. **Dept operational panel stabilization** — eliminate post-reveal throughput morph (WU rows ↔ pipeline lanes); one intentional panel shape per dept configuration.
2. **Work-unit queue loading consolidation** — one visible row-load authority per navigation; no stale lane flash from shell seed.
3. **Needs attention loading coherence** — paired with throughput under **one oper reveal**; no independent “recalculating” feel. Attention fetch may start in parallel with dept/work-unit GET (not after WU list returns).
4. **Workspace → dept nav prioritization (PERF-B-05)** — non-critical shell polls deferred via `scheduleAdminV2BackgroundWork`; entity labels server-hydrated in workspace layout; dept oper critical path unchanged.
4. **Drawer open choreography** — fewer visible beats; stable header/frame; defer secondary surfaces without giant body placeholders.
5. **Drawer loading philosophy** — compact reserves / chrome-led loading; **no** large fake white content deserts (per product direction).
6. **Skeleton / reserve alignment** — `loading.tsx`, session seed, and final layout share **one geometry family** (quiet anchored reserves, not mismatched row-skeleton → blank-box → content).
7. **KPI stabilization** — no `0 → real` or `— → digit` layout jump; strip appears once with stable cell geometry.
8. **Revisit behavior calmness** — shell instant + **single calm count phase** (scope-safe; may use stale-safe display rules, not necessarily persisting scope-sensitive totals in session).
9. **Animation simplification** — reduce stacked fades/pulses that amplify slowness; keep at most one subtle reveal per surface.
10. **Action placement consistency** — workspace/dept/WU/drawer header actions do not jump slots when data arrives (enrollment rail, drawer title rail).
11. **Async visibility reduction** — fewer `aria-busy` storms, spinners, and console/debug leakage on operator paths.
12. **Layout shift reduction** — fixed min-heights / grid slots from first paint through hydrate.

### 2.3 Engineering mechanisms (allowed)

- Adjust **when** UI reveals (gates), not **what** APIs own truth.
- Session shell cache **display policy** (what to show while revalidating) within scope-safety rules.
- `dedupeAdminFetch` / existing TTL helpers — no new cache layer.
- Extend **contract tests** for reveal stability and geometry.
- Perf instrumentation: capture/compare `[perf.*]` baselines; no permanent render-loop loggers.
- Shared geometry in `adminV2LoadingGeometry.ts` (extend, do not fork).

---

## 3. Explicit OUT of scope

### 3.1 Product / platform (forbidden this sprint)

| Out | Rationale |
|-----|-----------|
| New workspace features, queues, KPI types, drawer tabs, AI capabilities | Feature sprint |
| Schema / migration / RLS changes | Not required for perceived UX |
| Server-side combined rollup endpoint (workspace growth) | Optional future; client concurrency already exists |
| Replacing queue doctrine (previews vs rows vs summaries) | Frozen |
| Config-driven layout / record drawer composition redesign | Config system sprint |
| AdminV2 shell redesign, sidebar restructure, settings IA | Out of surface area |
| Uniform hard navigation everywhere | Phase 1 forbids without explicit decision |
| Work-unit queue tab URL sync after mount | Phase 1 regression source |
| New global load orchestrator / coordinator framework | Over-engineering risk |
| `AdminEntityDrawer` full rewrite or entity-split | Size fix via choreography only |
| AI command surface (`AICommandSurfaceShell`) feature or thread architecture work | Parallel product; only **non-regression** if drawer/shell touch shared z-index/dismiss |
| Settings hub soft-link → hard-link migration | Separate risk |
| Caching scope-sensitive queue totals in `sessionStorage` without signed product + security review | Documented stale-count incident |
| Childcare-only hardcoding in shared platform modules | Alloy doctrine |

### 3.2 Performance work explicitly deferred

- Raw latency optimization unrelated to visible phases (e.g. parallelizing `workspace/layout.tsx` server bundle) unless a change is **zero UI contract risk** and measured — **not** a default lane.
- Adjacent-lane prefetch tuning beyond cancel/token safety.
- Viewport link prefetch policy changes.
- Legacy dept queue sub-routes (`DepartmentQueueRouteShell`) removal.

### 3.3 “Done elsewhere” (do not duplicate)

- Phase 1 navigation matrix — **frozen**, cite compliance in PRs.
- Phase 5 visual pass (2026-05-19) — geometry helpers landed; this sprint **supersedes placeholder philosophy** where Phase 5 used large body skeletons → tighten to **stable chrome** direction below.

---

## 4. Implementation lanes

Lanes are **execution boundaries** for card grouping later — not task lists.

| Lane | ID | Owns | Primary files (indicative) |
|------|-----|------|----------------------------|
| **A — Loading vocabulary & geometry** | `LANE-A` | Single loading language: quiet reserves, compact pulses, shared heights; `loading.tsx` ↔ client seed alignment; animation budget | `adminV2LoadingGeometry.ts`, `WorkspaceQuietLoadingReserve.tsx`, `DepartmentPairedOperQueuesSkeleton.tsx`, `workspace.css`, route `loading.tsx` |
| **B — Dept oper console stability** | `LANE-B` | Throughput shape lock; paired reveal; pipeline vs WU presentation; attention bucket coherence; site-filter revisit UX | `dept/[departmentId]/page.tsx`, `resolveDeptPipelineExecSurface.ts`, paired oper components |
| **C — Work-unit queue discipline** | `LANE-C` | Fetch kick consolidation; stale queue clear on WU change; tab/badge/row refresh quietness; `workUnitQueueRevealReady` simplification | `work-unit/[workUnitId]/page.tsx`, `QueueBlock.tsx` |
| **D — Drawer premium choreography** | `LANE-D` | Opportunity open path: stable chrome, compact bootstrap, header/title rail stability, tab strip timing; reduce full-body placeholder; entity parity **documented** where not improved | `AdminEntityDrawer.tsx`, `Drawer.tsx`, `opportunityDrawerQueuePreviewSeed.ts` |
| **E — KPI & revisit calmness** | `LANE-E` | Dept/WU/root KPI strip phases; no false zeros; revisit revalidation messaging/continuity; workspace rollup refinement opacity | `resolver.ts`, `baseline.ts`, workspace/dept/WU pages |
| **F — Regression & baselines** | `LANE-F` | Contract tests; manual QA script; `[perf.*]` baseline capture; doc updates in same PRs | tests under `web/tests/admin/`, sprint docs |

**Lane dependency rule:** **A before B/C/D** (geometry vocabulary). **B and C** may parallelize after A. **D** starts after A (chrome tokens); may overlap C. **E** crosses B/C — integrate when each lane touches KPIs. **F** continuous.

---

## 5. Sequencing recommendations

### 5.1 Recommended build order

```text
0. Baseline capture (LANE-F) — staging [perf.*] for workspace, dept, WU, drawer open
1. LANE-A — Loading vocabulary & geometry lock (unblocks all UI)
2. LANE-B — Dept oper panel stability (highest operator ROI per audit)
3. LANE-C — Work-unit queue discipline
4. LANE-D — Drawer premium choreography (opportunity-first)
5. LANE-E — KPI & revisit calmness (cross-cutting sweep)
6. LANE-F — Closeout: full contract suite + manual QA matrix
```

### 5.2 Rationale

- **Dept before drawer:** Dept morph and multi-wave loading affect every enrollment operator session; drawer work is high value but narrower frequency per minute of desk time.
- **Geometry before morph fixes:** Prevents solving panel swap with another skeleton type.
- **WU after dept:** Shared patterns (reveal gates, quiet refresh) proven on dept first.
- **KPI sweep late:** Depends on stable oper/queue surfaces to avoid re-tuning strip twice.

### 5.3 PR slicing guidance

- One lane per PR where possible; max two lanes if tightly coupled (e.g. A+B for dept `loading.tsx` alignment).
- Each PR: contract tests green + doc touch if behavior contract changes.

---

## 6. Risk boundaries

| Risk | Boundary |
|------|----------|
| Navigation regression | No change to hard/soft/local matrix without Phase 1 doc + test updates |
| Drawer click capture | Backdrop stays `pointer-events-none`; outside mousedown dismiss preserved |
| Queue row dead clicks | `adminv2-ws-wu-queue-card-interactive` during refresh preserved |
| Scope-sensitive counts | Must not show org-wide cached totals under narrowed site filter |
| `open_record` ordering | Registry execute must not block drawer open |
| Drawer stack | `openDrawer` stack behavior unchanged |
| Work-unit URL | No `useSearchParams` / `scheduleWorkUnitLaneUrlSync` on work-unit page |
| Over-engineering stop line | If a fix requires >3 new refs/coordinators on a page, escalate — prefer gate consolidation |
| AdminEntityDrawer size | Choreography and conditional render only — no new abstraction layer |
| Phase 5 regression | Replacing compact skeletons with large body placeholders is **forbidden** |

**Escalation triggers (require explicit scope amendment):** new API endpoints, session cache policy change for numeric summaries, navigation class changes, drawer backdrop pointer-events change.

---

## 7. Acceptance criteria

### 7.1 Global (sprint exit)

- [ ] All Phase 1 contract tests pass; new reveal/geometry tests added for changed behavior.
- [ ] Manual QA matrix (§7.6) passed on staging with recorded `[perf.*]` samples.
- [ ] No new modules under `web/lib/**` except extensions to existing helpers (`adminV2LoadingGeometry`, perf log).
- [ ] Active sprint doc + audit doc updated when behavior contracts change.

### 7.2 Lane acceptance

**LANE-A — Loading vocabulary**
- [ ] Dept cold nav (`loading.tsx`) and cache revisit use **same oper-panel geometry family** (no row-skeleton → empty-panel → list mismatch).
- [ ] At most **one** animated loading indicator per workspace surface region (queue lane, KPI band, drawer body).
- [ ] Giant white content deserts **eliminated** on opportunity drawer bootstrap path (stable chrome or compact reserves only).

**LANE-B — Dept oper console**
- [ ] Enrollment (pipeline) dept: throughput panel **does not change row structure** after first oper reveal (lanes vs WU list decided before reveal, or single morph-free presentation).
- [ ] Needs Attention and throughput appear in **one oper reveal** — no attention-only second wave visible to operator.
- [ ] Dept revisit: names/titles instant; counts enter via **one** calm phase (no second full-panel skeleton swap).
- [ ] Site filter change: scoped refresh without layout collapse; no stale org-wide counts flash.

**LANE-C — Work-unit queue**
- [ ] Navigating A → B work unit never shows **A’s queue rows/summaries** after B shell seeds.
- [ ] At most **one visible** primary lane row-load cycle per navigation (background refresh indistinguishable from “refreshing” copy or subtle row state, not empty lane).
- [ ] Tab change: prior rows remain visible; badges may update quietly; no empty lane flash.
- [ ] Drawer open from row: preview seed title stable; no generic “Loading…” flash when preview exists.

**LANE-D — Drawer**
- [ ] Opportunity drawer open: header chrome stable on first frame; **≤2 operator-perceived beats** before overview readable (visible → overview; full hydrate not a third shell).
- [ ] No drawer body region >~30% viewport of blank placeholder during open on standard laptop viewport.
- [ ] Tab switch to comms/notes: localized loading inside tab, not whole-drawer resize.
- [ ] Non-opportunity entities: documented baseline; no regression vs current.

**LANE-E — KPI & revisit**
- [ ] No KPI cell shows `0` as operational truth before data loads (use `—`, empty reserve, or last-known-safe where approved).
- [ ] KPI strip does not change **cell count** after first stable render when placements known.
- [ ] Workspace growth tile refinement does not collapse card layout.

**LANE-F — Regression**
- [ ] `tsc`, contract tests, targeted vitest for touched files.
- [ ] Baseline table filed in sprint closeout section (timings optional but recommended).

### 7.3 Non-goals (not required for exit)

- Sub-100ms API times; server rollup endpoint; drawer rewrite; tab URL sync; settings nav unification.

### 7.4 Manual QA matrix (staging)

1. Sidebar → workspace → dept → work unit → open opportunity → close → back — each hop once; browser back works.  
2. Dept enrollment: oper panels appear once, stable shape; drill to WU with correct `?queue=` on first land only.  
3. Dept revisit (browser back): shell instant, single count phase.  
4. WU tab switch: no URL churn; rows stay visible.  
5. Drawer: sidebar/settings clickable; outside dismiss; no full-screen blocker.  
6. Site filter narrow: dept + WU counts match scope.  
7. Save opportunity in drawer: queue updates without emptying lane.

---

## 8. Success metrics

### 8.1 Operator perception (primary)

| Metric | Target |
|--------|--------|
| “Feels like it loaded twice” on dept land | Eliminated in enrollment QA scenarios |
| Throughput panel shape change after paint | **Zero** post-reveal morph |
| Wrong queue on WU navigation | **Zero** observed in QA matrix |
| Drawer open “empty white panel” | **Zero** on opportunity standard path |
| Loading indicator count per surface | ≤1 primary indicator per region |

### 8.2 Technical (secondary — baseline comparison)

Capture before/after on staging with `__WS_PERF_DEBUG__` or `[perf.*]`:

| Tag | Surface |
|-----|---------|
| `[perf.workspace.load]` | Root critical_deps, rollup_refined, kpi_placements_ready |
| `[perf.dept.load]` | shell_seed, shell_ready, summaries_ready, kpis_ready |
| `[perf.queue.rows]` | Work-unit primary lane |
| `[perf.drawer.full_hydrate]` / `drawer_visible_ready` | Drawer open |

**Success:** Median timings **not worse than baseline**; primary win is **phase count reduction** (fewer distinct `perf` phase emissions visible per single user action).

### 8.3 Quality gates

- Contract test count ≥ current; no skipped navigation tests.
- No new `console.warn` on hot paths in production builds (`pipeline-count-unify` gated or removed).

---

## 9. Suggested card grouping structure

High-level epics only — **cards created in Step 3**, not here.

| Epic | Lane | Summary |
|------|------|---------|
| **EPIC-A1** | A | Align route loaders + session seed to quiet reserve geometry |
| **EPIC-A2** | A | Animation budget + single vocabulary doc in sprint closeout |
| **EPIC-B1** | B | Dept throughput shape lock (pipeline vs WU before reveal) |
| **EPIC-B2** | B | Dept oper + attention single reveal gate |
| **EPIC-B3** | B | Dept revisit calm revalidation UX |
| **EPIC-C1** | C | WU navigation stale queue purge |
| **EPIC-C2** | C | WU single row-fetch authority + quiet refresh |
| **EPIC-C3** | C | WU queue picker/badge stability |
| **EPIC-D1** | D | Opportunity drawer stable chrome open |
| **EPIC-D2** | D | Drawer bootstrap body philosophy (compact / no giant panel) |
| **EPIC-D3** | D | Drawer secondary surfaces defer + tab-local load |
| **EPIC-E1** | E | KPI strip phase elimination (dept/WU/root) |
| **EPIC-E2** | E | Automation strip false-zero fix |
| **EPIC-E3** | E | Workspace rollup refinement calmness |
| **EPIC-F1** | F | Perf baseline capture + contract extensions |
| **EPIC-F2** | F | Sprint QA + doc closeout |

Optional **fast-follow bucket** (still out of sprint unless scope amended): server workspace rollup, settings nav alignment, non-opportunity drawer parity pass.

---

## 10. Areas requiring special caution

| Area | Caution |
|------|---------|
| **Enrollment pipeline dept** | `resolveDeptPipelineExecSurface` probes multiple WUs — do not reintroduce sequential probe waterfall; shape lock must not add more network |
| **Session dept cache** | Never hydrate scope-sensitive summary counts without explicit approval |
| **`refreshQueueSummaries(null, [])`** | Early summary fetch is intentional parallelism — fixing “double load” is **UI reveal**, not removing fetch |
| **`adminv2:opportunity-updated`** | Invalidation must keep queue truth; make refresh quiet, not remove listener |
| **Hard nav + RSC loading** | `loading.tsx` skeleton differs from client seed — align geometry, do not switch nav class |
| **AdminEntityDrawer** | Small conditional changes have wide blast radius — opportunity path first; test jobs/contacts for regression only |
| **Site filter** | Full effect re-run is correct for scope — UX must communicate refresh, not suppress fetch |
| **Queue row cache + stale refresh** | Background refresh is intentional — operator should not see empty lane |
| **Phase 5 skeleton helpers** | Revisit `DrawerOpportunityQueueBootstrapBodySkeleton` — shrink or replace with chrome-led pattern per new direction |
| **AI command bar z-index** | Drawer outside-click ignore selectors must remain |

---

## Appendix — Loading philosophy (locked)

**Prefer**
- Fixed chrome: drawer header, panel border, oper panel titles, queue lane frame.
- Compact reserves matching final layout grid.
- Last-known-safe display for revisits where scope allows (shell names; optional muted stale counts with revalidate indicator — product copy TBD in implementation).
- One reveal per surface; background refinement invisible or single subtle opacity transition.

**Avoid**
- Full-panel white skeleton blocks implying broken UI.
- Independent skeleton regions that resolve at different times in the same panel.
- Multiple pulse animations in one viewport.
- Structural list replacement after operator has scanned content.

**Queue doctrine (unchanged)**
- Summaries authoritative for counts; rows preview-only; drawer detail via entity APIs.
- `include_previews=false` on summary endpoints unless explicitly required.

---

## Appendix — Operational runtime hardening (phase 2, locked)

**Scope amendment (2026-05-19):** One **server** combined endpoint for dept oper critical path is allowed: `GET /api/admin/departments/[id]/operational-bootstrap`. No client orchestrator; legacy fan-out remains as fallback only.

### Settled `/dept` UX contract (do not regress)

1. Chrome / bridge shell first (`deptShellReady`).
2. Today's Focus + KPI quiet reserve independent of oper region.
3. **One** `DeptOperationalRegionLoader` inside paired Pipeline + Needs Attention.
4. Pipeline + Needs Attention reveal **together** when authoritative.
5. Never: blank oper bodies, `Total —` when oper/bootstrap data exists, wrong enrollment WU row, stale prior-dept content, full-page oper blocker.

### Request-priority philosophy

| Tier | When | Examples |
|------|------|----------|
| **P0 — dept bootstrap** | First network round trip after dept nav | `GET .../operational-bootstrap` — oper data + `kpi_placements` + `right_rail_actions` (one auth) |
| **P1 — shell chrome** | Same navigation, non-blocking oper reveal | Session dept shell cache, bridge layout; workspace page stays mounted (no `workspace/loading.tsx` flash) |
| **P2 — deferred** | `requestIdleCallback` / after nav settles | Sidebar tree, entity-labels refresh, verticals, AI capabilities, agent activity, operational tasks, unread count, workflow panels |
| **P3 — post-oper UI only** | After `deptOperationalRegionReady` | Show prefetched right-rail actions (no new fetch on happy path); legacy KPI placements fetch only if bootstrap omits `kpi_placements` |

### Runtime hardening rules

- **One auth bundle per HTTP request** — routes use `loadAdminRouteGate()` instead of duplicate `getAdminContext` + `getAdminAccessContext` entry calls.
- **One dept oper HTTP request from browser** when bootstrap succeeds — replaces 4–6 parallel admin API calls each paying ~300–600ms auth.
- **Shared DB reads inside bootstrap** — single work-units query feeds summaries (`workUnitIds`), attention (`workUnitRows`), and pipeline probe (`queue_definition` on row).
- **Pipeline probe server-side** — `resolveDeptPipelineExecSurfaceServer` calls `getWorkUnitQueueSummaries` directly; no client HTTP to `/work-units/:id` or `/queues` during dept nav.
- **No global auth cache** — React `cache()` remains request-scoped only; navigation-local reuse via bootstrap payload + existing `dedupeAdminFetch`.
- **Legacy fan-out** — retained in `dept/page.tsx` when bootstrap fails; must not change oper reveal gates.

### Navigation contention rules

- Sidebar `/departments` + all `/work-units` must not run in the first ~600ms of dept nav (`scheduleAdminV2BackgroundWork`).
- Background shell APIs must not share the same burst as P0 oper fetch.
- Entity labels: server-hydrate in workspace layout; client refresh deferred and TTL-bounded.
- **No `workspace/loading.tsx`** — that segment `loading.tsx` wrapped all nested routes and flashed `WorkspaceRootColdShell` on soft nav to dept. Workspace cold shell is **client-only** (`workspace/page.tsx` when `loading` and no session seed). Dept cold shell remains `dept/[departmentId]/loading.tsx` for hard refresh and dept segment Suspense.

### KPI strip data contract (dept closeout, locked)

- Bootstrap returns `kpi_placements: { items, scope_has_placements }` — **same shape** as `GET /api/admin/workspace-kpi-placements?surface=department`.
- Client sets `deptPlacementRows` from bootstrap before `deptTopSummaryReady`.
- When queue summaries are **skipped** for enrollment (`enrollment_pipeline` + `needs_attention`), client **synthesizes** `deptWorkUnitSummaries` from `attention` + `pipeline_surface` via `synthesizeDeptKpiWorkUnitSummaries` so Today's Focus metrics (`ctx.dept.*`, `dept.wu_queue.total_per_work_unit`) do not show `—`.
- Quiet reserve (`WorkspaceQuietKpiReserve`) only while `deptPlacementRows === undefined` (unresolved placements), not while summaries are empty.

### Right-rail actions contract (dept closeout, locked)

- Bootstrap optional query `right_rail_work_unit_id` (enrollment pipeline WU when known from cache).
- Response includes `right_rail_actions: ResolvedActionForClient[]` from server bundle (`loadRightRailActionsBundleServer` — one auth, three surfaces).
- Client stores in `enrollmentRightRailPrefetchRef`; applies at `deptOperationalRegionReady` without `fetchWorkspaceRightRailResolvedActions`.
- Fallback: single `GET /api/admin/actions/right-rail-bundle` (not three `?surface=` calls).

### Replication template for `/work-unit` (next sprint — copy `/dept` exactly)

**Posture:** `/work-unit` should **reuse `/dept` runtime patterns verbatim** where applicable. Smaller surface area → expect **equal or better** timings; do **not** invent a parallel client fan-out.

| Dept (locked reference) | Work-unit target |
|---------------|------------------|
| Workspace stable on nav | Parent layout stable; no segment `loading.tsx` that replaces active page |
| Dept shell + bridge immediate | WU shell + lane chrome immediate |
| `DeptOperationalRegionLoader` only in oper region | Queue-region loader only in oper region — not full page |
| `operational-bootstrap` one HTTP | `work-unit-operational-bootstrap` (or equivalent) — **one auth**, bundled oper payload |
| Bundled KPI + actions + queue data | Placements + rail actions + primary lane rows/summaries as needed |
| `resolveDeptNeedsAttentionWorkUnit` doctrine | On WU page: execution WU is usually **known** (`workUnitId`); still use queue-definition awareness for NA queue tab |
| `synthesizeDeptKpiWorkUnitSummaries` pattern | WU KPI synthesis from lane rows if summaries deferred |
| `[dept-bootstrap-perf]`-style phases | Add `work-unit-bootstrap-perf` with oper/queue/attention breakdown |
| Background shell deferred | Same P2 + nav suppression rules |
| No stale lane rows | Clear queue rows/buffers on WU id change (PERF-C) |
| No duplicate auth storms | Single `loadAdminRouteGate` per bootstrap request |
| Drawer | **Later** — inherit work-unit runtime doctrine; out of WU replication PR |

**Explicit non-goals for WU replication:** UX contract changes, drawer work, schema migrations, new global orchestrator.

### `/dept` canonical runtime reference (CLOSED 2026-05-20)

**`/adminV2/workspace/dept/[departmentId]` is the AdminV2 premium runtime reference implementation.** Work-unit replication should copy these patterns exactly; drawer inherits WU doctrine later.

| Pillar | Locked behavior |
|--------|-----------------|
| Navigation | Workspace parent stays mounted — **no** `workspace/loading.tsx` root skeleton flash on soft nav |
| Shell | `deptShellReady` bridge first; Today's Focus / KPI quiet reserve independent of oper region |
| Oper reveal | **One** `DeptOperationalRegionLoader`; pipeline + Needs Attention reveal **together** when authoritative |
| Network | **One** `GET …/operational-bootstrap` (P0); legacy fan-out fallback only |
| Bundling | `kpi_placements`, `right_rail_actions`, summaries + attention + `pipeline_surface` server-parallel under one auth |
| Dedup | No duplicate queue summary work for skipped enrollment WUs; **no duplicate resolver passes** on attention lane |
| KPI | `synthesizeDeptKpiWorkUnitSummaries` when summaries intentionally skipped |
| Background | P2 deferred via `scheduleAdminV2BackgroundWork`; entity labels server-hydrated; nav suppression ~600ms |
| Premium target | Calm, authoritative oper console — not multi-phase public hydration |

**Code anchors:** `loadDeptOperationalBootstrap.ts`, `loadDeptAttentionPreviewServer.ts`, `resolveDeptNeedsAttentionWorkUnit.ts`, `dept/[departmentId]/page.tsx`, `deptOperationalBootstrapPerf.ts`.

---

### Needs Attention execution work unit (architecture — locked)

**Critical learning:** Enrollment (and `pipeline_with_attention` depts) commonly model **`needs_attention` as a queue inside `enrollment_pipeline`**, not as a standalone work unit (`work_units.key === needs_attention`).

| Rule | Detail |
|------|--------|
| Resolver | **`resolveDeptNeedsAttentionWorkUnit`** — reads `queue_definition` on dept work units (bootstrap passes `queue_definition` on preloaded rows) |
| Order | (1) explicit `work_unit_id` if standalone NA WU or pipeline WU with NA queue; (2) standalone `needs_attention` WU; (3) pipeline WU preferring `enrollment_pipeline` with NA queue in definition |
| Happy path counts | **`buildWorkUnitScopedNeedsAttentionLaneBuckets`** on resolved execution WU id — same cap/resolver as `GET …/queues/{workUnitId}/needs_attention` |
| Response | `source: work_unit_needs_attention_lane`, `bucket_count_scope: work_unit_needs_attention_list_cap` |
| Fallback | **`department_attention_preview`** only when **no** queue-backed execution WU exists — org 500-row preview; **not** enrollment happy path |

**Do not** assume a standalone `needs_attention` work unit exists when wiring dept or work-unit attention.

---

### Needs Attention perf (dept bootstrap — doctrine-safe)

Dept **`attention_ms`** is dominated by **`loadOpportunityNeedsAttentionRows`** (SQL candidate OR + cap) + **`resolveOpportunityAttention`** per fetched row. Optimizations **must not** change qualification, bucket totals, or reason categories.

**Implemented (final /dept pass):**

- One resolver pass; bucket merge reads **`resolved_by_id`** via **`collectNeedsAttentionResolverMatches`** (no second resolve).
- Request-local **`createOpportunityAttentionResolverBatchContext`** (terminal keys, lifecycle rules, stale/tour day cuts once).
- **`resolver_minimal`** SELECT; **`skipPostFilterSort`** on dept lane (counts do not need queue list ordering).
- Single-pass bucket merge: precomputed reason-code **`Set`** per bucket; one reason-code set per inquiry.
- `[dept-bootstrap-perf]` breakdown: `attention_source`, `attention_rules_ms`, `attention_query_ms`, `attention_candidate_count`, `attention_resolver_ms`, `attention_membership_filter_ms`, `attention_bucket_merge_ms`.

**Log hygiene:** subtimings are stamped **only** when `attention.source === work_unit_needs_attention_lane`. Fallback `department_attention_preview` logs `attention_source` without query/resolver fields (not `undefined` noise). Check bootstrap JSON `attention.source` if server logs look wrong.

**Enrollment happy path:** canonical model has **`needs_attention` as a queue on `enrollment_pipeline`**, not a separate work unit. Resolver: **`resolveDeptNeedsAttentionWorkUnit`** (bootstrap passes `queue_definition` on work unit rows). If logs show `department_attention_preview`, the dept had no resolvable execution WU (missing/invalid `queue_definition` or wrong department).

**Interpret logs:** if `attention_query_ms` ≫ `attention_resolver_ms`, the bottleneck is **SQL** (wide `.or` on `opportunities`), not CPU. If `attention_resolver_ms` dominates with high `attention_candidate_count`, resolver cost scales with candidates (cap 5000).

**DB/index debt (propose separately — do not auto-migrate):**

Candidate fetch: `org_id` + `work_unit_id` + `.or(buildOpportunityNeedsAttentionCandidateOrExpr)` + `order(updated_at)` + `limit(5000)`.

| Recommendation | Rationale |
|----------------|-----------|
| `CREATE INDEX … ON opportunities (org_id, work_unit_id, updated_at)` | Base filter + sort for capped fetch |
| Partial: `(org_id, work_unit_id) WHERE customer_id IS NULL` | `customer_id.is.null` OR branch |
| Partial: `(org_id, work_unit_id) WHERE primary_person_id IS NULL OR primary_contact_id IS NULL` | Identity-missing branches |
| Expression / GIN on `(metadata->'enrollment_operational'->>'wait_bucket')` | Wait-bucket OR branches |
| Expression on `(metadata->>'next_follow_up_at')`, `(metadata->>'commitment_due_at')` | Commitment / follow-up branches |
| Partial: `(org_id, work_unit_id, updated_at) WHERE status_key = 'tour_scheduled'` + expression on `metadata->>'tour_date'` | Tour-date branch |
| Partial on `updated_at` / `created_at` for stale cuts | `updated_at.lt.*` / `created_at.lt.*` branches |

Validate with `EXPLAIN (ANALYZE, BUFFERS)` on the exact PostgREST-equivalent query before shipping indexes.

**Do not:** lower `NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP`, approximate bucket counts, or narrow SQL OR without resolver parity proof.

### Staging perf baseline (enrollment dept, post-closeout — 2026-05-20)

Observed `[dept-bootstrap-perf]` on enrollment happy path after WU resolution + resolver hardening (`attention_source: work_unit_needs_attention_lane`):

| Phase | ms (approx) |
|-------|-------------|
| `total_ms` | **~1110** |
| `loader_ms` | **~529** |
| `attention_ms` | **~264** |
| `attention_query_ms` | **~247** |
| `attention_resolver_ms` | **~7** |
| `attention_candidate_count` | **~141** |

**Interpretation:** Resolver CPU on dept lane is **effectively solved** (single pass + batch context). Remaining cost is **bounded hotspot optimization**, not architecture failure.

| Remaining hotspot tier | Examples (future / index debt only) |
|------------------------|-------------------------------------|
| Auth / context | `route_gate_ms`, `getAdminAuth` / bundle resolve per request |
| Pipeline | `pipeline_ms`, lane queue probes inside bootstrap |
| SQL / index | `attention_query_ms` when candidate count grows — see index table above |
| Shell / labels | Entity-label route overhead; P2 polls (already deferred) |

**No doctrine changes required** for these — measure, index, or reuse auth opportunistically in later sprints.

### Dept readiness — **LOCKED** (premium standard)

**`/dept` is locked** as the AdminV2 premium runtime template (staging: Today's Focus digits, single right-rail bundle on happy path, `work_unit_needs_attention_lane` + subtimings above). **Next:** replicate to **`/work-unit`** (smaller scope — generally faster); preserve shell-first + oper reveal + bootstrap bundling + nav suppression; drawer choreography remains Lane D / post-WU.

### AdminV2 runtime + drawer sprint closeout (2026-05-20)

**Status:** Closed — good enough for now. Full narrative: [`adminv2_drawer_performance_hardening_phase0.md`](./adminv2_drawer_performance_hardening_phase0.md#sprint-closeout-2026-05-20).

| Shipped | Notes |
|---------|--------|
| `/dept` canonical runtime | Locked premium template |
| `/work-unit` oper bootstrap | Shell-first + bundled bootstrap |
| Composed drawer open | Overlay until bootstrap + primary + full (or enrichment-held) + header actions |
| Intent prefetch | hover / mousedown / focus on queue rows |
| Request suppression | Pass 3 — no pre-reveal option/comms/tour storms |
| `adminv2-interactive-surface` | Subtle hover/press on dept tiles, oper queue cards, WU rows, rollup drills |

**Staging baselines (approx):** drawer bootstrap **680–790ms**; full **900–1100ms**; WU bootstrap **1.7–2.2s**; dept bootstrap **0.9–1.6s**.

**Doctrine:** no partial drawer; overlay → composed mount; no route-wide skeleton swap; queues = previews; bootstrap ≠ mutation truth.

**Future (non-blocking):** route_gate/auth slimming; full hydrate split; above-fold reshape cleanup; defer remaining option/status/tour/packet fetches; header prewarm by WU/entity type.

---

## Document control

| Step | Artifact |
|------|----------|
| Step 0 | Audit (complete) |
| **Step 2** | **This scope lock** |
| Step 3 | Cards from §9 epics (not started) |
| Implementation | Per lane PRs + Phase 1 compliance |

**Suggested commit message when landing this doc:**  
`docs: lock AdminV2 performance + premium UX sprint scope (step 2)`
