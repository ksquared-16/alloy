"use client";

import { useCallback, useState } from "react";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import MetricBuilderPanel from "@/app/adminV2/settings/analytics/MetricBuilderPanel";
import VisualizationBuilderPanel from "@/app/adminV2/settings/analytics/VisualizationBuilderPanel";
import PlacementBuilderPanel from "@/app/adminV2/settings/analytics/PlacementBuilderPanel";
import RollupBuilderPanel from "@/app/adminV2/settings/analytics/RollupBuilderPanel";
import { runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import { BUILDER_TAB_LABELS, SNAPSHOT_RUN_STORAGE_KEY } from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import { dispatchAnalyticsSnapshotsUpdated } from "@/app/adminV2/settings/analytics/platformBuilderEvents";
import {
    PlatformBuilderButton,
    PlatformBuilderCallout,
    PLATFORM_BUILDER_SHELL,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";

type Props = { canEdit: boolean };

type BuilderTab = "metrics" | "visualizations" | "placements" | "rollups";

const TABS: { key: BuilderTab; label: string }[] = [
    { key: "metrics", label: BUILDER_TAB_LABELS.metrics },
    { key: "visualizations", label: BUILDER_TAB_LABELS.visualizations },
    { key: "placements", label: BUILDER_TAB_LABELS.placements },
    { key: "rollups", label: BUILDER_TAB_LABELS.rollups },
];

function formatLastRun(iso: string | null): string | null {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export default function MetricPlatformBuilderTabs({ canEdit }: Props) {
    const [tab, setTab] = useState<BuilderTab>("metrics");
    const [snapshotState, setSnapshotState] = useState<"idle" | "running" | "success" | "error">("idle");
    const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
    const [lastRunAt, setLastRunAt] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(SNAPSHOT_RUN_STORAGE_KEY);
    });

    const runSnapshots = useCallback(async () => {
        if (!canEdit) return;
        setSnapshotState("running");
        setSnapshotMessage(null);
        const result = await runMetricSnapshots();
        const now = new Date().toISOString();
        if (result.errors.length && !result.written) {
            setSnapshotState("error");
            setSnapshotMessage(result.errors[0] ?? "Snapshot run failed.");
        } else {
            setSnapshotState("success");
            setSnapshotMessage(`Updated ${result.written} snapshot${result.written === 1 ? "" : "s"}.`);
            window.localStorage.setItem(SNAPSHOT_RUN_STORAGE_KEY, now);
            setLastRunAt(now);
            dispatchAnalyticsSnapshotsUpdated(result);
        }
        window.setTimeout(() => setSnapshotState("idle"), 4000);
    }, [canEdit]);

    return (
        <div className="space-y-4" data-metric-platform-builders="true">
            <div className={`${PLATFORM_BUILDER_SHELL} flex flex-wrap items-start justify-between gap-3 p-3`}>
                <SettingsEntityTabBar tabs={TABS} activeKey={tab} onSelect={setTab} aria-label="Metric platform builders" />
                {canEdit ?
                    <div className="flex min-w-[12rem] flex-col items-end gap-1">
                        <PlatformBuilderButton
                            variant="primary"
                            loading={snapshotState === "running"}
                            loadingLabel="Updating metrics…"
                            onClick={() => void runSnapshots()}
                        >
                            Update live metric values
                        </PlatformBuilderButton>
                        {lastRunAt ?
                            <p className="text-[10px] text-alloy-midnight/45">Last updated {formatLastRun(lastRunAt)}</p>
                        :   <p className="text-[10px] text-alloy-midnight/45">Refresh stored values used across the workspace.</p>}
                        {snapshotMessage ?
                            <PlatformBuilderCallout tone={snapshotState === "error" ? "warning" : "success"}>
                                {snapshotMessage}
                            </PlatformBuilderCallout>
                        :   null}
                    </div>
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
