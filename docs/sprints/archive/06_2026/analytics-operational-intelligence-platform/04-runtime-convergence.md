# Slice 3 — Runtime Intelligence & Data Wiring (Convergence Analysis)

**Status:** Architecture / convergence sprint (June 2026). **No broad implementation authorized.**
**Prerequisite:** Slice 2 dev preview frozen (`8433f5ef`); product + visual language frozen.
**Question this answers:** *What is the minimum remaining engineering work to make every Analytics surface resolve real operational data and navigate directly into operational work?*

---

## Executive summary

Alloy is **~75% of the way** to a functioning Analytics platform. The substrate already exists:

| Layer | Status | Evidence |
|---|---|---|
| Metric calculation (OIP) | **Complete** | `web/lib/metrics/metricEngine.ts`, `resolvers/*`, code registry |
| Metric platform V2 (config + snapshots) | **Mostly complete** | `metric_definitions`, `metric_visualizations`, `metric_placements`, `metric_platform_snapshots` |
| Placement render pipeline | **Complete** | `/api/admin/analytics/render`, `renderMetricPlacements.ts`, `MetricPlacementRenderer` |
| Metric card renderers | **Complete** (Slice 1–1.5) | `MetricVisualRenderer`, `Metric*Card` family |
| Scope / org / site / work-unit filtering | **Mostly complete** | `MetricEvaluationContext`, `resolveMetricScopeFilter`, `AdminAccessScopeDimensions` |
| Operational Context (record grain) | **Complete** | `OperationalContext` boundary for Focus Panel cards |
| Command / action runtime | **Complete** | Operational Command Runtime V3 (`commandFlow`, `invocationContext`) |
| Queue drill navigation (workspace) | **Partial** | `enrollmentDepartmentViewModel` builds `openQueueHref`; no analytics-wide resolver |
| Breakdown / chart / report providers | **Missing or partial** | Dimensions filter single values; no group-by API; charts are dev-preview only |
| Analytics Context (surface filters) | **Missing** | Slice 2 `AnalyticsFilterBar` is fixture-local; no shared context model |
| Drill resolution (analytics-wide) | **Missing** | Slice 2 `DrillDestination` is preview contract only |
| Declarative surface registry | **Partial** | `metric_placements` + surfaces catalog; no section/panel composition schema |
| Financial metrics | **Missing** | GL config read-only; no revenue/AR metric resolvers |
| Optimization center runtime | **Partial** | Ratio/compliance read models exist; no command surface route |

**Minimum path:** Wire existing placement + OIP pipeline to real Dashboard surfaces, add an `AnalyticsContext` + `DrillResolver`, extend OIP with one breakdown read, then promote surfaces one at a time. Do **not** rebuild charts, actions, or metric math.

---

## 1. Analytics Runtime Architecture

### 1.1 Design principle

The UI declares **what question**, **what scope**, **what grain**, and **what drill destinations** it supports. The platform resolves data, permissions, and navigation. Presentation never computes.

```
Surface declaration
  → AnalyticsContext (scope)
  → MetricRequest (key + grain + dimensions)
  → Provider (OIP / snapshot / rollup / operational read model)
  → ResolvedVisualization (formatted, health, comparison, segments, drill targets)
  → Renderer (MetricVisualRenderer / chart renderer / panel primitive)
```

### 1.2 Provider inventory

