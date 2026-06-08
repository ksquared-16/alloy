# Person + Child Drawer Layout Runtime Cutover

**Status:** Planned — reference implementation is Opportunity drawer (`OpportunityDrawerVmRuntime`).  
**Date:** 2026-06-08  
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

| # | Requirement | Current | Target | Blocker / notes |
|---|-------------|---------|--------|-----------------|
| P1 | Proof-layout runtime header | ❌ Legacy VM header in `PersonsDrawerVmRuntime` | `PersonDrawerProofLayoutHeader` + `ProofRecordModalHeaderShell` | New header component mirroring Opportunity |
| P2 | Overview body from Layout Runtime | ❌ `PersonsDrawerVmBody` / operating sections | `DrawerLayoutRuntimeOverviewBody` + person layout API | Need `/api/admin/layout-runtime/person-drawer-body` (or shared route) |
| P3 | No `PersonDrawerOperatingSections` normal path | ❌ Active | Remove from normal path | Layout API + record mapper |
| P4 | No `EntityDrawerOverview` fallback | ❌ Possible via legacy router | Hard cutover + hold panel | Feature flag parity with Opportunity |
| P5 | Opportunity → Person no blank shell | ⚠️ Partial transition hold | Opening overlay + warm VM | Preload + `vmDrawerTransitionCoordinator` |
| P6 | Back to Opportunity seamless | ⚠️ Cache exists | Warm restore header+body together | Align `goBack()` with Opportunity pattern |
| P7 | Tabs: Overview, Comms, Notes, Docs, Activity | ⚠️ Partial | Same tab doctrine + background preload | Person tab prefetch module |
| P8 | Header: BOS → Actions → Status → Close | ❌ Different chrome | Same control row as Opportunity | Port header controls |
| P9 | Actions from runtime header (single stack) | ❌ Legacy actions | Registry modals + portal | `usePersonDrawerVmRegistryModals` |
| P10 | Save only when real editable path | ⚠️ Partial | Floating save rail + coordinator | Person-contact / layout edit registration |
| P11 | Layout widgets use real VM data | ❌ VM sections | Widget record mapper | `buildPersonLayoutRuntimeRecordFromVm` |
| P12 | Preload from Opportunity open | ❌ Not wired | Background person/child VM + layout | New preload arm in Opportunity runtime |
| P13 | DOM markers for QA | ⚠️ Partial | See DOM table below | Add `data-drawer-runtime="person-vm"` etc. |
| P14 | Emergency legacy flag only | ❌ Legacy drawer still routes some paths | `AdminEntityDrawer` routes person/child to VM only | Already routed — finish VM shell |

---

## Child Drawer Pass/Fail Matrix

| # | Requirement | Current | Target | Blocker / notes |
|---|-------------|---------|--------|-----------------|
| C1 | Proof-layout runtime header | ❌ Same as Person VM shell | Child-specific title row in proof header | `customer_member` display name |
| C2 | Overview body from Layout Runtime | ❌ VM operating sections | `DrawerLayoutRuntimeOverviewBody` | Child layout API + `child.*` + `inquiry_child.*` mapper |
| C3 | Durable child = `customer_member` | ⚠️ Partial | Record mapper uses `child.*` refKeys | FC-CM-1 field registry |
| C4 | Participation = `inquiry_child.*` | ⚠️ Partial in layout catalog | No `child_inquiry.*` anywhere | Audit mappers |
| C5 | Opportunity → Child no blank shell | ⚠️ Partial | Opening Child overlay | Preload child drawer targets |
| C6 | Back to Opportunity seamless | ⚠️ Same as P6 | Shared drawer VM cache | |
| C7 | Tabs + preload | ⚠️ Partial | Same as Opportunity | Child tab prefetch |
| C8 | Header/actions/save | ❌ | Opportunity pattern | |
| C9 | Layout widgets | ❌ | Tasks/attention if configured | Child may omit tasks — intentional empty |
| C10 | Adornment → Person/Opportunity | ⚠️ | `handleLayoutRuntimeAdornmentOpenDrawer` | Extend for child surface |
| C11 | Preload from Opportunity | ❌ | Preload linked child drawer VMs | From `_inquiry_children` / layout related list |

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
| `data-drawer-runtime="person-vm"` | Person VM runtime (to add) |
| `data-drawer-runtime="child-vm"` | Child VM runtime (to add) |
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
