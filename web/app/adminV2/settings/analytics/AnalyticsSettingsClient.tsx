"use client";

import { useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import KpiPacksPanel from "@/app/adminV2/settings/analytics/KpiPacksPanel";
import KpiTargetsPanel from "@/app/adminV2/settings/analytics/KpiTargetsPanel";
import KpiPlacementOverviewPanel from "@/app/adminV2/settings/analytics/KpiPlacementOverviewPanel";

const TABS: { key: TabKey; label: string }[] = [
    { key: "packs", label: "KPI packs" },
    { key: "targets", label: "KPI targets" },
    { key: "placements", label: "KPI placement" },
];

type TabKey = "packs" | "targets" | "placements";

export default function AnalyticsSettingsClient() {
    const [tab, setTab] = useState<TabKey>("packs");
    const { canMutate } = useAdminAuth();

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-adminv2-analytics-settings="true">
            <SettingsPageHeader
                variant="hero"
                title="Analytics"
                subtitle="Configure operational intelligence — KPI packs, targets, and where metrics appear for your team."
            />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-alloy-pine/20 bg-[linear-gradient(135deg,rgba(236,247,243,0.95)_0%,rgba(255,255,255,0.98)_100%)] px-4 py-3">
                <p className="text-xs text-alloy-midnight/65">
                    Operators view live metrics in the{" "}
                    <span className="font-medium text-alloy-midnight">Analytics</span> workspace from the sidebar.
                    Configure targets and placements here.
                </p>
                <Link
                    href="/adminV2/workspace"
                    className="text-xs font-medium text-alloy-pine hover:underline"
                    onClick={(e) => {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent("adminv2:open-analytics-modal"));
                    }}
                >
                    Preview Analytics modal →
                </Link>
            </div>

            <SettingsEntityTabBar tabs={TABS} activeKey={tab} onSelect={setTab} aria-label="Analytics configuration sections" />

            <div className="mt-4">
                {tab === "packs" ?
                    <KpiPacksPanel />
                : tab === "targets" ?
                    <KpiTargetsPanel canEdit={canMutate} />
                :   <KpiPlacementOverviewPanel canEdit={canMutate} />}
            </div>
        </div>
    );
}
