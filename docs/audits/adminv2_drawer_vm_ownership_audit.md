# AdminV2 Drawer VM Ownership Audit

**Status:** Audit only (no implementation).  
**Baseline commit audited:** `d6c7e05e` — *Stabilize VM first-paint for work unit actions, drawer swaps, and opportunity status.*  
**Reverted regression range:** `d6c7e05e..a68c7ef2` (staging reset target vs broken VM-shell work).  
**Date:** 2026-06-04  

**Related:** `docs/system/adminv2-runtime-performance-doctrine.md`, `docs/audits/drawer-to-drawer-navigation-vm-audit.md`, `docs/audits/drawer_runtime_state_machine_audit_2026-06.md`

---

## Executive summary

AdminV2 CRM drawers (Opportunity, Person, Child) have **two parallel runtime stacks**:

1. **Legacy monolith** — `AdminEntityDrawerLegacy.tsx` (~19k lines): full production presentation, bootstrap/hydrate gates, composed-payload reveal.
2. **VM runtimes** — `AdminEntityDrawer.tsx` router + `vmDrawer/*`: VM-first data/preload/cache, **partial presentation** (especially Opportunity).

At `d6c7e05e`, VM is **opt-in per entity** via build-time env flags (all default **off**). The reverted `a68c7ef2` work flipped to **VM-on-by-default** (kill-switch only) and introduced **`AdminEntityDrawerVmShell`** — a unified shell that moved header/tab/lifecycle ownership and still failed parity with legacy for several regions.

**Core overlap problem:** VM owns **mount routing + fetch contract** while legacy still owns **most production UI**. The safe commit does not merge them — it **forks** at `AdminEntityDrawer`. Opportunity VM fork renders a **slim placeholder overview**, not legacy inquiry workflow UI.

---

## Part 1 — Runtime path map

### Feature gates (baseline `d6c7e05e`)

| Flag | Env var | Default | Hard-cutover gate |
|------|---------|---------|-------------------|
| Opportunity VM | `NEXT_PUBLIC_ADMINV2_DRAWER_VM` | off | `opportunityDrawerHardCutoverEnabled()` |
| Person VM | `NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM` | off | `personDrawerHardCutoverEnabled()` |
| Child VM | `NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM` | off | `childDrawerHardCutoverEnabled()` |

Router: `web/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute.ts`  
Entry: `web/components/admin/AdminEntityDrawer.tsx`

**Reverted `a68c7ef2`:** single `adminV2DrawerVmCutoverEnabled()` — **true unless kill switch**; route becomes `vm_shell` → `AdminEntityDrawerVmShell.tsx`.

---

### 1. Opportunity drawer

