# AdminV2 Performance Sprint 2 — Bootstrap Speed + Admin Context Tax

**Date:** 2026-05-22  
**Status:** Card 2 complete — **WU bootstrap parallelization**  
**Predecessor:** [`adminv2_platform_navigation_performance_sprint.md`](./adminv2_platform_navigation_performance_sprint.md) (navigation/loading UX — closed pending staging QA)  
**Scope:** Server bootstrap latency, admin auth/context tax, duplicate background API calls — **not** visual loading UX  

**Hard constraints (carry forward):**

- No drawer behavior changes
- No QueueService truth semantic changes
- No auth/RLS bypass
- No stale permission bugs
- No dept → WU navigation softening
- No visual polish sprint (trivial dept loader color match to WU is OK)

---

## 1. Staging evidence (baseline)

### Work-unit `operational-bootstrap` (~1.5–1.6s total)

| Phase (logged) | Observed ms | Share of total |
|----------------|------------:|---------------:|
| `total_ms` | 1543–1596 | 100% |
| `route_gate_ms` | ~345 | ~22% |
| `loader_ms` | 1075–1152 | ~68% |
| `queue_summaries_ms` | 257–274 | (serial inside loader) |
| `attention_ms` | 232–242 | (serial inside loader) |
| `primary_lane_rows_ms` | 455–537 | (serial inside loader; **largest**) |
| `right_rail_actions_ms` | 133–137 | (parallel with loader wall-clock) |

`kpi_placements_ms` not cited in staging snippet but route runs it in parallel with `loadWorkUnitOperationalBootstrap` — typically **not** on loader critical path unless it exceeds bootstrap serial chain.

### Background / header APIs

| Endpoint | Dominant cost | Observed |
|----------|---------------|----------|
| `GET /api/admin/operational-tasks?scope=workspace&summary=true` | `getAdminAuth` | ~478–538ms |
| `GET /api/admin/communications/unread-count` | `getAdminAuth` | ~437ms |
| `GET /api/admin/workflows/summary` | `require_admin_ms` + `get_admin_context_ms` + queries | total ~1042ms; auth/context ~439ms + ~393ms |

---

## 2. Audit answers

### 2.1 Why does admin context cost ~400–500ms repeatedly?

**Confirmed:** Each browser `fetch()` to an admin API route is a **new HTTP request**. React `cache()` in `getAdminAuthCached` / `getAdminContextCached` / `loadAdminAccessBundleCached` is **request-scoped only** — it does not cross requests.

**Per-request cost stack:**

1. **Session resolution** — `getCachedAuthUser()` (used by `getAdminAuth`) always calls `supabase.auth.getUser()` ([`cachedAuthSession.ts`](../../../web/lib/admin/cachedAuthSession.ts)). `getCachedAuthUserId()` (used by the access bundle) tries `getClaims()` first, then `getUser()`. These are **separate** `cache()` wrappers, so a route that calls **both** `requireAdminOrOps()` and `getAdminContextCached()` can still pay **two auth round-trips** when the claims fast path misses.

2. **Access bundle** — `resolveAdminAccessCore()` ([`resolveAdminAccessCore.ts`](../../../web/lib/admin/resolveAdminAccessCore.ts)) sequentially loads:
   - `user_roles` (all org memberships)
   - optional legacy `user_profiles` / `app_users` fallback
   - `role_permission_grants` for all role keys
   - `user_access_profiles` (department/site scope mode)
   - conditional `user_department_access` / `user_site_access` when restricted

3. **Double gate on many routes** — Pattern repeated on operational-tasks, unread-count, workflows/summary, workflow-runs:
   ```text
   requireAdminOrOps()  → getAdminAuth() → getCachedAuthUser + loadAdminAccessBundleCached
   getAdminContextCached() → loadAdminAccessBundleCached (bundle cache-hit, auth user may not)
   ```
   Bundle resolves once per request, but **full User fetch + redundant portal check** often still runs first.

