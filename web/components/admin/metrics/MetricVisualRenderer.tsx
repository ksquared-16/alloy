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

export type MetricVisualRendererProps = {
    placement: ResolvedMetricPlacement;
    evaluation: MetricEvaluationResult | null;
    loading?: boolean;
    sparklinePoints?: number[];
    trendComparison?: MetricTrendComparison | null;
};

export function MetricVisualRenderer({
    placement,
    evaluation,
    loading = false,
    sparklinePoints,
    trendComparison,
}: MetricVisualRendererProps) {
    const viz = placement.visualization;
    const label = (viz.display_config as { labelOverride?: string }).labelOverride ?? viz.label;
    const type = viz.visualization_type as MetricVisualizationType;

    switch (type) {
        case "kpi_card":
        case "scorecard":
        case "gauge":
            return (
                <MetricKpiCard
                    label={label}
                    value={evaluation?.formattedValue ?? "—"}
                    status={evaluation?.healthState ?? "unknown"}
                    loading={loading}
                    accent={(viz.style_config as { accent?: string }).accent}
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
