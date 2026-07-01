"use client";

import type { ReactNode } from "react";

import type { MetricHealthState } from "@/lib/metrics/platform/types";
import type { MetricVisualFill } from "@/lib/metrics/platform/metricVisualAccent";
import { MetricCardShell, MetricCardValue, type MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    accent?: string;
    fill?: MetricVisualFill | string;
    /** Optional operational question eyebrow (Card Language). */
    question?: string | null;
    density?: MetricCardDensity;
    showHealthChip?: boolean;
    /** Optional drill / context footer. */
    footer?: ReactNode;
};

export function MetricKpiCard({
    label,
    value,
    status = "unknown",
    loading = false,
    accent = "neutral",
    fill,
    question,
    density = "standard",
    showHealthChip,
    footer,
}: Props) {
    return (
        <MetricCardShell
            visual="kpi_card"
            label={label}
            question={question}
            status={status}
            accent={accent}
            fill={fill}
            density={density}
            showHealthChip={showHealthChip}
            footer={footer}
        >
            <MetricCardValue value={value} loading={loading} density={density} />
        </MetricCardShell>
    );
}
