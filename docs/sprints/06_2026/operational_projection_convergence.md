# Operational Projection Convergence

**Status:** Canonical projection + bounded fixes implemented; count-surface consumer wiring scoped — pending review
**Branch:** `claude/operational-projection-convergence` (off `origin/staging`)
**Goal:** for one created enrollment lead, every operational surface agrees — workspace KPI, process
card, Work View nav/header count, queue rows, Focus Panel.

> **Core doctrine.** There is **one operational projection source** for runtime work. Analytics metrics
> may exist, but must not masquerade as operational queue truth. If a value is operational, it comes from
> the **same resolver** as the queue/work-view rows. If a metric is analytics-only, it is labeled as such
> and must never render a value beside a contradictory "No data".

---

## 1. Audit — what produces each number

| Surface | Source (file) | Resolver / query | Filters | Kind | Mismatch |
|---------|---------------|------------------|---------|------|----------|
| Workspace **KPI "Lead Count = 7"** | `lib/metrics/resolvers/eventWindowMetrics.ts` `resolveEnrollmentLeadCount` | `opportunities WHERE created_at in [rolling 30d]` | created-at window; no status/work_unit | **Analytics** | Different scope than operational; can show value + "No data" |
| Workspace **"No data" chip** | `lib/metrics/workspaceHealthSummary.ts` `workspaceHealthLabel("unknown")` → `OipKpiObjectCard` | KPI health = "unknown" (no threshold) | n/a | **Analytics health** | Rendered beside a value |
| Process card **records = 1** | `lib/workspace/workUnitQueueDerived.ts` `workUnitScopeTotalFromSummaries` → `findAllRecordsQueueKey` (`pipeline_total`) | all-records lane summary | none (all records) | **Operational** | Correct |
| Work View **nav count** | `app/adminV2/components/Sidebar.tsx` | *(none — sidebar renders no per-view count badge)* | — | — | Absent |
| Work View **process-card per-view count** (`todaysWork[].count`) | `lib/admin/enrollmentOperationalSurfaceLanding.ts` `queueCountFromSummaries` | lane summary by `queueKey` | **lane membership** (status/stage) | **Operational (wrong path)** | Predicate-only view id → no lane → 0 |
| Work View **header pill count** | `app/adminV2/components/workspace/WorkUnitAboveFoldHeaderChips.tsx` (`chip.count`) | lane summary by lane `key` | lane membership | **Operational (wrong path)** | Predicate-only view → no lane → 0 |
| Work View **queue rows** | `app/api/admin/queues/[workUnitId]/[queueKey]/route.ts` → `getWorkUnitQueueItems` + `filterQueueRowsByWorkViewFilters` | all-records base + V3 predicates | **predicates** | **Operational (correct)** | Fixed in prior commit (`46535340a`) |
| **Focus Panel** | `components/admin/workspace/WorkUnitSlugRouteHost.tsx` → `composeOpportunityDrawerViewModel(org_id+id)` | by record id | none | Operational (by id) | Opens regardless of active view membership |

**The mismatch in one sentence:** counts come from **lane-membership summaries** (which a predicate-only
Work View never matches → 0), while rows come from **predicates over the all-records base** — two
different resolvers — and the analytics KPI (7) sits beside an analytics "No data" health chip.

---

## 2. Canonical operational projection (the single source)

`web/lib/lifecycle/operationalProjection.ts` — `computeOperationalProjection({ baseRows, workViews, includeRows? })`:

- `total` = all-records base count (process/work-unit scope).
- per Work View: `count === rows.length`, derived from `filterQueueRowsByWorkViewFilters(baseRows,
  view.filters_v1, match)` — the **same** evaluator as the queue rows. `includeRows: false` gives a cheap
  count-only projection whose counts are still the predicate-filtered counts (never a lane summary).
- `recordMatchesWorkView(record, view)` / `resolveFocusPanelScope({record, activeView})` — single-record
  membership via the same evaluator (for the Focus Panel scope state).

By construction this answers all of: total records, per-view count, per-view rows, record-belongs-to-view,
and focus-panel eligibility — from one base + one evaluator. **Base rows** come from
`getWorkUnitQueueItems(orgId, workUnitId, queueKey = findAllRecordsQueueKey(def))` (= `pipeline_total`),
the same source as the correct "records = 1".

---

## 3–4. Work View counts & process-card count (convergence)

