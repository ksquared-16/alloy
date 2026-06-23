"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AnalyticsKpiCard } from "@/app/adminV2/analytics/AnalyticsKpiCard";
import { fetchOipMetricsResolved } from "@/lib/kpi/oipBridge";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { fetchMetricTrends } from "@/lib/metrics/fetchMetricTrends";
import type { MetricTrendMap } from "@/lib/metrics/fetchMetricTrends";
import {
    listAvailableMetricPacks,
    listMetricPacks,
    type MetricPackDefinition,
} from "@/lib/metrics/packs";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { OipMetricKey } from "@/lib/metrics/types";
import { getMetricDefinition } from "@/lib/metrics/registry";

const DEFAULT_WINDOW = "rolling_30d" as const;

const SUMMARY_METRIC_KEYS: OipMetricKey[] = [
    "enrollment.tour_conversion_rate",
    "enrollment.time_to_schedule_tour",
    "ops.work_overdue_count",
    "forms.completion_rate",
];

function packHealthStatus(
    pack: MetricPackDefinition,
    resolved: ResolvedMetricMap
): "healthy" | "warning" | "critical" | "unknown" {
    if (pack.domainStatus !== "available") return "unknown";
    const statuses = pack.metricKeys
        .map((k) => resolved[k]?.kpi?.status)
        .filter((s): s is string => Boolean(s && s !== "unknown"));
    if (!statuses.length) return "unknown";
    if (statuses.some((s) => s === "critical")) return "critical";
    if (statuses.some((s) => s === "warning")) return "warning";
    if (statuses.every((s) => s === "healthy")) return "healthy";
    return "unknown";
}

function healthChipClass(status: ReturnType<typeof packHealthStatus>): string {
    switch (status) {
        case "healthy":
            return "border-alloy-pine/25 bg-alloy-pine/8 text-alloy-pine";
        case "warning":
            return "border-alloy-amber/30 bg-alloy-amber/8 text-alloy-amber";
        case "critical":
            return "border-alloy-ember/30 bg-alloy-ember/8 text-alloy-ember";
        default:
            return "border-alloy-stone/20 bg-alloy-stone/8 text-alloy-midnight/50";
    }
}

function healthChipLabel(status: ReturnType<typeof packHealthStatus>): string {
    switch (status) {
        case "healthy":
            return "Healthy";
        case "warning":
            return "Needs attention";
        case "critical":
            return "Critical";
        default:
            return "No data";
    }
}

function SummaryMetricCard({
    metricKey,
    resolved,
    trends,
    loading,
}: {
    metricKey: OipMetricKey;
    resolved: ResolvedMetricMap;
    trends: MetricTrendMap;
    loading: boolean;
}) {
    const def = getMetricDefinition(metricKey);
    const metric = resolved[metricKey] ?? null;
    const status = metric?.kpi?.status;

    if (loading) {
        return (
            <div className="rounded-xl border border-alloy-stone/15 bg-white/70 p-3" aria-busy="true">
                <div className="h-3 w-2/3 animate-pulse rounded bg-alloy-stone/15" />
                <div className="mt-3 h-7 w-1/2 animate-pulse rounded bg-alloy-stone/10" />
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-alloy-stone/15 bg-white px-3 py-3 shadow-[0_4px_16px_rgba(47,93,74,0.05)]">
            <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">{def.label}</div>
                {status && status !== "unknown" ?
                    <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${healthChipClass(status as "healthy")}`}
                    >
                        {healthChipLabel(status as "healthy")}
                    </span>
                :   null}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-alloy-midnight">
                {metric?.formatted_value ?? "—"}
            </div>
            {trends[metricKey]?.trend_label ?
                <p className="mt-1 text-[10px] font-medium text-alloy-midnight/45">{trends[metricKey]!.trend_label}</p>
            :   null}
        </div>
    );
}

function PackSection({
    pack,
    resolved,
    trends,
    loading,
}: {
    pack: MetricPackDefinition;
    resolved: ResolvedMetricMap;
    trends: MetricTrendMap;
    loading: boolean;
}) {
    if (pack.domainStatus === "coming_soon") {
        return (
            <section
                id={`analytics-pack-${pack.key}`}
                className="rounded-xl border border-dashed border-alloy-stone/25 bg-alloy-stone/[0.04] px-4 py-5"
            >
                <h3 className="text-sm font-semibold text-alloy-midnight/70">{pack.label}</h3>
                <p className="mt-1 text-xs text-alloy-midnight/50">{pack.description}</p>
                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">Coming soon</p>
            </section>
        );
    }

    return (
        <section id={`analytics-pack-${pack.key}`} aria-labelledby={`analytics-pack-heading-${pack.key}`}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h3 id={`analytics-pack-heading-${pack.key}`} className="text-sm font-semibold text-alloy-midnight">
                        {pack.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-alloy-midnight/55">{pack.description}</p>
                </div>
                <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${healthChipClass(packHealthStatus(pack, resolved))}`}
                >
                    {healthChipLabel(packHealthStatus(pack, resolved))}
                </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pack.metricKeys.map((key) => (
                    <AnalyticsKpiCard
                        key={key}
                        metricKey={key}
                        metric={resolved[key] ?? null}
                        trend={trends[key] ?? null}
                        loading={loading}
                    />
                ))}
            </div>
        </section>
    );
}

