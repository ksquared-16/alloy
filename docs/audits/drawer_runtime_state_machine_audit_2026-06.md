# Drawer Runtime State Machine Audit

**Path:** `docs/audits/drawer_runtime_state_machine_audit_2026-06.md`  
**Status:** Audit only — **no implementation** until reviewed  
**Date:** 2026-06-04  
**Scope:** AdminV2 drawer VM cutover (Opportunity / Person / Child). Excludes Work Unit queue UX.

---

## Executive summary

The drawer runtime today is **not one state machine**. It is several overlapping machines:

1. **Context navigation** (`AdminDrawerContext`) — drawer id/type, stack, preload refs, `drawerModelSwapGeneration`.
2. **Entity hydration** (`AdminEntityDrawer` entity-open `useEffect`) — `data`, `loading`, bootstrap/primary/full hydrates.
3. **VM cutover** (`applyOpportunityDrawerPreload` / `applyPersonDrawerPreload`, session VM cache).
4. **Presentation gates** (`drawerGateLoading`, `drawerBodyGateLoading`, coordinated reveal, composed payload).
5. **Per-widget ownership** (opportunity status pin vs person paint-ready vs right-column fetch).

Recent “hold content / suppress loading” patches added a sixth implicit mode — **`drawerShellPinnedVmSwapActive`** — that is **sticky** (`drawerModelSwapGeneration > 0` never resets) and **over-broad** (true for `queue_row_person`, `opportunity_primary_contact`, etc., not only in-drawer swaps). That mode can **disable the entity-fetch bridge** while **also** hiding loading UI, producing **blank drawers** when VM preload is missing.

**Communications tab** works because it uses a **separate, simpler contract**: tab panes stay mounted once `drawerSurfaceReady`, data layer warms via `backgroundPreload`, and tab switch only toggles `hidden` + `active` — no entity-id swap on the parent shell.

---

## Part 1 — Intended drawer runtime (design intent)

Legend: *intended* behavior per VM cutover docs and coordinator patterns; actual code may diverge (Part 2).

### A. Cold open Opportunity from Work Unit row

| Question | Intended answer |
|----------|-----------------|
| **What starts the open?** | WU page `openWorkUnitQueueOpportunity` → `prefetchOpportunityDrawerOnRowIntent` → `openDrawer(buildOpportunityDrawerOpenParams(id))` (`work-unit/[workUnitId]/page.tsx`). On AdminV2 routes, `shouldDeferOpportunityDrawerOpen` → external coordinator (`OpportunityDrawerOpenCoordinator.tsx`). |
| **Data that should already exist** | Row preview seed; optional intent prefetch (bootstrap/primary/header); after coordinator completes: `OpportunityDrawerOpenPreload` with `openPath: "view_model"` when hard cutover on. |
| **Fetches** | Coordinator: `loadOpportunityDrawerComposedOpen` or VM loader; not a naked entity GET in the drawer shell first. |
| **Cache** | `peekDrawerEntitySnapshot`, bootstrap/primary warm caches, `drawerViewModelSessionCache` after VM compose. |
| **State changes** | `openingOpportunity` → coordinator commit → `commitOpportunityDrawerOpen` sets preload ref + `drawer { type, id }`. |
| **First render** | `OpportunityDrawerOpeningOverlay` until commit; then `AdminEntityDrawer` mounts with drawer id. |
| **Stays mounted** | `Drawer` shell, workflow tab host once surface ready. |
| **Forbidden** | Full-panel loading after first paint settled; `data === null` empty queue semantics; status skeleton after VM pin. |

### B. Reopen same Opportunity

| Question | Intended answer |
|----------|-----------------|
| **Start** | `openDrawer` same id or queue row again. |
| **Pre-existing** | `peekDrawerEntitySnapshot`, `peekDrawerViewModelCacheEntry`, shell pin snapshot. |
| **Fetches** | Background refresh only; no cold coordinator overlay. |
| **First paint** | `applyOpportunityDrawerPreload` or snapshot apply — instant shell. |

### C. Opportunity → Person