| Stage | Path (VM cutover ON @ d6c7e05e) | Path (legacy / flag OFF) |
|-------|--------------------------------|---------------------------|
| **Open source** | WU queue row: `openWorkUnitQueueRecord` → `buildOpportunityDrawerOpenParams` + `prefetchOpportunityDrawerOnRowIntent` (`page.tsx`). Actions, global search, related icons, tour modal callbacks → `openDrawer({ type: "opportunities", ... })`. | Same `openDrawer` entry; no VM router. |
| **Context** | `AdminDrawerContext.openDrawer` / `openDrawerModelSwap` (eligible opp↔person swaps). Deferred open: `shouldDeferOpportunityDrawerOpen` + `openingOpportunity` gate. | Same. |
| **Preload** | `prepareDrawerViewModel` / `peekDrawerViewModelPreloadSync` / `consumeOpportunityDrawerPreload` (`drawerShellPinnedModelSwap.ts`, `drawerModelSwapNavigation.ts`). WU `prepareDrawerViewModel` on person/child intent. | `prefetchOpportunityDrawerOnRowIntent`, bootstrap snapshot, queue seed on drawer state. |
| **VM compose** | `loadOpportunityDrawerViaViewModel` → `fetchOpportunityDrawerViewModelClient` → `composeOpportunityDrawerViewModel` → `buildOpportunityDrawerOpenPreloadFromViewModel`. | Shadow VM optional in legacy via `buildOpportunityDrawerPipelineStateFromViewModel`; **primary** path uses bootstrap + `drawer_primary` hydrate. |
| **Cache** | `drawerViewModelSessionCache` keyed by org/dept/WU + `buildDrawerViewModelCacheKey`. Session preload ref in `AdminDrawerContext`. | Entity snapshot cache, header-actions cache, opportunity drawer preload ref, route session patterns. |
| **Legacy path** | **Not mounted** when route = `opportunity`. Legacy bootstrap **skipped** in code if hard cutover (but legacy unmounted anyway). | `AdminEntityDrawerLegacy`: `fetchOpportunityDrawerOperationalBootstrap` → primary hydrate → composed reveal gates → full inquiry UI. |
| **Component mounted** | `OpportunityDrawerVmRuntime` | `AdminEntityDrawerLegacy` |
| **Body** | Slim grid: record name card + `VmInquiryRightColumn` only (`OpportunityDrawerVmRuntime.tsx` ~L181–210). **No** `FamilyContactsPanel`, inquiry children, tour block, lifecycle in body. | `FamilyContactsPanel`, `OpportunityInquiryChildrenSection`, tour blocks, pipeline-driven layout (`AdminEntityDrawerLegacy` ~L16359+). |
| **Header** | `Drawer` title/subtitle from VM; `OpportunityDrawerHeaderControls` (actions); `VmOpportunityStatusControl` (`statusBadge`). | Rich workflow header: location, lifecycle strip, oper trust, queue seed calm-loading, `opportunityInquiryWorkflowHeaderStatus`, modal 3-column layout. |
| **Status** | VM `displayVm.header.status` → `VmOpportunityStatusControl`; queue seed pill during `holdPriorPayload`. Legacy status-options fetch **blocked** when hard cutover + legacy mounted (N/A when VM runtime). | `statusDefsForDrawer` + `/api/admin/status-options` with VM pin reconciliation when shadow VM settled. |
| **Tabs** | Simple button strip from `displayVm.layout.tabs` (often `overview` + `communications` only). | `OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP` + workflow tab mount gates + lazy tab panes. |
| **Loading / skeleton** | `coldLoading` → centered "Loading opportunity…"; swap: `shouldHoldPriorDrawerContent` + `suppressFullDrawerLoading`; queue nav overlay. | `opportunityDrawerHeaderCalmLoading`, pipeline reveal gates, `DrawerOpportunityOperationalLoadingComposition`, section skeletons (forbidden for above-fold per doctrine — legacy still has coordinated gates). |
| **First-paint fetches** | `useOpportunityDrawerVmPayload` layout effect: preload consume → sync cache → else `loadOpportunityDrawerViaViewModel`. | Bootstrap API, then primary contract; status seed from record. |
| **Post-paint fetches** | `CommunicationsDrawerBackgroundLoader`; comms tab `CommunicationsDrawerSection`. No notes/documents/activity in VM runtime. | Background full hydrate, tour bookings, inquiry children hydrate, tab-first-visit fetches, communications loader. |

**Summary table**

| Entity | Open source | VM path | Legacy path | Current owner @ d6c7e05e (VM on) | Overlap risk |
|--------|-------------|---------|-------------|-----------------------------------|--------------|
| Opportunity | `openDrawer` / WU queue / model swap | `OpportunityDrawerVmRuntime` + `useOpportunityDrawerVmPayload` | `AdminEntityDrawerLegacy` (unmounted) | **VM data + VM slim UI** | **High** — same VM payload could feed legacy UI but does not; presentation fork |

---

### 2. Person drawer