**Rule:** a Work View's count must equal its row count, and must **not** use lane summaries for
predicate-only views. The process card "records" and "All Leads" must agree (both = `total`).

- **Already correct (prior commit `46535340a`):** queue ROWS + the work-unit page's authoritative total
  come from the predicate-over-all-records path; "All Leads" (empty filters) = all base rows.
- **Process-card per-view counts — converged (this commit).** `buildWorkLinesFromConfiguredWorkViews`
  (`enrollmentOperationalSurfaceLanding.ts`) now computes per-view counts from
  `computeOperationalProjection({ baseRows, workViews, includeRows: false })` over the **same** Work Views
  it builds the work lines from — so the count keys align by id and every `todaysWork[].count` is the
  predicate-filtered count (All Leads = total; predicate-only views no longer drop to 0). The client
  loader (`loadOperatorLifecycleLandingClient.fetchPipelineBaseRowsForDepartment`) fetches the all-records
  base rows once per department (`pipeline_total`, in parallel with the existing summaries fetch — not a
  duplicate) and passes them through. Lane summaries remain a **fallback** only when base rows aren't yet
  available (server first paint).
- **Above-fold header pills — lane-keyed; already projection-consistent for lane-bound views.** Each
  header chip is a `queue_definition` lane; for a Work View that binds a lane (`compat_queue_key`) the lane
  count *is* the predicate count, so the chip agrees with the projection. Predicate-only views have no lane
  chip — surfacing them as header pills with projection counts is the **Work View header-pill
  materialization** follow-up (per `business-process-system.md` § Work View runtime materialization), a
  page restructure, not a count-source swap.

---

## 5. Workspace KPI contradiction — value + "No data" (fixed)

Implemented **Option B** (the metric stays analytics) with the doctrine guard: **a KPI tile never renders
a value and a "No data" indicator together.** `OipKpiObjectCard` now gates the "No data" helper on
`!oipDisplayValueIsPresent(displayValue)` (`lib/metrics/oipKpiObjectPresentation.ts`) — when a real value
is present, no "No data". (Labeling the analytics metric as "leads created in N days" is a copy change in
the metric definition, deliberately not bundled — no label-only patch.)

---

## 6. Focus Panel scope guard (resolver ready)

The Focus Panel still loads by record id (deep links, cross-scope) — unchanged. `resolveFocusPanelScope`
classifies the loaded record against the active Work View: `in_scope` / `no_active_view` /
`out_of_scope(activeViewId,label)`. The work-unit host can render an explicit "record is outside this
view — open in All Leads" state instead of silently showing a record the active queue counts as 0.
→ Resolver + tests delivered; wiring the visible scope banner into `WorkUnitSlugRouteHost` is the UI step.

---

## 7. Runtime events / refresh

Membership-changing actions (Create Lead) already dispatch the canonical
`dispatchOpportunityQueueUpdated(opportunityId, "create_lead")` and register `create_lead` in
`QUEUE_MEMBERSHIP_ACTION_KEYS` (see `actions-and-workflows.md` § Post-mutation projection refresh). When
the count surfaces consume the projection, that same refresh recomputes the projection (base rows
re-fetch) → process card count, Work View counts, rows, and active Focus Panel scope all update from one
event. No new event is required; the projection becomes the recomputed unit.

---

## Tests

- `web/tests/lifecycle/operationalProjection.test.ts` — one created lead in All Leads count AND rows;
  every view count === rows; count-only projection still predicate-filtered (not lane summary);
  empty-filter = include-all; total === All Leads; membership + focus-panel scope (in/out/none).
- `web/tests/metrics/oipKpiNoDataGuard.test.ts` — value present ⇒ no "No data"; placeholder ⇒ may show.
- Prior consistency tests (`resolveWorkViewRuntimeContext.test.ts`, `evaluateWorkViewFiltersV1.test.ts`)
  cover base-queue resolution, count==rows on the queue route, include-all, and focus-panel route safety.

---

## Files changed (this commit)

