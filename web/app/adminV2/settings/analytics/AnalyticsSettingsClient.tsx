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
import MetricPlatformBuilderTabs from "@/app/adminV2/settings/analytics/MetricPlatformBuilderTabs";

type TabKey = "calculations" | "targets" | "visibility" | "builders";

const TABS: { key: TabKey; label: string }[] = [
    { key: "calculations", label: "Calculations" },
    { key: "targets", label: "Targets" },
    { key: "visibility", label: "Experience placement" },
    { key: "builders", label: "Metric builders" },
];

function tabFromParam(raw: string | null): TabKey {
    if (raw === "builders") return "builders";
    if (raw === "targets") return "targets";
    if (raw === "visibility" || raw === "placements") return "visibility";
    if (raw === "calculations" || raw === "packs" || raw === "metrics") return "calculations";
    return "calculations";
}

function AnalyticsSettingsInner() {
    const searchParams = useSearchParams();
    const [tab, setTab] = useState<TabKey>(() => tabFromParam(searchParams.get("tab")));
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

            <SettingsEntityTabBar tabs={TABS} activeKey={tab} onSelect={setTab} aria-label="Operational Intelligence sections" />

            <div className="mt-4">
                {tab === "calculations" ?
                    <MetricBuilderPanel canEdit={canMutate} />
                : tab === "targets" ?
                    <KpiTargetsPanel canEdit={canMutate} />
                : tab === "builders" ?
                    <MetricPlatformBuilderTabs canEdit={canMutate} />
                :   <OipVisibilityPanel canEdit={canMutate} />}
            </div>
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
