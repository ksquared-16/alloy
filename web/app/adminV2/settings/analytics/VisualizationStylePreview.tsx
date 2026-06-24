"use client";

import { MetricVisualRenderer } from "@/components/admin/metrics/MetricVisualRenderer";
import type {
    MetricDefinitionRow,
    MetricEvaluationResult,
    MetricVisualizationRow,
    ResolvedMetricPlacement,
} from "@/lib/metrics/platform/types";

type Props = {
    form: {
        label: string;
        label_override: string;
        visualization_type: string;
        accent: string;
        icon: string;
        subtitle: string;
        additional_metric_ids: string[];
    };
    primaryMetric?: MetricDefinitionRow;
    extraMetricLabels: string[];
};

const MOCK_EVALUATION: MetricEvaluationResult = {
    metricDefinitionId: "preview-def",
    key: "preview",
    label: "Preview",
    unit: "percent",
    value: 0.62,
    numeratorValue: 31,
    denominatorValue: 50,
    formattedValue: "62%",
    healthState: "healthy",
    periodStart: new Date(Date.now() - 30 * 86400000).toISOString(),
    periodEnd: new Date().toISOString(),
    computedAt: new Date().toISOString(),
};

const MOCK_SPARKLINE = [0.52, 0.55, 0.58, 0.6, 0.62, 0.61, 0.62];

function buildMockPlacement(form: Props["form"], primaryMetric?: MetricDefinitionRow): ResolvedMetricPlacement {
    const definition: MetricDefinitionRow =
        primaryMetric ?? {
            id: "preview-def",
            org_id: null,
            key: "preview",
            label: form.label || "Preview metric",
            description: "",
            category: "general",
            entity_scope: "org",
            source_type: "oip_adapter",
            source_key: "enrollment.tour_conversion_rate",
            aggregation: "rate",
            numerator_config: null,
            denominator_config: null,
            filter_config: { version: 1 },
            dimension_config: { version: 1 },
            default_period_config: { version: 1, kind: "rolling", days: 30 },
            unit: "percent",
            precision: 1,
            is_kpi: true,
            target_config: null,
            threshold_config: null,
            status: "active",
            version: 1,
            created_at: "",
            updated_at: "",
            created_by: null,
            updated_by: null,
        };

    const visualization: MetricVisualizationRow = {
        id: "preview-viz",
        org_id: null,
        metric_definition_id: definition.id,
        key: "preview",
        label: form.label || "Preview",
        visualization_type: form.visualization_type as MetricVisualizationRow["visualization_type"],
        style_config: { version: 1, accent: form.accent, icon: form.icon || undefined },
        display_config: {
            version: 1,
            labelOverride: form.label_override || undefined,
            subtitle: form.subtitle || undefined,
            additionalMetricDefinitionIds: form.additional_metric_ids.length ? form.additional_metric_ids : undefined,
        },
        status: "active",
        version: 1,
        created_at: "",
        updated_at: "",
    };

    return {
        id: "preview-placement",
        org_id: "preview-org",
        visualization_id: visualization.id,
        surface: "operational_intelligence",
        surface_key: "default",
        placement_zone: "overview",
        sort_order: 0,
        context_config: { version: 1 },
        visibility_config: { version: 1, visible: true },
        status: "active",
        version: 1,
        created_at: "",
        updated_at: "",
        visualization,
        definition,
    };
}

export function VisualizationStylePreview({ form, primaryMetric, extraMetricLabels }: Props) {
    const placement = buildMockPlacement(form, primaryMetric);

    return (
        <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.02] p-3" data-viz-style-preview={form.visualization_type}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Preview</p>
            <MetricVisualRenderer
                placement={placement}
                evaluation={MOCK_EVALUATION}
                sparklinePoints={MOCK_SPARKLINE}
                trendComparison={{
                    current: MOCK_EVALUATION,
                    previous: { ...MOCK_EVALUATION, formattedValue: "58%", value: 0.58 },
                    deltaValue: 0.04,
                    deltaPercent: 6.9,
                    direction: "up",
                    sentiment: "good",
                }}
            />
            {form.visualization_type === "scorecard" && extraMetricLabels.length ?
                <ul className="mt-2 space-y-1 border-t border-alloy-stone/10 pt-2 text-xs text-alloy-midnight/55">
                    {extraMetricLabels.map((label) => (
                        <li key={label}>+ {label}</li>
                    ))}
                </ul>
            :   null}
        </div>
    );
}