| Question | Intended answer |
|----------|-----------------|
| **Start** | `openDrawer` → `isDrawerModelSwapEligible` → `openDrawerModelSwap` (`AdminDrawerContext.tsx`). |
| **Pre-existing** | `warmRelatedDrawerViewModels` from opportunity apply; row/hover `prepareDrawerViewModel` (`drawerModelSwapNavigation.ts`). |
| **Fetches** | Only on cache miss: `loadPersonDrawerViaViewModel`. |
| **Cache** | `peekDrawerViewModelPreloadSync` then async `prepareDrawerViewModel`. |
| **State** | Preload ref → `drawerModelSwapGeneration++` → drawer id/type/openSource update; **shell stays mounted**. |
| **Swap** | One layout commit: `consumePersonDrawerPreload` → `applyPersonDrawerPreload` sets `data`, VM settled flags. |
| **Forbidden** | Loading overlay between records; clearing `data` before target ready; opportunity status skeleton. |

### D. Person → Child

Same as C with surface `child` (`resolvePersonDrawerViewModelSurface`, `presentationEmphasis: "child_lifecycle"`).

### E. Child → Opportunity

Same swap path; opportunity needs `opportunityWorkspaceContext` for `prepareDrawerViewModel` (line 79–80 `drawerModelSwapNavigation.ts` — **returns null without workspace**).

### F. Related record click, target VM not cached

| Question | Intended answer |
|----------|-----------------|
| **Start** | `openDrawerModelSwap` → async `prepareDrawerViewModel` → `applyDrawerModelSwap(params, preload)`. |
| **UX** | Keep showing **current** record until preload ready; then **one** apply (Communications-like). |
| **Forbidden** | Spinner between records; blank body; stuck with stale id and no fetch. |

---

## Part 2 — Actual code path (today)

### Navigation entry points

| Function | File | Role |
|----------|------|------|
| `openDrawer` | `web/contexts/AdminDrawerContext.tsx` ~556 | Routes to `openDrawerModelSwap` if `isDrawerModelSwapEligible`, else deferred opportunity open, else `setDrawer`. |
| `openDrawerModelSwap` | same ~531 | Sync `peekDrawerViewModelPreloadSync` or async `prepareDrawerViewModelForOpen` → `applyDrawerModelSwap`. |
| `applyDrawerModelSwap` | same ~489 | Writes preload ref, bumps `drawerModelSwapGeneration`, updates drawer state (keeps stack). |
| `prepareDrawerViewModel` | `web/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation.ts` | VM cache peek or network compose; opportunity **requires** `opportunityWorkspaceContext`. |
| `warmRelatedDrawerViewModels` | same ~155 | Fire-and-forget `prepareDrawerViewModel` for linked ids. |

### AdminEntityDrawer — preload / apply

| Hook / function | File | Role |
|-----------------|------|------|
| `useLayoutEffect` (opp) | `AdminEntityDrawer.tsx` ~2586 | `consumeOpportunityDrawerPreload` → `applyOpportunityDrawerPreload`. |
| `applyOpportunityDrawerPreload` | ~2657 | Sets `data`, VM refs, pipeline, status pin, header actions, shell contract. |
| `useLayoutEffect` (person) | ~2649 | `consumePersonDrawerPreload` → `applyPersonDrawerPreload` if `first_paint_settled`. |
| `applyPersonDrawerPreload` | ~2609 | Sets `data`, `personDrawerVmFirstPaintSettled`, snapshot, warm related. |
| Entity-open `useEffect` | ~2791 | Cache hit, bootstrap, **or** `setData(null)` + `setLoading(true)` + hydrates. |

### Global “swap mode” flag (critical)

```ts
// AdminEntityDrawer.tsx ~1773
drawerShellPinnedVmSwapActive =
  isShellPinnedModelSwapOpenSource(drawer.openSource) || drawerModelSwapGeneration > 0;
```

- `isShellPinnedModelSwapOpenSource` — `drawerShellPinnedModelSwap.ts` (~26): includes `drawer_model_swap`, `opportunity_primary_contact`, `opportunity_inquiry_child`, `queue_row_person`, etc.
- **`drawerModelSwapGeneration` is only incremented, never reset** → after first swap, swap mode stays **true for the entire session**.