| Provider | Purpose | Status | Primary symbols / paths |
|---|---|---|---|
| **Metric (point) provider** | Single resolved value + health | ✅ Complete | `evaluateMetricDefinition`, `resolveSingleMetric`, `getLatestMetricPlatformSnapshot` |
| **Snapshot provider** | Pre-computed period values | ✅ Complete | `metric_platform_snapshots`, `writeOrgMetricSnapshots`, `metricSnapshotRunner` |
| **Trend provider** | Time series + PoP comparison | ✅ Mostly complete | `getMetricPlatformSnapshotSeries`, `comparePeriodOverPeriod`, `GET …/metrics/[id]/trend` |
| **Breakdown provider** | Segmented values (site, stage, program) | ⚠️ Partial | `MetricDimensions` (`lifecycle_stage`, `status_key`) filters **one** segment; no group-by API returning `MetricBreakdownSegment[]` |
| **Rollup provider** | Composite / health scores | ⚠️ Partial | `computeMetricRollup`, `metric_rollups` table, `workspaceHealthSummary` — org-level only |
| **Chart provider** | X/Y series, funnel, cohort grids | ❌ Missing (runtime) | Slice 2 `web/app/dev/analytics-surface-mocks/slice2/charts.tsx` — dev preview only |
| **Report provider** | Tabular / period output surfaces | ❌ Missing | No server route returns report-shaped rows; financial GL is config-only |
| **Optimization provider** | Constraint diagnosis + simulation | ⚠️ Partial | `childcareOperational/config/ratioRules`, `attendance/actualCompliance` — read models, not wired to Analytics |
| **Affected-work provider** | Operational objects behind an insight | ⚠️ Partial | Queue previews, `OperationalContext.signals`, attention resolver — no analytics-facing API |
| **Recommendation provider** | Suggested actions with projected impact | ❌ Missing | BOS recommendations path exists (`bos_recommendations` placement) but not analytics-bound |

### 1.3 Existing runtime data flow (already live)

```
metric_placements (DB)
  → placementResolver.resolvePlacementsForSurface
  → renderMetricPlacementsForSurface
      → getLatestMetricPlatformSnapshot (per definition + context)
      → getMetricPlatformSnapshotSeries (sparkline + comparison)
  → GET /api/admin/analytics/render?surface=…&context_type=…&context_id=…
  → fetchMetricRenderBundle (client)
  → MetricPlacementRenderer → MetricVisualRenderer → Metric*Card
```

**Surfaces already using this pipeline:**

| Surface | Component | `surface` param |
|---|---|---|
| Workspace header | `WorkspaceOperationalPulseStrip` | `workspace_header` |
| Work unit header | `WorkUnitCommandSurface` | `work_unit_header` |
| BP tile | `WorkspaceRootLifecycleGrid` | `business_process_tile` |
| OI modal | `OiV2MetricOverview` | `operational_intelligence` (zoned) |

Dashboard / report surfaces are registered in `VALID_SURFACES` on the render route but have **no production page** consuming them yet.

### 1.4 Grain model (required on every visualization)

Reuse and extend `MetricEntityScope` from `web/lib/metrics/platform/types.ts`:

| Grain | Scope keys | Aggregation owner | Drill default |
|---|---|---|---|
| `organization` | `org_id` | OIP snapshot / rollup | Executive summary, org health |
| `site` | `org_id` + `site_location_id` | OIP with `resolveMetricScopeFilter` | Site-scoped queue or report |
| `department` | `org_id` + department scope | `AdminAccessScopeDimensions` | Department workspace |
| `work_unit` | `org_id` + `work_unit_id` | OIP + queue total (coming_soon adapter) | Work unit queue |
| `record` | subject id + type | Operational Context / entity GET | Drawer / Focus Panel |
| `queue` | work unit + stage/status filters | Queue preview API | Filtered queue (authoritative list) |

**Rule:** Every visualization config must declare `entity_scope` + `grain`. No implicit grain. The breakdown/chart layer adds an optional `group_by` dimension key validated against `MetricSourceAdapter.supportedDimensions`.

### 1.5 Proposed runtime contract (minimal, no new engine)

Add one shared type module — **`web/lib/analytics/runtime/types.ts`** (or extend `metric/platform/types.ts`) — not a `CompositionEngine` class:

```typescript
/** What a surface section asks the platform for. */
type AnalyticsVisualizationRequest = {
  metricDefinitionId?: string;
  metricKey?: string;           // OIP key fallback
  visualizationType: MetricVisualizationType;
  grain: MetricEntityScope;
  groupBy?: string;             // breakdown/chart dimension
  drillContractId?: string;     // references drill registry
};

/** What the platform returns — presentation-ready, never raw SQL rows. */
type ResolvedVisualization = {
  request: AnalyticsVisualizationRequest;
  formattedValue?: string;
  healthState?: MetricHealthState;
  comparison?: MetricTrendComparison;
  sparklinePoints?: number[];
  segments?: MetricBreakdownSegment[];  // breakdown / stacked bar
  series?: ChartSeries[];               // line / area
  rows?: TableRow[];                    // report
  drill?: DrillDestination;             // default drill for the viz
  affectedWork?: AffectedWorkItem[];    // optional, loaded on drill
};
```