export default function AnalyticsWorkspacePanel() {
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    const [resolved, setResolved] = useState<ResolvedMetricMap>({});
    const [trends, setTrends] = useState<MetricTrendMap>({});
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const metricKeys = useMemo(
        () => listAvailableMetricPacks().flatMap((p) => p.metricKeys) as OipMetricKey[],
        []
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFetchError(null);

        void Promise.all([
            fetchOipMetricsResolved({ keys: metricKeys, window: DEFAULT_WINDOW, siteId: selectedSiteId }),
            fetchMetricTrends({ keys: metricKeys, window: DEFAULT_WINDOW, siteId: selectedSiteId }),
        ])
            .then(([metrics, trendMap]) => {
                if (!cancelled) {
                    setResolved(metrics);
                    setTrends(trendMap);
                    setLastUpdated(new Date());
                }
            })
            .catch(() => {
                if (!cancelled) setFetchError("Unable to load metrics right now.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [metricKeys, selectedSiteId]);

    const packs = listMetricPacks();
    const siteLabel =
        selectedSiteId && siteFilter?.bootstrap?.sites?.length
            ? (siteFilter.bootstrap.sites.find((s) => s.id === selectedSiteId)?.label ?? "Selected site")
            : "All sites";

    const enrollmentHealth = packHealthStatus(
        packs.find((p) => p.key === "enrollment")!,
        resolved
    );
    const opsHealth = packHealthStatus(
        packs.find((p) => p.key === "operational_health")!,
        resolved
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-analytics-panel="true">
            <div className="shrink-0 border-b border-alloy-stone/12 bg-[linear-gradient(135deg,rgba(236,247,243,0.92)_0%,rgba(255,255,255,0.98)_100%)] px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-alloy-pine">
                            Operational Intelligence
                        </div>
                        <p className="mt-1 text-xs text-alloy-midnight/60">
                            Live metrics · rolling 30 days
                            {lastUpdated ?
                                <> · Updated {lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
                            :   null}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-alloy-stone/20 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-alloy-midnight/65">
                            Site: {siteLabel}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${healthChipClass(enrollmentHealth)}`}>
                            Enrollment · {healthChipLabel(enrollmentHealth)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${healthChipClass(opsHealth)}`}>
                            Operations · {healthChipLabel(opsHealth)}
                        </span>
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-analytics-summary-row="true">
                    {SUMMARY_METRIC_KEYS.map((key) => (
                        <SummaryMetricCard key={key} metricKey={key} resolved={resolved} trends={trends} loading={loading} />
                    ))}
                </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <aside className="hidden w-44 shrink-0 border-r border-alloy-stone/12 bg-[#f7f6f3]/80 px-3 py-4 md:block">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">Packs</div>
                    <nav className="mt-3 space-y-1" aria-label="Analytics metric packs">
                        {packs.map((pack) => (
                            <a
                                key={pack.key}
                                href={`#analytics-pack-${pack.key}`}
                                className={[
                                    "block rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                                    pack.domainStatus === "coming_soon"
                                        ? "text-alloy-midnight/40"
                                        : "text-alloy-midnight/75 hover:bg-white hover:text-alloy-pine",
                                ].join(" ")}
                            >
                                {pack.label}
                            </a>
                        ))}
                    </nav>
                    <Link
                        href="/admin/settings/analytics"
                        className="mt-6 block text-[11px] font-medium text-alloy-pine hover:underline"
                    >
                        Configure analytics →
                    </Link>
                </aside>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                    {fetchError ?
                        <p className="mb-4 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-xs text-alloy-ember">
                            {fetchError}
                        </p>
                    :   null}
                    <div className="space-y-8">
                        {packs.map((pack) => (
                            <PackSection key={pack.key} pack={pack} resolved={resolved} trends={trends} loading={loading} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