### Loading gates

| Gate | File | When true |
|------|------|-----------|
| `drawerGateLoading` | ~1779 | **Forced false** if `drawerShellPinnedVmSwapActive`. Else: existing target and not `drawerReady`. |
| `drawerBodyGateLoading` | ~8424 | `drawerGateLoading \|\| recordModalV2ChromePending`. |
| `opportunityDrawerPrimaryLoadingVisible` | ~9688 | Suppressed when `drawerShellPinnedVmSwapActive`. |
| `opportunityComposedPreparing` | ~8876 | Suppressed when swap active. |
| `personDrawerComposedPreparing` / `personDrawerShowLoadingShell` | ~10047+ | Suppressed when swap active. |

### Main body render gate (why navigation “does not load”)

```tsx
// AdminEntityDrawer.tsx ~13814
(drawerReady || (person && personDrawerComposedPayloadIsReady))
  && data && dataMatchesDrawer
```

If swap mode blocks entity fetch and preload never applies:

- `data` may still be **previous record** → `dataMatchesDrawer` **false**.
- `drawerGateLoading` **false** → **no loading shell**.
- Result: **empty body** (not loading, not content).

Entity-open effect early return (~3003–3016):

```ts
if (drawerShellPinnedVmSwapActive && isVmBackedDrawerEntityType(...)) {
  // tab init only
  return; // no fetch, no setData
}
```

Preload apply is the **only** path in swap mode — if it fails, nothing else runs.

### Opportunity status render path

| Location | Returns |
|----------|---------|
| `opportunityInquiryWorkflowHeaderStatus` useMemo | ~12276 |
| Early | `null` if not inquiry workflow / no overview |
| Skeleton | ~12305, ~12322 (`data-opportunity-status-skeleton`) |
| **Unmount** | ~12301–12303: `opportunityDrawerVmFirstPaintSettled` && no `currentStatus` && no latched key → **`return null`** |
| Control | ~12354: `<select data-opportunity-drawer-vm-status-control>` |

**Status defs effect** (~5465): `opportunityDrawerVmStatusAuthoritative` blocks API fetch; can still run bootstrap seed paths when not authoritative.

**Pin apply:** `commitOpportunityVmStatusPin` in `applyOpportunityDrawerPreload` (~2678) and `pinOpportunityDrawerVmStatusFromViewModel`.

### Task / reminder right column

| Layer | Source |
|-------|--------|
| VM build | `buildOpportunityDrawerViewModelRightColumn` — tasks from `parseInquirySummaryTaskPreview(record)`; record paint includes `_inquiry_summary_tasks` (`buildOpportunityDrawerOpenPreloadFromViewModel.ts` ~25). |
| Resolved model | `opportunityInquirySummaryRightColumnResolved` (~9495): pipeline → VM → empty if settled. |
| UI | `OpportunityInquirySummaryRightColumn` → `TasksSection` + `OpportunityOperationalCompactStrip` (`hideTasksSection`, `rightColumnModel`). |
| Fetch | `inquirySummaryFetchEnabled` = `!opportunityDrawerVmFirstPaintSettled && …` (~9753). Strip `load()` when `fetchEnabled` (~396). |
| Fallback model | If pipeline/VM null and not settled: `tasks.state: "skeleton"` (~16610). |

**Overview reveal** (~8886): when VM settled, needs `opportunityPrimaryHydrateApplied && opportunityRegistryHeaderReady` — can delay overview (including pills) after VM data is already in `data`.

### Person / Child status (why different)

| | Opportunity | Person/Child |
|---|-------------|--------------|
| Header status | `opportunityInquiryWorkflowHeaderStatus` + VM pin + latch | `personDrawerChildHeaderStatus` (~12455) |
| Gate | `vmStatusReady`, `opportunityDrawerVmFirstPaintSettled`, pin id match | **`personDrawerPaintReady`** (chrome + status defs + composed payload) |
| Unmount | Explicit `return null` when settled without status (~12301) | Skeleton until `personDrawerPaintReady`; then **always** renders `<select>` (~12498) |
| VM pin | Yes | No equivalent pin/latch |

