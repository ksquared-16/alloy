# Lifecycle runtime — interaction, waitlist, actions, order

**Sprint:** 06/2026  
**Scope:** Fast lifecycle work-unit pill switching, waitlist layout, Schedule Tour execution, labels, stage reorder, action placement isolation, workspace description sync.  
**Out of scope:** lifecycle visibility evaluator, QueueService visibility contract, assignment_home, lifecycle configuration data model.

## 1. In-page work-unit pill switching

**Before:** `router.replace` on sibling lifecycle pills remounted the Next.js page segment (`[workUnitId]` param change).

**After:**
- `activeWorkUnitId` state drives operational fetches; URL updates via `history.replaceState` (`replaceWorkUnitLocationHref`) without Next navigation
- `setLifecycleInPageWorkUnitSwitchFlag` — layout effect resets queue lane only (not full shell)
- `setLifecycleWorkUnitSwitchPreserveSiblingsFlag` — sibling header + route shell trace preserved
- Target WU warm snapshot applied when available (`readLifecycleWorkUnitSwitchSnapshot`)
- Dev trace: `[lifecycle-wu-pill-click]` with `navigation: "in_page"`

## 2. Waitlist (lifecycle WU)

- `resolveWaitlistCandidateGrainContext` accepts lifecycle `lifecycle_*` keys with `domain: waitlist` and `grain: candidate`
- `queryWaitlistCandidates` uses `metadata.status_keys` + `opportunities.status_key` when waitlist presentation mode (not strict `opportunities.work_unit_id` only)
- Dev log: `[lifecycle-waitlist-candidates]` with loader, status keys, returned count

## 3. Schedule Tour (work-unit + department rail)

**Expected paths:**
- **Work unit or department right rail, no record selected** → `WorkUnitScheduleTourRecordPickerModal` → debounced search via `GET /api/admin/ai/task-assist/entity-search` (org/site access scope, not limited to current work-unit queue) → `openTourScheduleModalForOpportunity` (drawer + Schedule Tour form modal; not drawer-only).
- **Queue row action** → tour modal for that row’s opportunity id (no picker).
- **Drawer / record context** → tour modal for `entityId` (no picker).

**Implementation:** `isScheduleTourRegistryAction` early in `applyRegistryResolvedActionClient` (workflow + open_form, no `window.alert`); `scheduleTourRecordPickerSearch.ts` + modal (`placeholder="Search records..."`, no org-scope helper copy); work-unit and dept pages wire picker + `openTourScheduleModalForOpportunity`. `AdminEntityDrawer` `pendingTourScheduleRef` flushes modal when drawer id catches up after picker selection. Row `opportunityId` resolution for queue actions: `scheduleTourWorkUnitActions.ts`.

**Labels:** `formatOpportunityOperatorDisplayLabel` / `opportunityDisplayLabel.ts` strip legacy “Family inquiry” boilerplate from picker, task assist, and search hits; configured opportunities singular label used only when no household/location tail exists.

## 3b. Lifecycle queue row preview fields (Jun 2026)

**Standard opportunity stages:** `lifecycleStageQueueRowPreviewFields` includes `desired_start_date` and `tour_date` when present on row data (same enrollment pipeline projection fields).

**Tour stage:** `tour_date` listed before `desired_start_date` for prominence.

**Waitlist:** `phone`, `email`, contact/child/program/desired_start_date — **no** `tour_date` (legacy waitlist parity). Candidate-grain rows still receive `_primary_phone` / `_primary_email` from `enrichOpportunityRows` in `QueueService` — no visibility-bridge change.

## 3c. Row action pop-in (Jun 2026)

**Fix:** `hydrateWorkUnitQueueRowActions()` awaited before first non-prefetch queue row apply; cached primary lane waits for hydration; `rowActionsPending` on `QueueVm` renders reserved action skeleton chips in `QueueBlock` until registry placements are ready.

## 4. Action placement isolation