4. **Workspace RSC layout** — [`workspace/layout.tsx`](../../../web/app/adminV2/workspace/layout.tsx) calls `getAdminAuth()` then `getAdminAccessContextCached()` on every layout render (hard nav reload tax amplifies this).

**Suspected:** Supabase Auth latency + 4–6 DB round-trips in `resolveAdminAccessCore` dominate; not CPU-bound JS.

---

### 2.2 Are we resolving the same org/user/roles/access bundle on every small API call?

**Yes — confirmed** for endpoints that use `requireAdminOrOps` + `getAdminContextCached` or `loadAdminRouteGate` (which uses `getAdminAccessContextCached` only — better, but still full bundle every request).

**Partial dedupe within a single request:** `loadAdminAccessBundleOnce` is shared by auth and context helpers.

**No cross-request dedupe today** for org/roles/permissions.

---

### 2.3 Can request-level or short-lived server cache safely reduce this?

| Approach | Safety | Notes |
|----------|--------|-------|
| Request-scoped (existing) | ✅ | Already used; insufficient across parallel client fetches |
| Unify gates (`loadAdminRouteGate` only) | ✅ | Removes double `getAdminAuth` + `getAdminContext` pattern |
| Single auth user resolution (`getCachedAuthUserId` only) | ✅ | Align `getAdminAuth` to derive from user id when full `User` not needed |
| Short TTL cache (userId → bundle, 30–60s) | ⚠️ | Must invalidate on role/scope changes; document risk; optional feature flag |
| Embed org_id in JWT / session claims | ⚠️ | Larger product change; claims path exists but not used for org |

**Do not:** cache across users, skip permission checks on mutating routes, or reuse bundle across org switches without fingerprint invalidation.

---

### 2.4 Can header/sidebar polling APIs use lighter auth/context paths?

**Yes — confirmed opportunity.**

| Endpoint | Needs full bundle? | Lighter path |
|----------|-------------------|--------------|
| `operational-tasks?summary=true` | orgId + portalEligible only | `loadAdminRouteGate` or `getAdminPortalContext` → orgId; no `User` object |
| `communications/unread-count` | orgId + userId | Same; body only scans messages + reads |
| `workflows/summary` (badge/KPI) | orgId | Gate + org scoped queries; variant=workspace already parallelizes DB |
| `workflow-runs?list=kpis` | orgId + operational TZ | Gate; avoid second context call |
| AI `*/capabilities` | orgId + permission subset | Gate + targeted permission check vs full grant list |

**Client-side:** [`OperationalTasksNavBadge.tsx`](../../../web/app/adminV2/components/OperationalTasksNavBadge.tsx) already skips fetch when `isAdminV2OperNavigationActive(10_000)` — extend pattern to other pollers.

---

### 2.5 Why is WU `loader_ms` over 1s?

**Confirmed: serial critical path inside `loadWorkUnitOperationalBootstrap`** ([`loadWorkUnitOperationalBootstrap.ts`](../../../web/lib/workspace/loadWorkUnitOperationalBootstrap.ts)):

```text
dept + wu fetch (parallel)     ~small
→ buildQueueSummariesSharedBootstrap   (in route, before loader — shared_bootstrap_ms)
→ getWorkUnitQueueSummaries           queue_summaries_ms ~260ms
→ loadOpportunityNeedsAttentionRows   attention_ms ~235ms  (if NA lane in definition)
→ buildWorkUnitScopedNeedsAttentionLaneBuckets (included in attention_ms)
→ getWorkUnitQueueItems (primary lane) primary_lane_rows_ms ~455–537ms
```

**Dept bootstrap contrast:** [`loadDeptOperationalBootstrap.ts`](../../../web/lib/workspace/loadDeptOperationalBootstrap.ts) already runs **summaries ∥ attention ∥ pipeline** after shared bootstrap (`Promise.all`).

