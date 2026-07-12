# Person + Child Drawer Layout Runtime Cutover

**Status:** In progress — Person + Child VM runtime cutover landed; Opportunity remains canonical reference.  
**Date:** 2026-06-08 (updated)
**Do not start:** field catalog cleanup, seed/demo cleanup, broad performance refactor.

---

## Doctrine (same as Opportunity)

| Layer | Owns |
|-------|------|
| **Layout Runtime** | Drawer visual structure — sections, fields, widgets, related lists |
| **VM Runtime** | Data, lifecycle, actions, BOS, comms/notes/docs, caching/preload, navigation |
| **Contact** | Person record (`persons`) |
| **Child** | Durable `customer_member` |
| **Inquiry child** | OCM / enrollment participation (`inquiry_child.*`) — **never** `child_inquiry.*` |

**Hard rules:**
- No old hardcoded drawer body as normal path
- No old UI → new UI flash
- No duplicate old/new action stacks
- Layout hold/error when layout cannot render — not VM body fallback
- Legacy fallback only behind emergency env flag (`LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1`)

---

## Reference files (Opportunity — do not rewrite)

| Concern | File |
|---------|------|
| VM runtime shell | `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` |
| Proof header | `web/components/admin/vmDrawer/OpportunityDrawerProofLayoutHeader.tsx` |
| Layout overview body | `web/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody.tsx` |
| Layout body hook | `web/lib/layout/runtime/useDrawerLayoutRuntimeBody.ts` |
| Session cache | `web/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache.ts` |
| VM payload + cache | `web/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload.ts` |
| Action modals portal | `web/components/admin/vmDrawer/VmDrawerActionModalsPortal.tsx` |
| Opening overlay | `web/components/admin/OpportunityDrawerOpeningOverlay.tsx` |
| Tab prefetch | `web/lib/admin/opportunityDrawerTabPrefetch.ts` |
| Drawer transition | `web/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator.ts` |
| Ownership map | `docs/platform_convergence/opportunity_drawer_runtime_ownership.md` |

---

## Person Drawer Pass/Fail Matrix

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| P1 | Proof-layout runtime header | ✅ | `PersonDrawerProofLayoutHeader` + `ProofRecordModalHeaderShell` |
| P2 | Overview body from Layout Runtime | ✅ | `PersonDrawerOverviewBody` → `DrawerLayoutRuntimeOverviewBody` + `/api/admin/layout-runtime/person-drawer-body` |
| P3 | No `PersonDrawerOperatingSections` normal path | ✅ | Moved to `PersonDrawerLegacyOperatingOverview` (emergency flag only) |
| P4 | No `EntityDrawerOverview` fallback | ✅ | Hard cutover error panel; legacy behind `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1` |
| P5 | Opportunity → Person no blank shell | ⚠️ | Opening overlay + transition hold; verify in browser |
| P6 | Back to Opportunity seamless | ⚠️ | `warmRelatedDrawerGraph` + session cache — verify Person → Opp restore |
| P7 | Tabs (Overview / Activity / Docs / Comms) | ✅ | Proof tab strip; generic person = Overview only |
| P8 | Header: BOS → Actions → Status → Close | ✅ | Same shell row; Actions menu stub (empty registry) |
| P9 | Actions from runtime header (single stack) | ⚠️ | Portal pattern ready; person registry modals not wired |
| P10 | Save only when real editable path | ⚠️ | Shared floating save bar in `panelFooterChrome` |
| P11 | Layout record mapper | ✅ | `buildPersonLayoutRuntimeRecordFromVm` + `household_children` child.id |
| P12 | Preload from Opportunity open | ⚠️ | Existing graph warm — layout body session cache on navigate |
| P13 | DOM markers | ✅ | `data-drawer-runtime="person-vm"`, `data-person-drawer-layout-runtime-overview` |
| P14 | Emergency legacy flag only | ✅ | `PersonDrawerLegacyOperatingOverview` |

---

