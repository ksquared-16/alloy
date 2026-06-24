"use client";

import { normalizeOipHealthStatus, oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import { MetricSparkline } from "@/components/admin/metrics/MetricSparkline";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    sparklinePoints?: number[];
};

function normalizeStatus(status: MetricHealthState | string) {
    return normalizeOipHealthStatus(status);
}

export function MetricTrendCard({ label, value, status = "unknown", loading = false, sparklinePoints }: Props) {
    return (
        <div
            className="rounded-lg border border-alloy-stone/15 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            data-metric-visual="trend_card"
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/60">{label}</p>
                <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${oipHealthStatusChipClass(normalizeStatus(status))}`}>
                    {oipHealthStatusLabel(normalizeStatus(status))}
                </span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums text-alloy-midnight">{loading ? "…" : value}</p>
            {sparklinePoints?.length ?
                <div className="mt-2">
                    <MetricSparkline label="" points={sparklinePoints} compact />
                </div>
            :   null}
        </div>
    );
}
