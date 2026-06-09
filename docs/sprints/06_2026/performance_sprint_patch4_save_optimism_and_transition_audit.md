# Performance Sprint Patch 4 — Save All Optimism + Transition System Audit

**Status:** Complete (not committed — review gate)  
**Patches 1–3:** merged to staging  
**Patch 4 Part A:** implemented  
**Patch 4 Part B:** audit only (no transition implementation)

---

## Part A — Save All Optimism

### Root cause (pessimistic waiting)

1. **Sequential server-await** — `drawerOperatingSaveAll` awaited each dirty section in order; inquiry children and layout child rows looped sequentially inside sections.
2. **Server-first UI** — layout-runtime Save All invalidated/refetched the layout body (`dispatchDrawerLayoutRuntimeBodyInvalidate`) instead of patching VM/display record in place.
3. **No optimistic baseline** — drafts stayed dirty until all PATCHes succeeded; Save button stayed in “Saving…” while fields remained in edit state.
4. **Legacy inquiry path** — `onChildrenMutated` triggered full VM reload after each row save.
5. **Partial optimism existed elsewhere** — tour booking, queue display patches, add-child blocks — but not wired into Save All.

### Implementation summary

| Area | Change |
|------|--------|
| `drawerOperatingSaveCoordinator.ts` | Optimistic phase → parallel `Promise.all` section confirms → per-section rollback on failure; `[perf:save]` phases |
| `LayoutRuntimeDrawerEditProvider.tsx` | `applyOptimistic` / `rollbackOptimistic`; in-place VM + layout body record patch; no body invalidate on Save All |
| `applyLayoutRuntimeDraftToRecord.ts` | Merge person contact + child repeater draft onto proof record |
| `drawerLayoutRuntimeBodyRecordPatch.ts` | In-place layout body record patch event (no refetch flash) |
| `useDrawerLayoutRuntimeBody.ts` | Listens for record patch; updates session cache |
| `layoutRuntimeChildFieldEdit.ts` | Parallel dirty child row saves (`Promise.all`) |
| `OpportunityInquiryChildrenSection.tsx` | Optimistic queue patches + parallel row confirms; skip full VM reload on Save All |
| Person drawer sections | Shared optimistic handlers (`personDrawerOptimisticSectionHandlers.ts`) |
| `PersonEmployeePlacementSection.tsx` | Optimistic apply when `deferSave` (drawer coordinator path) |

### Before / after behavior

| Action | Before | After |
|--------|--------|-------|
| Save All (layout runtime) | Sequential PATCH → body invalidate/refetch → visible wait | Draft commits immediately → VM/body record patch → parallel PATCH confirm in background |
| Save All (inquiry children) | Sequential rows → full VM reload per row | Optimistic queue patch + row “saved” → parallel row PATCH |
| Save All (person drawer) | Sequential sections; fields disabled while saving | Optimistic record merge → parallel section PATCH; fields stay editable during confirm |
| Save button | Blocked until all sections finish | Optimistic apply clears dirty immediately; button shows brief “Saving…” during confirm only |
| Failure | First error aborts; no rollback of prior sections | Failed section rolls back optimistic state; error propagates |

### Independent save groups (parallel-safe)

- Person drawer: `parent_summary`, `child_summary`, `household_address`, `employee_placement`
- Opportunity coordinator sections: `layout_runtime_person_contact` vs `opportunity_inquiry_children` (layout `saveOrder: 0`, inquiry `saveOrder: 1` — both run in parallel batch; order only affects sort key)
- Within layout section: person contact ∥ child repeater rows (parallel); per-row identity → OCM remains ordered inside row

### `[perf:save]` events

Emitted via `perfSave()` → `[perf:save]` namespace:

- `mutation_start` — `section_count`, `optimistic`, `rollback_required`
- `optimistic_applied` — `section`
- `section_start` — `section`, `optimistic`
- `section_confirm` — `section`, `duration_ms`, `optimistic`, `rollback_required`, `source: server`
- `section_error` — `section`, `duration_ms`, `rollback_required`, `error`
- `rollback` — `section`, `rollback_required: true`
- `mutation_confirm` / `mutation_error` — aggregate timing + failed sections

### Tests

