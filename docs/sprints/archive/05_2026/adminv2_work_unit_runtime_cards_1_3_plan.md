# AdminV2 `/work-unit` Runtime — Cards 1–3 Implementation Plan

**Date:** 2026-05-20  
**Status:** Pre-implementation (review gate) — runtime/drawer performance sprint **closed** separately; see [`adminv2_drawer_performance_hardening_phase0.md`](./adminv2_drawer_performance_hardening_phase0.md#sprint-closeout-2026-05-20).  
**Authority:** [`adminv2_dept_runtime_closeout_handoff.md`](./completed/adminv2_dept_runtime_closeout_handoff.md), [`adminv2_performance_scope_lock.md`](./adminv2_performance_scope_lock.md) (Appendix), locked `/dept` runtime (PERF-B-06–08)

**Scope:** Cards 1–3 only. Drawer composed-open + prefetch landed in phase-0 closeout; this plan still owns **WU route parity** with `/dept`. **`/dept` must not regress.**

---

## AdminV2 Runtime Contract V1 (replication target)

All workspace drill-in surfaces converge on:

```txt
stable shell
→ isolated oper-region-only loader
→ one authoritative bootstrap (one loadAdminRouteGate per HTTP)
→ bundled critical oper data (single shared computation context)
→ authoritative oper reveal
→ deferred P2 shell/background work
```

`/dept` is **LOCKED** as the reference implementation. `/work-unit` copies doctrine exactly; smaller scope should yield **faster** bootstrap than dept.

---

## FINAL `/dept` closeout — MUST carry into `/work-unit`

| Doctrine | `/dept` (locked) | `/work-unit` target |
|----------|------------------|-------------------|
| Shell-first navigation | No `workspace/loading.tsx`; bridge immediate | Parent `AdminV2Shell` stable; WU segment loader geometry-only |
| Oper-region-only loader | `DeptOperationalRegionLoader` in paired oper only | `WorkspaceQuietQueueLaneReserve` in queue lane only |
| One authoritative bootstrap | `operational-bootstrap` | `work-units/{id}/operational-bootstrap` |
| One `loadAdminRouteGate` | Per bootstrap route | Same |
| Bundled KPI placements | In bootstrap | Same |
| Bundled right rail | `right_rail_actions` in bootstrap | Same |
| Bundled queue summaries | In bootstrap | Same WU summaries |
| Deferred P2 | `scheduleAdminV2BackgroundWork` | Same |
| No duplicate summary/action/KPI fetches | Happy path | Same |
| No stale/optimistic rows | Clear oper state on nav | `useLayoutEffect` purge invariant |

---

## Critical attention doctrine (2026-05-20)

### Do NOT assume Needs Attention is a separate work unit

Enrollment truth:

```txt
work_units.key = enrollment_pipeline
queue_definition includes needs_attention queue
```

**Resolver doctrine** (from `web/lib/workspace/resolveDeptNeedsAttentionWorkUnit.ts`):

```txt
resolve execution WU from queue_definition
→ if a WU contains a needs_attention queue, use that WU as the attention execution WU
→ only fall back to department_attention_preview if no WU in the department has a needs_attention queue
```

### `/work-unit` rules

| Rule | Implementation |
|------|----------------|
| Detect NA from `queue_definition` | Use `workUnitDefinesNeedsAttentionQueue(wu.queue_definition)` — **not** only `work_units.key === "needs_attention"` |
| Current WU hosts NA queue | Run `buildWorkUnitScopedNeedsAttentionLaneBuckets` on **current** `workUnitId` (e.g. `enrollment_pipeline`) |
| No dept/org preview on WU bootstrap | **Never** call `buildOpportunityAttentionQueueItems` / `department_attention_preview` from WU bootstrap |
| Dept preview fallback | **Out of scope** on WU route (dept bootstrap retains fallback) |
| `right_rail_work_unit_id` | Actions only — **not** attention resolution |

**New helper (WU-scoped):** `resolveWorkUnitNeedsAttentionExecution(workUnitRow)` → `{ executionWorkUnitId, mode } | null` when current WU defines NA queue or is standalone `needs_attention` WU. Reuse `workUnitDefinesNeedsAttentionQueue` from `resolveDeptNeedsAttentionWorkUnit.ts` (import shared, do not fork logic).

**Runtime markers (verification):**

- `attention.source === "work_unit_needs_attention_lane"`
- `attention.execution_work_unit_id ===` current page WU when WU defines NA queue
- `attention.bucket_count_scope === "work_unit_needs_attention_list_cap"`
- **Not** `department_attention_preview` on enrollment_pipeline happy path

### Attention performance doctrine (do not re-litigate)

Staging `/dept` proved resolver architecture is correct:

| Metric | ~ms |
|--------|-----|
| attention_ms | 264 |
| attention_query_ms | 247 |
| attention_resolver_ms | 7 |
| attention_candidate_count | 141 |

**Conclusion:** Eliminate **duplicate passes**, not DB/index tuning in this sprint.

**WU bootstrap must:**

- Run `loadOpportunityNeedsAttentionRows` **at most once** per bootstrap
- Reuse `resolved_by_id` for buckets **and** primary lane rows
- Share `buildQueueSummariesSharedBootstrap` across summaries, attention, rows
- Use `columnSelect: "resolver_minimal"` for oper-critical candidates
- Log `attention_resolver_passes` — **expected: 1**

### Attention metadata rule (critical)

If:

```ts
workUnitDefinesNeedsAttentionQueue(queue_definition) === true
```

then the operational bootstrap **MUST** compute the WU-scoped attention pack **exactly once** and include attention bucket metadata in the bootstrap response, **regardless of the currently selected `focus_queue`**.

| Principle | Rule |
|-----------|------|
| Attention metadata | Part of **operational context** — not conditional on visible lane |
| `primary_lane.items` | **Only** field that changes based on `focus_queue` |
| Attention execution context | Stable across lane switches (client reuses bootstrap `attention` on tab change) |

**Expected contract:** `attention_resolver_passes === 1`

The resolver output (`resolved_by_id`) **must** be reused for:

- bucket counts (`needs_attention_buckets`)
- reason counts (`attention_reason_counts`)
- primary lane row filtering when `focus_queue === needs_attention`
- operational explainability surfaces (row `operationalNextHint`, etc.)

**Do NOT:**

- rerun `loadOpportunityNeedsAttentionRows` on lane switch
- recompute attention independently per lane
- tie `queue.attention` existence to visible queue selection

**Lane switch after bootstrap:** Tab/bucket changes use client state + optional row fetch for non-primary lanes; they **must not** trigger a second attention resolver pass on navigation settle (reuse bootstrap attention metadata for pills/buckets).

---

## Bootstrap row authority rule

Bootstrap queue rows are authoritative for **initial operational presentation only**.

They are **NOT**:

- durable entity truth
- mutation truth
- drawer truth
- workflow execution truth

Record-level authority remains:

- entity fetches (`/api/admin/entity/...`)
- queue refresh invalidation flows (`adminv2:opportunity-updated`, `fetchQueueItems` with `force: true`)
- authoritative server mutations

---

## Runtime consistency doctrine

Queue summaries, attention metadata, and primary lane rows **must** share:

- identical scope constraints (`recordScopeConstraints`)
- identical queue-definition snapshot (preloaded from WU row — no second `loadWorkUnitQueueDefinitionWithMeta` on bootstrap path)
- identical status/rule definitions (`opportunityStatusDefs` from shared bootstrap)
- identical attention resolver context (`preloadedAttentionPack` + `resolved_by_id`)

They derive from a shared **`WorkUnitOperBootstrapContext`** — the authoritative computation context for:

- queue summaries
- attention buckets and reason counts
- KPI synthesis inputs
- primary lane selection
- operational explainability

`buildQueueSummariesSharedBootstrap(orgId)` is loaded **once** into that context and passed through all oper phases (not ad-hoc parallel snapshots).

---

## Bootstrap payload budget

Explicit targets to preserve shell-first + oper reveal timing:

| Target | Guidance |
|--------|----------|
| Total bootstrap payload | **< ~250 KB compressed** (monitor on staging) |
| `primary_lane.items` | **≤ 20** rows |
| Relationship / member graphs | **Excluded** |
| Tab payloads (comms, notes, activity, related) | **Excluded** |
| Secondary AI / sidebar payloads | **Excluded** (P2 defer) |
| Workflow history / run detail | **Excluded** |
| `pipeline_surface` | **Excluded** v1 (no WU pipeline panel) |

**Goal:** Bootstrap is authoritative but lean — minimize parse/hydration cost; avoid invisible oper-reveal delay from oversized JSON.

---

## Card 1 — Work-unit shell stability

### Files

| File | Change |
|------|--------|
| `web/lib/ui-v2/adminV2LoadingGeometry.ts` | `ADMINV2_WORK_UNIT_QUEUE_LANE_MIN_H` + `adminV2WorkUnitQueueLaneReserveStyle()` |
| `web/components/admin/workspace/WorkspaceQuietLoadingReserve.tsx` | Use shared constant |
| `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/loading.tsx` | Breadcrumb + `WorkspaceQuietQueueLaneReserve` (remove `AdminV2RouteLoadingState` card) |
| `web/tests/admin/adminV2LoadingGeometry.test.ts` | Shared constant contract |

### Acceptance

- Route `loading.tsx` and in-page blocking load use **same** quiet lane geometry
- No route-wide skeleton replacing `AdminV2Shell` or workspace layout

---

## Card 2 — Work-unit operational bootstrap

### Route

`GET /api/admin/work-units/{workUnitId}/operational-bootstrap`

**Required query:** `department_id` (validate `wu.department_id`)

**Params:** `include_previews=false`, `count_mode=exact`, `summary_mode=all`, `focus_queue`, `attention_bucket`, `primary_row_limit=20`, `omit_total_count=true`, workspace site id

**Auth:** `loadAdminRouteGate()` once; prep parallel: `assertRowOrg`, `resolveQueueRecordScopeConstraints`, `fetchEffectiveUserDisplayTimezone`

### Payload (v1 — includes `primary_lane` + unconditional `attention` when NA queue in definition)

```typescript
type WorkUnitOperationalBootstrap = {
  department: DepartmentShellSummary;
  work_unit: WorkUnitShellSummary; // includes queue_definition
  queue: {
    summaries: QueueSummary[];
    deferred_queue_keys?: string[];
    work_unit_scope_total?: number | null;
    work_unit_scope_queue_key?: string | null;
    primary_lane?: {
      queue_key: string;
      route: string;
      items: AuthoritativeQueueRow[]; // presentation-only; keyed by focus_queue
      total_omitted?: boolean;
    };
    // REQUIRED when workUnitDefinesNeedsAttentionQueue — NOT gated on focus_queue
    attention?: {
      source: "work_unit_needs_attention_lane";
      execution_work_unit_id: string;
      execution_mode?: "standalone_work_unit" | "pipeline_work_unit";
      bucket_count_scope: "work_unit_needs_attention_list_cap";
      needs_attention_buckets: unknown[];
      total_matches: number;
      attention_reason_counts: Record<string, number> | unknown; // shape per existing bucket summary types
      opportunity_needs_attention_semantics?: unknown;
      attention_query_ms: number;
      attention_resolver_ms: number;
      attention_candidate_count: number;
      attention_resolver_passes: number; // MUST === 1
    };
  };
  kpi_placements: { items: KpiPlacement[]; scope_has_placements: boolean };
  right_rail_actions: ResolvedActionForClient[];
  runtime: {
    generated_at: string;
    source: "authoritative_work_unit_bootstrap";
    bootstrap_total_ms: number;
    deferred: string[];
  };
};
```

See **Bootstrap payload budget** (above) for size and exclusion rules.

### Server files (new / modified)

| File | Action |
|------|--------|
| `web/app/api/admin/work-units/[id]/operational-bootstrap/route.ts` | **New** |
| `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts` | **New** |
| `web/lib/workspace/workUnitOperationalBootstrapPerf.ts` | **New** — `[wu-bootstrap-perf]` |
| `web/lib/workspace/resolveWorkUnitNeedsAttentionExecution.ts` | **New** — WU-scoped NA detection (reuses `workUnitDefinesNeedsAttentionQueue`) |
| `web/lib/kpi/loadWorkUnitKpiPlacementsServer.ts` | **New** |
| `web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts` | Optional `preloadedAttention` — skip second load |
| `web/lib/queues/QueueService.ts` | Optional `preloadedAttentionPack` + `preloadedQueueDefinition` on `getWorkUnitQueueItems` — **defaults unchanged** |

**Do not modify:** `loadDeptOperationalBootstrap.ts`, dept `operational-bootstrap/route.ts`, `dept/page.tsx`

### Loader sequence (single context object)

```txt
loadAdminRouteGate
→ build WorkUnitOperBootstrapContext:
    buildQueueSummariesSharedBootstrap(orgId)  [once]
    parallel: dept shell, wu shell (incl. queue_definition)
→ resolveWorkUnitNeedsAttentionExecution(wu)

→ Phase 1 — summaries (shared context):
    getWorkUnitQueueSummaries(preloadedQueueDefinition from wu row)

→ Phase 2 — attention (if workUnitDefinesNeedsAttentionQueue):
    loadOpportunityNeedsAttentionRows(columnSelect: resolver_minimal)  [exactly once; attention_resolver_passes++]
    buildWorkUnitScopedNeedsAttentionLaneBuckets(preloadedAttention)     [reuse resolved_by_id; no second load]
    populate queue.attention (buckets, reason counts, perf fields)       [always; ignore focus_queue]

→ Phase 3 — primary_lane (focus_queue-dependent items only):
    IF focus_queue === needs_attention:
        slice + enrich rows from same preloadedAttentionPack / resolved_by_id
    ELSE:
        getWorkUnitQueueItems(preloadedQueueDefinition, preloadedAttentionPack when NA WU hosts lane)

→ parallel route extras (same request, after oper context):
    loadWorkUnitKpiPlacementsServer
    loadRightRailActionsBundleServer(departmentId, workUnitId)

→ log [wu-bootstrap-perf] including attention_resolver_passes (expect 1)
```

**Implementation notes:**

- **Never** call `buildOpportunityAttentionQueueItems` / `department_attention_preview` from WU loader.
- `queue.attention` is **omitted** only when `workUnitDefinesNeedsAttentionQueue(wu.queue_definition) === false`.
- When `focus_queue !== needs_attention` (e.g. `pipeline_total` on `enrollment_pipeline`), bootstrap still returns full `queue.attention`; client stores it for pill expansion and lane switches without refetching attention.
- Tab change to `needs_attention` after land: prefer bootstrap `attention` + row fetch using shared client state; **no** second bootstrap for attention only.

### Client apply (`page.tsx`)

```txt
useLayoutEffect: clear ALL queue state; optional shell seed (dept+wu metadata only)
useEffect:
  markWorkUnitNavigationStart()
  TRY operational-bootstrap
    apply dept, wu, summaries, kpi_placements, right_rail_actions
    IF queue.attention: persist attention buckets/reason counts (lane-independent)
    apply primary_lane.items + selectedQueueKey from focus_queue
    wuQueueLaneAuthorityReady = true; suppressQueueFetchEffectOnceRef = true
    setLoading(false)
    scheduleAdminV2BackgroundWork → deferred supplement (Card 3)
    RETURN
  CATCH legacy fan-out (existing parallel GETs + row fetch)
```

### Legacy fallback

Preserved exactly when bootstrap fails — no behavior removal.

### Perf logging

**Server:** `[wu-bootstrap-perf]` with `bootstrap_total_ms`, `attention_query_ms`, `attention_resolver_ms`, `attention_candidate_count`, `attention_resolver_passes`, `pipeline_ms` (0/omitted v1), `queue_summaries_ms`, `primary_lane_rows_ms`, `kpi_placements_ms`, `right_rail_actions_ms`

**Client:** `work_unit_bootstrap_ready`, `work_unit_oper_reveal_ready`, `source: bootstrap|legacy`

---

## Card 3 — Deferred background pass

Move off critical path (via `scheduleAdminV2BackgroundWork` after bootstrap apply):

- `loadWorkUnitDeferredSupplement` (queue_row actions, workflow KPIs/summary)
- `loadWuKpiPlacements` only if bootstrap omits `kpi_placements`
- `deptWuListPromiseRef` / dept work-units list for NA WU id — **remove from bootstrap wave**; optional in deferred or omit (NA execution is current WU)
- Adjacent lane prefetch (unchanged timing — post primary settle)
- Sidebar tree, entity-labels refresh, AI capabilities, operational tasks, unread count (global defer; `isAdminV2OperNavigationActive` via `markWorkUnitNavigationStart`)

---

## Implementation sequence

| Order | Card | Deliverable |
|------:|------|-------------|
| A | 1 | Geometry alignment + tests |
| B1 | 2 | Shared optional queue hooks + `resolveWorkUnitNeedsAttentionExecution` + perf types |
| B2 | 2 | Server loader + route + `workUnitOperationalBootstrap.test.ts` |
| C | 2 | Client bootstrap apply + legacy fallback |
| D | 3 | Deferred scheduling + remove critical-path noise |
| E | All | Verification checklist + dept regression CI |

---

## Tests / contracts

| Test | Asserts |
|------|---------|
| `web/tests/workspace/workUnitOperationalBootstrap.test.ts` | Route, gate, loader, shared bootstrap, `resolveWorkUnitNeedsAttentionExecution`, `attention_resolver_passes`, attention included when NA queue in def **without** `focus_queue=needs_attention`, no dept preview in loader |
| `web/tests/workspace/deptOperationalBootstrap.test.ts` | **Unchanged — must stay green** |
| `web/tests/admin/adminV2WorkUnitLaneLocalState.test.ts` | Bootstrap before legacy; stale purge; single primary row authority |
| `web/tests/admin/adminV2LoadingGeometry.test.ts` | WU lane constant shared |

**Anti-regression:** `attention_resolver_passes === 1` in server log contract test or loader instrumentation.

---

## Risks to `/dept`

| Risk | Mitigation |
|------|------------|
| `QueueService` optional params | Default `undefined` → identical behavior; dept tests green |
| Shared `workUnitDefinesNeedsAttentionQueue` refactor | Export only; dept `resolveDeptNeedsAttentionWorkUnit` unchanged |
| Summary vs primary_lane drift | Single `WorkUnitOperBootstrapContext` + same scope/def/status/attention pack |
| Someone uses bootstrap rows for drawer/mutations | Document presentation-only authority |
| Lane switch triggers second attention bootstrap | Client holds `queue.attention` from first bootstrap; row fetch only for lane body |
| Attention omitted when `focus_queue=pipeline_total` | Loader must include `queue.attention` whenever NA queue in definition (contract test) |

---

## Verification checklist (before closing Cards 1–3)

### Attention doctrine

- [ ] Bootstrap detects NA from `queue_definition`, not only `work_units.key`
- [ ] On `enrollment_pipeline` WU with NA queue, `attention.source === "work_unit_needs_attention_lane"`
- [ ] `attention.execution_work_unit_id` equals page WU id (not a separate NA WU unless standalone)
- [ ] No `department_attention_preview` on WU happy path
- [ ] **`queue.attention` present when `workUnitDefinesNeedsAttentionQueue`, even when `focus_queue` is e.g. `pipeline_total`**
- [ ] `attention_query_ms`, `attention_resolver_ms`, `attention_candidate_count` numeric on response and in `[wu-bootstrap-perf]`
- [ ] `attention_resolver_passes === 1` on every bootstrap
- [ ] Lane switch to `needs_attention` does **not** rerun `loadOpportunityNeedsAttentionRows` (reuse bootstrap attention + row fetch only)

### Runtime consistency

- [ ] Summaries, `queue.attention`, and `primary_lane` built from one `WorkUnitOperBootstrapContext`
- [ ] Same scope constraints, queue-definition snapshot, status defs, and attention pack across all three

### Bootstrap doctrine

- [ ] Happy path: **one** `operational-bootstrap` HTTP before oper reveal
- [ ] No separate critical-path KPI placements fetch
- [ ] No separate critical-path right-rail-bundle fetch
- [ ] No second primary row fetch on happy path
- [ ] `primary_lane.items` present for `focus_queue`; attention metadata independent of `focus_queue`
- [ ] Legacy fan-out only on bootstrap failure

### Stability doctrine

- [ ] WU A→B nav never shows A queue rows
- [ ] Route loader geometry matches in-page quiet reserve
- [ ] `/dept` unchanged; `deptOperationalBootstrap.test.ts` green

### Payload budget

- [ ] ≤ 20 primary lane rows
- [ ] No tab/comms/relationship/workflow-history/AI payloads in bootstrap
- [ ] Staging check: bootstrap **< ~250 KB compressed** on enrollment_pipeline WU (document actual size in closeout)

### Row authority

- [ ] Drawer open from row still uses entity API + preview seed doctrine (bootstrap rows not mutation/drawer truth)

---

## Acceptance criteria (sprint success)

1. `/work-unit` happy path uses **one** authoritative bootstrap for critical oper data (including `primary_lane.items`).
2. Browser no longer shows fragmented 4–6 request bootstrap before oper reveal.
3. Auth collapsed to **one** `loadAdminRouteGate` per bootstrap HTTP.
4. KPI placements and right rail **bundled** — no triple action / duplicate KPI fetch on happy path.
5. Needs Attention on **enrollment_pipeline** (and similar) uses **WU-scoped** lane resolver, not dept preview.
6. **One** attention resolver pass per bootstrap; `attention_resolver_passes === 1`.
7. When `workUnitDefinesNeedsAttentionQueue`, bootstrap **always** includes `queue.attention` metadata **regardless of `focus_queue`**; only `primary_lane.items` varies by lane.
8. `resolved_by_id` reused for buckets, reason counts, NA primary lane rows, and operational explainability — no per-lane attention recompute.
9. `WorkUnitOperBootstrapContext` ensures summaries, attention, and primary lane share scope, definition snapshot, status defs, and attention context.
10. Bootstrap payload stays within budget (~250 KB compressed, ≤20 rows, no tab/AI/workflow/heavy relationship payloads).
11. Bootstrap rows are presentation-authoritative only; entity/mutation/drawer truth unchanged.
12. `/dept` behavior and perf **do not regress**.
13. No stale rows or optimistic incorrect queue data.

---

## Out of scope

- Drawer bootstrap
- `/dept` page or bootstrap changes
- DB indexes / SQL tuning
- `pipeline_ms` on WU (no pipeline panel)

---

## Suggested commit messages (when implementing)

1. `perf(adminv2): align work-unit route loader with quiet lane geometry (card 1)`
2. `perf(adminv2): work-unit operational bootstrap + attention WU doctrine (card 2)`
3. `perf(adminv2): defer WU background fetches after bootstrap reveal (card 3)`
