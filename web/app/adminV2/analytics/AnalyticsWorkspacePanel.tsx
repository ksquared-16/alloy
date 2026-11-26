"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
    OIP_PRIMARY_BTN_CLASS,
    OipSectionCard,
} from "@/app/adminV2/analytics/oipWorkspaceUi";
import AlloyModeSwitch from "@/components/workspace/AlloyModeSwitch";
import { Settings2 } from "lucide-react";
import { OperationalIntelligencePanel } from "@/components/adminV2/intelligence/OperationalIntelligencePanel";
import {
    OipKpiObjectCard,
    OipKpiObjectRow,
} from "@/components/admin/workspace/OipKpiObjectCard";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    listMetricPacks,
    type MetricPackDefinition,
} from "@/lib/metrics/packs";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { closeWorkspaceModal } from "@/lib/adminV2/workspaceModalCoordinator";
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

/**
 * Operational Intelligence shell follows the operational-workspace doctrine:
 * Work / Studio mode, with analytics *views* underneath. Work surfaces live operational
 * intelligence (Overview today; Planning / Financials / Utilization are the documented
 * future category model). Studio owns the reusable analytics assets (Playbooks today;
 * Metrics / Targets / Display are future), and Configure belongs to Studio — one entry,
 * not a duplicated header action.
 */
type OipMode = "work" | "studio";
type OipStudioView = "playbooks" | "configure";

const OI_MODES: ReadonlyArray<{ key: OipMode; label: string }> = [
    { key: "work", label: "Work" },
    { key: "studio", label: "Studio" },
];
/** Underline child-view tab styling (subordinate to the mode switch, attached to baseline). */
function oiViewTabClass(active: boolean): string {
    return `-mb-px px-0.5 pb-1.5 pt-0.5 text-xs font-semibold transition-colors ${
        active
            ? "border-b-2 border-alloy-juniper text-alloy-juniper"
            : "border-b-2 border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/80"
    }`;
}

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
    const [loading, setLoading] = useState(!cachedOnMount || Object.keys(cachedOnMount).length === 0);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(cachedOnMount ? new Date() : null);
    const [mode, setMode] = useState<OipMode>("work");
    const [studioView, setStudioView] = useState<OipStudioView>("playbooks");

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

        // Only the resolved metric map drives this surface; it is warm-first + deduped via the OIP warm
        // cache. (The former `fetchMetricTrends` result was discarded — `void trends` — so it was a pure
        // wasted round-trip on every open; removed.)
        void prefetchOipMetricsWarm({ siteId: selectedSiteId, keys: metricKeys })
            .then((metrics) => {
                if (!cancelled) {
                    setResolved(metrics);
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
            {/* Mode (Work / Studio) + analytics views, doctrine-aligned with other modules. */}
            <div className="shrink-0 bg-white px-3 py-2 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <AlloyModeSwitch
                        modes={OI_MODES}
                        active={mode}
                        onChange={setMode}
                        ariaLabel="Operational Intelligence mode"
                    />
                    <p className="text-[10px] text-alloy-midnight/45">
                        Rolling 30 days
                        {lastUpdated ?
                            <> · {lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
                        :   null}
                        <> · {siteLabel}</>
                    </p>
                </div>
                {/* Child views — subordinate to the mode (underline strip on a baseline). */}
                <div
                    className="mt-2 flex flex-wrap items-end gap-4 border-b border-alloy-stone/15"
                    role="tablist"
                    aria-label={mode === "work" ? "Work views" : "Studio views"}
                    data-oip-views="true"
                >
                    {mode === "work" ? (
                        <button type="button" role="tab" aria-selected data-oip-tab="overview" className={oiViewTabClass(true)}>
                            Overview
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={studioView === "playbooks"}
                                data-oip-tab="playbooks"
                                onClick={() => setStudioView("playbooks")}
                                className={oiViewTabClass(studioView === "playbooks")}
                            >
                                Playbooks
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={studioView === "configure"}
                                data-oip-tab="configure"
                                onClick={() => setStudioView("configure")}
                                className={oiViewTabClass(studioView === "configure")}
                            >
                                Configure
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
                {mode === "work" ?
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4" data-oip-tab-panel="overview">
                        {fetchError ?
                            <p className="mb-3 rounded-lg border border-alloy-ember/30 bg-white px-3 py-2 text-xs text-alloy-ember">
                                {fetchError}
                            </p>
                        :   null}
                        <OperationalIntelligencePanel />
                    </div>
                : studioView === "playbooks" ?
                    <>
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
                        </aside>

                        <div
                            className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-3 sm:px-4 sm:py-4"
                            data-oip-tab-panel="playbooks"
                        >
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
                :   <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4" data-oip-tab-panel="configure">
                        <OipSectionCard
                            title="Analytics configuration"
                            helper="Metrics, targets, and display/placement are configured in analytics settings."
                        >
                            <button
                                type="button"
                                onClick={openConfiguration}
                                className={OIP_PRIMARY_BTN_CLASS}
                                data-oip-configure-link="true"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <Settings2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                                    Open analytics configuration
                                </span>
                            </button>
                            <p className="mt-3 text-[11px] leading-snug text-alloy-midnight/55">
                                Studio will grow to host the reusable analytics assets directly: Metrics, Playbooks,
                                Targets, and Display / placement.
                            </p>
                        </OipSectionCard>
                    </div>
                }
            </div>
        </div>
    );
}