| Concern | File |
|---------|------|
| Canonical operational projection (total / per-view count+rows / membership / focus scope) | `web/lib/lifecycle/operationalProjection.ts` (new) |
| **Process-card per-view counts → projection** | `web/lib/admin/enrollmentOperationalSurfaceLanding.ts` (count source), `web/lib/admin/loadOperatorLifecycleLandingClient.ts` (base-rows fetch) |
| KPI doctrine guard — no value beside "No data" | `web/lib/metrics/oipKpiObjectPresentation.ts`, `web/components/admin/workspace/OipKpiObjectCard.tsx` |
| Tests | `web/tests/lifecycle/operationalProjection.test.ts` (new), `web/tests/metrics/oipKpiNoDataGuard.test.ts` (new), `web/tests/lib/admin/enrollmentOperationalSurfaceLanding.test.ts` (projection-overrides-summaries) |
| Docs | this file, `docs/platform/core/business-process-system.md`, `docs/platform/modules/actions-and-workflows.md` |

---

## Stage is derived from status (New Leads vs Registration — data-proven)

The Lyons Family lead showed under **Registration**, not **New Leads**. Inspecting the live record
(org `93667019`):

- `opportunities.status_key = new_inquiry`, **`lifecycle_stage_key = null`** (null on *every* opportunity
  org-wide — opportunities never store a stage column).
- New Leads filter = `opportunity_stage equals "lead"` (match=all). The evaluator resolves
  `opportunity_stage` from `lifecycle_stage_key` → **null** → New Leads **false**.
- Registration filter = `child_enrollment_status in […] OR needs_attention equals "true"` (match=**any**).
  A brand-new uncontacted lead is needs-attention → that OR-branch → Registration **true**.

**Root cause:** a record's **stage is a roll-up over its status** (`status_definitions.metadata.process_stage_key`,
e.g. `new_inquiry → lead`), but the Stage predicate had no row value to evaluate because the stage was
never materialized from the status.

**Fix (correct layer = evaluator/projection input, not Create Lead or config):**
`enrichRowsWithDerivedStage(rows, statusStageMap)` sets `lifecycle_stage_key` from
`status_key → process_stage_key` when absent; `computeOperationalProjection` applies it before filtering.
The status→stage map comes from `/api/admin/status-options` (now returns `process_stage_key`); the client
landing loader fetches it once and threads it into the enrollment projection. New Leads now correctly
counts the new lead. (Registration *also* matching via its `needs_attention` OR-branch is the saved
config's intent — not changed, per "do not change Work View config".)

**Diagnostic:** `diagnoseRecordWorkViewPlacement({ record, workViews, statusStageMap })` returns the
record's status/derived-stage/work_unit + each Work View's pass/predicate — the dev/test tool used to
prove the placement above.

## KPI decision (Lead Count = 7)

**Decision: the workspace KPI "Lead Count" is an ANALYTICS metric (opportunities created in a rolling
30-day window), NOT the operational lead count, and must not be compared to operational projection
counts.** The doctrine guard (`oipDisplayValueIsPresent`) ensures it never renders a value beside "No
data". The cosmetic relabel ("Lead Count" → "Leads created in 30 days") is intentionally **not** done here
("do not patch labels"); the operational New Leads / All Leads counts come from the projection, which is
the operational source of truth.

## Remaining risks / work (bounded)

1. **Work Unit page header/pills are still lane-keyed.** The `/workspace/work-unit/...` above-fold chips
   render from `queue_definition` lanes (`queuePillSections` in the page) — they agree with the projection
   for lane-bound views but do not yet render one pill per configured Work View. Repointing them
   (one pill per visible Work View, `?work_view=<id>` navigation, active from `loc.workViewId`, count from
   the projection) is a hot-page restructure (~`page.tsx` 1037-1059 + the pill-click handler +
   `WorkUnitAboveFoldHeaderChips`) — scoped as the next focused commit. The tile + sidebar already
   materialize all six.
2. **Queue-route rows need the same stage derivation.** The page's queue rows come from
   `/api/admin/queues/[workUnitId]/[queueKey]` (server) filtered by the active view; for a Stage predicate
   to match there, the route must apply the same `enrichRowsWithDerivedStage` server-side (it loads
   `status_definitions` already). Same root fix, server seam.
3. **Focus Panel scope banner.** `resolveFocusPanelScope` is ready + tested; rendering the out-of-scope
   banner + "open in All Leads" action in `WorkUnitSlugRouteHost` is the UI step.
4. **Base-rows count cap.** The client fetches up to `PROJECTION_BASE_ROWS_LIMIT` (500) all-records base
   rows per department for in-memory per-view counts (consistent with the existing in-memory row filter);
   a pipeline >500 records would under-count — the scale-correct path is a server-side per-view count.