| Stage | Path (person VM ON @ d6c7e05e) | Path (legacy) |
|-------|--------------------------------|---------------|
| **Open source** | `queue_row_person`, `opportunity_primary_contact`, `opportunity_household_adult`, `person_household_link`, global search, household links. | Same |
| **Preload** | `prepareDrawerViewModel` (person surface), `consumePersonDrawerPreload`, sync cache peek | `prefetchPersonDrawerSnapshot`, composed person payload loop in legacy |
| **VM compose** | `loadPersonDrawerViaViewModel` → `composePersonDrawerViewModel` → `evaluateComposedPersonDrawerPayload` | Legacy GET `/api/admin/entity/persons/:id` + composed gates |
| **Cache** | `drawerViewModelSessionCache` surface `person` | `putDrawerEntitySnapshot`, person drawer preload ref |
| **Legacy path** | **Not mounted** (route `person` or `child` → both use **`PersonsDrawerVmRuntime`**) | Full legacy person chrome + `PersonDrawerOperatingSections` via layout runtime |
| **Component mounted** | `PersonsDrawerVmRuntime` (not `PersonDrawerVmRuntime.tsx`) | `AdminEntityDrawerLegacy` |
| **Body** | `PersonDrawerOperatingSections` via `layoutVariantFromPersonVm` | Same sections + enrollment activity + employee placement + `PersonDrawerRelationshipsOverview` in overview map |
| **Header** | VM `header.title` / `header.subtitle` + `VmPersonStatusControl` only | `PersonDrawerParentTitleRow` / `PersonDrawerHeaderMetadata` / profile badges / back link in subtitle |
| **Status** | VM `status_label` readonly pill | Profile-aware status fetch in legacy |
| **Tabs** | None in VM runtime (single scroll body) | Legacy drawer tabs when configured |
| **Loading** | Cold text shell; swap hold via `usePersonsDrawerVmPayload` | `personDrawerComposedPreparing`, parent/child overview skeletons |
| **First-paint** | Preload → `loadPersonDrawerViaViewModel` | VM hard-cutover effect in legacy (~L3305) **only when legacy mounted** |
| **Post-paint** | `warmRelatedDrawerTargetsAfterVmApply` | Legacy refetch on mutation paths |

**Summary table**

| Entity | Open source | VM path | Legacy path | Current owner @ d6c7e05e (VM on) | Overlap risk |
|--------|-------------|---------|-------------|-----------------------------------|--------------|
| Person | `openDrawer` / model swap / WU prefetch | `PersonsDrawerVmRuntime` + `usePersonsDrawerVmPayload` | Legacy unmounted | **VM data + partial legacy body components** | **Medium** — body mostly production sections; header/chrome missing |

---

### 3. Child drawer

| Stage | Path (child VM ON @ d6c7e05e) | Path (legacy) |
|-------|-------------------------------|---------------|
| **Open source** | `opportunity_inquiry_child` or seed `presentation_emphasis: child_lifecycle` (`isChildDrawerVmOpen`) | Same |
| **VM compose** | `loadChildDrawerViaViewModel` → `composeChildDrawerViewModel` (sets `_drawer_presentation_emphasis: child_lifecycle`) | Legacy child chrome detectors + composed child payload |
| **Router** | `resolveVmDrawerRuntimeRoute` → `"child"` but **`AdminEntityDrawer` maps `person` and `child` to `PersonsDrawerVmRuntime`** | `personChildLifecycleChrome` branches in legacy |
| **Body** | `PersonDrawerChildLifecycleRail` + `PersonDrawerOperatingSections` with child layout variant | `PersonDrawerChildTitleRow`, child header subtitle, child skeletons, lifecycle rail |
| **Header** | Generic VM title "Child" / VM subtitle | `PersonDrawerChildTitleRow` + record number + back link |
| **Surface mismatch risk** | `layoutVariant` null if `isChildSurface` disagrees with `displayVm.surface` → **empty body** | Explicit chrome flags |

**Summary table**

| Entity | Open source | VM path | Legacy path | Current owner @ d6c7e05e (VM on) | Overlap risk |
|--------|-------------|---------|-------------|-----------------------------------|--------------|
| Child | inquiry child / child seed | `PersonsDrawerVmRuntime` + child branch in `usePersonsDrawerVmPayload` | Legacy unmounted | **VM data + partial child body** | **Medium–high** — wrong surface/cache → generic person/empty body |

---

## Part 2 — Ownership inventory

Legend: **VM** = VM runtime component/field; **Legacy** = `AdminEntityDrawerLegacy`; **Shared** = used by both; **Unclear** = split or dead code.

