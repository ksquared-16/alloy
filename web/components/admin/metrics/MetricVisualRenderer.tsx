import type {
    MetricEvaluationResult,
    MetricTrendComparison,
    MetricVisualizationRow,
    MetricVisualizationType,
    ResolvedMetricPlacement,
} from "@/lib/metrics/platform/types";
import { MetricComparisonCard } from "@/components/admin/metrics/MetricComparisonCard";
import { MetricKpiCard } from "@/components/admin/metrics/MetricKpiCard";
import { MetricTrendCard } from "@/components/admin/metrics/MetricTrendCard";
import { MetricChip } from "@/components/admin/metrics/MetricChip";
import { MetricSparkline } from "@/components/admin/metrics/MetricSparkline";
import { MetricScorecard, type ScorecardMetric } from "@/components/admin/metrics/MetricScorecard";
import { MetricHealthCard } from "@/components/admin/metrics/MetricHealthCard";
import { MetricBreakdownCard, type MetricBreakdownSegment } from "@/components/admin/metrics/MetricBreakdownCard";

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
}: MetricVisualRendererProps) {
    const viz = placement.visualization;
    const label = (viz.display_config as { labelOverride?: string }).labelOverride ?? viz.label;
    const type = viz.visualization_type as MetricVisualizationType;
    const accent = (viz.style_config as { accent?: string }).accent;
    const fill = (viz.style_config as { fill?: string }).fill;

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
