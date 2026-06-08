# Person / Child Drawer VM — Phase B Audit

**Date:** 2026-06-04  
**Scope:** AdminV2 `persons` drawer VM parity with legacy production chrome (no warm-load, no `AdminEntityDrawerVmShell`).

## Routing (current)

| Path | Component | Gate |
|------|-----------|------|
| `AdminEntityDrawer.tsx` | `PersonsDrawerVmRuntime` | `resolveVmDrawerRuntimeRoute` → `person` or `child` when `NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM` / `NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM` |
| Unused split runtimes | `PersonDrawerVmRuntime.tsx`, `ChildDrawerVmRuntime.tsx` | Tests assert router uses unified `PersonsDrawerVmRuntime` only |
| Payload | `usePersonsDrawerVmPayload` | `loadPersonDrawerViaViewModel` / `loadChildDrawerViaViewModel` — no legacy bootstrap |

## Legacy production UI (reuse targets)

### Header

| Surface | Legacy | Reuse in VM |
|---------|--------|-------------|
| Child | `PersonDrawerChildTitleRow`, subtitle status + record #, no `statusBadge` | Same |
| Parent | `PersonDrawerParentTitleRow`, subtitle status + record # | Same |
| Generic | Plain title + `PersonDrawerHeaderMetadata` + `statusBadge` | Same |

### Body — operating (above overview)

| Surface | Sections | Component |
|---------|----------|-----------|
| Child | `child_summary`, `household` | `PersonDrawerOperatingSections` + `PersonDrawerChildLifecycleRail` |
| Parent | `parent_summary`, `household`, `household_address`, `employee_status`* | `PersonDrawerOperatingSections` + `PersonDrawerParentLifecycleRail` |
| Generic | none (layout `person_generic_v1`) | `EntityDrawerOverview` only |

\* `employee_status` renders only when `"is_employee" in record` (`PersonDrawerOperatingSections`).

### Body — config-driven overview

| Surface | Pipeline | Component |
|---------|----------|-----------|
| All | `_field_definitions` → section list → profile filter → parent/child suppress | `EntityDrawerOverview` via `resolvePersonDrawerVmOverviewSections` |
| Generic | + `employee_placement`, `relationships`, `enrollment_activity` custom sections | `PersonEmployeePlacementSection`, `PersonDrawerRelationshipsOverview`, `PersonDrawerEnrollmentActivity` |

### Tabs (parent / child operating chrome)

| Tab | Legacy | VM Phase B |
|-----|--------|------------|
| Overview | Operating + overview | Same |
| Activity (`related`) | `PersonDrawerOperatingActivityTab` | Same |
| Communications | Parent: `CommunicationsDrawerSection`; Child: placeholder | Same |
| Documents | `EntityDocumentsSection` (lazy fetch related API) | Lazy on tab visit |

### Do not use

- `AdminEntityDrawerVmShell` / placeholder VM bodies
- Legacy `opportunityInquiryWorkflow*` bootstrap on person paths
- Generic-only `employee_status` / child modules on wrong surfaces

## Phase B deliverables

1. This audit
2. `resolvePersonDrawerVmOverviewSections` — shared overview section pipeline
3. `PersonsDrawerVmBody` — tabs + production sections
4. `PersonsDrawerVmRuntime` — header/body wiring
5. `personDrawerVmParity.test.ts` — static + compose surface guards