| Region | VM owner | Legacy owner | Actual owner @ d6c7e05e (VM flags ON) | Conflict? | Risk |
|--------|----------|--------------|--------------------------------------|-----------|------|
| Drawer shell/chrome | `Drawer` in `*VmRuntime` | `Drawer` in legacy | VM runtime `Drawer` | No | Low |
| Header title | VM `header.title` | `formatOpportunityInquiryDrawerTitle` / person title rows | Opp: VM; Person: VM plain string; Child: VM "Child" default | **Yes** | High for person/child |
| Header subtitle | VM `header.subtitle` | Workflow compact record #, location, person metadata | VM only (lossy) | **Yes** | High |
| Status | `VmOpportunityStatusControl` / `VmPersonStatusControl` | Status dropdown + options API + workflow header status | VM controls | Partial | Medium — opp VM status OK; legacy pin logic unused when VM mounted |
| Header actions | `OpportunityDrawerHeaderControls` in VM | Same + save nodes + queue nav placement | Opp: **Shared** component; Person: legacy only when legacy | Partial | Low opp / high person |
| Lifecycle rail | **None** in VM opp runtime | `RecordLifecycleRail` in legacy workflow header/postTab | Legacy only (VM opp missing) | **Yes** | High |
| Tabs | VM simple strip (opp) | `OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP` + gates | Opp VM partial; Person none | **Yes** | High |
| Overview body | `VmInquiryRightColumn` + name card (opp VM) | Full inquiry workflow layout | **VM placeholder (opp)** / `PersonDrawerOperatingSections` (person) | **Yes** | Critical (opp) |
| Family/contact summary | **None** (opp VM) | `FamilyContactsPanel` | Legacy only | **Yes** | Critical |
| Multiple contacts | **None** (opp VM) | `FamilyContactsPanel` + related people | Legacy only | **Yes** | Critical |
| Inquiry children | **None** (opp VM) | `OpportunityInquiryChildrenSection` | Legacy only | **Yes** | Critical |
| Tour block | **None** (opp VM) | `OpportunityInquiryTourDateBlock` / what-matters slots | Legacy only | **Yes** | High |
| Tasks/reminders | `VmInquiryRightColumn` (partial) | `OpportunityInquirySummaryRightColumn` / operational strip | Shared data model, **different components** | Partial | Medium |
| Communications tab | `CommunicationsDrawerSection` | Same + tab visit tracking | **Shared** | No | Low |
| Notes tab | **None** (opp VM) | Legacy tab panes | Legacy only | **Yes** | High |
| Documents tab | **None** (opp VM) | Legacy tab panes | Legacy only | **Yes** | High |
| Activity tab | **None** (opp VM) | Legacy tab panes | Legacy only | **Yes** | High |
| Person household section | `PersonDrawerHouseholdSection` via `PersonDrawerOperatingSections` | Same + relationships overview | **Shared** body components when person VM on | No | Low |
| Child household section | Same (child variant sections) | Same | **Shared** if layout resolves | Partial | Medium if variant wrong |
| Loading shell | VM cold text / swap hold | Pipeline gates, calm loading, skeletons | VM swap hold; legacy gates dormant | Partial | Medium |
| Skeletons | VM avoids section skeletons | Child/parent overview skeletons | Person VM: minimal; Legacy path: coordinated | Partial | Medium |

---

## Part 3 — Conflict / overlap: why `a68c7ef2` broke presentation

### What changed after `d6c7e05e`

| Area | `d6c7e05e` (safe) | `a68c7ef2` (reverted) |
|------|-------------------|------------------------|
| Router | Per-entity routes → `OpportunityDrawerVmRuntime` / `PersonsDrawerVmRuntime` | Single `vm_shell` → `AdminEntityDrawerVmShell` |
| Feature gates | Opt-in env flags (default off) | **Default ON** unless kill switch |
| Opportunity body | Slim placeholder in `OpportunityDrawerVmRuntime` | `OpportunityDrawerVmBody` + **`OpportunityDrawerInquiryWorkflowOverview`** (production panels) |
| Person/child body | `PersonsDrawerVmRuntime` | `PersonDrawerVmBody` (same sections, no title rows) |
| Header layout | Status in `statusBadge` slot | Status moved to **`headerTitleCenter`**; tabs in `headerExtra`; lifecycle in `postTabStrip` |
| Dead runtimes | `PersonDrawerVmRuntime`, `ChildDrawerVmRuntime` unused | Still unused (shell uses `PersonsDrawerVmPayload` only) |

### Root-cause answers

