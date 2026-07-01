"use client";

import type { ReactNode } from "react";

import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import type { MetricVisualFill } from "@/lib/metrics/platform/metricVisualAccent";
import { MetricCardShell, type MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    /**
     * Optional 0–100 fill for the gauge ring. Presentation only — when omitted the
     * ring length is derived from the (already OIP-computed) health band, never from
     * recomputing the metric. Percent/rate metrics can pass `value × 100`.
     */
    score?: number | null;
    loading?: boolean;
    accent?: string;
    fill?: MetricVisualFill | string;
    question?: string | null;
    density?: MetricCardDensity;
    footer?: ReactNode;
};

/** Visual-only band used purely to size the ring when no numeric score is supplied. */
const HEALTH_BAND: Record<MetricHealthState, number> = {
    healthy: 88,
    warning: 55,
    critical: 25,
    unknown: 0,
};

const RING_COLOR: Record<MetricHealthState, string> = {
    healthy: "text-alloy-juniper",
    warning: "text-amber-500",
    critical: "text-alloy-ember",
    unknown: "text-alloy-stone/40",
};

function clampScore(score: number | null | undefined, health: MetricHealthState): number {
    if (score != null && Number.isFinite(score)) {
        return Math.max(0, Math.min(100, score));
    }
    return HEALTH_BAND[health];
}

export function MetricHealthCard({
    label,
    value,
    status = "unknown",
    score,
    loading = false,
    accent = "enrollment",
    fill,
    question,
    density = "standard",
    footer,
}: Props) {
    const health = normalizeOipHealthStatus(status);
    const pct = clampScore(score, health);
    // Gauge shrinks in compact (header) density so it stays light in the Workspace chrome.
    const dim = density === "compact" ? 44 : 64;
    const center = dim / 2;
    const stroke = density === "compact" ? 5 : 7;
    const radius = center - stroke - 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - pct / 100);
    const valueSize = density === "compact" ? "text-xl" : "text-2xl";

    return (
        <MetricCardShell
            visual="gauge"
            label={label}
            question={question}
            status={status}
            accent={accent}
            fill={fill}
            density={density}
            footer={footer}
        >
            <div className="flex items-center gap-3">
                <svg
                    width={dim}
                    height={dim}
                    viewBox={`0 0 ${dim} ${dim}`}
                    aria-hidden="true"
                    className={RING_COLOR[health]}
                    data-metric-gauge-fill={Math.round(pct)}
                >
                    <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth={stroke} />
                    {loading ? null : (
                        <circle
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={stroke}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            transform={`rotate(-90 ${center} ${center})`}
                        />
                    )}
                </svg>
                <p className={`truncate font-semibold tabular-nums text-alloy-midnight ${valueSize}`}>
                    {loading ? "…" : value}
                </p>
            </div>
        </MetricCardShell>
    );
}