**Provider dispatch** stays in existing modules:

- Point/trend → `renderMetricPlacements` / `evaluateMetricDefinition`
- Breakdown → **new** `evaluateMetricBreakdown` delegating to OIP resolvers in a loop or one SQL group-by per adapter
- Chart → breakdown provider output reshaped to chart series (presentation transform only)
- Optimization → `childcareOperational/*` read models wrapped as `ResolvedVisualization`

---

## 2. Filter Context Architecture

### 2.1 Problem

Slice 2 proved surface-aware filters (date, location, program, stage, …). Today, metric scope is fragmented:

| Context | Where | Fields |
|---|---|---|
| `MetricEvaluationContext` | Server metric eval | `orgId`, `siteLocationId`, `workUnitId`, `period`, `filters`, `dimensions` |
| `MetricResolveContext` | OIP engine | `orgId`, `scope` (dept/site access), `window`, `siteLocationId`, `workUnitId`, `dimensions` |
| `OperationalContext` | Focus Panel cards | `subject`, `businessProcess`, `truth`, `signals` — **record grain, not analytics scope** |
| Render API query params | Client fetch | `context_type`, `context_id`, `surface`, `surface_key`, `placement_zone` |
| Workspace routes | URL | `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]` |

There is **no shared AnalyticsContext** that flows from a Dashboard surface into every card, chart, table, affected-work panel, and drill destination.

### 2.2 Proposed `AnalyticsContext` model

Extend — do not replace — existing scope types:

```typescript
type AnalyticsContext = {
  orgId: string;
  /** Inherited from admin session — never client-supplied alone. */
  accessScope: AdminAccessScopeDimensions;

  /** Surface identity */
  surfaceId: string;          // e.g. "executive-performance"
  surfaceKey?: string;        // metric_placements.surface_key

  /** Filter dimensions (Slice 2 filter bar) */
  dateRange: MetricPeriodConfig;
  comparisonPeriod?: MetricPeriodConfig;
  siteLocationIds?: string[] | null;   // null = all allowed
  programIds?: string[] | null;
  roomLocationIds?: string[] | null;
  businessProcessKey?: string | null;
  workUnitId?: string | null;
  stageKeys?: string[] | null;
  staffIds?: string[] | null;
  /** Financial-only */
  accountCategory?: string | null;
  agingBucket?: string | null;

  /** Active drill selection (chart mark → narrows affected work) */
  drillSelection?: DrillSelection | null;
};
```

### 2.3 Propagation rules

| Consumer | How context arrives |
|---|---|
| Metric cards | `MetricPlacementRenderer` passes `contextType` + `contextId` derived from `AnalyticsContext` → render API → snapshot lookup |
| Charts / breakdowns | Server route accepts serialized `AnalyticsContext` (or hash in URL) → provider evaluates with scope |
| Affected-work panels | Drill selection + context → queue preview API or entity list API |
| Recommendations | BOS / rules engine receives context snapshot; returns action placements |
| Drill destinations | `DrillResolver` merges context + mark scope into navigation target |
| Focus Panel (embedded metrics) | Inherits **record** context from `OperationalContext`, not full AnalyticsContext — embedded metrics use `context_type=record`, `context_id=subject.id` |

### 2.4 URL representation

**Recommendation:** Encode analytics scope in search params on a first-class route, e.g.:

```
/adminV2/intelligence/executive-performance
  ?period=quarter
  &compare=prior_quarter
  &site=uuid
  &program=infant
```

