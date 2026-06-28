"use client";

import type { ReactNode } from "react";

import type { MetricTrendComparison } from "@/lib/metrics/platform/types";
import { formatDeltaPercent } from "@/lib/metrics/platform/metricFormatters";
import type { MetricVisualFill } from "@/lib/metrics/platform/metricVisualAccent";
import { MetricCardShell, MetricCardValue, type MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";

type Props = {
    label: string;
    value: string;
    comparison?: MetricTrendComparison | null;
    loading?: boolean;
    accent?: string;
    fill?: MetricVisualFill | string;
    /** Baseline label shown after the delta (defaults to "prior period"). */
    baselineLabel?: string;
    question?: string | null;
    density?: MetricCardDensity;
    footer?: ReactNode;
};

export function MetricComparisonCard({
    label,
    value,
    comparison,
    loading = false,
    accent = "enrollment",
    fill,
    baselineLabel = "prior period",
    question,
    density = "standard",
    footer,
}: Props) {
    const delta = comparison?.deltaPercent;
    const sentiment = comparison?.sentiment ?? "neutral";
    const deltaClass =
        sentiment === "good" ? "text-alloy-juniper"
        : sentiment === "bad" ? "text-alloy-ember"
        : "text-alloy-midnight/50";

    return (
        <MetricCardShell
            visual="comparison"
            label={label}
            question={question}
            accent={accent}
            fill={fill}
            density={density}
            showHealthChip={false}
            footer={footer}
        >
            <MetricCardValue value={value} loading={loading} density={density} />
            {comparison && delta != null ? (
                <p className={`text-xs font-medium tabular-nums ${deltaClass}`}>
                    {formatDeltaPercent(delta)} vs {baselineLabel}
                </p>
            ) : null}
        </MetricCardShell>
    );
}
