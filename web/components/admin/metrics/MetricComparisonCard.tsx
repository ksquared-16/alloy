"use client";

import type { MetricTrendComparison } from "@/lib/metrics/platform/types";
import { formatDeltaPercent } from "@/lib/metrics/platform/metricFormatters";
import { resolveMetricVisualAccent } from "@/lib/metrics/platform/metricVisualAccent";

type Props = {
    label: string;
    value: string;
    comparison?: MetricTrendComparison | null;
    loading?: boolean;
    accent?: string;
};

export function MetricComparisonCard({ label, value, comparison, loading = false, accent = "enrollment" }: Props) {
    const visual = resolveMetricVisualAccent(accent);
    const delta = comparison?.deltaPercent;
    const sentiment = comparison?.sentiment ?? "neutral";
    const deltaClass =
        sentiment === "good" ? "text-alloy-juniper"
        : sentiment === "bad" ? "text-alloy-ember"
        : "text-alloy-midnight/50";

    return (
        <div
            className={`min-w-0 rounded-lg border border-l-[3px] border-alloy-stone/15 ${visual.rail} bg-white p-3`}
            data-metric-visual="comparison"
            data-metric-accent={visual.key}
        >
            <p className={`truncate text-[11px] font-semibold uppercase tracking-wide ${visual.text}`} title={label}>{label}</p>
            <p className="mt-2 truncate text-xl font-semibold tabular-nums text-alloy-midnight">{loading ? "…" : value}</p>
            {comparison && delta != null ?
                <p className={`mt-1 text-xs font-medium tabular-nums ${deltaClass}`}>
                    {formatDeltaPercent(delta)} vs prior period
                </p>
            :   null}
        </div>
    );
}