Person does **not** use `opportunityDrawerVmStatusRenderLatchRef` or hard-cutover pin contract.

---

## Part 3 — Communications tab comparison

### Why Communications feels instant

| Mechanism | Detail |
|-----------|--------|
| **Tab session** | `opportunityWorkflowTabSessionActive` (~7372) → workflow layout. |
| **Pre-mount** | `createOpportunityDrawerTabVisitSet` includes all workflow tabs (`opportunityDrawerTabSession.ts` ~16). |
| **Mount rule** | `opportunityDrawerWorkflowTabMountEnabled(..., drawerSurfaceReady)` → when bootstrap/VM applied, **all tabs mount once** (~7394). |
| **Visibility** | `opportunityDrawerWorkflowTabPaneClass` — `hidden` vs `block`; **panes stay in DOM** (~7414). |
| **Background warm** | `CommunicationsDrawerBackgroundLoader` at drawer footer (~19446): `active={false}`, `backgroundPreload` (~19423). |
| **Deferred prefetch** | `scheduleDeferredCommunicationsDrawerPrefetch` in layout effect (~9680). |
| **Data layer** | `CommunicationsDrawerSection`: `dataLayerActive = active \|\| backgroundPreload` (~417). |
| **Entity change** | Resets thread state on `entityId` change (~384) but **does not unmount** drawer shell. |

### Drawer-to-drawer vs Communications

| Communications tab | Drawer-to-drawer navigation |
|------------------|----------------------------|
| Same `entityId` until user switches tab | **`drawer.id` changes** (whole record model) |
| Pane hidden, not torn down | **Competing effects** reset opportunity/person state |
| Preload independent of overview gates | **Depends on** `consume*Preload` + entity-open effect |
| No `dataMatchesDrawer` on tab | **Strict** `dataMatchesDrawer` for body (~13816) |
| Loading UI optional / inline | **Multiple** full-body loaders (`DrawerOpportunityOperationalLoadingComposition`, etc.) |

**Missing for drawer swap:** single **target-ready** state; guaranteed preload-or-fetch; **monotonic** `data` handoff; generation flag that doesn’t stick forever.

---

## Part 4 — Opportunity status root cause (evidence)

### Every render branch (opportunity header status)

| Branch | Condition | Output | File:line |
|--------|-----------|--------|-----------|
| Off | Not inquiry / not opportunity | `null` | ~12277 |
| Off | No overview / create | `null` | ~12278 |
| Skeleton | No status, not latched, not settled path | skeleton | ~12305 |
| **Unmount** | No status, **`vmStatusReady \|\| opportunityDrawerVmFirstPaintSettled`** | **`null`** | **~12301–12303** |
| Skeleton | Legacy: defs loading | skeleton | ~12316 |
| Off | `!renderStatusKey` | `null` | ~12338 |
| Control | else | `<select>` | ~12354 |

### Effects that write status defs

| Effect | Action | ~line |
|--------|--------|-------|
| `commitOpportunityVmStatusPin` | `setStatusDefsForDrawer(pin.statusDefs)` | ~2186 |
| Status defs `useEffect` | authoritative → restore defs; hard cutover wait; bootstrap seed; **API fetch** `setStatusDefsLoading(true)` | ~5465–5610 |
| `applyOpportunityDrawerPreload` | pin or fallback defs | ~2674 |

### Unmount / remount drivers

1. **`return null` while settled** (~12301) when `currentStatus` empty but pin not yet for new `drawer.id` (pin id mismatch during swap).
2. **Latch shows previous opportunity’s status** then pin updates → visible label/key **change** (reads as reset).
3. **`overviewData` / `formData.status_key`** briefly wrong id when `dataMatchesDrawer` false but header still renders from partial state.
4. **`setData(null)`** still runs on non-swap entity change (~3033); swap hold bypasses only when `drawerShellPinnedVmSwapActive` early return — if flag false, clear still runs.

