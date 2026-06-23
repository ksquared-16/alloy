"use client";

import { useEffect, useMemo, useState } from "react";

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

const DEFAULT_WINDOW = "rolling_30d" as const;

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
            <section className="rounded-xl border border-dashed border-alloy-stone/25 bg-alloy-stone/[0.04] px-4 py-5">
                <h3 className="text-sm font-semibold text-alloy-midnight/70">{pack.label}</h3>
                <p className="mt-1 text-xs text-alloy-midnight/50">{pack.description}</p>
                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                    Coming soon
                </p>
            </section>
        );
    }

    return (
        <section aria-labelledby={`analytics-pack-${pack.key}`}>
            <div className="mb-3">
                <h3 id={`analytics-pack-${pack.key}`} className="text-sm font-semibold text-alloy-midnight">
                    {pack.label}
                </h3>
                <p className="mt-0.5 text-xs text-alloy-midnight/55">{pack.description}</p>
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
            : null;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-analytics-panel="true">
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <aside className="hidden w-44 shrink-0 border-r border-alloy-stone/12 bg-[#f7f6f3]/80 px-3 py-4 md:block">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">
                        Packs
                    </div>
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
                                {pack.domainStatus === "coming_soon" ?
                                    <span className="ml-1 text-[10px] text-alloy-midnight/35">Soon</span>
                                :   null}
                            </a>
                        ))}
                    </nav>
                </aside>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                    {siteLabel ?
                        <p className="mb-3 text-[11px] text-alloy-midnight/55">
                            Scoped to site: <span className="font-medium text-alloy-midnight/75">{siteLabel}</span>
                        </p>
                    :   null}
                    {fetchError ?
                        <p className="mb-4 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-xs text-alloy-ember">
                            {fetchError}
                        </p>
                    :   null}
                    <div className="space-y-8">
                        {packs.map((pack) => (
                            <PackSection
                                key={pack.key}
                                pack={pack}
                                resolved={resolved}
                                trends={trends}
                                loading={loading}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
