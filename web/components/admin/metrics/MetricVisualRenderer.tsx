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

export type MetricVisualRendererProps = {
    placement: ResolvedMetricPlacement;
    evaluation: MetricEvaluationResult | null;
    loading?: boolean;
    sparklinePoints?: number[];
    trendComparison?: MetricTrendComparison | null;
    /** Additional metric rows for scorecard bodies (label + value). */
    scorecardMetrics?: ScorecardMetric[];
};

export function MetricVisualRenderer({
    placement,
    evaluation,
    loading = false,
    sparklinePoints,
    trendComparison,
    scorecardMetrics,
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
        case "kpi_card":
        case "gauge":
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