## Child Drawer Pass/Fail Matrix

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| C1 | Proof-layout runtime header | ✅ | Same shell; `dataAttribute="child-drawer-runtime"` |
| C2 | Overview body from Layout Runtime | ✅ | Child layout API uses **person id** (not customer_member id) |
| C3 | Durable child = `customer_member` fields | ✅ | `buildChildLayoutRuntimeRecordFromVm` — `child.*` refKeys |
| C4 | Participation = `inquiry_child.*` | ✅ | Mapper uses `inquiry_child.*`; no `child_inquiry.*` |
| C5 | Opportunity → Child no blank shell | ⚠️ | Opening overlay + child seed — verify in browser |
| C6 | Back to Opportunity seamless | ⚠️ | Same warm graph as P6 |
| C7 | Tabs + preload | ✅ | Operating tabs + `PersonDrawerVmTabPanes` |
| C8 | Header/actions/save | ✅ | Shared shell; Actions stub |
| C9 | Layout widgets | ⚠️ | Depends on published child LayoutDoc |
| C10 | Adornment → Person/Opportunity/Child | ✅ | `handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer` |

---

## Opportunity blank children — root cause + fix

| Item | Detail |
|------|--------|
| **Symptom** | Child Information / enrollment repeaters empty while Person household shows children |
| **Root cause** | Layout runtime mapped only `_inquiry_children`. When OCM-linked rows are empty but household members exist on the person record (`_children` / `_household_children`), `buildOpportunityLayoutRuntimeRecordFromVm` produced empty `children` / `enrollment_children` arrays. |
| **Fix** | `resolveOpportunityLayoutRuntimeChildrenRows()` — inquiry rows first, then metadata + household `_children` fallback. |
| **Data source (Person)** | Person VM `_children` / `children` from household compose |
| **Data source (Opportunity)** | `_inquiry_children` (OCM + household merge in `attachOpportunityInquiryChildrenShell`) with household fallback |
| **Layout entity** | Person drawer → `entityType: "person"` LayoutDoc; Child drawer → `entityType: "child"` LayoutDoc (separate APIs) |

---

## Browser QA checklist

- [ ] Opportunity save bar sits bottom-right inside drawer panel, above BOS, dirty-only
- [ ] Person drawer: BOS → Actions → Status → Close; Back to Lead below title (not replacing header)
- [ ] Person overview: configured LayoutDoc only — no operating sections / module pills
- [ ] Child drawer: same header shell; body from **child** LayoutDoc (not person)
- [ ] Child enrollment fields show `inquiry_child.*` values where configured
- [ ] Opportunity child repeater rows populated when household has children
- [ ] Child row adornment opens child drawer with warm navigation
- [ ] Person household child links open child drawer
- [ ] Opportunity ↔ Person ↔ Child transitions: no title-only swap / blank shell
- [ ] Tabs: navy active, neutral inactive with green accent hover (all three drawers)
- [ ] `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1` restores legacy operating overview

---

## Legacy components removed from normal path

| Component | Normal path | Emergency fallback |
|-----------|-------------|-------------------|
| `PersonsDrawerVmBody` | ❌ not routed | — |
| `PersonDrawerOperatingSections` | ❌ | ✅ `PersonDrawerLegacyOperatingOverview` |
| `EntityDrawerOverview` (person) | ❌ | ✅ legacy overview |
| `PersonsDrawerVmTabStrip` (module pills) | ❌ | — |
| Lifecycle rails in body | ❌ | ✅ legacy only (rails now in proof header when parent/child) |

---

## Drawer-to-Drawer Performance / Cache Plan

### Cache layers (reuse Opportunity stack)

1. **VM payload cache** — `putDrawerViewModelCacheEntry` / peek on open (already used by Person payload hook; extend write-on-apply).
2. **Layout body session cache** — `drawerLayoutRuntimeBodySessionCache.ts` keyed by `(entityType, entityId, layoutKey, departmentId, workUnitId)`.
3. **Tab prefetch slots** — comms threads/messages, documents, activity (person/child related API paths).
4. **Transition coordinator** — keep source drawer mounted until target `structureSettled && layoutBodyReady` (`vmDrawerTransitionCoordinator.ts`).

### Preload triggers

| When | Preload |
|------|---------|
| Opportunity drawer opens (overview ready) | Linked person ids from layout record + `_overview_data` |
| Opportunity drawer opens | Linked child/`customer_member` ids from inquiry children |
| Person drawer opens | Comms/docs/activity tabs |
| Child drawer opens | Same tab set |

### Invalidation