| Symptom | Why |
|---------|-----|
| **Opportunity lost real body** | At **d6c7e05e**, VM ON already shows **placeholder** overview (name + `VmInquiryRightColumn` only). **`a68c7ef2`** added production overview but coupled it to **shell display logic** (`useVmDrawerShellDisplay`): if `activeOpportunityVm` not ready and pin/hold fails → cold shell or empty body. Forced **default VM ON** exposed this on all staging traffic. |
| **Multiple contacts disappeared** | Not rendered in `OpportunityDrawerVmRuntime` at d6c7e05e. In a68c7ef2, `FamilyContactsPanel` lives in `OpportunityDrawerInquiryWorkflowOverview` — requires **full VM record** + `family_contacts` slot; shell hold showing wrong surface or cold shell blocks overview. |
| **Child drawer generic / employee-only** | `PersonDrawerOperatingSections` uses `layoutVariantFromChildVm` / person variant. If **`isChildSurface` vs `displayVm.surface` mismatch** (stale person VM during child open, or cross-surface pin), `layoutVariant` is **null** → no body; if person VM used, **generic/employee** sections appear. Shell **`accentColor`** logic used `activeOpportunityVm` and caused **wrong chrome** during opp→child swaps. |
| **Person header lost context** | VM runtimes never ported **`PersonDrawerHeaderMetadata`**, **`PersonDrawerParentTitleRow`**, **`PersonDrawerChildTitleRow`**, back links, record numbers. a68c7ef2 shell used flat `title`/`headerSubtitle` from VM header fields only. |
| **Placeholder "Family inquiry" title** | VM `buildOpportunityDrawerHeaderTitle` uses `record.name` / `title` / `_customer_name`. Slim VM card also uses `record.name ?? record.title ?? "Inquiry"`. Legacy uses **`formatOpportunityInquiryDrawerTitle`**. VM record shape without inquiry formatting → generic titles. |

### Placeholder / dead-end components (do not treat as canonical body)

| Component | Notes |
|-----------|--------|
| `OpportunityDrawerVmRuntime` overview block (~L193–201) | Name card only; not production inquiry workflow |
| `VmInquiryRightColumn` | VM-only tasks column; subset of `OpportunityInquirySummaryRightColumn` |
| `PersonDrawerVmRuntime.tsx` | **Not routed** by `AdminEntityDrawer` |
| `ChildDrawerVmRuntime.tsx` | **Not routed** |
| `usePersonDrawerVmPayload` / `useChildDrawerVmPayload` | Used only by dead runtimes above |
| VM cold-loading text shells | UX placeholder, not production loading composition |

### Production components that must be preserved (reuse under VM data ownership)

| Component | Role |
|-----------|------|
| `FamilyContactsPanel` | Multiple contacts / family summary |
| `OpportunityInquiryChildrenSection` | Inquiry children |
| `OpportunityInquiryTourDateBlock` / tour slots in inquiry summary | Tour block |
| `OpportunityInquirySummaryRightColumn` or parity with `VmInquiryRightColumn` | Tasks/reminders (prefer production column when hydrate allows) |
| `OpportunityInquirySummaryActivity` | Activity summary in overview |
| `RecordLifecycleRail` | Lifecycle rail |
| `OpportunityDrawerHeaderControls` | Header actions (already in VM opp) |
| `CommunicationsDrawerSection` / `CommunicationsDrawerBackgroundLoader` | Comms |
| Legacy tab panes (notes, documents, activity) | Non-overview tabs |
| `PersonDrawerOperatingSections` + household components | Person/child body |
| `PersonDrawerChildLifecycleRail` | Child lifecycle |
| `PersonDrawerChildTitleRow` / `PersonDrawerParentTitleRow` / `PersonDrawerHeaderMetadata` | Person/child header context |
| `PersonDrawerRelationshipsOverview` | Household relationships (non-chrome person) |
| `formatOpportunityInquiryDrawerTitle` + workflow header subtitle stack | Opportunity header context |

### Components that should never be canonical drawer body alone

- `OpportunityDrawerVmRuntime` inner name-only card (placeholder).
- `VmInquiryRightColumn` as **sole** overview content.
- Empty `layoutVariant` fallback rendering employee/generic person layout for child opens.
- `AdminEntityDrawerVmShell` without verified parity tests (shell may be fine **after** body adapter proven — not before).

**Note:** `a68c7ef2`'s `OpportunityDrawerInquiryWorkflowOverview` is the **right direction** (production composition) but must not ship with gate flip + shell header moves until parity tests pass.

---

## Part 4 — Safe VM cutover strategy (design only)

### Principles

