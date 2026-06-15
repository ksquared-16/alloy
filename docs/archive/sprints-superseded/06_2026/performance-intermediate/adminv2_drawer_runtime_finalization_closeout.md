# AdminV2 Drawer Runtime Finalization — Sprint Closeout

**Path:** `docs/sprints/06_2026/adminv2_drawer_runtime_finalization_closeout.md`  
**Status:** In progress (June 2026)  
**Doctrine:** `docs/system/adminv2-runtime-performance-doctrine.md`  
**Work Unit follow-on:** `docs/audits/work_unit_runtime_cutover_audit.md`

---

## Sprint goal

Finish Drawer Runtime to **production-grade (A-)** and establish Work Unit VM architecture using the same doctrine that succeeded in Opportunity Drawer VM.

---

## Deliverables status

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Fix Opportunity status double-commit | **Shipped** — VM status pin state + authoritative gate; enhanced `[drawer_vm_status_write]` diagnostics |
| 2 | Fix tasks/reminders first-paint lag | **Shipped** — `opportunityDrawerRightColumnFromVm`; no post-VM fetch/skeleton |
| 3 | Remove drawer swap loading UI | **Shipped** — shell-pinned swap guards on entity effect, chrome pending, opportunity reset |
| 4 | Validate Opp ↔ Person ↔ Child Excel-tab nav | **Verify on staging** — search logs for `[drawer_vm_model_swap_apply]` without gate overlay |
| 5 | Work Unit runtime audit | **Complete** — `docs/audits/work_unit_runtime_cutover_audit.md` |
| 6 | Work Unit queue UX proposal | **Complete** — `docs/sprints/06_2026/work_unit_queue_ux_redesign_proposal.md` |
| 7 | Work Unit VM cutover plan | **Complete** — Phase 2–4 in audit doc |
| 8 | Remaining blockers for A- grade | **See below** |

---

## Shipped runtime fixes (this sprint)

### Opportunity status — single commit

**Root cause:** Competing writers — VM pin in `useLayoutEffect`, legacy status-options fetch and bootstrap single-option seed in `useEffect`, skeleton gated on `statusDefsLoading` after VM pin.

**Fix:**
- `commitOpportunityVmStatusPin` — single writer path with generation + `[drawer_vm_status_write]` logs
- `opportunityDrawerVmStatusAuthoritative` — blocks legacy fetch/seed after VM apply
- State-backed `opportunityDrawerVmStatusPin` (not ref-only) for render stability
- No status skeleton after `opportunityDrawerVmFirstPaintSettled`

**Diagnostics:** Browser console — filter `drawer_vm_status_write`, `drawer_vm_status_double_commit_detected`.

### Tasks / reminders — first paint

**Root cause:** `rightColumnModel` fell back to skeleton when pipeline state lagged; `fetchEnabled` still true briefly after VM settle.

**Fix:**
- `opportunityDrawerRightColumnFromVm` reads VM `above_fold.render_model.inquiry_summary.right_column`
- `fetchEnabled={inquirySummaryFetchEnabled && !opportunityDrawerVmFirstPaintSettled}`
- VM-settled fallback uses `empty` not `skeleton`

### Drawer model swap — Excel-tab behavior

**Root cause:** Entity identity `useEffect` cleared `data` and set `loading` after layout preload apply; record chrome pending blocked body during swap.

**Fix:**
- `drawerShellPinnedVmSwapActive` — unified swap detection
- Early return in entity effect when VM open ref matches during swap
- Skip opportunity id-change reset during swap
- Suppress `opportunityRecordChromePending` / `personRecordChromePending` / `personStatusPending` when VM first paint settled on swap

---

## Remaining blockers before A- / production-grade

| ID | Blocker | Severity | Owner phase |
|----|---------|----------|-------------|
| **DR-A1** | Staging measurement — cold/warm/swap timings not instrumented in prod metrics | P1 | WU-VM-0 + drawer perf marks |
| **DR-A2** | Backend entity route waterfall still dominates cold open TTFB | P1 | `adminv2_backend_query_payload_optimization_phase.md` |
| **DR-A3** | Queue nav cold path still shows overlay when preload misses | P2 | Adjacent prefetch hit rate |
| **DR-A4** | `AdminEntityDrawer.tsx` monolith — swap/status logic hard to regression-test in isolation | P2 | Extract VM apply module |
| **DR-A5** | Child drawer VM swap parity — child uses person preload path; verify child-specific chrome | P2 | Manual QA matrix |
| **DR-A6** | Work Unit not on VM — drawer doctrine not yet replicated on `/work-unit` | P0 product | WU-VM cutover sprint |

**A- definition for this sprint:** Opp/Person/Child drawer Excel-tab navigation with zero intermediate loading chrome on cached swap; status and lead-summary above-fold in one render pass on VM cold open; no `[drawer_vm_status_double_commit_detected]` on staging smoke.

---

## Verification

```bash
cd web && npm run test -- \
  tests/adminV2/viewModel/opportunityDrawerVmStatusReconciliation.test.ts \
  tests/adminV2/viewModel/drawerShellPinnedModelSwap.test.ts \
  tests/adminV2/viewModel/drawerModelSwapNavigation.test.ts \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts

cd web && npx tsc --noEmit
```

**Staging smoke:**
1. Cold open opportunity — status + tasks + reminders same beat; no status flicker
2. Opp → Person → Child → Opp — no spinner/skeleton between; content replaces content
3. Console — no `double_commit_detected` after first paint

---

## Next sprint

**Work Unit VM cutover** — implement WU-VM-0 through WU-VM-4 per `docs/audits/work_unit_runtime_cutover_audit.md`. KPI pill model swap documented but **not implemented** until queue VM shell is stable.
