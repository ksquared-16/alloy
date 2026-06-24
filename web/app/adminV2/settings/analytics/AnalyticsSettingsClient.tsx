"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import KpiTargetsPanel from "@/app/adminV2/settings/analytics/KpiTargetsPanel";
import OipVisibilityPanel from "@/app/adminV2/settings/analytics/OipVisibilityPanel";
import { OipSettingsProvider } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import MetricBuilderPanel from "@/app/adminV2/settings/analytics/MetricBuilderPanel";
import VisualizationBuilderPanel from "@/app/adminV2/settings/analytics/VisualizationBuilderPanel";
import PlacementBuilderPanel from "@/app/adminV2/settings/analytics/PlacementBuilderPanel";
import RollupBuilderPanel from "@/app/adminV2/settings/analytics/RollupBuilderPanel";
import MetricSetupFlow from "@/app/adminV2/settings/analytics/MetricSetupFlow";
import MetricSnapshotButton from "@/app/adminV2/settings/analytics/MetricSnapshotButton";
import { PlatformBuilderButton } from "@/app/adminV2/settings/analytics/platformBuilderUi";

type TabKey = "calculations" | "displays" | "placements" | "rollups" | "targets" | "visibility";

const TABS: { key: TabKey; label: string; subtitle: string }[] = [
    { key: "calculations", label: "Calculations", subtitle: "Define what is measured." },
    { key: "displays", label: "Display styles", subtitle: "Choose how metrics appear." },
    { key: "placements", label: "Where it appears", subtitle: "Choose where metrics show up." },
    { key: "rollups", label: "Combined scores", subtitle: "Combine metrics into one health score." },
];

/** Legacy V1 surfaces — reachable via the Advanced link / ?tab=, not primary tabs. */
const LEGACY_TABS: TabKey[] = ["targets", "visibility"];

function tabFromParam(raw: string | null): TabKey {
    if (raw === "displays" || raw === "visualizations") return "displays";
    if (raw === "placements") return "placements";
    if (raw === "rollups") return "rollups";
    if (raw === "targets") return "targets";
    if (raw === "visibility") return "visibility";
    if (raw === "calculations" || raw === "packs" || raw === "metrics" || raw === "builders") return "calculations";
    return "calculations";
}

function AnalyticsSettingsInner() {
    const searchParams = useSearchParams();
    const [tab, setTab] = useState<TabKey>(() => tabFromParam(searchParams.get("tab")));
    const [flowOpen, setFlowOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const { canMutate } = useAdminAuth();

    useEffect(() => {
        setTab(tabFromParam(searchParams.get("tab")));
    }, [searchParams]);

    const isLegacy = LEGACY_TABS.includes(tab);
    const activeSubtitle = TABS.find((t) => t.key === tab)?.subtitle;

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-adminv2-analytics-settings="true">
            <SettingsPageHeader
                title="Operational Intelligence"
                subtitle="Configure calculations, display styles, and where metrics appear across the workspace."
            />

            {canMutate ?
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <PlatformBuilderButton variant="primary" onClick={() => setFlowOpen(true)}>+ New metric</PlatformBuilderButton>
                    <MetricSnapshotButton />
                </div>
            :   null}

            <SettingsEntityTabBar tabs={TABS} activeKey={isLegacy ? "calculations" : tab} onSelect={setTab} aria-label="Operational Intelligence sections" />
            {activeSubtitle ? <p className="-mt-1 text-xs text-alloy-midnight/55">{activeSubtitle}</p> : null}

            <div className="mt-4" key={refreshKey}>
                {tab === "calculations" ?
                    <MetricBuilderPanel canEdit={canMutate} />
                : tab === "displays" ?
                    <VisualizationBuilderPanel canEdit={canMutate} />
                : tab === "placements" ?
                    <PlacementBuilderPanel canEdit={canMutate} />
                : tab === "rollups" ?
                    <RollupBuilderPanel canEdit={canMutate} />
                : tab === "targets" ?
                    <KpiTargetsPanel canEdit={canMutate} />
                :   <OipVisibilityPanel canEdit={canMutate} />}
            </div>

            <div className="mt-6 border-t border-alloy-stone/15 pt-3">
                <details data-analytics-legacy-advanced="true">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Advanced · legacy V1 surfaces
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setTab("targets")} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${tab === "targets" ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper" : "border-alloy-stone/25 text-alloy-midnight/60"}`}>
                            Targets (legacy)
                        </button>
                        <button type="button" onClick={() => setTab("visibility")} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${tab === "visibility" ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper" : "border-alloy-stone/25 text-alloy-midnight/60"}`}>
                            Experience placement (legacy V1)
                        </button>
                    </div>
                </details>
            </div>

            <MetricSetupFlow
                open={flowOpen}
                onClose={() => setFlowOpen(false)}
                onComplete={() => setRefreshKey((k) => k + 1)}
            />
        </div>
    );
}

export default function AnalyticsSettingsClient() {
    return (
        <OipSettingsProvider>
            <AnalyticsSettingsInner />
        </OipSettingsProvider>
    );
}