**Route-level:** [`operational-bootstrap/route.ts`](../../../web/app/api/admin/work-units/[id]/operational-bootstrap/route.ts) already parallelizes **KPI placements** and **right rail** with the bootstrap loader promise — good; they do not explain `loader_ms` wall clock unless bootstrap serial chain is longer than those (~133ms).

**`primary_lane_rows_ms` is the largest single phase** — full queue row fetch for first lane (limit 20) before response.

---

### 2.6 Can bootstrap sub-phases run more parallel?

| Phase | WU today | Parallelizable? | Dependency |
|-------|----------|-----------------|------------|
| `shared_bootstrap` | Before loader | Already once per request | opportunity status defs + operational day |
| `queue_summaries` | Serial step 1 | — | Needs WU row |
| `attention` | Serial step 2 | **Yes — with summaries** | Needs WU row + sharedBootstrap; does **not** need summaries result |
| `primary_lane` | Serial step 3 | Partially | Needs `primaryQueueKey` from summaries (+ attention preload for NA lane) |
| `kpi_placements` | ∥ in route | Already parallel | Independent |
| `right_rail_actions` | ∥ in route | Already parallel | Independent |

**Estimated savings (WU):** parallel `summaries ∥ attention` → ~**220–240ms** off loader when attention path runs (min of the two, not sum).

**Dept:** further gains likely from route_gate + WU concurrency on summaries, not from oper parallelization (already parallel).

---

### 2.7 First useful render vs deferrable (WU bootstrap payload)

| Field | Classification | Rationale |
|-------|----------------|-----------|
| `department`, `work_unit` | **Blocking / core** | Shell identity, breadcrumb, lane definition |
| `queue.summaries` | **Blocking / core** | Tab strip, counts, lane selection |
| `queue.primary_lane` (rows) | **Blocking today** / **defer candidate** | Shell-first UX can show lane reserve; rows currently gate `wuQueueLaneAuthorityReady` — deferring saves ~450ms but needs client contract check |
| `queue.attention` (buckets) | **Secondary** | Required only when NA lane active or NA tab selected |
| `kpi_placements` | **Secondary** | Already has quiet reserve on client; in bootstrap for parity |
| `right_rail_actions` | **Secondary / defer** | Rail placeholder exists; enrollment merge can lag |
| `runtime.deferred` list in route | **Documented intent** | Already lists workflow_kpis, unread_count, etc. — good reference for Card 3 |

**Dept bootstrap:** `pipeline_surface`, full `summaries` for all WUs, and `attention` are oper-critical for dept throughput UI; trimming is harder than WU without product tradeoffs.

---

## 3. Design targets

| Metric | Target | Acceptable | Current (staging) |
|--------|--------|------------|-------------------|
| WU `operational-bootstrap` `total_ms` | **< 700ms** | < 1000ms | ~1543–1596ms |
| WU `loader_ms` | **< 500ms** | < 700ms | ~1075–1152ms |
| WU `route_gate_ms` | **< 150ms** | < 250ms | ~345ms |
| Header/background read APIs (auth + handler) | **< 200ms** | < 350ms | ~437–538ms auth alone |
| `workflows/summary` total | **< 400ms** | < 700ms | ~1042ms |
| Admin context per **light** endpoint | **1 auth + 1 bundle max** | — | Often 2 auth paths |

---

## 4. Bottleneck table (confirmed vs suspected)