1. **VM owns:** preload, cache keys, compose API, first-paint contract, swap hold, stale guards — per `adminv2-runtime-performance-doctrine.md`.
2. **Production UI owns:** layout/header/body components listed above — fed by VM payload adapter, not reimplemented slim placeholders.
3. **No default-on gate flip** until parity suite green; keep per-entity env flags until Phase D.
4. **Do not mount legacy + VM** for the same entity; single router fork with legacy fetch paths **blocked** when VM route active (already partially true).

### Phase A — VM data ownership only

- Keep `AdminEntityDrawer` router as d6c7e05e (per-entity runtimes) or thin shell **without** header moves.
- VM provides full `OpportunityDrawerViewModel` / person / child VM via existing compose paths.
- Add **payload adapter** layer: `vmRecord → legacy overview props` (record, shell contract, inquiry_summary).
- Render **legacy overview subtree** (`FamilyContactsPanel`, inquiry children, tour, etc.) inside VM route using VM data.
- Block `fetchOpportunityDrawerOperationalBootstrap`, legacy `drawer_primary` first paint, and person legacy GET when VM route active (verify no double fetch).
- **Presentation unchanged** — user sees legacy UI components.

### Phase B — Header/status stabilization

- Keep legacy header components; feed status from `displayVm.header.status` / VM status defs pin.
- No `/api/admin/status-options` before first paint when VM authoritative (extend existing `opportunityDrawerVmStatusReconciliation` patterns).
- Person: restore `PersonDrawerHeaderMetadata` / child/parent title rows driven by VM record + openSource.

### Phase C — Shell-pinned movement (optional)

- Introduce **one** `Drawer` host only after Phase A+B parity tests pass.
- Swap `displayVm` only; use `useVmDrawerShellDisplay`-style hold **without** changing tab/status placement initially.
- Port `OpportunityDrawerInquiryWorkflowOverview`-style body into VM route before shell consolidation.

### Phase D — Remove legacy path

- Delete legacy opportunity/person/child first-paint branches only when:
  - Parity tests green (Part 5).
  - Runtime determinism suite green (doctrine § Required tests).
  - Flags default to VM with kill switch only.

---

## Part 5 — Required regression tests (before implementation)

### Opportunity

- [ ] Renders same body sections as legacy overview (family/contacts, inquiry children, tour, what-matters).
- [ ] Renders **multiple contacts** (FamilyContactsPanel rows > 1 when seed data says so).
- [ ] Renders **inquiry children** section when shell contract includes `inquiry_children`.
- [ ] Renders **tour block** when metadata/bookings slots active.
- [ ] Renders **lifecycle rail** (steps or skeleton when queue definition pending).
- [ ] Tabs: communications, notes, documents, activity — each mounts production pane.
- [ ] Does **not** show placeholder-only overview (`data-drawer-vm-runtime-overview` without `data-opportunity-inquiry-summary`).
- [ ] Does **not** use generic title when inquiry title formatter would differ.
- [ ] Status stable across open → no options-fetch flicker before first paint.

### Person