| Param | Maps to |
|---|---|
| `period`, `compare` | `MetricPeriodConfig` |
| `site`, `dept`, `work_unit` | location / department / work unit scope |
| `program`, `stage`, `room`, `staff` | dimension filters |
| `drill` | optional active drill token (restores chart → affected-work state) |

**Workspace sharing:** When drilling from Analytics → work unit queue, pass through scope as queue filter query params (pattern already used in `enrollmentDepartmentViewModel.openQueueAction.href`).

**Do not** store filter state only in React local state (Slice 2 preview pattern) — production surfaces must be linkable and back-button safe.

### 2.5 Context provider placement

One React context at the Analytics surface page shell:

```
AnalyticsSurfacePage
  └─ AnalyticsContextProvider (reads URL ↔ state)
       └─ sections (ExecutiveSummary, Diagnostic, …)
            └─ MetricPlacementRenderer | ChartZone | AffectedWorkPanel
```

Server routes receive context via POST body or canonical query string — **never** trust client org_id.

---

## 3. Drill Contract Model

### 3.1 Slice 2 preview contract (frozen)

From `web/app/dev/analytics-surface-mocks/slice2/types.ts`:

```typescript
type DrillDestinationKind =
  | "queue" | "records" | "work_unit" | "business_process"
  | "drawer" | "report_detail" | "workflow" | "optimization_center";

type DrillDestination = {
  kind: DrillDestinationKind;
  label: string;
  target: string;      // stable token, e.g. "queue/tours-stalled"
  scope?: string;      // human-readable scope echo
};
```

### 3.2 Runtime resolution pipeline

```
User clicks chart mark / metric footer / table row
  → DrillSelection { destinationKind, target, markScope }
  → merge(AnalyticsContext, DrillSelection)
  → DrillResolver.resolve() → NavigationIntent
  → existing router / command launcher
```

**`NavigationIntent`** maps to existing infrastructure — no new action system:

| `DrillDestinationKind` | Resolves to | Existing path |
|---|---|---|
| `queue` | Filtered work unit queue | `enrollmentDepartmentViewModel` href pattern; `useOpportunityQueueLayoutRuntime` query params |
| `records` | Affected-work panel or entity list | Queue preview rows → drawer open |
| `work_unit` | Workspace work unit page | `/adminV2/workspace/dept/…/work-unit/…` |
| `business_process` | BP workspace / process surface | Workspace root lifecycle grid |
| `drawer` | Entity drawer / Focus Panel | Existing drawer open + `OperationalContext` |
| `report_detail` | Report drill row / financial detail | New report detail route (later) |
| `workflow` | Operational Command | `resolveCommandContext` + `runRegisteredAction` |
| `optimization_center` | Command surface | New route wrapping operational read model (later) |

### 3.3 Declarative drill registry

Store drill contracts on **`metric_definitions`** or **`metric_visualizations.display_config`** — not hardcoded in renderers:

```json
{
  "drill": {
    "default": { "kind": "queue", "target": "queue/leads", "work_unit_key": "enrollment-new-leads" },
    "by_dimension": {
      "site_id": { "kind": "queue", "target": "queue/leads", "inherit_dimension": "site_id" },
      "lifecycle_stage": { "kind": "queue", "target": "queue/stage/{value}" }
    }
  }
}
```

**`DrillResolver`** (`web/lib/analytics/runtime/drillResolver.ts` — new, small):

1. Load drill config for metric/visualization.
2. Merge `AnalyticsContext` + clicked segment dimension.
3. Validate operator access (`resolveMetricScopeFilter` / `getAdminAccessContextCached`).
4. Return `NavigationIntent` `{ href }` or `{ command: RegisteredAction, context }`.

### 3.4 Grain → default drill mapping (platform defaults)

| Metric (OIP key) | Grain | Default drill |
|---|---|---|
| `enrollment.lead_count` | org / site | Lead queue (work unit) |
| `enrollment.tour_conversion_rate` | org / site | Tour work unit + stage filter |
| `enrollment.time_to_schedule_tour` | org / site | Stalled tour queue |
| `ops.work_overdue_count` | org / work_unit | Overdue tasks queue |
| `ops.needs_attention_count` | org | Needs-attention queue |
| `forms.completion_rate` | org | Incomplete forms queue |
| Ratio compliance (future) | site / room | Optimization center |
| Revenue / AR (future) | org / site | Financial report detail |

