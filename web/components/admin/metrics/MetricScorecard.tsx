"use client";

import type { ReactNode } from "react";

import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import type { MetricHealthState } from "@/lib/metrics/platform/types";
import type { MetricVisualFill } from "@/lib/metrics/platform/metricVisualAccent";
import { MetricCardShell, MetricCardValue, type MetricCardDensity } from "@/components/admin/metrics/MetricCardShell";

export type ScorecardMetric = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
};

type Props = {
    label: string;
    value: string;
    status?: MetricHealthState | string;
    loading?: boolean;
    accent?: string;
    fill?: MetricVisualFill | string;
    metrics?: ScorecardMetric[];
    question?: string | null;
    density?: MetricCardDensity;
    footer?: ReactNode;
};

const SUB_DOT: Record<MetricHealthState, string> = {
    healthy: "bg-alloy-juniper",
    warning: "bg-amber-500",
    critical: "bg-alloy-ember",
    unknown: "bg-alloy-stone/40",
};

export function MetricScorecard({
    label,
    value,
    status = "unknown",
    loading = false,
    accent = "enrollment",
    fill,
    metrics = [],
    question,
    density = "standard",
    footer,
}: Props) {
    return (
        <MetricCardShell
            visual="scorecard"
            label={label}
            question={question}
            status={status}
            accent={accent}
            fill={fill}
            density={density}
            footer={footer}
        >
            <MetricCardValue value={value} loading={loading} density={density} />
            {metrics.length ? (
                <ul className="space-y-1 border-t border-alloy-stone/15 pt-2" data-scorecard-metrics="true">
                    {metrics.map((m) => (
                        <li key={m.label} className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-alloy-midnight/65">
                                <span
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${SUB_DOT[normalizeOipHealthStatus(m.status)]}`}
                                    aria-hidden="true"
                                />
                                <span className="truncate" title={m.label}>
                                    {m.label}
                                </span>
                            </span>
                            <span className="shrink-0 font-medium tabular-nums text-alloy-midnight">{m.value}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </MetricCardShell>
    );
}