- `web/tests/admin/drawer/drawerOperatingSaveCoordinator.test.ts` — optimistic order, parallel confirm, rollback, perf phases
- `web/tests/layout/applyLayoutRuntimeDraftToRecord.test.ts` — record merge helper
- Existing: `opportunityDrawerSaveDoctrine.test.ts`, `personDrawerHardeningPhase2.test.ts`, `linkedRecordFieldEditing.test.ts` (blur-save unchanged)

### Remaining risks

1. **Partial multi-section failure** — successful sections remain committed on server; only failed section rolls back optimistic UI.
2. **Household address create path** — optimistic apply assumes existing `location_id`; first-time address create may need server confirm before optimistic row has stable id.
3. **Legacy opportunity form + coordinator** — header still runs `onSaveForm` before coordinator (unchanged); possible duplicate person-field writes if both paths dirty.
4. **Status / lifecycle rails** — still outside Save All; unchanged server-first behavior.

---

## Part B — Transition System Audit (recommendations only)

### Navigation doctrine questions

| Transition | Current | Recommendation (Patch 5) |
|------------|---------|---------------------------|
| Queue row → drawer | Row “Opening…” + full-screen overlay + VM cold text | **Hold row highlight** + composed drawer reveal; **remove triple overlay** (Q4 + D1 + D3) |
| Drawer → linked drawer | Icon spinner / “Opening…” text / runtime overlay | **Keep prior drawer body** (`holdPriorPayload`) + **short crossfade**; retire micro-spinners when VM cache hits |
| Back navigation | VM session cache + layout body cache (Patches 1–3) | **Zero loader on cache hit**; quiet top ribbon on miss only |
| Work unit navigation | Page loading gate + occasional row skeletons | **Hold prior rows** until replacement ready (`rowsHeld` doctrine); remove Q1 row skeletons (conflicts with `adminV2QueueMayShowRowSkeleton === false`) |
| Page navigation | `AdminV2RouteLoadingState` centered spinner | **Shell stays mounted**; top ribbon + in-place content crossfade |

### Loading inventory (summary)

See subagent inventory — ~48 distinct indicators across workspace, WU, queue, drawer, tabs.

### Classification table

| Category | Count | Examples |
|----------|-------|----------|
| **Safe To Remove** | ~8 | Null route `loading.tsx`; dead cold shells; Q1 row skeletons when page gate owns reveal |
| **Replace With Transition** | ~25 | Page gates P3–P5; queue→drawer triple open; linked pending L1–L3; tab “Loading activity/documents” |
| **Must Remain** | ~15 | `rowsHeld`; refresh shimmer Q3; cold drawer shell D7/D8; comms footprint skeleton T5; mutation feedback T12 |

### Recommended Patch 5 — Transition System

**Principles**

- Hold previous surface until replacement is ready (no blank shell)
- Pressed / selected state on nav targets (`data-adminv2-nav-pending` → visual pressed, not spinner)
- Row highlight on queue→drawer (subject focus already wired via `_queue_row_context`)
- Subtle opacity crossfade (150–220ms) for drawer model swap — extend `holdPriorPayload`
- Top indeterminate ribbon for route transitions only (`AdminV2NavigationTransitionRibbon` unified)
- Avoid: centered spinners, page-wide skeletons, section pop-in

**Priority order**

1. Consolidate queue→drawer open affordance (one surface, not three)
2. Linked drawer: cache-first crossfade using Patches 1–2 VM warm paths
3. Replace WU/page centered spinners with shell-hold + ribbon
4. Tab below-fold: prefetch + hold prior tab content (activity/documents)
5. Remove Q1 row skeleton path; enforce page-gate hold only

### Patch 5 risks

- Removing loaders before cache hit rate is proven → false “broken” perception on slow networks
- Crossfade without `holdPriorPayload` → flash of empty drawer
- Legacy `AdminEntityDrawerLegacy` paths still carry skeleton system until VM cutover completes

---

## Suggested commit message (after review)

```
Add optimistic Save All with parallel section confirms and in-place VM patch.

Apply layout/inquiry/person drafts immediately; confirm server in parallel;
rollback failed sections; emit [perf:save] telemetry. Includes Patch 4
transition audit doc (recommendations only).
```
