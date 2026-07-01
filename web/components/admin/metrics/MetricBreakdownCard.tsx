"use client";

import type { ReactNode } from "react";

import type { MetricHealthState } from "@/lib/metrics/platform/types";
import type { MetricVisualFill } from "@/lib/metrics/platform/metricVisualAccent";
import { MetricCardShell, type MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";

export type MetricBreakdownSegment = {
    /** Dimension label (site, program, stage…). */
    label: string;
    /** Numeric magnitude used to size the bar (presentation only). */
    value: number;
    /** Display value; falls back to the numeric value. */
    formattedValue?: string;
    /** Operational tone for the bar fill. */
    tone?: MetricHealthState | "neutral";
};

type Props = {
    label: string;
    segments?: MetricBreakdownSegment[];
    status?: MetricHealthState | string;
    loading?: boolean;
    accent?: string;
    fill?: MetricVisualFill | string;
    question?: string | null;
    density?: MetricCardDensity;
    footer?: ReactNode;
};

const BAR_TONE: Record<MetricHealthState | "neutral", string> = {
    healthy: "bg-alloy-juniper",
    warning: "bg-amber-500",
    critical: "bg-alloy-ember",
    unknown: "bg-alloy-stone/40",
    neutral: "bg-alloy-pine",
};

export function MetricBreakdownCard({
    label,
    segments = [],
    status = "unknown",
    loading = false,
    accent = "neutral",
    fill,
    question,
    density = "standard",
    footer,
}: Props) {
    const max = segments.reduce((acc, s) => (Number.isFinite(s.value) ? Math.max(acc, s.value) : acc), 0) || 1;

    return (
        <MetricCardShell
            visual="bar_chart"
            label={label}
            question={question}
            status={status}
            accent={accent}
            fill={fill}
            density={density}
            footer={footer}
        >
            {loading ? (
                <div className="h-16 animate-pulse rounded bg-alloy-stone/10" />
            ) : segments.length ? (
                <ul className="space-y-1.5" data-metric-breakdown-segments={segments.length}>
                    {segments.map((seg) => {
                        const width = Math.max(2, Math.round((seg.value / max) * 100));
                        return (
                            <li key={seg.label} className="flex items-center gap-2 text-xs">
                                <span className="w-20 shrink-0 truncate text-alloy-midnight/65" title={seg.label}>
                                    {seg.label}
                                </span>
                                <span className="h-2 flex-1 overflow-hidden rounded-full bg-alloy-stone/15">
                                    <span
                                        className={`block h-full rounded-full ${BAR_TONE[seg.tone ?? "neutral"]}`}
                                        style={{ width: `${width}%` }}
                                    />
                                </span>
                                <span className="w-12 shrink-0 text-right font-medium tabular-nums text-alloy-midnight">
                                    {seg.formattedValue ?? seg.value}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="py-2 text-xs text-alloy-midnight/45">No breakdown available</p>
            )}
        </MetricCardShell>
    );
}