| ID | Bottleneck | Status | Impact | Primary location |
|----|------------|--------|--------|------------------|
| B1 | WU bootstrap serial: summaries → attention → primary rows | **Confirmed** | ~950ms+ serial | `loadWorkUnitOperationalBootstrap.ts` |
| B2 | `primary_lane_rows_ms` dominates loader | **Confirmed** | ~455–537ms | `getWorkUnitQueueItems` in bootstrap |
| B3 | `route_gate_ms` full access bundle every bootstrap | **Confirmed** | ~345ms | `loadAdminRouteGate` → `resolveAdminAccessCore` |
| B4 | Double auth: `requireAdminOrOps` + `getAdminContextCached` | **Confirmed** | ~400–500ms on small APIs | Multiple `app/api/admin/*` routes |
| B5 | `getCachedAuthUser` vs `getCachedAuthUserId` split | **Confirmed** | Extra `getUser()` when both paths run | `adminAuth.ts`, `cachedAuthSession.ts` |
| B6 | No cross-request bundle cache | **Confirmed** | Every parallel client poll repeats bundle | All admin API routes |
| B7 | `resolveAdminAccessCore` multi-query scope load | **Confirmed** | Baseline bundle cost | `resolveAdminAccessCore.ts` |
| B8 | `workflows/summary` heavy queries + failed_action lookup | **Confirmed** | ~600ms+ after auth | `workflows/summary/route.ts` |
| B9 | Workspace layout double auth on hard nav | **Confirmed** | Adds to reload tax | `workspace/layout.tsx` |
| B10 | Dept oper bootstrap already parallel | **Confirmed (good)** | Lower hanging fruit than WU | `loadDeptOperationalBootstrap.ts` |
| B11 | Background workflow panels after dept/WU load | **Confirmed** | Extra summary + workflow-runs | `fetchWorkflowAutomationWorkspacePanels.ts` |
| B12 | AI capabilities fetch on command surface mount | **Suspected** | Spikes when AI panel opens | `AICommandSurfaceShell.tsx` |
| B13 | `unread-count` 300-message scan | **Suspected** | DB after auth | `communications/unread-count/route.ts` |
| B14 | Cross-request cache / JWT org claim | **Suspected fix** | High leverage if safe | New in Card 1 |

---

## 5. Proposed implementation cards

