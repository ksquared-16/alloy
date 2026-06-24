"use client";

import type { MetricTrendComparison } from "@/lib/metrics/platform/types";
import { formatDeltaPercent } from "@/lib/metrics/platform/metricFormatters";

type Props = {
    label: string;
    value: string;
    comparison?: MetricTrendComparison | null;
    loading?: boolean;
};

export function MetricComparisonCard({ label, value, comparison, loading = false }: Props) {
    const delta = comparison?.deltaPercent;
    const sentiment = comparison?.sentiment ?? "neutral";
    const deltaClass =
        sentiment === "good" ? "text-alloy-juniper"
        : sentiment === "bad" ? "text-alloy-ember"
        : "text-alloy-midnight/50";

    return (
        <div className="rounded-lg border border-alloy-stone/15 bg-white p-3" data-metric-visual="comparison">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/60">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-alloy-midnight">{loading ? "…" : value}</p>
            {comparison && delta != null ?
                <p className={`mt-1 text-xs font-medium tabular-nums ${deltaClass}`}>
                    {formatDeltaPercent(delta)} vs prior period
                </p>
            :   null}
        </div>
    );
}
