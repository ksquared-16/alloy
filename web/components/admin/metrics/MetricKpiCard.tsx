"use client";

import { normalizeOipHealthStatus, oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import { resolveMetricVisualAccent } from "@/lib/metrics/platform/metricVisualAccent";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    accent?: string;
};

function normalizeStatus(status: MetricHealthState | string): MetricHealthState {
    return normalizeOipHealthStatus(status);
}

export function MetricKpiCard({ label, value, status = "unknown", loading = false, accent = "enrollment" }: Props) {
    const visual = resolveMetricVisualAccent(accent);
    const healthClass = oipHealthStatusChipClass(normalizeStatus(status));

    return (
        <div
            className={`min-w-0 rounded-lg border border-l-[3px] border-alloy-stone/15 ${visual.rail} bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}
            data-metric-visual="kpi_card"
            data-metric-accent={visual.key}
        >
            <div className="flex items-start justify-between gap-2">
                <p className={`min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide ${visual.text}`} title={label}>
                    {label}
                </p>
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${healthClass}`}>
                    {oipHealthStatusLabel(normalizeStatus(status))}
                </span>
            </div>
            <p className="mt-2 truncate text-xl font-semibold tabular-nums text-alloy-midnight">
                {loading ? "…" : value}
            </p>
        </div>
    );
}
