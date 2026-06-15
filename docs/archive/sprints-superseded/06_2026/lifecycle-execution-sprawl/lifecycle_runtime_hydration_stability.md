# Lifecycle runtime hydration stability

**Sprint:** 06/2026  
**Scope:** `/work-unit` builder-owned lifecycle shell — stable header paint, label precedence, sibling counts.  
**Out of scope:** lifecycle visibility evaluator, QueueService visibility contract, assignment_home, Actions Matrix placement, Create Lead binding.

## Symptoms addressed

1. Header showed only Lead + Qualification, then Tours + Waitlist appeared later.
2. Page kept mutating while idle (sibling refetch tied to `queueSummaries`).
3. Tour / Waitlist pill counts showed `0` despite records (deferred/partial dept cache totals).
4. Renamed work unit (`Lead` → `New Leads`) still displayed stage label on some surfaces.

## Root causes

| Issue | Cause |
|-------|--------|
| Partial pills | Dept session cache seeded an incomplete `workUnits` list before authoritative `/api/admin/work-units` response; header fell back to single current WU. |
| Reload churn | `useEffect` for siblings depended on `queueSummaries`, re-running fetch and replacing pills. |
| Zero counts | Sibling totals from dept cache skipped rows when `work_unit_scope_total` was null (`summary_mode: priority`); tour/waitlist not counted in first paint. |
| Stale “Lead” label | Operator copy must use `work_units.name`; `metadata.lifecycle_stage_label` is builder copy only. |

## Fix summary

### 1. Single hydration pass (server)

`loadWorkUnitOperationalBootstrap` now returns `lifecycle_siblings`:

- Full lifecycle WU list for the department (sorted by `sort_order`).
- `totals_by_work_unit_id` from `getDepartmentWorkUnitQueueSummaries` with `countAccuracy: "exact"` (lifecycle visibility scope per WU).

### 2. Client paint gate

- No lifecycle header pills until `lifecycleSiblingsHydrationComplete`.
- Skeleton Work Units row via `lifecycle_builder_owned_header_pending`.
- Client fetch is fallback only (bootstrap miss); **no cache-first partial sibling list**.
- Totals merge in `useMemo` (bootstrap totals + dept cache + current lane) without refetching siblings.

### 3. Labels

`resolveDeptWorkUnitDisplayLabel`: `work_units.name` → key title-case → fallback. Ignores `lifecycle_stage_label`.

### 4. Dev logging

`[lifecycle-wu-hydration]` in development: bootstrap/client_fetch start/end, ids, labels.

## Files

| File | Role |
|------|------|
| `web/lib/lifecycle/lifecycleWorkUnitSiblingHydration.ts` | Sort/dedupe/merge/totals/paint-ready/skeleton |
| `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts` | `lifecycle_siblings` block |
| `web/app/adminV2/workspace/dept/.../work-unit/.../page.tsx` | Hydration state + bootstrap apply |
| `web/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel.ts` | Pending skeleton header |
| `web/lib/workspace/workUnitShellDisplayTitle.ts` | Label precedence doc |

## Manual test plan

- [ ] Open `/work-unit` on Tour: skeleton header → full sibling row in one step (no 2-pill intermediate).
- [ ] Idle on page 30s: sibling labels/counts do not flicker or refetch.
- [ ] Tour / Waitlist pills show non-zero when records exist for lifecycle visibility status keys.
- [ ] Renamed WU (`New Leads`) on workspace tile, `/dept` cards, breadcrumb, sibling pills.
- [ ] Waitlist candidate layout: count still matches visibility filter (not assignment-only).

## Tests

`web/tests/lifecycle/lifecycleWorkUnitSiblingHydration.test.ts`