No visualization dead-ends: if data represents operational objects, registry must declare a drill or explicitly mark `exploratory_only: true` (board charts only).

---

## 4. Action Integration Model

### 4.1 Principle

Analytics is another **entry point into work**. Reuse Operational Command Runtime V3 — do not invent analytics actions.

Existing stack:

| Piece | Path |
|---|---|
| Registered capabilities | `web/lib/adminV2/actions/actionRegistry.ts` |
| Context resolution | `web/lib/platform/commands/invocationContext.ts` |
| Flow stages | `web/lib/platform/commands/commandFlow.ts` |
| Execution | `runRegisteredAction` / workflow paths |

### 4.2 Analytics → command mapping

| Analytics UI | Command entry | `LogicalActionPlacement` |
|---|---|---|
| Recommendation panel CTA | `resolveCommandContext({ action, surface: "analytics", … })` | `bos_recommendations` or new `analytics_recommendations` |
| Command panel chip | Same | `work_unit_actions` when queue context known |
| Optimization "Apply" | Workflow-backed command | `resolve_required_inputs` → `preview` → `execute` |
| Metric card footer drill | Navigation, not mutation | DrillResolver → queue (read path) |

**New logical placement (optional, config-only):**

```typescript
| "analytics_command"  // Analytics command panel + optimization center CTAs
```

Maps to existing `action_placements` surface enum via `logicalPlacementForPhysicalSurface`.

### 4.3 Recommendation flow

```
Insight detected (metric threshold / breakdown segment)
  → rule or BOS proposes RegisteredAction + rationale
  → RecommendationPanel renders (Slice 2 primitive)
  → operator clicks → resolveCommandContext
  → Command Flow V3 stages (subject may need resolution from queue)
  → execute → audit → refresh metric snapshots (ANALYTICS_V2_SNAPSHOTS_UPDATED event)
```

**Re-measure loop:** After command success, emit existing `ANALYTICS_V2_SNAPSHOTS_UPDATED` so `MetricPlacementRenderer` reloads — already wired.

### 4.4 Optimization center actions

Ratio/labor optimization is **not** a new action type. It composes:

1. **Read:** `computeActualCompliance` + `requiredStaffForChildren`
2. **Recommend:** rule-based staff move (config or heuristic)
3. **Act:** existing workflow command (e.g. reassign staff — when registered)
4. **Track:** re-fetch compliance read model

---

## 5. Backend Mapping Matrix

For each Slice 2 preview surface → real platform data.

### 5.1 Executive Summary

| UI (Slice 2) | Metric / data | Resolver / provider | Source tables | Drill | Action |
|---|---|---|---|---|---|
| Narrative insight: conversion | `enrollment.tour_conversion_rate` | OIP + snapshot | `tour_bookings`, `opportunities` | Diagnostic surface | — |
| Narrative insight: capacity | Capacity fill (missing OIP key) | **Missing** — needs `capacity.fill_rate` adapter | `childcareOperational/config/capacityRules`, placements | Enrollment BP | — |
| Narrative insight: AR | Revenue/AR (missing OIP key) | **Missing** | `invoices`, `gl_accounts` (future) | AR queue | Collections workflow |
| Revenue line chart | Revenue trend | **Missing** — needs financial snapshot series | Ledger / invoices | Report detail | — |
| Org health gauge | Health rollup | `computeMetricRollup` / `workspaceHealthSummary` | `metric_rollups`, child KPI snapshots | Health roll-up report | — |

### 5.2 Operational Intelligence / Command Center

