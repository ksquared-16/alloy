"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { dispatchAdminV2OpenAnalyticsModal } from "@/lib/adminV2/workspaceModalEvents";
import KpiPacksPanel from "@/app/adminV2/settings/analytics/KpiPacksPanel";
import KpiTargetsPanel from "@/app/adminV2/settings/analytics/KpiTargetsPanel";
import OipVisibilityPanel from "@/app/adminV2/settings/analytics/OipVisibilityPanel";
import OipSettingsSummary from "@/app/adminV2/settings/analytics/OipSettingsSummary";
import { OipSettingsProvider } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import { OIP_SECONDARY_BTN_CLASS } from "@/app/adminV2/analytics/oipWorkspaceUi";

const TABS: { key: TabKey; label: string }[] = [
    { key: "packs", label: "Operational playbooks" },
    { key: "targets", label: "Targets" },
    { key: "visibility", label: "Experience placement" },
];

type TabKey = "packs" | "targets" | "visibility";

function tabFromParam(raw: string | null): TabKey {
    if (raw === "targets" || raw === "visibility" || raw === "placements") return raw === "placements" ? "visibility" : raw;
    return "packs";
}

function AnalyticsSettingsInner() {
    const searchParams = useSearchParams();
    const [tab, setTab] = useState<TabKey>(() => tabFromParam(searchParams.get("tab")));
    const { canMutate } = useAdminAuth();

    useEffect(() => {
        setTab(tabFromParam(searchParams.get("tab")));
    }, [searchParams]);

    const previewModal = useCallback(() => {
        dispatchAdminV2OpenAnalyticsModal();
    }, []);

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-adminv2-analytics-settings="true">
            <SettingsPageHeader
                variant="hero"
                title="Operational Intelligence"
                subtitle="What your team tracks, the targets you set, and where performance indicators appear across the workspace."
            />

            <OipSettingsSummary />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-alloy-stone/18 bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                <button type="button" onClick={previewModal} className={OIP_SECONDARY_BTN_CLASS}>
                    Preview panel →
                </button>
            </div>

            <SettingsEntityTabBar tabs={TABS} activeKey={tab} onSelect={setTab} aria-label="Operational Intelligence sections" />

            <div className="mt-4">
                {tab === "packs" ?
                    <KpiPacksPanel onNavigateTab={setTab} />
                : tab === "targets" ?
                    <KpiTargetsPanel canEdit={canMutate} />
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
