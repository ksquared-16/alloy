"use client";

import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import type { MetricTrendApiItem } from "@/app/api/admin/metrics/trends/route";
import { AnalyticsTrendSparkline } from "@/app/adminV2/analytics/AnalyticsTrendSparkline";
import { getMetricDefinition } from "@/lib/metrics/registry";

export type AnalyticsKpiCardProps = {
    metric: MetricResolveApiItem | null;
    metricKey: string;
    trend?: MetricTrendApiItem | null;
    loading?: boolean;
};

const WINDOW_LABELS: Record<string, string> = {
    rolling_24h: "Last 24 hours",
    rolling_7d: "Last 7 days",
    rolling_30d: "Last 30 days",
};

function kpiStatusClass(status: string | undefined): string {
    switch (status) {
        case "healthy":
            return "text-alloy-pine bg-alloy-pine/10";
        case "warning":
            return "text-alloy-amber bg-alloy-amber/10";
        case "critical":
            return "text-alloy-ember bg-alloy-ember/10";
        default:
            return "text-alloy-midnight/55 bg-alloy-stone/10";
    }
}

function kpiStatusLabel(status: string | undefined): string | null {
    if (!status || status === "unknown") return null;
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function emptyCopy(metricKey: string): string {
    const def = getMetricDefinition(metricKey as Parameters<typeof getMetricDefinition>[0]);
    if (def.snapshotSemantics) {
        return "No snapshot data in this window yet. Live evaluation may still run on demand.";
    }
    return "No activity recorded in this window yet.";
}

export function AnalyticsKpiCard({ metric, metricKey, trend = null, loading = false }: AnalyticsKpiCardProps) {
    const def = getMetricDefinition(metricKey as Parameters<typeof getMetricDefinition>[0]);
    const windowLabel = metric?.window ? (WINDOW_LABELS[metric.window] ?? metric.window) : "Rolling window";
    const hasValue = metric?.value != null && metric.formatted_value !== "—";
    const kpiStatus = metric?.kpi?.status;

    if (loading) {
        return (
            <article
                className="flex min-h-[9.5rem] flex-col rounded-xl border border-alloy-stone/15 bg-white/80 p-4 shadow-sm"
                aria-busy="true"
            >
                <div className="h-3 w-2/5 animate-pulse rounded bg-alloy-stone/20" />
                <div className="mt-4 h-8 w-1/3 animate-pulse rounded bg-alloy-stone/15" />
                <div className="mt-auto h-3 w-3/5 animate-pulse rounded bg-alloy-stone/10" />
            </article>
        );
    }

    return (
        <article className="flex min-h-[9.5rem] flex-col rounded-xl border border-alloy-stone/15 bg-white p-4 shadow-[0_8px_24px_rgba(47,93,74,0.06)]">
            <div className="flex items-start justify-between gap-2">
                <h4 className="text-[13px] font-semibold leading-snug text-alloy-midnight">{def.label}</h4>
                {kpiStatusLabel(kpiStatus) ?
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kpiStatusClass(kpiStatus)}`}
                    >
                        {kpiStatusLabel(kpiStatus)}
                    </span>
                :   null}
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
                <div className="text-[1.65rem] font-semibold tabular-nums tracking-tight text-alloy-midnight">
                    {hasValue ? metric!.formatted_value : "—"}
                </div>
                {trend?.sparkline_y?.length ?
                    <AnalyticsTrendSparkline points={trend.sparkline_y} direction={trend.direction} />
                :   null}
            </div>

            {trend ?
                <p
                    className={`mt-2 text-[11px] font-medium ${
                        trend.direction === "up" ? "text-alloy-pine"
                        : trend.direction === "down" ? "text-alloy-ember"
                        : "text-alloy-midnight/50"
                    }`}
                    data-analytics-trend-label="true"
                >
                    {trend.trend_label}
                </p>
            :   null}

            <p className="mt-2 text-[11px] leading-relaxed text-alloy-midnight/60">
                {hasValue ?
                    def.description
                :   emptyCopy(metricKey)}
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[10px] text-alloy-midnight/45">
                <span>{windowLabel}</span>
                {metric?.sources?.length ?
                    <>
                        <span aria-hidden>·</span>
                        <span>{metric.sources.slice(0, 2).join(", ")}</span>
                    </>
                :   null}
                {def.snapshotSemantics ?
                    <>
                        <span aria-hidden>·</span>
                        <span>Bounded snapshot</span>
                    </>
                :   null}
            </div>
        </article>
    );
}
