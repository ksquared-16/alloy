/**
 * Analytics Runtime — shared contracts.
 *
 * These types EXTEND existing scope types (`MetricEvaluationContext`,
 * `MetricResolveContext`, `AdminAccessScopeDimensions`). They never replace them.
 * Presentation never computes: a surface declares what question / scope / grain /
 * drill it wants; the platform resolves data, permissions, and navigation.
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 * Convergence: docs/sprints/06_2026/analytics-operational-intelligence-platform/04-runtime-convergence.md
 */

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import type { OipMetricKey, MetricDimensionKey } from "@/lib/metrics/types";
import type {
    MetricEntityScope,
    MetricHealthState,
    MetricPeriodConfig,
    MetricTrendComparison,
    MetricVisualizationType,
} from "@/lib/metrics/platform/types";

/* ---------------------------------------------------------------------------
 * Drill contract — mirrors the frozen Slice 2 preview contract
 * (web/app/dev/analytics-surface-mocks/slice2/types.ts). Re-declared here so the
 * runtime library does not depend on a dev-preview module; the dev preview may
 * later import from here, not the reverse.
 * ------------------------------------------------------------------------- */

export type DrillDestinationKind =
    | "queue"
    | "records"
    | "work_unit"
    | "business_process"
    | "drawer"
    | "report_detail"
    | "workflow"
    | "optimization_center";

export type DrillDestination = {
    kind: DrillDestinationKind;
    label: string;
    /** Stable token, e.g. "queue/tours-stalled". */
    target: string;
    /** Human-readable scope echo. */
    scope?: string;
};

/** A user selection on a visualization (chart mark, table row, metric footer). */
export type DrillSelection = {
    destinationKind: DrillDestinationKind;
    target: string;
    /** The dimension the clicked mark represents, if any. */
    dimensionKey?: MetricDimensionKey;
    dimensionValue?: string;
    /** Human-readable scope echo for the selection. */
    markScope?: string;
};

/**
 * What the platform produces for a resolved drill. Maps to existing infrastructure —
 * never a new action system.
 */
export type NavigationIntent =
    | { kind: "href"; destinationKind: DrillDestinationKind; label: string; href: string }
    | {
          kind: "command";
          destinationKind: DrillDestinationKind;
          label: string;
          commandKey: string;
          context: Record<string, unknown>;
      }
    | { kind: "unavailable"; reason: string };

/* ---------------------------------------------------------------------------
 * Analytics context — the scope/filter envelope that flows into every request.
 * ------------------------------------------------------------------------- */

export type AnalyticsContext = {
    orgId: string;
    /** Inherited from the admin session — never client-supplied alone. */
    accessScope: AdminAccessScopeDimensions;

    /** Surface identity. */
    surfaceId: string;
    surfaceKey?: string;

    /** Filter dimensions (Slice 2 filter bar). */
    dateRange: MetricPeriodConfig;
    comparisonPeriod?: MetricPeriodConfig;
    siteLocationIds?: string[] | null;
    departmentId?: string | null;
    programIds?: string[] | null;
    roomLocationIds?: string[] | null;
    businessProcessKey?: string | null;
    workUnitId?: string | null;
    stageKeys?: string[] | null;
    staffIds?: string[] | null;
    /** Financial-only. */
    accountCategory?: string | null;
    agingBucket?: string | null;

    /** Active drill selection (chart mark → narrows affected work). */
    drillSelection?: DrillSelection | null;
};

/* ---------------------------------------------------------------------------
 * Visualization request / resolved output (presentation-ready, never raw rows).
 * ------------------------------------------------------------------------- */

/** What a surface section asks the platform for. */
export type AnalyticsVisualizationRequest = {
    /** Calculation key (= OipMetricKey). */
    calculationKey: OipMetricKey;
    metricDefinitionId?: string;
    visualizationType: MetricVisualizationType;
    grain: MetricEntityScope;
    /** Breakdown / chart dimension. */
    groupBy?: MetricDimensionKey;
};

/** A single segment of a breakdown (Phase 2 provider output). */
export type MetricBreakdownSegment = {
    dimensionKey: MetricDimensionKey;
    dimensionValue: string;
    label: string;
    value: number | null;
    formattedValue: string;
    healthState?: MetricHealthState;
};

/** A chart series point (Phase 2 presentation transform). */
export type AnalyticsChartSeries = {
    seriesKey: string;
    label: string;
    points: Array<{ x: string; y: number | null }>;
};

/** A report/table row (Phase 3). */
export type AnalyticsTableRow = {
    rowKey: string;
    cells: Record<string, string | number | null>;
};

/** What the platform returns — presentation-ready, never raw SQL rows. */
export type ResolvedVisualization = {
    request: AnalyticsVisualizationRequest;
    formattedValue?: string;
    value?: number | null;
    healthState?: MetricHealthState;
    comparison?: MetricTrendComparison;
    sparklinePoints?: number[];
    segments?: MetricBreakdownSegment[];
    series?: AnalyticsChartSeries[];
    rows?: AnalyticsTableRow[];
    drill?: DrillDestination;
};
