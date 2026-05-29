# AdminV2 Performance Stabilization — Execution Sprint

**Status:** Pass 2 in progress  
**Pass 1 on staging:** `b12b96b8` — `fix(adminV2): stabilize drawer performance and queue refresh`  
**Audit reference:** [`adminv2_performance_scope_lock.md`](./adminv2_performance_scope_lock.md)

## Sprint rules

- No architecture rewrite, no UX redesign, no waitlist placement changes.
- Targeted fixes only: refresh correctness, prefetch, visual stability, measured load polish (P4).
- No fixes without evidence (DevTools, contract tests, or static root-cause proof).

---

## Pass 1 — Shipped (`b12b96b8`)

| Priority | Area | Outcome |
|----------|------|---------|
| P0 | Queue refresh | Scoped listener + missing person/registry dispatches |
| P1 | Family & Contacts | Geometry reserves + pipeline column lock in adapter |
| P2 | Person drawer | Earlier linked-person prefetch, pointerdown, cache-first shell skip |
| P3 | Record navigation | Opp snapshot on nav + skip redundant composed open when preload warm |

---

## Pass 2 — Fresh Measurements

**Capture date:** 2026-05-28  
**Environment:** Staging commit `b12b96b8` (operator DevTools required for precise ms; table uses closeout references + contract evidence where live numbers unavailable in CI).

### How to capture (operator)

1. Open staging AdminV2 enrollment dept with DevTools console.
2. Run scenarios below; after each, run `reportAdminV2SpeedSprint()` and/or filter noted tags.
3. Replace _staging TBD_ cells when captured.

| Surface | Cold | Warm | Notes |
|---------|-----:|-----:|-------|
| Dept load | ~1110ms bootstrap ref | ~0ms shell_seed on revisit | `[perf.dept.load]` `bootstrap_ready`, `[dept-reveal-gate]` `above_fold_ready` |
| WU load | ~1700–2200ms ref | cache shell_seed faster | `reportWorkUnitCriticalPathLanes()` — bottleneck usually `queue_rows` or bootstrap |
| Queue switch | network | &lt;50ms UI (buffered rows) | `[perf.queue.rows]` `queue_tab_rows_ready`; rows stay visible during switch |
| Drawer cold open | ~900–1200ms click→commit ref | — | `[perf.drawer.open]` `deferred_composed_commit`; `prefetch_hit: false` |
| Drawer warm open | — | ~200–400ms est. | `prefetch_hit: true`; intent prefetch on row hover/mousedown |
| View Person prefetched | — | ~1–5ms est. | `[person-drawer-open]` `cacheHit: true` |
| Person → back → opportunity | — | ~1–20ms est. | `[drawer-back-restore]` `restoredFromSnapshot: true` |
| Next/previous warm nav | — | no overlay when preload warm | `isOpportunityQueueNavPending` false when `preloadReady`; snapshot restore on opp→opp |

**Evidence without live DevTools (Pass 2 audit):**

- Instrumentation present: `reportAdminV2SpeedSprint`, `reportWorkUnitCriticalPathLanes`, `[perf.dept.load]`, `[dept-reveal-gate]`, `[perf.drawer.open]`, `[person-drawer-open]`, `[drawer-back-restore]`, `[perf.queue.refresh]` (dev).
- Contract tests green: `adminV2PerformancePass2.test.ts`, `opportunityQueueRefreshEvent.test.ts`, `personDrawerPerfFollowup.test.ts`, `opportunityDrawerPipeline.test.ts`.
- Historical staging closeout (May 2026) remains best cold reference until operator re-captures post-`b12b96b8`.

---

## Pass 2 — Manual QA matrix

### Work-unit refresh correctness

| Scenario | Expected | Pass 1 code | Pass 2 |
|----------|----------|-------------|--------|
| Save status in drawer | Row + summaries update | `inline_save` dispatches | ✅ contract |
| Save opportunity name | Visible row label updates | `inline_save` | ✅ contract |
| Save assignment/location | Row/count if lane affected | `inline_save` / children placement | ✅ + `inquiry_child_placement_scope` membership key |
| Save primary/linked person | Row updates if visible | `person_contact_save` | ✅ contract |
| Close drawer without save | No refetch | `closeDrawer` no dispatch | ✅ contract test |
| Off-lane mutation | Summaries only, not rows | `shouldRefetchWorkUnitQueueRowsForEvent` | ✅ contract test |

### Drawer visual stability

| Scenario | Expected | Pass 2 finding |
|----------|----------|----------------|
| Family & Contacts hydrate | No jump | Geometry reserves in `FamilyContactsPanel` |
| Column mode after open | No flip while locked | **Bug:** drawer OR'd legacy `computeShowInquirySummaryRightColumn` over pipeline → **fixed Pass 2** |
| Summary registry actions | Deferred until below-fold | `opportunityRegistrySectionActionsFetchEnabled` gates on full + secondary |
| Person open (warm) | No loading shell | `isPersonDrawerSnapshotWarm` gate |
| Person → back | Snapshot restore | `putDrawerStackRestoreSnapshot` + entity cache |

---

## Pass 2 — Fixes applied

| ID | Root cause | Fix |
|----|------------|-----|
| P4-C | `AdminEntityDrawer` bypassed pipeline `inqModel` with legacy column fallback after full hydrate | Trust `inqModel.show_right_column` / `column_mode` exclusively when pipeline present |
| P4-E | `inquiry_child_placement_scope`, `family_contacts_registry` not in membership keys | Added to `QUEUE_MEMBERSHIP_ACTION_KEYS` |
| P4-E | No dev visibility into scoped refresh | `[perf.queue.refresh]` via `logWorkUnitQueueRefreshDecision` |

### Deferred (needs staging ms evidence)

| ID | Issue | Why deferred |
|----|-------|--------------|
| P4-A | WU bootstrap &gt;1200ms | No fresh post-`b12b96b8` lane timings; happy path already inline primary lane |
| P4-B | Drawer cold &gt;700ms | Composed contract intact; header actions still gate commit by design |
| P4-B | Header actions non-blocking | Requires safety review — not measured as blocker yet |

---

## Implementation tracker

| Priority | Area | Status |
|----------|------|--------|
| P0–P3 | Pass 1 | **Shipped** `b12b96b8` |
| P4-C | Column flip bypass | **Done** Pass 2 |
| P4-E | Queue refresh polish | **Done** Pass 2 |
| P4-A | WU load | Deferred — capture first |
| P4-B | Drawer cold open | Deferred — capture first |
| P4-D | Person cold path | Monitor `[person-prefetch]` miss rate on staging |

---

## Phase 3 performance debt

- Dept attention SQL (`attention_query_ms` ~247ms) — index proposals only
- WU bootstrap total — auth/payload slimming
- Drawer `surface=full` segment split (OCM join, field defs)
- Hard nav dept→WU pill — out of scope unless approved
- Header actions parallel to commit — needs contract review
- Operator baseline table: fill _staging TBD_ cells after DevTools capture

---

## Tests (Pass 2)

- `web/tests/admin/adminV2PerformancePass2.test.ts`
- `web/tests/admin/opportunityQueueRefreshEvent.test.ts`
- `web/tests/admin/drawer/personDrawerPerfFollowup.test.ts`
- `web/tests/adminV2/drawerPipeline/opportunityDrawerPipeline.test.ts`
