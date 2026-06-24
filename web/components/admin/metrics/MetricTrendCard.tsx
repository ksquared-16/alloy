"use client";

import { normalizeOipHealthStatus, oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState, MetricTrendDirection } from "@/lib/metrics/platform/types";
import {
    normalizeMetricVisualFill,
    resolveMetricCardSurface,
    resolveMetricVisualAccent,
    type MetricVisualFill,
} from "@/lib/metrics/platform/metricVisualAccent";
import { MetricSparkline } from "@/components/admin/metrics/MetricSparkline";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    sparklinePoints?: number[];
    accent?: string;
    fill?: MetricVisualFill | string;
    /** Optional explicit direction; otherwise computed from sparkline history. */
    direction?: MetricTrendDirection;
};

function normalizeStatus(status: MetricHealthState | string) {
    return normalizeOipHealthStatus(status);
}

/** Trend direction is derived from history, never operator-picked. */
export function deriveTrendDirection(points: number[] | undefined): MetricTrendDirection {
    const finite = (points ?? []).filter((p) => Number.isFinite(p));
    if (finite.length < 2) return "flat";
    const delta = finite[finite.length - 1]! - finite[0]!;
    const scale = Math.abs(finite[0]!) || 1;
    if (delta / scale > 0.005) return "up";
    if (delta / scale < -0.005) return "down";
    return "flat";
}

const DIRECTION_GLYPH: Record<MetricTrendDirection, string> = { up: "▲", down: "▼", flat: "▬" };

export function MetricTrendCard({
    label,
    value,
    status = "unknown",
    loading = false,
    sparklinePoints,
    accent = "enrollment",
    fill,
    direction,
}: Props) {
    const visual = resolveMetricVisualAccent(accent);
    const fillMode = normalizeMetricVisualFill(fill);
    const computedDirection = direction ?? deriveTrendDirection(sparklinePoints);
    const directionClass =
        computedDirection === "up" ? "text-alloy-juniper"
        : computedDirection === "down" ? "text-alloy-ember"
        : "text-alloy-midnight/40";

    return (
        <div
            className={`min-w-0 rounded-lg border-l-[3px] ${visual.rail} ${resolveMetricCardSurface(visual, fillMode)} p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}
            data-metric-visual="trend_card"
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
            <div className="mt-2 flex items-baseline gap-1.5">
                <p className="truncate text-xl font-semibold tabular-nums text-alloy-midnight">{loading ? "…" : value}</p>
                {!loading && sparklinePoints?.length ?
                    <span className={`text-xs font-semibold ${directionClass}`} aria-hidden="true" data-trend-direction={computedDirection}>
                        {DIRECTION_GLYPH[computedDirection]}
                    </span>
                :   null}
            </div>
            {sparklinePoints?.length ?
                <div className="mt-2">
                    <MetricSparkline label="" points={sparklinePoints} compact />
                </div>
            :   null}
        </div>
    );
}