### Why Person/Child do not exhibit the same

- No `opportunityDrawerVmStatusPin` / `vmStatusReady` / settled+empty → null branch.
- Person waits for `personDrawerPaintReady` then renders select; skeleton is **before** ready, not after.
- Person status defs use **separate** profile-aware fetch (`useEffect` ~5471 returns early for persons).

### Why “double-commit” persists after prior fixes

Fixes added latch + block skeleton after settle, but **did not remove** settled+empty → `null` (~12301). Sequence still possible:

1. Paint select from pin or record.  
2. Swap: pin `opportunityId !== drawer.id`, `currentStatus` from stale/empty `formData` → **`return null`** (disappear).  
3. `applyOpportunityDrawerPreload` → pin → select reappears.

`detectOpportunityStatusDoubleCommit` only logs when skeleton follows mounted control — **null unmount is outside that detector**.

---

## Part 5 — Task/reminder pills root cause (evidence)

### Are tasks/reminders in VM at first commit?

**Yes, when `openPath: "view_model"`:**

- `paintRecordFromViewModel` sets `_inquiry_summary_tasks: vm.summaries.tasks` (`buildOpportunityDrawerOpenPreloadFromViewModel.ts` ~25).
- `buildOpportunityDrawerViewModelRightColumn` sets `tasks.state` to `ready` or `empty` from `parseInquirySummaryTaskPreview` (`buildOpportunityDrawerViewModelAboveFold.ts` ~48–59).

### What ignores VM on first paint?

| Consumer | Issue |
|----------|--------|
| `opportunityDrawerPipeline` useMemo (~9407) | May rebuild from `overviewData` + shell **before** VM pipeline state wins; client pipeline can omit `right_column` until enrich gates pass. |
| Fallback JSX (~16610) | Still uses `state: "skeleton"` when `rightColumnModel` null. |
| `OpportunityOperationalCompactStrip` | `fetchEnabled` true until `opportunityDrawerVmFirstPaintSettled`; `load()` replaces seeded tasks; `TasksSection` reads `model.state === "skeleton"`. |
| `opportunityDrawerOverviewRevealReady` (~8886) | After VM settled, still waits `opportunityPrimaryHydrateApplied && opportunityRegistryHeaderReady` — **overview column can mount late**. |
| `reviewAssistLoading` (~16638) | Extra skeleton until record fields present. |

### What fetch makes pills appear?

- `fetchOperationalTasks` / `fetchCommunicationScheduledSends` in strip `load()` when `inquirySummaryFetchEnabled` (~9753).
- Pipeline transition from skeleton → ready when primary/full hydrate fills `_inquiry_summary_tasks` on record.

### Why not immediate?

**Split ownership:** VM has tasks in preload, but UI gates tie visible pills to **pipeline + overview reveal + fetchEnabled**, not solely to `applyOpportunityDrawerPreload` commit.

---

## Part 6 — Navigation break after suppressing loading (proof)

### What the loading visual was doing

`DrawerOpportunityOperationalLoadingComposition` / `drawerBodyGateLoading` display when `drawerGateLoading` or chrome pending — user sees spinner.

**Hidden bridge:** entity-open `useEffect` normally sets `loading=true`, runs bootstrap/GET hydrates, eventually `setData` + `drawerReady`. Loading UI **correlates** with that in-flight work.

### What suppressing loading broke

| Change | Effect |
|--------|--------|
| `drawerGateLoading` → always false when `drawerShellPinnedVmSwapActive` (~1780) | No loading **signal**. |
| Entity-open early `return` when swap active (~3003) | **No fetch fallback** when preload missing. |
| `drawerModelSwapGeneration > 0` forever | Swap mode **never clears** — even cold opens with `queue_row_person` source hit swap rules. |
| Body gate (~13814) | Needs `data && dataMatchesDrawer` — stale data → **blank**. |

Loading UI was accidentally acting as a **state bridge**: user saw “working” while async preload/hydrate completed. Removing it without replacing the bridge (**target-pending → target-ready** with guaranteed apply or fetch) → **stuck or blank**.