- `loadRightRailActionsBundleServer({ placementSurfaces })` — no merge of `work_unit` + `department` by default on scoped calls
- `/dept` + dept operational-bootstrap: `placementSurfaces: ["department"]`
- `/work-unit` + right-rail-bundle client: `placementSurfaces: ["work_unit"]`

## 5. Work unit order

- `sortLifecycleDeptWorkUnits` / `mapBootstrapWorkUnits` — `work_units.sort_order` on dept bootstrap and throughput cards
- Lifecycle Builder: visible ↑/↓ on **LifecycleStageNav** (active stage) + toolbar; `reorder_stage` → `syncWorkUnitSortOrderFromBuilderStages`
- Runtime sibling pills / hydration already sort by `sort_order`

## 6. Workspace description

- Lifecycle builder `saveConfig` always writes `departments.description` from `lifecycleWorkspaceTileDescription(process.description, process.name)` when builder-owned (no skip when fallback is non-empty)
- Workspace tile reads `departments.description`; fallback to dept name only when description column empty

## 7. Labels

- `resolveDeptWorkUnitDisplayLabel` / `resolveWorkUnitShellDisplayTitle`: `work_units.name` wins over `metadata.lifecycle_stage_label`

## Root cause fix (Jun 2026) — queue key leak on work-unit pill switch

**Bug:** After a lifecycle sibling pill click, React could run the queue fetch effect with the **new** `workUnitId` but the **previous** `selectedQueueKey` (e.g. Waitlist WU + `lifecycle_qualification`), producing:

`GET /api/admin/queues/{waitlistWuId}/lifecycle_qualification` → `Unknown queue key`

**Fix:**
- `activeLifecycleSelectionRef` + `applyActiveLifecycleWorkUnitSelection()` — update work unit id and primary queue key in one transition (refs first, then batched state)
- `guardLifecycleQueueFetchBeforeApi()` — before any queue rows API call, verify the key exists on the target work unit’s `queue_definition`; log `[lifecycle-wu-queue-key-leak-guard]` and correct to primary when invalid
- Queue fetch effect skips when `lifecycleSelectionStateMatchesRef()` is false (partial state update)
- Pill handler uses `buildLifecycleWorkUnitPillSelection(targetWu)` — never the previous lane key
- Rows stay visible during switch (`lifecyclePillRetainRows`); right rail preserved via in-page switch flag

**Waitlist:** Primary key from waitlist `queue_definition` (e.g. `lifecycle_waitlist`); client loader hint `waitlist_candidate_grain` via `inferLifecycleQueueRowLoader`.

## Waitlist visibility bridge + row actions (Jun 2026)

**Waitlist count/rows = 0 fix:**
- Lifecycle waitlist uses **status-based visibility** (`resolveLifecycleVisibilityStatusKeys` from metadata + `queue_definition`), not `opportunities.work_unit_id`.
- Candidate-grain loader **bridges** lifecycle-visible opportunities → placement_candidate rows; **synthetic rows** when an opportunity matches Waitlisted status but has no `placement_candidates` row yet.
- Dev trace: `[lifecycle-waitlist-resolution]` (work unit id/key, stage key, status keys, loader, opportunity vs candidate counts).

**Row action buttons late flash fix:**
- `hydrateWorkUnitQueueRowActions()` runs on work-unit ready, in parallel with queue fetch, and on lifecycle pill switch — not only after `requestWorkUnitDeferredSupplement` idle delay.
- First paint: await hydration before `setQueueItems` (non-quiet); skeleton chips when rows visible but actions not ready (`rowActionsPending`).

| Step | Expected | Verified |
|------|----------|----------|
| Waitlist pill count > 0 when Waitlisted opps exist | Pill badge matches lane | [ ] |
| Waitlist lane rows show phone + email columns | Same CRM compact contact grid as legacy waitlist | [ ] |
| Waitlist lane rows | Candidate/waitlist layout, preview/adjust position, siblings | [ ] |
| Schedule Tour rail (WU + dept) | Accessible-record search picker → tour modal | [ ] |
| Row actions | No visible pop-in (skeleton or simultaneous) | [ ] |

