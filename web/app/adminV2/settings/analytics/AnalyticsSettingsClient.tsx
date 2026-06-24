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

const TABS: { key: TabKey; label: string }[] = [
    { key: "calculations", label: "Calculations" },
    { key: "displays", label: "Display styles" },
    { key: "placements", label: "Where it appears" },
    { key: "rollups", label: "Combined scores" },
    { key: "targets", label: "Targets" },
    { key: "visibility", label: "Experience placement" },
];

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

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-adminv2-analytics-settings="true">
            <SettingsPageHeader
                title="Operational Intelligence"
                subtitle="Configure calculations, targets, and where metrics appear across the workspace."
            />

            {canMutate ?
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <PlatformBuilderButton variant="primary" onClick={() => setFlowOpen(true)}>+ New metric</PlatformBuilderButton>
                    <MetricSnapshotButton />
                </div>
            :   null}

            <SettingsEntityTabBar tabs={TABS} activeKey={tab} onSelect={setTab} aria-label="Operational Intelligence sections" />

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