- [ ] Header shows **PersonDrawerHeaderMetadata** or parent title row (record #, back link).
- [ ] **Household relationships** section when data present.
- [ ] Can open linked household member / opportunity from drawer.

### Child

- [ ] **Child-specific** body (lifecycle rail, child variant sections).
- [ ] Does **not** fall back to employee-only/generic person layout.
- [ ] Household relationships / child household sections render.

### Runtime

- [ ] VM first paint does **not** call legacy bootstrap or `drawer_primary` for that entity.
- [ ] Drawer-to-drawer cached swap does **not** show full loader (hold prior + suppress cold shell).
- [ ] Uncached swap holds current drawer content until target VM `structureSettled` + composed ready.
- [ ] Child open from opportunity uses **child** VM surface in cache key (no person surface bleed).

**Suggested test locations:** extend `web/tests/adminV2/viewModel/vmDrawerRuntime.test.ts`, add DOM/contract tests beside `opportunityDrawerViewModelContract.test.ts`, `personDrawerViewModel.test.ts`, `childDrawerViewModel.test.ts`, and drawer determinism tests in doctrine.

---

## Part 6 — Conflict / overlap summary table

| Layer | VM | Legacy | Overlap | Resolution |
|-------|-----|--------|---------|------------|
| Router mount | `AdminEntityDrawer` → VM runtimes | `AdminEntityDrawerLegacy` | Mutual exclusive | Keep single fork |
| Compose/fetch | `load*ViaViewModel`, session cache | bootstrap + primary + composed evaluate | Same APIs, different callers | VM only on VM route |
| Opportunity UI | Placeholder overview | Full inquiry workflow | **No shared body** | Phase A adapter |
| Person UI | Operating sections only | Full chrome + sections | Partial shared sections | Port header chrome |
| Child UI | Combined persons runtime | Child chrome branches | Surface detection | Enforce cache surface + title rows |
| Feature flags | Per-entity opt-in @ d6c7e05e | N/A | a68 default-on | **Do not repeat** |

---

## Recommendation

### Implement next (smallest safe progress on `d6c7e05e`)

1. **Phase A for Opportunity only:** VM data route unchanged; replace placeholder overview in `OpportunityDrawerVmRuntime` with legacy composition extracted from `AdminEntityDrawerLegacy` (or port `OpportunityDrawerInquiryWorkflowOverview` from a68c7ef2 **without** shell/gate changes).
2. **Keep per-entity env flags** default off; enable in staging selectively for opportunity only after parity tests.
3. **Person/child:** keep `PersonsDrawerVmRuntime` but add legacy header chrome components before enabling person/child flags broadly.
4. **Wire parity tests** (Part 5) before any staging default-on.

### Do NOT touch (until parity proven)

- `adminv2-runtime-performance-doctrine.md` reveal gates, cache keys, `evaluateComposedDrawerPayload` predicates.
- **Do not** re-land `a68c7ef2` gate model (VM default-on) without kill-switch discipline and full test pass.
- **Do not** use `AdminEntityDrawerVmShell` + `headerTitleCenter` status move until opportunity body parity verified on per-entity runtimes first.
- **Do not** delete `AdminEntityDrawerLegacy` opportunity/person branches (Phase D only).
- **Do not** route to `PersonDrawerVmRuntime` / `ChildDrawerVmRuntime` without reconciling with `PersonsDrawerVmRuntime` and tests.

### Files inspected (blast radius)

- `web/components/admin/AdminEntityDrawer.tsx`
- `web/components/admin/AdminEntityDrawerLegacy.tsx` (opportunity/person/header/fetch sections)
- `web/components/admin/vmDrawer/*`
- `web/contexts/AdminDrawerContext.tsx`
- `web/lib/adminV2/viewModel/drawer/**` (gates, compose, vmRuntime, model swap)
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` (open/preload)
- Git diff `d6c7e05e..a68c7ef2` (23 files, +1531/−242)

---

## Appendix — Key code anchors

```14:27:web/components/admin/AdminEntityDrawer.tsx
export default function AdminEntityDrawer() {
    const pathname = usePathname();
    const { drawer } = useAdminDrawer();
    const route = resolveVmDrawerRuntimeRoute(drawer, pathname);

    if (route === "opportunity") {
        return <OpportunityDrawerVmRuntime />;
    }
    if (route === "person" || route === "child") {
        return <PersonsDrawerVmRuntime />;
    }

    return <AdminEntityDrawerLegacy />;
}
```

```24:41:web/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute.ts
    if (drawer.type === "opportunities" && opportunityDrawerHardCutoverEnabled()) {
        return "opportunity";
    }

    if (drawer.type === "persons") {
        const childOpen = isChildDrawerVmOpen({ ... });
        if (childOpen && childDrawerHardCutoverEnabled()) {
            return "child";
        }
        if (personDrawerHardCutoverEnabled()) {
            return "person";
        }
    }

    return "legacy";
```

```181:210:web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx
                        {drawerTab === "overview" ?
                            <div ... data-drawer-vm-runtime-overview="true">
                                <div className={clsx("grid gap-3", ...)}>
                                    <div className="...">
                                        <h3>...</h3>  {/* placeholder — not FamilyContactsPanel */}
                                    </div>
                                    {rightColumn ?
                                        <VmInquiryRightColumn ... />
                                    :   null}
                                </div>
                            </div>
                        :   null}
```

**Suggested commit message (doc only):** `docs: add AdminV2 drawer VM ownership audit (d6c7e05e baseline vs a68c7ef2 regression)`
