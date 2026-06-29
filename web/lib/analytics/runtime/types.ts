/**
 * Analytics Runtime — shared contracts.
 *
 * These types EXTEND existing scope types (`MetricEvaluationContext`,
 * `MetricResolveContext`, `AdminAccessScopeDimensions`). They never replace them.
 * Presentation never computes: a surface declares what scope / grain / drill it
 * wants; the platform resolves data, permissions, and navigation.
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import type { MetricDimensionKey } from "@/lib/metrics/types";
import type { MetricPeriodConfig } from "@/lib/metrics/platform/types";

/* ---------------------------------------------------------------------------
 * Drill contract — mirrors the frozen Slice 2 preview contract
 * (web/app/dev/analytics-surface-mocks/slice2/types.ts). Re-declared here so the
 * runtime library does not depend on a dev-preview module.
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

    /** Filter dimensions. */
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
