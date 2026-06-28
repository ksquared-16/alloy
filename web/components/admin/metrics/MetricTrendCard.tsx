"use client";

import type { ReactNode } from "react";

import type { MetricHealthState, MetricTrendDirection } from "@/lib/metrics/platform/types";
import type { MetricVisualFill } from "@/lib/metrics/platform/metricVisualAccent";
import { MetricCardShell, type MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";
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
    question?: string | null;
    density?: MetricCardDensity;
    footer?: ReactNode;
};

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
    question,
    density = "standard",
    footer,
}: Props) {
    const computedDirection = direction ?? deriveTrendDirection(sparklinePoints);
    const directionClass =
        computedDirection === "up" ? "text-alloy-juniper"
        : computedDirection === "down" ? "text-alloy-ember"
        : "text-alloy-midnight/40";
    const valueSize = density === "compact" ? "text-xl" : "text-2xl";

    return (
        <MetricCardShell
            visual="trend_card"
            label={label}
            question={question}
            status={status}
            accent={accent}
            fill={fill}
            density={density}
            footer={footer}
        >
            <div className="flex items-baseline gap-1.5">
                <p className={`truncate font-semibold tabular-nums text-alloy-midnight ${valueSize}`}>
                    {loading ? "…" : value}
                </p>
                {!loading && sparklinePoints?.length ? (
                    <span
                        className={`text-xs font-semibold ${directionClass}`}
                        aria-hidden="true"
                        data-trend-direction={computedDirection}
                    >
                        {DIRECTION_GLYPH[computedDirection]}
                    </span>
                ) : null}
            </div>
            {sparklinePoints?.length ? (
                <div>
                    <MetricSparkline label="" points={sparklinePoints} compact />
                </div>
            ) : null}
        </MetricCardShell>
    );
}
