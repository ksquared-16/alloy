"use client";

import { normalizeOipHealthStatus, oipHealthStatusChipClass } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
};

export function MetricChip({ label, value, status = "unknown", loading = false }: Props) {
    const normalized = normalizeOipHealthStatus(status);
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${oipHealthStatusChipClass(normalized)}`}
            data-metric-visual="chip"
        >
            <span className="text-alloy-midnight/60">{label}</span>
            <span className="tabular-nums text-alloy-midnight">{loading ? "…" : value}</span>
        </span>
    );
}