| UI | Metric / data | Resolver | Source | Drill | Action |
|---|---|---|---|---|---|
| Overdue work ranked list | `ops.work_overdue_count` + queue rows | OIP + queue preview | `operational_tasks` | Overdue queue | Resolve task command |
| Needs attention | `ops.needs_attention_count` | `operationalHealthMetrics` (evaluator snapshot) | `opportunities`, attention resolver | Attention queue | — |
| Lead response by site | `enrollment.time_to_schedule_tour` breakdown by site | **Needs wiring** — group by site | `opportunities`, `tour_bookings` | Site lead queue | — |
| Tours unconfirmed | Queue count | Queue adapter (coming_soon) | `tour_bookings` | Tour queue | Confirm tour command |

### 5.3 Enrollment Intelligence / Diagnostic

| UI | Metric / data | Resolver | Source | Drill | Action |
|---|---|---|---|---|---|
| Tour conversion by site (stacked) | `enrollment.tour_conversion_rate` × site | **Needs breakdown API** | `tour_bookings` | Site lost-tour queue | Follow-up workflow |
| Families stuck (affected work) | Queue preview | `WorkspaceOpportunityQueueRuntime` | `opportunities` | Drawer | Follow-up workflow |
| Enrollment funnel | Stage counts | `OpportunityLifecycleKpisRuntime` | `opportunities` | Stage queue (`enrollmentDepartmentViewModel`) | — |
| Pipeline funnel chart | Same | Same | Same | Stage queue | — |

### 5.4 Financial Performance / Report

| UI | Metric / data | Resolver | Source | Drill | Action |
|---|---|---|---|---|---|
| Revenue QTD | **Missing** | **Missing** | Invoices / ledger | Report detail | — |
| AR aging breakdown | **Missing** | **Missing** | `invoices` aging | Past-due queue | Collections workflow |
| Monthly summary table | Report provider | **Missing** | GL + invoices | Row drill | Export PDF (future) |
| Revenue by site | **Missing** | **Missing** | Invoices by location | Site report | — |

### 5.5 Optimization Center (Ratio / Labor)

| UI | Metric / data | Resolver | Source | Drill | Action |
|---|---|---|---|---|---|
| Rooms in breach | Compliance entries | `computeActualCompliance` | `child_attendance_events`, ratio config | Room drawer | — |
| Constraint diagnosis | `requiredStaffForChildren` | `ratioRules` | `childcare_config_rules` | — | — |
| Affected rooms | Compliance warnings | `actualCompliance` | Attendance fold + tiers | Room drawer | — |
| Simulated ratios | Staff move heuristic | **Missing** — simulation provider | Schedule assignments (partial) | — | Reassign workflow |
| Apply move | — | Command runtime | — | — | `workflow/reassign-staff` (if registered) |

### 5.6 Chart Gallery (reference)

| Chart type | Data path today | Runtime status |
|---|---|---|
| Line (revenue) | Snapshot series | ⚠️ Works for existing OIP metrics only |
| Bar (response time by site) | Breakdown by site | ❌ Needs breakdown provider |
| Grouped/stacked bar | Multi-series breakdown | ❌ Needs breakdown provider |
| Funnel | Lifecycle KPI breakdown | ⚠️ Exists in workspace VM, not analytics API |
| Cohort | Retention | ❌ Missing |
| Table / ranked list | Queue + metric | ⚠️ Partial |

---

## 6. Implementation Dependency Report

### Complete ✅

| Capability | Evidence |
|---|---|
| OIP metric registry + resolvers | `web/lib/metrics/registry.ts`, `metricEngine.ts`, `resolvers/*` |
| Metric platform DB model | `metric_definitions`, `_visualizations`, `_placements`, `_snapshots`, `_rollups` |
| Placement resolve + render API | `placementResolver.ts`, `renderMetricPlacements.ts`, `/api/admin/analytics/render` |
| Client render + cache + ownership guards | `MetricPlacementRenderer`, `metricRenderBundleCache` |
| Metric card visual language | `MetricCardShell`, `MetricVisualRenderer`, density (Slice 1.5) |
| Org/site/dept/work-unit scope for metrics | `scopeFilter.ts`, `MetricEvaluationContext`, `accessScope` |
| OI modal (zoned placements) | `OiV2MetricOverview`, surface=`operational_intelligence` |
| Operational Context for record cards | `operationalContext/types.ts`, `buildOperationalContext.ts` |
| Command runtime V3 | `platform/commands/*`, `actionRegistry` |
| Surfaces catalog (dashboard category) | `useSurfacesConfigurationSettings.ts` dashboards array |
| Dev preview (Slice 2 compositions) | `/dev/analytics-surface-mocks`, `slice2/*` |
| Ratio/compliance read models | `childcareOperational/config/ratioRules`, `attendance/actualCompliance` |
| Workspace queue drill hrefs | `enrollmentDepartmentViewModel.openQueueAction` |

