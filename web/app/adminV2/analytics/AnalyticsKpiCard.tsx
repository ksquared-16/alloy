"use client";

import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import type { MetricTrendApiItem } from "@/app/api/admin/metrics/trends/route";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { OipKpiObjectCard } from "@/components/admin/workspace/OipKpiObjectCard";
import {
    formatTargetFromKpi,
    oipStatusOperatorLabel,
} from "@/lib/metrics/oipKpiObjectPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";

export type AnalyticsKpiCardProps = {
    metric: MetricResolveApiItem | null;
    metricKey: string;
    trend?: MetricTrendApiItem | null;
    loading?: boolean;
    /** compact = object card; default = standalone card */
    variant?: "default" | "compact";
};

function emptyCopy(metricKey: string): string {
    const def = getMetricDefinition(metricKey as Parameters<typeof getMetricDefinition>[0]);
    if (def.snapshotSemantics) {
        return "No snapshot data in this window yet.";
    }
    return "No activity in this window yet.";
}

export function AnalyticsKpiCard({
    metric,
    metricKey,
    trend: _trend = null,
    loading = false,
    variant = "default",
}: AnalyticsKpiCardProps) {
    void _trend;
    const def = getMetricDefinition(metricKey as Parameters<typeof getMetricDefinition>[0]);
    const hasValue = metric?.value != null && metric.formatted_value !== "—";
    const status = metric?.kpi?.status;

    if (variant === "compact") {
        return (
            <OipKpiObjectCard
                label={def.label}
                value={hasValue ? metric!.formatted_value : "—"}
                target={formatTargetFromKpi(metric?.kpi)}
                status={status}
                loading={loading}
                compact
            />
        );
    }

    if (loading) {
        return (
            <article className="rounded-xl border border-alloy-stone/18 bg-white p-3" aria-busy="true">
                <div className="h-3 w-1/3 animate-pulse rounded bg-alloy-stone/12" />
                <div className="mt-2 h-5 w-16 animate-pulse rounded bg-alloy-stone/8" />
            </article>
        );
    }

    const normalized = normalizeOipHealthStatus(status);

    return (
        <article className="flex flex-col rounded-xl border border-alloy-stone/18 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-semibold text-alloy-midnight">{def.label}</h4>
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-alloy-midnight">
                {hasValue ? metric!.formatted_value : "—"}
            </div>
            {formatTargetFromKpi(metric?.kpi) ?
                <div className="mt-1 text-[10px] text-alloy-midnight/45">
                    Target {formatTargetFromKpi(metric?.kpi)}
                </div>
            :   null}
            <div className="mt-1 text-[10px] font-medium text-alloy-midnight/55">
                {oipStatusOperatorLabel(normalized)}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/50">
                {hasValue ? def.description : emptyCopy(metricKey)}
            </p>
        </article>
    );
}
