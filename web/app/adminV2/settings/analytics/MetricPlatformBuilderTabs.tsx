"use client";

import { useState } from "react";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import MetricBuilderPanel from "@/app/adminV2/settings/analytics/MetricBuilderPanel";
import VisualizationBuilderPanel from "@/app/adminV2/settings/analytics/VisualizationBuilderPanel";
import PlacementBuilderPanel from "@/app/adminV2/settings/analytics/PlacementBuilderPanel";
import RollupBuilderPanel from "@/app/adminV2/settings/analytics/RollupBuilderPanel";
import { runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import { PLATFORM_BUILDER_BTN } from "@/app/adminV2/settings/analytics/platformBuilderUi";

type Props = { canEdit: boolean };

type BuilderTab = "metrics" | "visualizations" | "placements" | "rollups";

const TABS: { key: BuilderTab; label: string }[] = [
    { key: "metrics", label: "Metrics" },
    { key: "visualizations", label: "Visualizations" },
    { key: "placements", label: "Placements" },
    { key: "rollups", label: "Rollups" },
];

export default function MetricPlatformBuilderTabs({ canEdit }: Props) {
    const [tab, setTab] = useState<BuilderTab>("metrics");

    return (
        <div className="space-y-4" data-metric-platform-builders="true">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <SettingsEntityTabBar tabs={TABS} activeKey={tab} onSelect={setTab} aria-label="Metric platform builders" />
                {canEdit ?
                    <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void runMetricSnapshots()}>
                        Run snapshots
                    </button>
                :   null}
            </div>
            {tab === "metrics" ?
                <MetricBuilderPanel canEdit={canEdit} />
            : tab === "visualizations" ?
                <VisualizationBuilderPanel canEdit={canEdit} />
            : tab === "placements" ?
                <PlacementBuilderPanel canEdit={canEdit} />
            :   <RollupBuilderPanel canEdit={canEdit} />}
        </div>
    );
}