| Card | Title | Goal | Depends on |
|------|-------|------|------------|
| **0** | Audit + timing map | **This document** | — |
| **1** | Admin context fast path | ✅ **Done** — see [Card 1 closeout](#card-1-closeout--admin-context-fast-path) |
| **2** | WU bootstrap parallelization | ✅ **Done** — see [Card 2 closeout](#card-2-closeout--wu-bootstrap-parallelization) |
| **3** | First-render bootstrap trimming | Move `primary_lane` / optional `attention` / `right_rail` out of blocking JSON when shell-first client allows | 2 |
| **4** | Duplicate background API cleanup | Stagger/defer polls; dedupe client fetches; respect `isAdminV2OperNavigationActive`; avoid workflow summary during transition | 1 |
| **5** | Verification | Phase timing tests; staging log comparison; no UX/nav regressions | 1–4 |

**Recommended fix order:** **1 → 2 → 4 → 3 → 5**  
(Card 3 highest product risk; Card 1 reduces noise on every page including bootstrap gate.)

---

## 6. Files likely to change (implementation phase)

| Area | Paths |
|------|-------|
| Admin auth/context | `web/lib/adminAuth.ts`, `web/lib/admin/getAdminContext.ts`, `web/lib/admin/getAdminAccessContext.ts`, `web/lib/admin/cachedAuthSession.ts`, `web/lib/admin/resolveAdminAccessCore.ts`, **new** `web/lib/admin/adminPortalGate.ts` (or extend `adminRouteGate.ts`) |
| Light API routes | `web/app/api/admin/operational-tasks/route.ts`, `communications/unread-count/route.ts`, `workflows/summary/route.ts`, `workflow-runs/route.ts`, `web/app/api/admin/ai/**/capabilities/**` |
| WU bootstrap | `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`, `web/app/api/admin/work-units/[id]/operational-bootstrap/route.ts` |
| Dept bootstrap | `web/app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts` (gate only unless dept timings bad) |
| Client background | `OperationalTasksNavBadge.tsx`, `fetchWorkflowAutomationWorkspacePanels.ts`, `AICommandSurfaceShell.tsx`, `AdminV2Shell.tsx` / `TopNavBar.tsx` |
| Layout | `web/app/adminV2/workspace/layout.tsx` |
| Perf logging | `workUnitOperationalBootstrapPerf.ts`, `deptOperationalBootstrapPerf.ts`, `[admin-context-perf]`, `[admin-timing]` |
| Tests | `web/tests/admin/*`, `web/tests/workspace/*OperationalBootstrap*`, new `adminContextFastPath.test.ts` |
| Docs | This file (closeout sections per card) |

**Not in scope:** `AdminEntityDrawer.tsx`, `QueueService` queue semantics, navigation transition code from Sprint 1.

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Stale permissions with TTL bundle cache | Short TTL; fingerprint includes role/scope version if available; opt-in flag |
| Trimming bootstrap breaks shell-first authority gate | Card 3 gated on client `wuQueueLaneAuthorityReady` contract tests |
| Parallel attention + summaries race on shared mutable state | Read-only shared bootstrap; no shared mutable perf objects across tasks |
| Lighter gate accidentally allows non-portal users | Keep `portalEligible` check; test 401/403 |
| Deferring primary lane causes empty lane flash | Keep row reserve; align with Sprint 1 geometry tests |
| Dept/WU workflow panel defer breaks automation block | Defer only during `isAdminV2OperNavigationActive` window |
| Regression in `requireAdmin` mutate routes | Card 1 limited to read/summary endpoints first |

---

## 8. Verification plan (Card 5 preview)

**Logs**

- `[wu-bootstrap-perf]` — `total_ms`, `route_gate_ms`, `loader_ms`, phase keys
- `[admin-context-perf]`, `[admin-context]`, `[admin-timing]`
- **New:** `[adminv2-legacy-fan-out]` should stay absent on happy path
- **New (proposed):** `[admin-portal-gate-perf]` for light endpoints

**Staging comparison**

- Capture 10 WU navigations before/after: p50/p95 `total_ms`, `loader_ms`, `primary_lane_rows_ms`
- Capture parallel poll burst on workspace idle: operational-tasks, unread-count, workflows/summary
- Confirm `get_admin_context_ms` ≈ 0 when only light gate used

**Tests (must stay green)**

- `workUnitOperationalBootstrap.test.ts`, `deptOperationalBootstrap.test.ts`
- `adminV2PlatformSprintCloseout.test.ts`, `adminV2WorkUnitShellFirstLoading.test.ts`
- `adminV2NavigationContracts.test.ts`, `adminV2QueueRowClick.test.ts`

---

## 9. Explicit stop point (Card 0 — superseded)

Card 0 audit complete. **Cards 1–2 implemented.** Next: **Card 3 — first-render bootstrap trimming** (optional) or **Card 4 — background API cleanup**.

---

## Card 2 — Dependency audit (pre-implementation)

| Phase | Depends on | Independent? |
|-------|------------|--------------|
| dept + WU fetch | `departmentId`, `workUnitId`, `orgId` | Parallel with each other (unchanged) |
| `queue_summaries` | WU row (`preloadedQueueDefinition`), `sharedBootstrap`, scope | **Yes** — after WU row |
| `attention` | WU row, dept metadata, `sharedBootstrap`, `naExecution` | **Yes** — does not read summaries result |
| `primary_lane_rows` | `summariesResult.queues` (for `primaryQueueKey`) | After parallel block |
| `primary_lane` + NA | `preloadedAttention` from attention path | Only when `primaryQueueKey === needs_attention` |

**Shared state:** `sharedBootstrap` and WU/dept rows are read-only inputs; `attentionResolverPasses` is incremented only in attention task (no cross-write with summaries).

**NA attention:** Runs only when `naExecution && workUnitDefinesNeedsAttentionQueue(queueDefinition)`; otherwise `attentionP` resolves immediately with `attention_ms: 0`.

---

## Card 2 closeout — WU bootstrap parallelization

**Date:** 2026-05-22  
**Status:** Complete — response contract unchanged.

### Loader sequence

| Before | After |
|--------|-------|
| summaries → attention → primary_lane | **(summaries ∥ attention)** → primary_lane |

### Files changed

| File | Purpose |
|------|---------|
| `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts` | Parallel `summariesP` + `attentionP`; extracted `loadWorkUnitBootstrapAttention` |
| `web/lib/workspace/workUnitOperationalBootstrapPerf.ts` | `summaries_attention_parallel_ms`, `primary_lane_wait_on` |
| `web/tests/workspace/workUnitOperationalBootstrap.test.ts` | Parallel contract |
| `web/tests/workspace/workUnitBootstrapParallelization.test.ts` | Card 2 tests |

### Timing fields (`[wu-bootstrap-perf]`)

| Field | Meaning |
|-------|---------|
| `queue_summaries_ms` | Summaries task duration (unchanged) |
| `attention_ms` | Attention task duration (unchanged; 0 when NA not eligible) |
| `summaries_attention_parallel_ms` | Wall-clock of `Promise.all([summariesP, attentionP])` |
| `summaries_attention_parallel` | `true` |
| `primary_lane_wait_on` | `none` \| `summaries_only` \| `needs_attention` |
| `primary_lane_rows_ms` | Unchanged |

### Tests run

```bash
cd web && npm run test -- \
  tests/workspace/workUnitOperationalBootstrap.test.ts \
  tests/workspace/workUnitBootstrapParallelization.test.ts \
  tests/admin/getAdminOrgContextLight.test.ts
```

### Expected staging metric change

- `loader_ms` should drop ~**200–250ms** when both summaries and attention run (~260ms + ~235ms serial → ~max(260, 235) parallel).
- `summaries_attention_parallel_ms` ≈ max(`queue_summaries_ms`, `attention_ms`) on NA WUs.
- **Remaining bottleneck:** `primary_lane_rows_ms` (~455–537ms) — Card 3 candidate for defer/trim.

### Next card

**Card 3** (defer primary lane from blocking bootstrap) or **Card 4** (background poll cleanup).

---

## Card 1 — Pre-implementation audit (auth/context)

| Pattern | Finding |
|---------|---------|
| `getCachedAuthUser` vs `getCachedAuthUserId` | **Separate** `cache()` wrappers; routes using `requireAdminOrOps` → `getAdminAuth` → `getUser()` then `getAdminContext` → `getCachedAuthUserId` could hit auth twice |
| Double gate | **Confirmed** on operational-tasks, unread-count, workflows/summary, workflow-runs: `requireAdminOrOps()` + `getAdminContextCached()` |
| Full bundle queries | `resolveAdminAccessCore`: user_roles + `role_permission_grants` + `user_access_profiles` + optional dept/site access tables |
| Light route needs | orgId, userId, portalEligible (admin/ops); **no** permissionKeys or scope dimensions |

**Endpoints converted (Card 1):** unread-count, operational-tasks GET/POST, workflows/summary, workflow-runs GET, workflow-assist capabilities, agent v1 activity.

**Left full-context:** config-layout-assist capabilities (permissionKeys), bootstrap routes (`loadAdminRouteGate`), mutations with permission checks, communications send (permission grant).

---

## Card 1 closeout — Admin context fast path

**Date:** 2026-05-22  
**Status:** Complete.

### Files changed

| File | Purpose |
|------|---------|
| `web/lib/admin/cachedAuthSession.ts` | Unified `resolveAuthSessionOnce` — one auth resolution per request |
| `web/lib/admin/resolveAdminPortalOrgCore.ts` | Org + role_keys + portalEligible without grants/scope |
| `web/lib/admin/getAdminOrgContextLight.ts` | `getAdminOrgContextLightCached`, `requireAdminOrgContextLight` |
| `web/lib/adminAuth.ts` | `requireAdminOrOps` → light gate; `getAdminAuth` uses `getCachedAuthUserId` first |
| `web/app/api/admin/communications/unread-count/route.ts` | Light gate only |
| `web/app/api/admin/operational-tasks/route.ts` | Light gate only |
| `web/app/api/admin/workflows/summary/route.ts` | Light gate; timing log `portal_gate_ms` |
| `web/app/api/admin/workflow-runs/route.ts` | Light gate only |
| `web/app/api/admin/ai/workflow-assist/capabilities/route.ts` | Light gate only |
| `web/app/api/admin/agent/v1/activity/route.ts` | Light gate only |
| `web/tests/admin/getAdminOrgContextLight.test.ts` | Route contracts + helper shape |
| `web/tests/admin/resolveAdminPortalOrgCore.test.ts` | Portal org resolver unit tests |

### Routes converted

| Route | Before | After |
|-------|--------|-------|
| `GET /api/admin/communications/unread-count` | `requireAdminOrOps` + `getAdminContextCached` | `requireAdminOrgContextLight` |
| `GET/POST /api/admin/operational-tasks` | Double gate + full bundle | Light gate |
| `GET /api/admin/workflows/summary` | Double gate + full bundle | Light gate |
| `GET /api/admin/workflow-runs` | Double gate + full bundle | Light gate |
| `GET /api/admin/ai/workflow-assist/capabilities` | `getAdminContextCached` | Light gate |
| `GET /api/admin/agent/v1/activity` | `getAdminContextCached` | Light gate |

### Routes intentionally left full-context

| Route / area | Reason |
|--------------|--------|
| `GET /api/admin/ai/config-layout-assist/capabilities` | Requires `permissionKeys` for generate/review/apply |
| `operational-bootstrap`, `loadAdminRouteGate` | Needs full `AdminAccessScopeDimensions` |
| `POST /api/admin/communications/send` | Permission grant check |
| Most other `/api/admin/*` | Unchanged this card |

### Security reasoning

- Still requires authenticated session (`getCachedAuthUserId` / 401).
- Still resolves primary org via same `user_roles` + legacy rules as full bundle.
- Still requires `portalEligible` (admin or ops role_key) — 403 otherwise.
- Org-scoped queries unchanged (`eq("org_id", ctx.orgId)`).
- **Does not** skip RLS on data reads — service-role routes still use org from resolver.
- **Does not** expose broader data — only skips unused permission/scope tables for routes that never read them.

### Timing logs

- `[admin-portal-context-perf] getAdminOrgContextLight` when total > 250ms (`auth_ms`, `portal_org_ms`, `full_context_avoided: true`).
- `[admin-timing] GET /api/admin/workflows/summary` now logs `portal_gate_ms` + `light_context: true` instead of separate require/context ms.

### Tests run

```bash
cd web && npm run test -- \
  tests/admin/getAdminOrgContextLight.test.ts \
  tests/admin/resolveAdminPortalOrgCore.test.ts \
  tests/admin/getAdminAccessContext.test.ts
```

**Result:** 26 tests passed (2026-05-22).

### Expected staging metric change

| Endpoint | Before (auth/context) | Expected after |
|----------|----------------------|----------------|
| operational-tasks summary | ~478–538ms `getAdminAuth` | ~150–300ms light gate (user_roles only, no grants/scope, single auth) |
| unread-count | ~437ms | Similar reduction |
| workflows/summary | ~439ms + ~393ms double gate | One `portal_gate_ms` ~150–300ms + query time |

**Note:** `requireAdminOrOps()` alone (routes not yet converted) also uses light gate now — avoids `getUser()` when only used as portal check.

### Next card

**Card 2 — WU bootstrap parallelization** (`summaries ∥ attention`).

---

## 10. Related docs

- [`adminv2_platform_navigation_performance_sprint.md`](./adminv2_platform_navigation_performance_sprint.md)
- [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md)
- [`adminv2_performance_phase2_load_path_architecture.md`](./adminv2_performance_phase2_load_path_architecture.md)
- [`adminv2_dept_runtime_closeout_handoff.md`](./adminv2_dept_runtime_closeout_handoff.md)
- [`docs/system/workspace-system.md`](../system/workspace-system.md) — queue preview boundary