## Root cause fix (May 2026) — `lifecycle_wu_nav:*` as queue key

**Bug:** Sibling pill chip key `lifecycle_wu_nav:{workUnitId}` was left in `selectedQueueKey` while `workUnitId` updated (or not), producing:

`GET /api/admin/queues/{workUnitId}/lifecycle_wu_nav%3A{otherWuId}` → `Unknown queue key`

**Fix:**
- Pill click switches `activeWorkUnitId`, sets `selectedQueueKey` to `resolveLifecycleWorkUnitPrimaryQueueKey(targetWu)` (e.g. `lifecycle_lead`, `lifecycle_waitlist`)
- `fetchQueueItems(targetWorkUnitId, targetQueueKey, …)` — never the nav chip token
- `resolveWorkUnitFetchQueueKeyFromPill` + `fetchQueueItems` guard block nav tokens
- Clicking current WU pill is a no-op (nav chip is not a lane)

## Manual verification (May 2026)

Agent cannot run browser — **operator must confirm** and paste network lines below.

| Step | Expected network | Verified |
|------|------------------|----------|
| Open Lead Management `/work-unit` | — | [ ] |
| Pills show New Leads, Qualification, Tours, Waitlist in builder order | — | [ ] |
| Click New Leads | `GET …/queues/{newLeadsWuId}/lifecycle_lead?…` (not `lifecycle_wu_nav`) | [ ] |
| Click Waitlist | `GET …/queues/{waitlistWuId}/lifecycle_waitlist?…` + candidate layout | [ ] |
| Qualification → Waitlist → Qualification (repeat) | Each request: matching `{wuId}/{thatWuQueueKey}` only | [ ] |
| No `Unknown queue key` in console/network | — | [ ] |
| No full shell skeleton on pill click | — | [ ] |
| Right rail does not blank/remount | — | [ ] |
| Schedule Tour picker when no row selected (WU + dept rail) | Entity search, any accessible opp | [ ] |
| Schedule Tour from row/drawer | Skips picker | [ ] |

**Observed network calls (fill in during manual test):**

```
# Example — replace with actual:
# GET /api/admin/queues/<wu-id>/lifecycle_lead?limit=45&...
```

**Console (dev):** `[lifecycle-wu-pill-click]` with `target_queue_key`; `[lifecycle-waitlist-candidates]` on waitlist lane.

## Files

| File | Role |
|------|------|
| `web/lib/lifecycle/lifecycleWorkUnitSwitchRuntime.ts` | In-page switch flags + `replaceWorkUnitLocationHref` |
| `web/app/.../work-unit/.../page.tsx` | activeWorkUnitId, picker, placement surfaces |
| `web/lib/queues/candidateGrainWaitlistQueue.ts` | Lifecycle waitlist visibility query |
| `web/lib/workspace/loadRightRailActionsBundleServer.ts` | Scoped placement surfaces |
| `web/lib/lifecycle/sortLifecycleDeptWorkUnits.ts` | Dept/WU sort order |
| `web/lib/lifecycle/lifecycleStageQueuePresentation.ts` | Waitlist row_preview phone/email/tour_date |
| `web/lib/admin/actions/scheduleTourRecordPickerSearch.ts` | Accessible opportunity search for picker |
| `web/components/admin/workspace/WorkUnitScheduleTourRecordPickerModal.tsx` | Record picker (entity search) |
| `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` | Dept rail Schedule Tour picker |
| `web/components/adminV2/settings/lifecycle/LifecycleStageNav.tsx` | Visible reorder controls |

## Tests

- `web/tests/lifecycle/lifecycleWorkUnitSwitchRuntime.test.ts`
- `web/tests/lifecycle/lifecycleRuntimeInteractionPlacement.test.ts`
