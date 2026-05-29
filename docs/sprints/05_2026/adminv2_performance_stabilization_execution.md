# AdminV2 Performance Stabilization — Execution Sprint

**Status:** In progress  
**Baseline branch:** `fix/opportunity-drawer-recovery`  
**Audit reference:** Prior conversation audit + [`adminv2_performance_scope_lock.md`](./adminv2_performance_scope_lock.md)

## Sprint rules

- No architecture rewrite, no UX redesign, no waitlist placement changes.
- Targeted fixes only: refresh correctness, prefetch, visual stability, measured load polish (P4).

---

## Pre-implementation baseline capture

Capture in DevTools **before** merging execution fixes. Run each scenario once cold, once warm where applicable.

| # | Scenario | Commands / filters |
|---|----------|-------------------|
| 1 | Dept land | `[perf.dept.load]`, `[dept-reveal-gate]` |
| 2 | Work unit land | `reportAdminV2SpeedSprint()`, `reportWorkUnitCriticalPathLanes()`, `[wu-route-perf]` |
| 3 | Opportunity drawer cold open | `[perf.drawer.open]`, `[perf.drawer.phase]`, `[perf.drawer.first_paint]` |
| 4 | Opportunity drawer warm (row intent prefetch) | Same; expect `prefetch_hit: true` |
| 5 | View Person from opportunity | `[person-drawer-open]`, `[person-prefetch]` |
| 6 | Person → back → opportunity | `[drawer-back-restore]` |
| 7 | Next/previous in drawer | `[perf.drawer.open]`, queue nav pending overlay |

### Reference baselines (staging, May 2026 closeout — pre-execution)

| Surface | Metric | ms (approx) |
|---------|--------|-------------|
| Dept bootstrap | `total_ms` | 900–1600 |
| Dept attention (enrollment) | `attention_query_ms` | ~247 |
| Work unit bootstrap | total | 1700–2200 |
| Drawer open | bootstrap | 680–790 |
| Drawer open | full (background) | 900–1100 |
| Drawer click → commit (cold) | | 900–1200 |

### Fresh capture table (fill before/after in staging)

| Scenario | Metric | Pre-fix | Post-fix |
|----------|--------|---------|----------|
| Dept above_fold_ready | `reveal_wait_ms` | _TBD_ | _TBD_ |
| WU shell → primary lane | `since_origin_ms` | _TBD_ | _TBD_ |
| Drawer cold commit | `drawer_open_click_to_commit_ms` | _TBD_ | _TBD_ |
| Drawer warm commit | `drawer_open_click_to_commit_ms` | _TBD_ | _TBD_ |
| Person open (prefetched) | `timeToVisibleMs` | _TBD_ | _TBD_ |
| Back restore | `timeToVisibleMs` | _TBD_ | _TBD_ |
| Queue nav warm | overlay shown? | _TBD_ | _TBD_ |

---

## Implementation tracker

| Priority | Area | Status |
|----------|------|--------|
| P0 | Queue refresh correctness | **Done** — scoped listener + missing dispatches |
| P1 | Family & Contacts stability | **Done** — geometry reserves + column lock |
| P2 | Person drawer speed | **Done** — earlier prefetch + pointerdown + cache shell skip |
| P3 | Drawer record navigation | **Done** — opp snapshot on nav + skip redundant composed load |
| P4 | Dept/WU load | **Deferred** — capture baselines first on staging |

---

## P0 — Queue refresh audit

### Mutation paths → event dispatch

| Path | Dispatches? | action_key |
|------|-------------|------------|
| Drawer inline PATCH save | Yes | `inline_save` |
| Registry header/section actions | Yes | action key |
| Status modals / tour / quote | Yes | various |
| Family primary/linked person PATCH | **Added** | `person_contact_save` |
| Family registry `onRegistryApplied` | **Added** | `family_contacts_registry` |
| Inquiry children placement | Yes | (existing) |
| Manual placement order | Broadcast | **Fixed** detail |
| `dispatchOpportunityRecordUpdated` | Yes | registry |

Work-unit listener: rows refetch scoped by `detail.id` + visible ids; summaries always refresh on mutation events.