- Reuse `dispatchOpportunityDrawerScopedUpdate` pattern for person/child scoped refresh keys.
- Invalidate layout session cache on PATCH success for editable layout fields.
- Do not clear warm VM on drawer-to-drawer navigation — only on org/context change or explicit refresh.

### Reveal gate (no blank shell)

```
Opening overlay visible
  until: headerVmReady && layoutBodyPhase === 'loaded' && record != null
Hold prior drawer payload during transition (existing holdPriorPayload pattern)
```

Person/Child opening copy: **"Opening Person…"** / **"Opening Child…"** — mirror `OpportunityDrawerOpeningOverlay`.

---

## DOM Markers for QA

| Marker | Meaning |
|--------|---------|
| `data-drawer-runtime="opportunity-vm"` | Opportunity VM runtime body |
| `data-drawer-runtime="person-vm"` | Person VM runtime |
| `data-drawer-runtime="child-vm"` | Child VM runtime |
| `data-opportunity-drawer-opening-overlay` | Opening overlay |
| `data-drawer-composed-sticky-header` | Proof layout header mounted |
| `data-layout-runtime-drawer-body` | Layout runtime overview rendered |
| `data-layout-runtime-tasks-widget` | Tasks widget |
| `data-layout-runtime-task-detail-popover` | Task detail overlay |
| `data-opportunity-drawer-body-save-bar` | Floating save rail |
| `data-vm-drawer-action-modals-host` | Portaled action modals |
| `data-opportunity-drawer-action-overlay` | Action modal backdrop |
| `data-configured-create-form` | Configured create fields in action modal |

---

## Legacy Components to Remove from Normal Path

| Component | Entity | Replacement |
|-----------|--------|-------------|
| `PersonDrawerOperatingSections` | Person/Child | `DrawerLayoutRuntimeOverviewBody` |
| `EntityDrawerOverview` (person/opportunity sections) | Person | Layout runtime |
| `PersonsDrawerVmBody` hardcoded sections | Person/Child | Layout runtime |
| `AdminEntityDrawerLegacy` person/child paths | Person/Child | Already routed — delete dead branches after cutover |
| Duplicate header action stacks in legacy drawer | All | Single registry + VM modals portal |

---

## Remaining VM-Owned Chrome / Data (Person + Child)

- Drawer open/reveal gate + opening overlay
- Proof header: title, tabs, lifecycle rail (if applicable), BOS, Actions, Status, Close
- Registry action modals (portaled)
- Save coordinator host
- Communications / notes / documents / activity tab panes
- VM payload fetch, cache, PATCH, targeted refresh
- Back navigation + drawer stack
- BOS handoff + queue preview seed
- Preload orchestration

---

## Known Gaps (pre-cutover)

1. Person/Child layout runtime API routes may not exist or may lag Opportunity route.
2. `buildPersonLayoutRuntimeRecordFromVm` / child mapper not production-complete.
3. Person registry modals not extracted from legacy drawer.
4. No Opportunity → Person/Child preload arm yet.
5. Child drawer lifecycle rail ownership undefined (likely VM like Opportunity).
6. Person drawer may not expose `inquiry_child.*` on child surface — confirm product mapping.
7. Tests for person/child layout runtime body binding not yet mirrored from Opportunity suite.

---

## Suggested Implementation Order

1. Person layout runtime API + record mapper + hard cutover flag
2. `PersonDrawerProofLayoutHeader` + `PersonDrawerVmRuntime` shell (clone Opportunity structure)
3. Tab panes + prefetch + comms background loader
4. Registry modals portal + header actions
5. Drawer-to-drawer transition + preload from Opportunity
6. Child surface: separate layout key / mapper (`child.*` + `inquiry_child.*`)
7. Browser QA pass against matrices above
8. Remove legacy normal-path branches

---

## Acceptance Criteria (browser beats tests)

- [ ] Opportunity → Person: no blank shell; header + body appear together
- [ ] Opportunity → Child: same
- [ ] Back to Opportunity: instant from warm cache
- [ ] Reopen recent Person/Child: instant
- [ ] Overview renders from Layout Runtime only
- [ ] No VM body fallback in normal runtime
- [ ] No `child_inquiry.*` namespace
- [ ] Actions modals over drawer; drawer stays open
- [ ] Tabs switch without full reload feel
