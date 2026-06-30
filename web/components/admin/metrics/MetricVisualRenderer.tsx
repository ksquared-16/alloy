import type {
    MetricEvaluationResult,
    MetricTrendComparison,
    MetricVisualizationRow,
    MetricVisualizationType,
    ResolvedMetricPlacement,
} from "@/lib/metrics/platform/types";
import { resolveMetricDisplayLabel } from "@/lib/metrics/platform/metricSourceRegistry";
import { MetricComparisonCard } from "@/components/admin/metrics/MetricComparisonCard";
import { MetricKpiCard } from "@/components/admin/metrics/MetricKpiCard";
import { MetricTrendCard } from "@/components/admin/metrics/MetricTrendCard";
import { MetricChip } from "@/components/admin/metrics/MetricChip";
import { MetricSparkline } from "@/components/admin/metrics/MetricSparkline";
import { MetricScorecard, type ScorecardMetric } from "@/components/admin/metrics/MetricScorecard";
import { MetricHealthCard } from "@/components/admin/metrics/MetricHealthCard";
import { MetricBreakdownCard, type MetricBreakdownSegment } from "@/components/admin/metrics/MetricBreakdownCard";
import type { MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";

export type MetricVisualRendererProps = {
    placement: ResolvedMetricPlacement;
    evaluation: MetricEvaluationResult | null;
    loading?: boolean;
    sparklinePoints?: number[];
    trendComparison?: MetricTrendComparison | null;
    /** Additional metric rows for scorecard bodies (label + value). */
    scorecardMetrics?: ScorecardMetric[];
    /** Dimension segments for the breakdown (bar_chart) renderer. */
    breakdownSegments?: MetricBreakdownSegment[];
    /**
     * Card chrome density. Header / tile strips pass "compact" so the re-chromed
     * cards stay light in the Workspace / Focus Panel context; dashboards keep the
     * standard (premium) treatment. Presentation only.
     */
    density?: MetricCardDensity;
};

/**
 * Gauge fill is presentation only: percent/rate metrics map their resolved value
 * to 0–100; everything else lets the Health card derive the ring from health state.
 * Never recomputes the metric.
 */
function deriveGaugeScore(evaluation: MetricEvaluationResult | null): number | null {
    if (!evaluation || evaluation.value == null || !Number.isFinite(evaluation.value)) return null;
    if (evaluation.unit === "percent" || evaluation.unit === "rate") {
        return Math.max(0, Math.min(100, evaluation.value * 100));
    }
    return null;
}

export function MetricVisualRenderer({
    placement,
    evaluation,
    loading = false,
    sparklinePoints,
    trendComparison,
    scorecardMetrics,
    breakdownSegments,
    density = "standard",
}: MetricVisualRendererProps) {
    const viz = placement.visualization;
    const def = placement.definition;
    // Resolve display label with fallback chain — prevents raw source keys from reaching the
    // UI regardless of what was stored in metric_visualizations.label (e.g. first-publish bug).
    const label = resolveMetricDisplayLabel(
        (viz.display_config as { labelOverride?: string }).labelOverride ?? viz.label,
        def.label,
        def.source_key,
    );
    const type = viz.visualization_type as MetricVisualizationType;
    const fill = (viz.style_config as { fill?: string }).fill;

    // context_config carries surface-level overrides written by the header builder
    // (accent, showHealthChip). These take precedence over visualization-level style_config.
    const ctx = (placement.context_config ?? {}) as Record<string, unknown>;
    const accent = (typeof ctx.accent === "string" ? ctx.accent : null) ?? (viz.style_config as { accent?: string }).accent;
    const showHealthChip = typeof ctx.showHealthChip === "boolean" ? ctx.showHealthChip : undefined;

    switch (type) {
        case "scorecard":
            return (
                <MetricScorecard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                    accent={accent}
                    fill={fill}
                    metrics={scorecardMetrics}
                    density={density}
                />
            );
        case "gauge":
            return (
                <MetricHealthCard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    score={deriveGaugeScore(evaluation)}
                    loading={loading}
                    accent={accent}
                    fill={fill}
                    density={density}
                />
            );
        case "bar_chart":
            return (
                <MetricBreakdownCard
                    label={label}
                    segments={breakdownSegments}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                    accent={accent}
                    fill={fill}
                    density={density}
                />
            );
        case "kpi_card":
            return (
                <MetricKpiCard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                    accent={accent}
                    fill={fill}
                    density={density}
                    showHealthChip={showHealthChip}
                />
            );
        case "trend_card":
            return (
                <MetricTrendCard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                    sparklinePoints={sparklinePoints}
                    accent={accent}
                    fill={fill}
                    direction={trendComparison?.direction}
                    density={density}
                    showHealthChip={showHealthChip}
                />
            );
        case "chip":
            return (
                <MetricChip
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                />
            );
        case "comparison":
            return (
                <MetricComparisonCard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    comparison={trendComparison}
                    loading={loading}
                    accent={accent}
                    fill={fill}
                    density={density}
                />
            );
        case "line_chart":
        case "sparkline":
            return (
                <MetricSparkline
                    label={label}
                    points={sparklinePoints ?? []}
                    loading={loading}
                />
            );
        default:
            return (
                <MetricKpiCard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                    accent={accent}
                    fill={fill}
                    density={density}
                    showHealthChip={showHealthChip}
                />
            );
    }
}

export function visualizationTypeLabel(type: MetricVisualizationType): string {
    return type.replace(/_/g, " ");
}

export function resolveVisualizationLabel(viz: MetricVisualizationRow): string {
    const override = (viz.display_config as { labelOverride?: string }).labelOverride;
    return override ?? viz.label;
}
