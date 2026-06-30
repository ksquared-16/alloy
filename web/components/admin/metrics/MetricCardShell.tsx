"use client";

import type { ReactNode } from "react";

import { normalizeOipHealthStatus, oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import {
    normalizeMetricVisualFill,
    resolveMetricCardSurface,
    resolveMetricVisualAccent,
    type MetricVisualFill,
} from "@/lib/metrics/platform/metricVisualAccent";

/**
 * Shared chrome for every Metric archetype card (Analytics V2 renderers).
 *
 * One card language: an accent rail, an operational-question eyebrow + label, a
 * health chip, the answer body, and an optional drill/context footer — matching
 * `docs/sprints/06_2026/analytics-operational-intelligence-platform/mockups`.
 *
 * Presentation only. It NEVER computes a metric value; callers pass an already
 * resolved value/health from OIP. Re-chroming the individual renderers onto this
 * shell keeps their public props and `data-metric-visual` contracts intact.
 */

export type MetricCardDensity = "compact" | "standard";

export type MetricCardShellProps = {
    /** Section label (the metric name). */
    label: string;
    /** `data-metric-visual` marker preserved from the renderer that owns this shell. */
    visual: string;
    /** Optional operational question shown as a muted eyebrow (mockup `mc-q`). */
    question?: string | null;
    status?: MetricHealthState | string;
    accent?: string;
    fill?: MetricVisualFill | string;
    density?: MetricCardDensity;
    /** Health chip is shown by default; renderers that carry their own header-right (e.g. comparison delta) opt out. */
    showHealthChip?: boolean;
    /** Overrides the default health chip in the header-right slot. */
    headerRight?: ReactNode;
    /** Optional drill / context row pinned to the card foot. */
    footer?: ReactNode;
    className?: string;
    children: ReactNode;
};

export function metricHealthChipLabel(status: MetricHealthState | string | undefined): string {
    return oipHealthStatusLabel(normalizeOipHealthStatus(status));
}

export function MetricCardShell({
    label,
    visual,
    question,
    status = "unknown",
    accent = "neutral",
    fill,
    density = "standard",
    showHealthChip = true,
    headerRight,
    footer,
    className = "",
    children,
}: MetricCardShellProps) {
    const visualAccent = resolveMetricVisualAccent(accent);
    const fillMode = normalizeMetricVisualFill(fill);
    const normalizedStatus = normalizeOipHealthStatus(status);
    const padding = density === "compact" ? "px-3 py-2.5" : "p-3.5";
    const radiusClass = density === "compact" ? "rounded-lg" : "rounded-xl";
    const gapClass = density === "compact" ? "gap-1" : "gap-2";
    // Compact tiles (header strips) use a fixed width so every KPI and Trend card is the same
    // size regardless of label length — no tile grows because of a longer label or sparkline.
    const sizeClass = density === "compact" ? "w-[160px] min-h-[80px] shrink-0" : "min-w-0";

    const resolvedHeaderRight =
        headerRight ??
        (showHealthChip ? (
            <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${oipHealthStatusChipClass(normalizedStatus)}`}
                data-metric-health={normalizedStatus}
            >
                {oipHealthStatusLabel(normalizedStatus)}
            </span>
        ) : null);

    return (
        <div
            className={`flex flex-col ${gapClass} ${radiusClass} border-l-[3px] ${sizeClass} ${visualAccent.rail} ${resolveMetricCardSurface(visualAccent, fillMode)} ${padding} shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${className}`}
            data-metric-visual={visual}
            data-metric-card-shell="true"
            data-metric-accent={visualAccent.key}
            data-metric-fill={fillMode}
            data-metric-density={density}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    {question ? (
                        <p className="truncate text-[10px] font-medium text-alloy-midnight/45" title={question}>
                            {question}
                        </p>
                    ) : null}
                    <p
                        className={`text-[11px] font-semibold ${density !== "compact" ? "truncate uppercase tracking-wide" : ""} ${visualAccent.text}`}
                        style={density === "compact" ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
                        title={label}
                    >
                        {label}
                    </p>
                </div>
                {resolvedHeaderRight}
            </div>
            {children}
            {footer ? (
                <div className="mt-auto flex items-center gap-2 border-t border-alloy-stone/15 pt-2 text-[11px] font-medium text-alloy-midnight/60">
                    {footer}
                </div>
            ) : null}
        </div>
    );
}

const VALUE_SIZE: Record<MetricCardDensity, string> = {
    compact: "text-[22px] leading-none tracking-tight",
    standard: "text-2xl",
};

/** Canonical metric value display — tabular, truncating, density-aware. */
export function MetricCardValue({
    value,
    loading = false,
    density = "standard",
    className = "",
}: {
    value: string;
    loading?: boolean;
    density?: MetricCardDensity;
    className?: string;
}) {
    return (
        <p className={`truncate tabular-nums text-alloy-midnight ${density === "compact" ? "font-bold" : "font-semibold"} ${VALUE_SIZE[density]} ${className}`}>
            {loading ? "…" : value}
        </p>
    );
}
