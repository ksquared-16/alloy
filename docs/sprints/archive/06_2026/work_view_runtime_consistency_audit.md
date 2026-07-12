# Work View Runtime Consistency Audit — counts & membership

**Status:** Core fix implemented — pending review
**Branch:** `claude/work-view-count-consistency` (off `origin/staging`)
**Symptom:** workspace "Lead Count = 7" tile *also* shows "No data"; Enrollment tile "records = 1"
(correct); runtime Work Views all show 0 (incl. "All Leads"); the record (Lyons Family) opens fine.
One real enrollment record exists, but five surfaces read different sources.

---

## The five sources (exact)

| # | Surface | Value | Source (file) | Scope |
|---|---------|-------|---------------|-------|
| 1 | Workspace **Lead Count = 7** | 7 | `resolveEnrollmentLeadCount` (`lib/metrics/resolvers/eventWindowMetrics.ts`) → `opportunities WHERE created_at in [rolling 30d]` | **Analytics** (OIP), all opps created in 30d regardless of status/work_unit |
| 2 | Workspace **"No data"** badge | — | `workspaceHealthLabel("unknown")` (`lib/metrics/workspaceHealthSummary.ts`) → rendered in `WorkspaceHealthPulseSection` | KPI **health** status; "unknown" because the metric has a value but **no threshold/target** |
| 3 | Process tile **records = 1** | 1 | `workUnitScopeTotalFromSummaries` → `findAllRecordsQueueKey` → `pipeline_total` summary | **Operational** all-records queue (correct) |
| 4 | Left-nav / Work View **count** | 0 | `getWorkUnitQueueSummaries` (lane-membership), keyed by the view's queue key | Lane membership; **never applies Work View predicates** |
| 5 | Work Unit **queue rows** | 0 | `getWorkUnitQueueItems(workUnitId, queueKey)` + post-fetch `filterQueueRowsByWorkViewFilters` | Base lane rows, then predicates |
| — | **Focus Panel** | opens | `composeOpportunityDrawerViewModel(org_id + id)` | By record id — independent of any queue/view |

So three different numbers (7 / 1 / 0) come from three different sources: **analytics (7)**, **operational all-records (1)**, and **broken Work View runtime (0)**.

---

## Exact reason "All Leads = 0" (and all predicate-only views)

A predicate-only Work View (no `compat_queue_key`) resolved **no base queue**:

```ts
// resolveWorkViewRuntimeContext.ts (before)
const queueKey =
    workView.compat_queue_key?.trim()   // predicate-only view → undefined
    || params.queueKey?.trim()          // no ?queue= on the URL → undefined
    || null;                            // → null
```

With `queueKey = null`, the runtime never selected a lane:
- `page.tsx` work-view bootstrap: `if (!ctx.queueKey?.trim()) return;` → no queue selected.
- `useWorkUnitQueueRuntime`: `if (!apiQueueKey.trim()) { return; }` → no fetch.

→ **0 base rows → predicates never run → count/rows = 0**, for every predicate-only view including
"All Leads". The Focus Panel still opens because it loads by `opportunity.id`, not by queue membership.

**Secondary cause (All Leads specifically):** `createEmptyWorkViewDraft` seeded
`filters_v1: [{ tour_date = today }]`. An "All Leads" created from that draft silently carried a
`tour_date = today` predicate → 0 records even once a base queue exists.

---

## Fixed seam

**One base-queue resolver, with an all-records fallback for predicate-only views.**

1. `resolveWorkViewBaseQueueKey(workView, explicitQueueKey, queueDefinition)` (new, in
   `resolveWorkViewRuntimeContext.ts`):
   `compat_queue_key` → explicit `?queue=` → **all-records queue** (`findAllRecordsQueueKey` →
   `primary_total_queue` = `pipeline_total` for enrollment) → null. `resolveActiveWorkViewRuntimeContext`
   now uses it and accepts an optional `queueDefinition`.
2. `page.tsx` work-view bootstrap passes `queueDefinition: workUnit?.queue_definition`, so a predicate-only
   view resolves `queueKey = pipeline_total` (the same all-records queue behind the correct "records = 1")
   and the runtime selects it → rows fetch runs → predicates filter the all-records base.
3. `createEmptyWorkViewDraft` now seeds **empty `filters_v1`** (include-all). A new view shows all records
   in scope until the operator adds conditions.

**Result:** "All Leads" (empty filters over `pipeline_total`) → all records (1). New Leads (its predicate
over its base) → its own subset. The empty-filter evaluator already includes-all
(`filterQueueRowsByWorkViewFilters(rows, []) === rows`), so the count and rows agree.

**Count == rows, one resolver:** the authoritative per-view count is the queue route's `total`, which is
`filterQueueRowsByWorkViewFilters(items, ctx.filters, ctx.match).length` — the **same** resolver that
produces the rows. (Diagnostic test asserts count === rows over a shared base.)

---

## Tests added

`web/tests/lifecycle/`:
- `resolveWorkViewRuntimeContext.test.ts` — base-queue resolver (compat → lane; explicit → that queue;
  predicate-only + def → `pipeline_total`; no def → null); `resolveActiveWorkViewRuntimeContext` resolves
  `pipeline_total` for `all_leads`; one created lead appears in All Leads; count == rows via the shared
  resolver; counts differ when predicates differ; New Leads count == New Leads rows.
- `evaluateWorkViewFiltersV1.test.ts` — empty filter = include-all (AND and OR).
- `workViewsConfigV1.test.ts` — `createEmptyWorkViewDraft` is include-all (empty filters).

---

## Files changed

| Concern | File |
|---------|------|
| All-records base-queue resolver + context | `web/lib/lifecycle/resolveWorkViewRuntimeContext.ts` |
| Pass queue_definition so predicate-only views select the all-records base | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` |
| New-view draft is include-all (empty filters) | `web/lib/lifecycle/workViewsConfigV1.ts` |
| Tests | `web/tests/lifecycle/resolveWorkViewRuntimeContext.test.ts`, `evaluateWorkViewFiltersV1.test.ts`, `workViewsConfigV1.test.ts` |

---

## Documented boundaries (separate, scoped follow-ups — not in this commit)

- **Left-nav / sidebar preview count badge** still reads lane-membership queue summaries
  (`getWorkUnitQueueSummaries`), which do not apply Work View predicates — so a predicate-only view's
  *preview* badge may differ from its authoritative (predicate-filtered) queue total. Making the summary
  path predicate-aware is a QueueService change, intentionally out of this urgent fix.
- **Workspace "Lead Count = 7" vs "No data".** The 7 is a **live analytics** metric (30-day created-window),
  genuinely a different scope than operational counts; the "No data" is a KPI **health** status of
  "unknown" (the metric has a value but no threshold). The contradiction (value present + "No data") is an
  analytics-presentation fix: the health badge should not render "No data" when the metric resolved a
  value. Tracked separately (no UI-label patch — a value-aware gate on the health chip).
- **Focus Panel scope.** Opening by record id is intentional and must stay (deep links, cross-scope). A
  guard so the Focus Panel doesn't silently show a record the active view excludes (unless flagged
  out-of-scope) is a separate UX enhancement.
