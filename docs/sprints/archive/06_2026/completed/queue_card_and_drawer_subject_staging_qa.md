# Queue Card + Drawer Subject — Staging QA

**Date:** 2026-06-06  
**Environment:** https://staging.workwithalloy.com  
**Branch:** `staging`  
**Commits tested (repo / `origin/staging`):**

| Commit | Summary |
|--------|---------|
| `c1bc5ca8` | Drawer active subject context pipe |
| `319f70f6` | Queue card visual polish + duplicate subject suppression |
| `d2dc8d18` | OperationalQueueRecordRow v3 + QueueRowContext consumption |

**QA executor:** Agent automated pre-checks + operator manual session required for authenticated UI.

---

## 1. Deployment / build

| Check | Result | Notes |
|-------|--------|-------|
| `origin/staging` at `c1bc5ca8` | **Pass** | Local `git log origin/staging -1` |
| Staging site HTTP 200 | **Pass** | `https://staging.workwithalloy.com/` |
| Vercel build succeeded for `c1bc5ca8` | **Manual** | Confirm in Vercel dashboard — `gh` CLI not available in QA environment |
| No runtime errors on load | **Manual** | Open browser console on work-unit queue page |
| `cd web && npx tsc --noEmit` | **Pass** | Run 2026-06-06 |
| Queue/drawer unit tests (62) | **Pass** | See § Automated tests |

---

## 2. Work-unit queue page (layout runtime lane)

| Check | Result | Notes |
|-------|--------|-------|
| Enrollment WU lane loads layout-runtime rows | **Manual** | e.g. Qualification WU `a428520f-b6a1-4913-8209-2d45a9affcd9` |
| Inner row path `operational-queue-record-row-v3` | **Pass (code)** | On `.operational-queue-row-shell`; wrapper also has `layout-runtime-queue-row-view` |
| Rows load without stuck skeleton | **Manual** | Watch `rowsLoading` / coordinated reveal — no code changes this sprint |
| Lane counts unchanged vs pre-ship | **Manual** | Compare lane badge to API `total` |
| Spacing / readability acceptable | **Manual** | Polish CSS in `workspace.css` § operational-queue-row |

**DOM hint:** Layout path = `data-layout-runtime-queue-row="true"` → child `.operational-queue-row-shell[data-queue-row-runtime-path="operational-queue-record-row-v3"]`.

---

## 3. QueueRowContext diagnostics

| Check | Result | Notes |
|-------|--------|-------|
| API `items[n]._queue_row_context` on opportunity rows | **Manual** | `GET /api/admin/queues/{workUnitId}/{queueKey}` (authenticated) |
| `data-queue-row-context-present="true"` when context on row | **Pass (code)** | `queueRowContextDebugDataAttributes` on shell when record has `_queue_row_context` |
| `data-queue-row-context-present="false"` without context | **Pass (code)** | Legacy rows / `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` |
| `placement_context` only when deterministic | **Pass (unit)** | `buildPartialQueueRowContext` + mixed-placement test |
| `data-queue-row-placement-present` / `placement-omitted-mixed` | **Manual** | Inspect shell attrs on single-site vs mixed-placement household |
| No fake placement line on mixed rows | **Pass (unit)** | `opportunity.location` not overlaid; `visibleWhen: exists` hides field |

**Rollback flag:** `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` omits API context (cards still render from CRM fields).

---

## 4. Queue card visual QA

| Check | Result | Notes |
|-------|--------|-------|
| Family/case name primary | **Manual** | `queue-record-field--title` tier |
| Duplicate subject suppressed (case-grain) | **Pass (unit)** | No `queue-record-field--subject-focus` when subject = household |
| Stage/disposition clear | **Manual** | Stage caption + status pill |
| Placement muted, only when valid | **Manual** | `--placement-meta`; hidden when absent |
| Children summary compact | **Manual** | `.operational-queue-row__child-list` repeater |
| Attention/work/next action not overcrowded | **Manual** | `--context-meta` 2-line clamp |
| Narrow column / action rail | **Manual** | `<420px` stacks rail below content |

**Screenshots:** _Operator — attach to sprint assets or paste in PR when available._

---

## 5. Row click / drawer open

| Check | Result | Notes |
|-------|--------|-------|
| Click opens opportunity drawer | **Manual** | Same `open_record` → `openWorkUnitQueueRecord` chain |
| No click-target regression (links vs card) | **Manual** | Person/child adornments use `stopPropagation` |
| Open perf not worse | **Manual** | VM warm + prefetch unchanged; watch “Opening…” overlay |
| `data-drawer-active-subject-present` | **Manual** | On `[data-drawer-runtime="opportunity-vm"]` wrapper |
| `data-drawer-active-subject-type` | **Manual** | Case-grain rows: `case` |
| `data-drawer-stage-focus-key` | **Manual** | e.g. `tour` from queue lane `stage_key` |
| `data-drawer-subject-focus-mode` | **Manual** | Case rows: `case_default` |