### Correct architecture (intent)

Communications pattern applied to drawer record:

1. Shell + tab host **always mounted**.  
2. **`drawer.phase`**: `showing_record_A` → `preparing_B` → `showing_B`.  
3. During `preparing_B`, keep A visible until B VM apply sets `data` with `dataMatchesDrawer`.  
4. Never return early from entity-open without **either** apply or fetch.  
5. Reset `drawerModelSwapGeneration` or narrow swap flag to **in-flight swap only**.

---

## Runtime flow diagrams

### Intended warm swap (Communications-like)

```
User click related record
  → prepareDrawerViewModel (background or sync cache hit)
  → openDrawerModelSwap
  → preload ref set + drawer.id = target
  → useLayoutEffect: consumePreload → applyPreload (data, VM, pin, pipeline)
  → one paint: body gate passes (dataMatchesDrawer)
  → no full-body loader
```

### Actual broken swap (cache miss + suppressed loading)

```
openDrawerModelSwap
  → async prepareDrawerViewModel (slow / null if no workspace)
  → applyDrawerModelSwap(id, null) still increments generation
  → drawer.id = target, data = OLD record
  → drawerShellPinnedVmSwapActive = true
  → drawerGateLoading = false
  → entity-open effect: early return (no fetch)
  → layout effect: consumePreload → null
  → body: !dataMatchesDrawer → NOTHING RENDERED
```

### Opportunity status flash

```
Paint: select (pin A)
  → swap id to B
  → pin still A or empty currentStatus, settled true
  → return null (UNMOUNT)
  → applyPreload B → pin B → select (REAPPEAR)
```

---

## Root cause table

| # | Symptom | Root cause | Primary location |
|---|---------|------------|------------------|
| 1 | Status disappear/reappear | `return null` when settled without status; pin/id lag during swap; latch label change | `opportunityInquiryWorkflowHeaderStatus` ~12301 |
| 2 | Pills late | Overview reveal + pipeline rebuild + fetchEnabled + skeleton fallback despite VM seed | ~8886, ~9407, ~16610, strip `load` |
| 3 | Navigation blank | Swap mode disables fetch; preload miss; `dataMatchesDrawer` fails; loading suppressed | ~1780, ~3003, ~13814, `drawerModelSwapGeneration` |
| 4 | Person/Child OK | Different status gate (`personDrawerPaintReady`); no settled→null | ~12455 |
| 5 | vs Communications | Tabs pre-mount + background preload; no drawer id swap on tab | `opportunityDrawerTabSession.ts`, `CommunicationsDrawerSection` |

---

## Part 7 — Proposed fix plan (minimal, no implementation)

### 1. One authoritative drawer state machine

Introduce explicit phases in context (or ref-backed store):

- `idle` | `opening_cold` | `showing` | `swap_preparing` | `showing` (new id)

**Rules:**

- Only `swap_preparing` may show previous record under new id.  
- `showing` requires `dataMatchesDrawer` OR documented create flow.  
- Never combine “swap active forever” with “fetch disabled.”

### 2. One VM preload/apply path

| Event | Handler |
|-------|---------|
| Cold opportunity | Coordinator → single `applyOpportunityDrawerPreload` |
| Warm swap | `applyDrawerModelSwap` → layout `consume*` → same apply functions |
| No second entity-open hydrate for VM-backed types when preload applied | Guard on `opportunityDrawerViewModelOpenRef === drawer.id` |

### 3. One cache/preload lifecycle

- **Intent:** row hover / `warmRelatedDrawerViewModels` / adjacent queue prefetch.  
- **Session:** `drawerViewModelSessionCache` + `drawerEntitySnapshotCache`.  
- **Apply-once:** consume ref clears preload; generation tracks **in-flight swap only** (reset when apply completes).

### 4. Cold open vs warm swap

| | Cold | Warm swap |
|---|------|-----------|
| Overlay | Opportunity external coordinator allowed | **Forbidden** |
| `drawerShellPinnedVmSwapActive` | false (or only after first paint) | true only `swap_preparing` |
| Fetch fallback | Coordinator / VM loader | Cache → apply; else explicit fetch |