### Mostly complete ⚠️ (needs wiring, not rebuild)

| Capability | Gap |
|---|---|
| Dashboard / report surfaces | Render API accepts `surface=dashboard|report`; no production page |
| Trend / sparkline | Works for snapshotted metrics; not all metrics have snapshot history |
| Rollups / executive health | `metric_rollups` exist; not bound to Executive Summary surface |
| Metric source adapters | 8 available, 2 disabled/coming_soon; financial + capacity missing |
| Dimension filters | Single-value only; no group-by breakdown endpoint |
| OI → full command center | Modal exists; Slice 2 command center is fixture-only |
| Enrollment funnel | Data in workspace VM; not exposed as analytics provider |
| GL / financial config | Read-only GL; no metric computation |

### Needs wiring 🔌 (small, high-leverage)

| Work item | Effort | Leverage |
|---|---|---|
| `AnalyticsContext` type + URL provider | S | Unblocks all surfaces |
| `DrillResolver` + default registry for OIP keys | S | No dead-end metrics |
| Production Analytics route shell (one surface) | S | Proves end-to-end |
| Wire `MetricPlacementRenderer` into Dashboard page with context | S | Reuses 100% of render pipeline |
| Breakdown API: `evaluateMetricBreakdown(defId, groupBy, ctx)` | M | Unlocks bar, stacked, funnel, diagnostic |
| Promote OI modal content to routed surface | M | Operational Intelligence live |
| Bind `openQueueHref` pattern to `DrillResolver` | S | Consistent queue drills |

### Missing ❌ (new build, sequenced later)

| Capability | Notes |
|---|---|
| Financial metric resolvers (revenue, AR, margin) | Requires invoice/ledger aggregation path |
| Cohort / retention provider | No source adapter |
| Chart runtime components (production) | Promote from Slice 2 dev preview |
| Report export (PDF / board packet) | Document renderer |
| Optimization simulation provider | Staff schedule model incomplete (`staff_data_unavailable`) |
| Declarative surface composition schema (sections/panels) | Beyond `metric_placements` zones |
| Analytics Context Filter Bar (production) | Promote Slice 2 primitive + URL sync |
| Affected-work API (analytics-facing) | Wrap queue preview + compliance warnings |
| Recommendation engine (analytics-bound) | BOS / rules integration |

---

## 7. Recommended Implementation Order

Sequence for **maximum leverage, minimum risk**. Each step is independently shippable.

### Phase A — Connect (1–2 weeks)

**Goal:** One real Dashboard surface resolves real OIP data with drill to queue.

> **Outcome note (shipped):** the runtime surface ships **inside the existing Workspace → Analytics ("Operational Intelligence") modal** — `OperationalIntelligencePanel` fed by `GET /api/admin/intelligence/operational`. The standalone `/adminV2/intelligence/operational` route and the URL-sync provider/codec below were prototyped then **removed**; routes/modal state are implementation details, configuration lives in Surfaces. See `docs/platform/core/operational-calculations.md` § Runtime.

1. **`AnalyticsContext`** — shared scope type (`DrillResolver` consumes it).
2. **`DrillResolver`** — default mappings for existing OIP keys → queue hrefs (reuse `enrollmentDepartmentViewModel` patterns).
3. **Runtime surface:** the Workspace → Analytics modal renders real OIP metrics + breakdown + affected work with drill to queue.
4. **Metric footer drill** — wire metric cards to `DrillResolver`.

*Exit:* Operator opens the Analytics modal, sees real snapshot metrics, clicks drill → lands in filtered queue.