**Code path verified:** `buildOpportunityDrawerOpenParams` → `drawerSubjectContext` from `opportunityDrawerSubjectContextFromQueueItem`.

---

## 6. Fallback scenarios

| Check | Result | Notes |
|-------|--------|-------|
| Row without `_queue_row_context` renders | **Pass (unit)** | Legacy record fields; `context-present="false"` |
| Row without placement renders | **Pass (unit)** | Placement field hidden via `visibleWhen` |
| Layout error → CRM compact fallback | **Pass (code)** | `LayoutRuntimeQueueRowErrorBoundary` + `vmFallback` unless hard cutover |
| Hard cutover error card | **Manual** | `isLayoutRuntimeHardCutoverActiveClient()` |

---

## 7. Bugs found

| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| — | — | No regressions found in automated pre-checks | — |

_Operator: add rows here after manual session._

---

## 8. Fixes committed during QA

| Commit | Description |
|--------|-------------|
| — | No code changes during this QA pass |

---

## 9. Remaining known gaps (not QA failures)

- Case-grain `active_subject` — pipe only; no lifecycle visual highlight yet.
- In-drawer queue prev/next clears `drawerSubjectContext` until navigator carries per-row context.
- Child-grain queue rows not shipped — true child focus waits phase 6.
- Playwright live audit (`queue-record-live-qualification.spec.ts`) still targets wrapper path; update to assert `operational-queue-record-row-v3` on shell when live audit is re-run.
- Scripted `getWorkUnitQueueItems` smoke outside Next handler still blocked (`unstable_cache`).

---

## 10. Automated tests (2026-06-06)

```bash
cd web && npm run test -- \
  tests/workUnits/buildPartialQueueRowContext.test.ts \
  tests/workUnits/attachQueueRowContextToItems.test.ts \
  tests/workUnits/resolveQueueRowContextPresentation.test.ts \
  tests/workUnits/buildDrawerSubjectContextFromQueueRowContext.test.ts \
  tests/layout/queueRowSubjectPresentation.test.ts \
  tests/layout/operationalQueueRowContext.test.ts \
  tests/layout/operationalQueueRecordRow.test.tsx \
  tests/admin/adminV2QueueRowClick.test.ts \
  tests/queues/queueRowGrainContext.test.ts
```

**Result:** 62 passed.

**Live Playwright (optional):**

```bash
cd web && PLAYWRIGHT_LIVE_QUEUE_AUDIT=1 npx playwright test queue-record-live-qualification
```

Requires authenticated admin session.

---

## 11. Manual operator checklist (15 min)

1. Log in to staging → enrollment work-unit with layout queue (e.g. Qualification).
2. Network: queue API → confirm `_queue_row_context` on rows.
3. DOM: `.operational-queue-row-shell[data-queue-row-runtime-path="operational-queue-record-row-v3"]`.
4. Confirm `data-queue-row-context-present="true"` on a row with API context.
5. Find mixed-placement household → no header placement line; `placement-omitted-mixed` if applicable.
6. Click row → drawer opens; inspect `[data-drawer-runtime="opportunity-vm"]` subject attrs.
7. Note lane count vs API `total`.
8. Mark §2–§5 manual rows Pass/Fail above.

---

## 12. Clear to start next sprint?

| Gate | Status |
|------|--------|
| Automated regression | **Pass** |
| Staging deploy at `c1bc5ca8` | **Pass (git)** — confirm Vercel |
| Operator manual UI sign-off | **Pending** — complete §11 |

**Recommendation:** Proceed to next sprint after operator completes §11 with no P0/P1 findings. Automated confidence is high; UI sign-off is the remaining gate.

---

## 13. Recommended next sprint

**Drawer Subject Display / Lifecycle Visual consumption**

- Consume `drawerSubjectContext` in opportunity drawer lifecycle rail / header.
- Highlight `active_subject` / `active_subject_group` when non-case.
- Refresh subject context on in-drawer queue prev/next when navigator rows carry `_queue_row_context`.

---

## Related docs

- [`queue_row_context_consumption_closeout.md`](./queue_row_context_consumption_closeout.md)
- [`drawer_active_subject_context_closeout.md`](./drawer_active_subject_context_closeout.md)