### 5. Hold old content vs replace

- **Hold:** while `swap_preparing && !targetApplied` — keep prior `data` visible (optional opacity).  
- **Replace:** single `setData` from `apply*Preload` when target VM + entity ready.  
- **Never:** `setData(null)` during swap; never `return null` status when phase is `showing` with settled VM.

### 6. Status source ownership

| Source | Owner |
|--------|--------|
| Options + key + label | `PinnedOpportunityDrawerVmStatus` from VM header at apply time |
| UI | Always render from pin when `drawer.id === pin.opportunityId`; during swap show pin only after target pin ready OR keep control with **last label until new pin** (never null) |
| Remove | settled + empty → `null` branch |

### 7. Task/reminder source ownership

| Source | Owner |
|--------|--------|
| First paint | `viewModel.above_fold.render_model.inquiry_summary.right_column` + `_inquiry_summary_tasks` on `data` |
| UI | `rightColumnModel` from VM pipeline state only until settled; `fetchEnabled: false` after apply |
| Strip | Seed from VM `open_tasks`; background reconcile only |

### 8. Navigation without loading visual

- Replace loader with **phase semantics**: old content visible + optional subtle busy on header.  
- Fix `drawerModelSwapGeneration` stickiness.  
- Restore fetch fallback when `preload == null` even in swap (do not early-return entity effect without scheduling fetch).  
- Ensure Person→Opp passes `opportunityWorkspaceContext` into `prepareDrawerViewModel`.

### Suggested implementation order

1. Fix swap phase + generation reset + entity-open fallback (fixes #3).  
2. Status never unmount after first pin (fixes #1).  
3. Right column + strip read VM at apply (fixes #2).  
4. DOM trace + manual QA matrix.  
5. Contract tests for phase machine (not snapshot-only string tests).

---

## File / function map (quick reference)

| Concern | Files |
|---------|--------|
| Navigation API | `web/contexts/AdminDrawerContext.tsx` |
| VM cache / swap | `web/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation.ts`, `drawerViewModelSessionCache.ts`, `drawerShellPinnedModelSwap.ts` |
| Cold open | `web/lib/admin/opportunityDrawerOpenCoordinator.ts`, `web/components/admin/OpportunityDrawerOpenCoordinator.tsx` |
| Shell | `web/components/admin/AdminEntityDrawer.tsx` |
| Status | `opportunityInquiryWorkflowHeaderStatus`, `opportunityDrawerVmStatusReconciliation.ts`, status defs effect ~5465 |
| Tasks/pills | `OpportunityInquirySummaryRightColumn.tsx`, `OpportunityOperationalCompactStrip.tsx`, `buildOpportunityDrawerViewModelAboveFold.ts` |
| Communications | `CommunicationsDrawerSection.tsx`, `CommunicationsDrawerBackgroundLoader.tsx`, `opportunityDrawerTabSession.ts` |
| Queue intent | `QueueBlock.tsx`, `work-unit/.../page.tsx` |
| Diagnostics | `drawerVmDomRenderTrace.ts`, `drawerVmRuntimeDiagnostics.ts` |

---

## Manual QA matrix (post-fix)

| # | Action | Pass criteria |
|---|--------|----------------|
| 1 | Open opp from queue | No ext overlay flash; status stable; pills with overview |
| 2 | Reopen same opp | Instant; no status flash |
| 3 | Opp → Person (warm) | No loader; person content; no blank |
| 4 | Person → Child | Same |
| 5 | Child → Opp | Same; workspace context works |
| 6 | Related click (cold cache) | Old content until ready OR subtle busy; then swap |
| 7 | Communications tab | Still instant; no regression |
| 8 | Console | No `status_control: missing` between select states on warm path |

---

## Review gate

**Do not implement** until this audit is reviewed and the single state machine + phase rules are agreed. Prior patch set should be treated as **diagnostic** — especially `drawerShellPinnedVmSwapActive` coupling to `drawerModelSwapGeneration > 0` and entity-open early return.
