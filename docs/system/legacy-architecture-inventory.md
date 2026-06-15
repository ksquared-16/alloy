# Legacy architecture inventory

**Path:** `docs/system/legacy-architecture-inventory.md`  
**Status:** **Canonical** (June 2026 freeze). Classification for deletion planning — not a work order.  
**Companion:** **`repository-state-2026-06.md`**

---

## Classification key

| Class | Meaning |
|-------|---------|
| **Canonical** | Actively used; product and docs target this |
| **Transitional** | Still mounted; redirect or flag points to replacement |
| **Legacy** | Should be deleted after cutover; avoid new dependencies |

---

## Routes

| Route / pattern | Class | Notes |
|-----------------|-------|-------|
| `/workspace`, `/workspace/work-unit/:slug`, `…/:recordId` | **Canonical** | Operator product URLs |
| `/admin`, `/admin/settings/*`, `/admin/forms`, `/admin/workflows` | **Canonical** | Config / admin |
| `/adminV2/*`, `/admin/v2/*`, `/adminv2/*` | **Transitional** | 302 → `/admin/*` |
| `/legacy-admin/*` | **Legacy** | Old admin implementation |
| Non-prefix `/admin/*` (financials, etc.) | **Legacy** | Middleware → `/legacy-admin/*` |
| `/adminV2/workspace/dept/[departmentId]/…` | **Transitional** | Internal/compat; slug routes preferred |
| `/admin/workspace/*` | **Transitional** | Rewrite alias; use `/workspace` in nav |

---

## UI surfaces

| Surface | Class | Notes |
|---------|-------|-------|
| `WorkspaceRootLifecycleGrid` | **Canonical** | Lifecycle landing |
| Dept-first workspace landing grid | **Legacy** | Removed from operator UX |
| `AdminV2Shell` + slug work-unit host | **Canonical** | |
| `AdminEntityDrawer` → VM runtimes | **Canonical** (Opp) / **Transitional** (Person/Child) | |
| `AdminEntityDrawerLegacy` | **Legacy** | Non-converged entities |
| `ChildDrawerVmRuntime` | **Legacy** | **Deleted** — use `PersonsDrawerVmRuntime` |
| `PersonDrawerVmRuntime` (standalone) | **Legacy** | **Deleted** — merged into `PersonsDrawerVmRuntime` |

---

## APIs

| API area | Class | Notes |
|----------|-------|-------|
| `/api/admin/view-models/*` | **Canonical** | Drawer VM compose |
| `/api/admin/v2/view-models/*` | **Transitional** | Rewrite → view-models |
| `/api/admin/operational/*` | **Canonical** | Bootstrap, queue rows |
| Legacy admin API routes under unmigrated modules | **Legacy** | Tied to `/legacy-admin` pages |

---

## Kill switches / feature flags

| Flag / gate | Default | Class | Purpose |
|-------------|---------|-------|---------|
| `opportunityDrawerHardCutoverGate` | ON | **Canonical** | Opportunity VM path |
| Person drawer VM load options | OFF | **Transitional** | Person VM cutover |
| `NEXT_PUBLIC_*` drawer VM flags | varies | **Transitional** | Per-entity rollout |
| `ADMIN_PERF_TRACE`, `ALLOY_PLATFORM_PERF_*` | off | **Canonical** | Debug only |
| Legacy drawer prefetch on non-canonical host | gated | **Canonical** | Prevents wrong-surface prefetch |

Search: `web/lib/adminV2/viewModel/drawer/**`, `*HardCutover*`, `*KillSwitch*`.

---

## Files / modules (high-signal)

### Canonical (extend here)

- `web/lib/admin/canonicalAdminRoutes.ts`, `canonicalOperatorRoutes.ts`
- `web/lib/admin/operatorWorkUnitDrawerUrlSync.ts`
- `web/app/adminV2/workspace/work-unit/[workUnitSlug]/**`
- `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx`
- `web/lib/adminV2/workUnitRevealGate.ts`, `workUnitPageRevealPolicy.ts`
- `web/lib/perf/platformSurfacePerfTrace.ts`

### Transitional (do not expand; migrate callers)

- `web/app/adminV2/workspace/dept/**`
- `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx` (until VM flag default ON)
- `web/lib/adminV2/viewModel/drawer/vmRuntime/usePersonsDrawerVmPayload.ts`
- Filesystem `app/adminV2/**` (URL is `/admin` or `/workspace`)

### Legacy (no new imports; delete after cutover)

- `web/components/admin/AdminEntityDrawerLegacy.tsx` ( shrink as entities converge )
- `web/app/legacy-admin/**`
- `web/lib/admin/personDrawerSnapshot.ts` and other pre-VM snapshot paths where VM replaces
- Department-first landing components (if any remain)

---

## Systems

| System | Class |
|--------|-------|
| Lifecycle-first operator workspace | **Canonical** |
| Department-scoped ACL / metadata | **Canonical** (scope only) |
| Department-first navigation | **Legacy** (mental model) |
| Composed drawer payload (pre-VM person) | **Transitional** |
| Drawer VM runtime | **Canonical** (target for all converged entities) |
| Layout runtime + LayoutDoc | **Canonical** |
| Classic opportunities registry (`/legacy-admin`) | **Legacy** |
| `/adminV2` public URLs | **Transitional** |

---

## Documentation

| Doc | Class |
|-----|-------|
| `routing-doctrine.md`, `navigation-doctrine.md`, `drawer-doctrine.md`, `platform-performance-doctrine.md` | **Canonical** |
| `adminv2-runtime-performance-doctrine.md` | **Canonical** (implementation locked) |
| `drawer-operating-model-v1.md`, `drawer-view-model-runtime-contract.md` | **Canonical** (detail) |
| Sprint perf closeouts under `docs/sprints/06_2026/` | **Historical** — do not duplicate doctrine |
| Docs referencing department-first as primary nav | **Legacy** — update or archive banner |

---

## When this doc must be updated

Entity VM cutover completes, route removal, legacy-admin module deletion, or new kill switch added.
