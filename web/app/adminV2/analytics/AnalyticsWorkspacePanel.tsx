"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
    OIP_LINK_CLASS,
    OIP_SECONDARY_BTN_CLASS,
} from "@/app/adminV2/analytics/oipWorkspaceUi";
import { OipOverviewStructure } from "@/components/admin/workspace/OipOverviewStructure";
import {
    OipKpiObjectCard,
    OipKpiObjectRow,
} from "@/components/admin/workspace/OipKpiObjectCard";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { fetchMetricTrends } from "@/lib/metrics/fetchMetricTrends";
import type { MetricTrendMap } from "@/lib/metrics/fetchMetricTrends";
import {
    listMetricPacks,
    type MetricPackDefinition,
} from "@/lib/metrics/packs";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { closeWorkspaceModal } from "@/lib/adminV2/workspaceModalCoordinator";
import { computeWorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import {
    normalizeOipHealthStatus,
    oipHealthStatusChipClass,
    oipHealthStatusLabel,
    type OipHealthStatus,
} from "@/lib/metrics/oipStatusPresentation";
import { formatTargetFromKpi } from "@/lib/metrics/oipKpiObjectPresentation";
import {
    oipDomainVisualTokens,
    oipKpiCompactRowClass,
    oipModalSectionClass,
    oipPackAccentKey,
} from "@/lib/metrics/oipKpiCardVisualSystem";
import {
    allAvailableOipMetricKeys,
    buildOipWarmScopeKey,
    getLatestOipWarmSnapshotForSite,
    getOipWarmSnapshot,
    prefetchOipMetricsWarm,
    subscribeOipWarmCache,
} from "@/lib/metrics/oipWorkspaceWarmCache";

const DEFAULT_WINDOW = "rolling_30d" as const;

type OipPanelTab = "overview" | "playbooks";

function packHealthStatus(pack: MetricPackDefinition, resolved: ResolvedMetricMap): OipHealthStatus {
    if (pack.domainStatus !== "available") return "unknown";
    const statuses = pack.metricKeys
        .map((k) => normalizeOipHealthStatus(resolved[k]?.kpi?.status))
        .filter((s) => s !== "unknown");
    if (!statuses.length) return "unknown";
    if (statuses.some((s) => s === "critical")) return "critical";
    if (statuses.some((s) => s === "warning")) return "warning";
    if (statuses.every((s) => s === "healthy")) return "healthy";
    return "unknown";
}

function PackSection({
    pack,
    resolved,
    loading,
}: {
    pack: MetricPackDefinition;
    resolved: ResolvedMetricMap;
    loading: boolean;
}) {
    const health = packHealthStatus(pack, resolved);
    const accent = oipPackAccentKey(pack.key);
    const domain = oipDomainVisualTokens(accent);

    return (
        <section
            id={`analytics-pack-${pack.key}`}
            aria-labelledby={`analytics-pack-heading-${pack.key}`}
            className={`py-1 ${oipModalSectionClass(accent)}`}
        >
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <h3 id={`analytics-pack-heading-${pack.key}`} className={`text-sm font-semibold ${domain.sectionLabel}`}>
                    {pack.label}
                </h3>
                <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${oipHealthStatusChipClass(health)}`}
                >
                    {oipHealthStatusLabel(health)}
                </span>
            </div>
            <OipKpiObjectRow layout="compact" className={oipKpiCompactRowClass()}>
                {pack.metricKeys.map((key) => {
                    const metric = resolved[key];
                    const def = getMetricDefinition(key);
                    return (
                        <OipKpiObjectCard
                            key={key}
                            label={def.label}
                            value={metric?.formatted_value ?? "—"}
                            target={formatTargetFromKpi(metric?.kpi)}
                            status={metric?.kpi?.status}
                            loading={loading}
                            layout="compact"
                            metricKey={key}
                        />
                    );
                })}
            </OipKpiObjectRow>
        </section>
    );
}

function ComingSoonPacksGroup({ packs }: { packs: readonly MetricPackDefinition[] }) {
    const [expanded, setExpanded] = useState(false);
    if (!packs.length) return null;

    return (
        <section
            id="analytics-pack-coming-soon"
            className="rounded-lg border border-dashed border-alloy-stone/18 bg-white px-3 py-2"
            data-oip-coming-soon-group="true"
        >
            <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
            >
                <span className="text-xs font-semibold text-alloy-midnight/55">Coming soon</span>
                <span className="text-[10px] font-medium text-alloy-midnight/40">
                    {packs.length} playbook{packs.length === 1 ? "" : "s"}
                </span>
            </button>
            {expanded ?
                <ul className="mt-2 space-y-1 border-t border-alloy-stone/10 pt-2">
                    {packs.map((pack) => (
                        <li key={pack.key} className="text-[11px] text-alloy-midnight/45">
                            {pack.label}
                        </li>
                    ))}
                </ul>
            :   null}
        </section>
    );
}

export type AnalyticsWorkspacePanelProps = {
    onRequestClose?: () => void;
};

export default function AnalyticsWorkspacePanel({ onRequestClose }: AnalyticsWorkspacePanelProps) {
    const router = useRouter();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    const metricKeys = useMemo(() => allAvailableOipMetricKeys(), []);
    const warmScopeKey = useMemo(
        () => buildOipWarmScopeKey({ siteId: selectedSiteId, keys: metricKeys }),
        [selectedSiteId, metricKeys]
    );
    const cachedOnMount = useMemo(
        () => getOipWarmSnapshot(warmScopeKey) ?? getLatestOipWarmSnapshotForSite(selectedSiteId),
        [warmScopeKey, selectedSiteId]
    );

    const [resolved, setResolved] = useState<ResolvedMetricMap>(cachedOnMount ?? {});
    const [trends, setTrends] = useState<MetricTrendMap>({});
    const [loading, setLoading] = useState(!cachedOnMount || Object.keys(cachedOnMount).length === 0);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(cachedOnMount ? new Date() : null);
    const [activeTab, setActiveTab] = useState<OipPanelTab>("overview");

    void trends;

    useEffect(() => {
        return subscribeOipWarmCache(() => {
            const snap = getOipWarmSnapshot(warmScopeKey) ?? getLatestOipWarmSnapshotForSite(selectedSiteId);
            if (snap && Object.keys(snap).length) {
                setResolved((prev) => ({ ...prev, ...snap }));
                setLastUpdated(new Date());
                setLoading(false);
            }
        });
    }, [warmScopeKey, selectedSiteId]);

    useEffect(() => {
        let cancelled = false;
        const cached = getOipWarmSnapshot(warmScopeKey) ?? getLatestOipWarmSnapshotForSite(selectedSiteId);
        if (cached && Object.keys(cached).length) {
            setResolved(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setFetchError(null);

        void Promise.all([
            prefetchOipMetricsWarm({ siteId: selectedSiteId, keys: metricKeys }),
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
                if (!cancelled) setFetchError("Unable to load performance indicators right now.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [metricKeys, selectedSiteId, warmScopeKey]);

    const allPacks = listMetricPacks();
    const availablePacks = allPacks.filter((pack) => pack.domainStatus === "available");
    const comingSoonPacks = allPacks.filter((pack) => pack.domainStatus === "coming_soon");
    const health = computeWorkspaceHealthSummary(resolved);
    const siteLabel =
        selectedSiteId && siteFilter?.bootstrap?.sites?.length
            ? (siteFilter.bootstrap.sites.find((s) => s.id === selectedSiteId)?.label ?? "Selected site")
            : "All sites";

    const openConfiguration = () => {
        closeWorkspaceModal("analytics");
        onRequestClose?.();
        router.push("/admin/settings/analytics");
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-adminv2-analytics-panel="true">
            <div className="shrink-0 border-b border-alloy-midnight/10 bg-white px-3 py-2 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-md border border-alloy-midnight/10 p-0.5" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === "overview"}
                            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${activeTab === "overview" ? "bg-alloy-midnight/8 text-alloy-midnight" : "text-alloy-midnight/50"}`}
                            onClick={() => setActiveTab("overview")}
                            data-oip-tab="overview"
                        >
                            Overview
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === "playbooks"}
                            className={`rounded px-2.5 py-1 text-[11px] font-semibold ${activeTab === "playbooks" ? "bg-alloy-midnight/8 text-alloy-midnight" : "text-alloy-midnight/50"}`}
                            onClick={() => setActiveTab("playbooks")}
                            data-oip-tab="playbooks"
                        >
                            Playbooks
                        </button>
                    </div>
                    <p className="text-[10px] text-alloy-midnight/45">
                        Rolling 30 days
                        {lastUpdated ?
                            <> · {lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
                        :   null}
                        <> · {siteLabel}</>
                    </p>
                    <button type="button" onClick={openConfiguration} className={`hidden md:inline ${OIP_LINK_CLASS}`}>
                        Configure →
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
                {activeTab === "overview" ?
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4" data-oip-tab-panel="overview">
                        {fetchError ?
                            <p className="mb-3 rounded-lg border border-alloy-ember/30 bg-white px-3 py-2 text-xs text-alloy-ember">
                                {fetchError}
                            </p>
                        :   null}
                        <OipOverviewStructure health={health} resolved={resolved} loading={loading} />
                        <div className="mt-4 flex justify-end md:hidden">
                            <button type="button" onClick={openConfiguration} className={OIP_SECONDARY_BTN_CLASS}>
                                Configure
                            </button>
                        </div>
                    </div>
                :   <>
                        <aside className="hidden w-36 shrink-0 border-r border-alloy-stone/12 bg-white px-2.5 py-3 md:block">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                                Playbooks
                            </div>
                            <nav className="mt-2 space-y-0.5" aria-label="Operational playbooks">
                                {availablePacks.map((pack) => (
                                    <a
                                        key={pack.key}
                                        href={`#analytics-pack-${pack.key}`}
                                        className="block rounded-md px-2 py-1 text-xs font-medium text-alloy-midnight/70 transition-colors hover:text-alloy-juniper"
                                    >
                                        {pack.label}
                                    </a>
                                ))}
                                {comingSoonPacks.length ?
                                    <a
                                        href="#analytics-pack-coming-soon"
                                        className="block rounded-md px-2 py-1 text-xs font-medium text-alloy-midnight/35"
                                    >
                                        Coming soon
                                    </a>
                                :   null}
                            </nav>
                            <button type="button" onClick={openConfiguration} className={`mt-4 ${OIP_LINK_CLASS}`}>
                                Configure →
                            </button>
                        </aside>

                        <div
                            className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-3 sm:px-4 sm:py-4"
                            data-oip-tab-panel="playbooks"
                        >
                            <div className="mb-3 flex justify-end md:hidden">
                                <button type="button" onClick={openConfiguration} className={OIP_SECONDARY_BTN_CLASS}>
                                    Configure
                                </button>
                            </div>
                            {fetchError ?
                                <p className="mb-3 rounded-lg border border-alloy-ember/30 bg-white px-3 py-2 text-xs text-alloy-ember">
                                    {fetchError}
                                </p>
                            :   null}
                            <div className="space-y-3">
                                {availablePacks.map((pack) => (
                                    <PackSection key={pack.key} pack={pack} resolved={resolved} loading={loading} />
                                ))}
                                <ComingSoonPacksGroup packs={comingSoonPacks} />
                            </div>
                        </div>
                    </>
                }
            </div>
        </div>
    );
}
