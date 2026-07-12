# AdminV2 `/dept` runtime closeout — handoff for parallel threads

**Date:** 2026-05-20  
**Audience:** `/work-unit` replication sprint, parallel GPT context  
**Canonical docs:** [`adminv2_performance_scope_lock.md`](./adminv2_performance_scope_lock.md) (Appendix), [`adminv2_performance_cards.md`](./adminv2_performance_cards.md) (PERF-B-06–08), [`docs/system/workspace-system.md`](../system/workspace-system.md)

---

## Delta since previous handoff (paste into GPT thread)

### 1. `/dept` is LOCKED as canonical runtime reference

Enrollment dept path is the **premium standard** to copy for work-unit:

- Stable **shell-first** nav (deleted `workspace/loading.tsx` — no root skeleton flash)
- **Oper-region-only** loader; pipeline + Needs Attention **reveal together**
- **One** `GET /api/admin/departments/[id]/operational-bootstrap` (single `loadAdminRouteGate`)
- Bundled **`kpi_placements`** + **`right_rail_actions`** + summaries + attention + **`pipeline_surface`**
- P2 shell work deferred (`scheduleAdminV2BackgroundWork`); nav poll suppression ~600ms
- No duplicate queue summary fetches for skipped enrollment WUs
- **`synthesizeDeptKpiWorkUnitSummaries`** when summaries skipped (fixes Today's Focus `—`)

### 2. Architecture fix — attention execution work unit (critical)

**Was wrong:** `loadDeptAttentionPreviewServer` looked only for `work_units.key === needs_attention`.

**Enrollment truth:** `needs_attention` is a **queue** on **`enrollment_pipeline`** (`pipeline_with_attention` in `queue_definition`), not a separate work unit.

**Fix:** `resolveDeptNeedsAttentionWorkUnit` — resolves execution WU from `queue_definition`; bootstrap passes `queue_definition` on preloaded WU rows.

| Before | After (staging) |
|--------|-----------------|
| `attention_source: department_attention_preview` | `attention_source: work_unit_needs_attention_lane` |
| `attention_ms` ~975ms, subtimings undefined | `attention_ms` ~264ms, subtimings populated |
| Org 500-row preview fallback | `buildWorkUnitScopedNeedsAttentionLaneBuckets` on `enrollment_pipeline` id |

**Fallback doctrine:** `department_attention_preview` **only** when no WU in dept has a `needs_attention` queue in `queue_definition`.

`right_rail_work_unit_id=enrollment_pipeline` is **correct** for actions only — unrelated to attention resolution.

### 3. Attention performance — resolver solved, SQL is the lane hotspot

After single-pass resolver + batch context + minimal SELECT + skip sort:

| Metric | ~ms |
|--------|-----|
| bootstrap total | 1110 |
| loader | 529 |
| attention | 264 |
| attention_query_ms | 247 |
| attention_resolver_ms | 7 |
| attention_candidate_count | 141 |

**Conclusion:** Not architecture failure — **bounded hotspots**: auth/context, pipeline lane queries, attention SQL (future indexes only).

### 4. Code map (dept oper path)

- `web/app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts`
- `web/lib/workspace/loadDeptOperationalBootstrap.ts`
- `web/lib/workspace/loadDeptAttentionPreviewServer.ts`
- `web/lib/workspace/resolveDeptNeedsAttentionWorkUnit.ts` ← **new doctrine**
- `web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts`
- `web/lib/queues/QueueService.ts` (`loadOpportunityNeedsAttentionRows`, `resolved_by_id`)
- `web/app/adminV2/workspace/dept/[departmentId]/page.tsx`
- `web/lib/workspace/deptOperationalBootstrapPerf.ts` → `[dept-bootstrap-perf]`

### 5. Work-unit replication — do this next

Copy `/dept` patterns **exactly**; WU should be **faster** (smaller scope):

- `work-unit-operational-bootstrap` (one HTTP, one auth)
- Shell-first + oper/queue region loader (not full page)
- Same defer/suppression rules
- Reuse attention resolver doctrine where WU hosts NA queue tab
- Add `work-unit-bootstrap-perf` logging
- **Do not** change drawer in WU sprint
- **Do not** change UX contracts

### 6. Future only (not current requirements)

- DB indexes for `opportunities` attention candidate OR
- Pipeline lane query tuning
- Shared auth/context reuse across routes
- Entity-label route overhead

---

## Verification checklist (staging)

- [ ] `attention.source === "work_unit_needs_attention_lane"`
- [ ] `bucket_count_scope === "work_unit_needs_attention_list_cap"`
- [ ] `[dept-bootstrap-perf]` has numeric `attention_query_ms`, `attention_resolver_ms`, `attention_candidate_count`
- [ ] Today's Focus shows digits (not `—`)
- [ ] Single right-rail bundle on happy path (no 3× `?surface=`)
