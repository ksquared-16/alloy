"use client";

import { normalizeOipHealthStatus, oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import {
    normalizeMetricVisualFill,
    resolveMetricCardSurface,
    resolveMetricVisualAccent,
    type MetricVisualFill,
} from "@/lib/metrics/platform/metricVisualAccent";

export type ScorecardMetric = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
};

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    accent?: string;
    fill?: MetricVisualFill | string;
    metrics?: ScorecardMetric[];
};

function normalizeStatus(status: MetricHealthState | string): MetricHealthState {
    return normalizeOipHealthStatus(status);
}

export function MetricScorecard({ label, value, status = "unknown", loading = false, accent = "enrollment", fill, metrics = [] }: Props) {
    const visual = resolveMetricVisualAccent(accent);
    const fillMode = normalizeMetricVisualFill(fill);

    return (
        <div
            className={`min-w-0 rounded-lg border-l-[3px] ${visual.rail} ${resolveMetricCardSurface(visual, fillMode)} p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}
            data-metric-visual="scorecard"
            data-metric-accent={visual.key}
            data-metric-fill={fillMode}
        >
            <div className="flex items-start justify-between gap-2">
                <p className={`min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide ${visual.text}`} title={label}>
                    {label}
                </p>
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${oipHealthStatusChipClass(normalizeStatus(status))}`}>
                    {oipHealthStatusLabel(normalizeStatus(status))}
                </span>
            </div>
            <p className="mt-2 truncate text-xl font-semibold tabular-nums text-alloy-midnight">{loading ? "…" : value}</p>
            {metrics.length ?
                <ul className="mt-2 space-y-1 border-t border-alloy-stone/15 pt-2" data-scorecard-metrics="true">
                    {metrics.map((m) => (
                        <li key={m.label} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate text-alloy-midnight/65" title={m.label}>{m.label}</span>
                            <span className="shrink-0 tabular-nums font-medium text-alloy-midnight">{m.value}</span>
                        </li>
                    ))}
                </ul>
            :   null}
        </div>
    );
}
