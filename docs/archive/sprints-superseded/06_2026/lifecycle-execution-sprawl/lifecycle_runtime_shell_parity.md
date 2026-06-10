# Lifecycle Runtime Shell Parity

**Status:** Implemented (May 2026)  
**Prerequisite:** Lifecycle visibility contract + runtime surface integration  
**Out of scope:** Needs Attention sprint, Orchestration, visibility evaluator / QueueService predicate changes

## Goal

Builder-owned lifecycle departments use the **same operational runtime shell** as Enrollment: work-unit throughput row, Needs Attention row, right rail, KPI strip, breadcrumbs, and workspace tile counts. Configuration differs; components do not.

## Fixes applied

| Area | Change |
|------|--------|
| **Actions rail reservation** | `departmentReservesOperationalActionsRail()` — true for enrollment-like departments and builder-owned lifecycle (metadata or `lifecycle_wu_*` rows). Drives dept + work-unit reveal gates and rail fetch. |
| **Dept right rail** | Always renders `ActionsBlock` when rail is reserved (empty state when no matrix actions). Fetches resolved actions via existing `fetchWorkspaceRightRailResolvedActions`. |
| **Work-unit right rail** | `buildWorkUnitAboveFoldRenderModel` merges resolved actions whenever `reserve_actions_rail` is true (not only enrollment dept key). Bootstrap loads right rail for builder-owned lifecycle. |
| **Work units row** | Dept throughput uses `deptThroughputWuRows` (`lifecycle_wu_*` only). Titles match enrollment row pattern (`{name}. Total {n}.`). |
| **Needs Attention row** | Dept + work-unit: always rendered. Empty copy: `No needs attention rules configured`. Work-unit uses enrollment-style **Needs Attention** pill row (see below). |
| **Work-unit pill shell** | `buildLifecycleBuilderOwnedAboveFoldHeaderSections()` — **Work Units** row lists all active `lifecycle_wu_*` siblings with counts; selected pill = current WU; click navigates to sibling `/work-unit/:id`. **Needs Attention** row always present (placeholder chip when unconfigured). KPI strip suppressed (counts on pills, same as enrollment pipeline). |
| **KPI shell** | Removed lifecycle-only KPI labels (`Visible in work unit`, etc.). Same `KPIBlock` / placement resolver; counts still from queue summaries (visibility-based in QueueService). Facets still filter to lifecycle stage WUs on `/dept`. |
| **Lifecycle coverage panel** | Suppressed for `lifecycle_wu_*` (runtime flag + `suppress_lifecycle_panel` on new stage queue definitions). Queue pills use standard enrollment chip shell. |
| **Workspace tile count** | `accumulateWorkspaceDeptWorkUnitTileStats()` — `is_active !== false` only; departments with any active `lifecycle_wu_*` count **only** those rows (excludes inactive `enrollment_pipeline`). Used by workspace quick rollup and growth rollup. |

## Runtime shell audit

| Surface | Enrollment path | Builder-owned lifecycle (after parity) |
|---------|-----------------|----------------------------------------|
| Dept shell | `DepartmentWorkspaceBridgeShell` | Same |
| Throughput lanes | Pipeline lanes or per-WU rows | Per-`lifecycle_wu_*` rows only (no pipeline lanes) |
| Needs Attention | `WorkspacePairedOperPanel` | Same panel + empty placeholder |
| Dept actions rail | `ActionsBlock` + reveal gate | Same when `departmentReservesOperationalActionsRail` |
| Work-unit shell | `WorkUnitWorkspace` + above-fold model | Same |
| Queue pills | `WorkUnitAboveFoldHeaderChips` — Work Units + Needs Attention sections | Same two-row layout via `lifecycle_builder_owned_header_sections` |
| WU actions rail | `WorkUnitAboveFoldActionsRail` | Same when rail reserved |
| KPI strip | `KPIBlock` + `resolveKpisFor*` | Same labels/structure |
| Breadcrumbs | `buildWorkUnitRoutePipelineState` | Same hierarchy (dept name → work unit display title) |
| Workspace tile | Work unit count subline | Active `lifecycle_wu_*` count only |

## Remaining differences (configuration, not shell)

1. **Throughput content** — Enrollment may show `enrollment_pipeline` lane pills inside one work unit; lifecycle shows one primary queue per stage work unit. Same chip component; different `queue_definition` shape.
2. **Pipeline exec surface** — Builder-owned depts skip `deptPipelineExecSurface` / legacy lane probe (intentional).
3. **Dept KPI facets** — Builder-owned dept KPI list filters to `lifecycle_wu_*` only (enrollment may include other WU keys in facets). Count source unchanged (summaries).
4. **Existing queue definitions** — Stage WUs created before `suppress_lifecycle_panel` rely on runtime suppression until repair/sync rewrites `queue_definition`.
5. **Needs Attention data** — Empty shell now; bucket rules and WU key arrive in Needs Attention sprint.
6. **Growth-slice analytics** — Enrollment growth departments still fetch lifecycle KPI / pipeline-exact endpoints; builder-only depts use work-unit count subline only unless marked growth slice.

## Blockers before Needs Attention sprint

- None for shell parity. NA sprint adds: `needs_attention` work unit, bucket config, attention queue execution, and populated attention lane rows.
- Optional: repair lifecycle stage queue definitions so stored JSON includes `suppress_lifecycle_panel: true` without relying on runtime override.

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleWorkUnitShellPills.test.ts tests/lifecycle/lifecycleRuntimeSurfaceIntegration.test.ts tests/lifecycle/lifecycleBuilderOwnedRuntime.test.ts
```

Manual: Lead Management workspace tile shows **2 work units**; `/dept` shows Lead + Qualification throughput rows, Needs Attention empty section, Actions rail (empty or configured); `/work-unit/Lead` header shows **Work Units:** `[Lead]` `[Qualification]` and **Needs Attention:** placeholder; clicking Qualification navigates to that work unit.