### Phase B — Breakdown (1–2 weeks)

**Goal:** Diagnostic surfaces show real segmented data.

5. **`evaluateMetricBreakdown`** — server function; loop `supportedDimensions` or one group-by query per adapter; return `MetricBreakdownSegment[]`.
6. **Render API extension:** `GET …/render/breakdown?definition_id&group_by&…context`.
7. **Promote one chart renderer** (bar) from Slice 2 dev → `web/components/admin/metrics/charts/` (presentation only).
8. **Enrollment Diagnostic surface** — conversion by site with affected-work panel loading queue preview API.

*Exit:* Chart click → affected records → queue/drawer drill.

### Phase C — Surface family (2–3 weeks)

9. **Executive Summary** — rollup health gauge + 3 KPI placements + narrative from metric threshold rules (not LLM).
10. **Command Center** — ranked queues from real queue counts + OIP metrics.
11. **AnalyticsContext Filter Bar** (production) — promote Slice 2 primitive with URL sync.
12. **Surfaces config** — link dashboard catalog entries to production routes (not just dev preview).

### Phase D — Financial + Optimization (3+ weeks, parallel tracks)

13. **Financial metrics** — new OIP adapters for revenue, AR aging (invoice tables).
14. **Financial Report surface** — table provider + report section primitives.
15. **Optimization Center** — wire `computeActualCompliance` to command surface; staff actions via workflow commands.
16. **Cohort / retention** — when enrollment retention source is defined.

### Phase E — Convergence cleanup

17. Retire KPI V1 strips after header parity (protected files + perf suite).
18. Single snapshot store path (`metric_platform_snapshots` authoritative).
19. Declarative surface composition schema (sections → placements + panels) in Surfaces config.

---

## Appendix A — What NOT to build

| Temptation | Why not |
|---|---|
| `CompositionEngine` class | `placementResolver` + `renderMetricPlacements` already compose |
| Client-side metric calculation | Violates presentation doctrine |
| Parallel analytics action system | Command Runtime V3 exists |
| New snapshot / metric tables | `metric_platform_snapshots` + OIP |
| Rewriting Slice 2 UI | Visual language is frozen — wire data behind it |
| Broad chart library before breakdown API | Breakdown provider unlocks most chart types |

---

## Appendix B — Validation spike (optional, isolated)

If assumption risk is high for breakdown performance, one reversible spike:

- Add `evaluateMetricBreakdown` for **`enrollment.tour_conversion_rate` × `site_id`** only.
- Wire to dev preview Diagnostic surface behind flag.
- Measure query cost with org scope filters.
- Document in `docs/sprints/06_2026/analytics-operational-intelligence-platform/05-breakdown-spike.md`.

No migrations. No protected runtime files.

---

## Appendix C — Key file index

| Concern | Path |
|---|---|
| OIP engine | `web/lib/metrics/metricEngine.ts` |
| OIP registry | `web/lib/metrics/registry.ts` |
| Source adapters | `web/lib/metrics/platform/metricSourceRegistry.ts` |
| Scope filter | `web/lib/metrics/scopeFilter.ts` |
| Platform types | `web/lib/metrics/platform/types.ts` |
| Render pipeline | `web/lib/metrics/platform/renderMetricPlacements.ts` |
| Render API | `web/app/api/admin/analytics/render/route.ts` |
| Client renderer | `web/components/admin/metrics/MetricPlacementRenderer.tsx` |
| OI runtime | `web/components/admin/metrics/OiV2MetricOverview.tsx` |
| Operational Context | `web/lib/adminV2/runtime/operationalContext/*` |
| Command runtime | `web/lib/platform/commands/*` |
| Queue drill pattern | `web/lib/workspace/viewModels/enrollmentDepartmentViewModel.ts` |
| Ratio/compliance | `web/lib/childcareOperational/attendance/actualCompliance.ts` |
| Slice 2 preview contracts | `web/app/dev/analytics-surface-mocks/slice2/types.ts` |
| Surfaces catalog | `web/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings.ts` |
