"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationPrimaryButton,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import KpiTargetsPanel from "@/app/adminV2/settings/analytics/KpiTargetsPanel";
import OipVisibilityPanel from "@/app/adminV2/settings/analytics/OipVisibilityPanel";
import { OipSettingsProvider } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import MetricBuilderPanel from "@/app/adminV2/settings/analytics/MetricBuilderPanel";
import VisualizationBuilderPanel from "@/app/adminV2/settings/analytics/VisualizationBuilderPanel";
import PlacementBuilderPanel from "@/app/adminV2/settings/analytics/PlacementBuilderPanel";
import RollupBuilderPanel from "@/app/adminV2/settings/analytics/RollupBuilderPanel";
import MetricSetupFlow from "@/app/adminV2/settings/analytics/MetricSetupFlow";
import MetricSnapshotButton from "@/app/adminV2/settings/analytics/MetricSnapshotButton";

/** Left-rail sections — the modern settings list/detail pattern (Processes / Fields / Statuses). */
type SectionKey = "calculations" | "sources-targets" | "displays" | "snapshots" | "advanced";
type AdvancedKey = "placements" | "rollups" | "visibility";

const SECTIONS: { key: SectionKey; label: string; sub: string }[] = [
    { key: "calculations", label: "Calculations", sub: "Define what is measured" },
    { key: "sources-targets", label: "Sources & targets", sub: "Inputs and the goals they meet" },
    { key: "displays", label: "Displays", sub: "Default render style" },
    { key: "snapshots", label: "Snapshots", sub: "Point-in-time captures" },
    { key: "advanced", label: "Advanced", sub: "Platform internals" },
];

function sectionFromParam(raw: string | null): SectionKey {
    if (raw === "displays" || raw === "visualizations") return "displays";
    if (raw === "targets") return "sources-targets";
    if (raw === "snapshots") return "snapshots";
    if (raw === "placements" || raw === "rollups" || raw === "visibility") return "advanced";
    return "calculations";
}

function SnapshotsWorkspace() {
    return (
        <div className="process-config-setup-card overflow-hidden p-5">
            <p className="config-typo-workspace-title">Snapshots</p>
            <p className="config-typo-sublabel mt-1 max-w-md">
                Capture a point-in-time value for every active calculation. Snapshots back prior-period comparisons in the runtime.
            </p>
            <div className="mt-4">
                <MetricSnapshotButton />
            </div>
        </div>
    );
}

function AdvancedWorkspace({ tab, setTab, canEdit }: { tab: AdvancedKey; setTab: (t: AdvancedKey) => void; canEdit: boolean }) {
    const items: { key: AdvancedKey; label: string; note: string }[] = [
        { key: "placements", label: "Where it appears", note: "Placement lives in the Surface Builder now — this is the raw table." },
        { key: "rollups", label: "Combined scores", note: "Roll several metrics into one health score." },
        { key: "visibility", label: "Experience placement (legacy V1)", note: "Legacy visibility surface." },
    ];
    return (
        <div className="space-y-3">
            <p className="config-typo-sublabel">Platform internals — not the day-to-day flow. Placement and composition happen in Surfaces.</p>
            <div className="flex flex-wrap gap-2">
                {items.map((it) => (
                    <button
                        key={it.key}
                        type="button"
                        onClick={() => setTab(it.key)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${tab === it.key ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper" : "border-alloy-stone/25 text-alloy-midnight/60"}`}
                    >
                        {it.label}
                    </button>
                ))}
            </div>
            <p className="config-typo-sublabel">{items.find((i) => i.key === tab)?.note}</p>
            <div>
                {tab === "placements" ? <PlacementBuilderPanel canEdit={canEdit} /> : tab === "rollups" ? <RollupBuilderPanel canEdit={canEdit} /> : <OipVisibilityPanel canEdit={canEdit} />}
            </div>
        </div>
    );
}

function AnalyticsSettingsInner() {
    const searchParams = useSearchParams();
    const { canMutate } = useAdminAuth();
    const rawTab = searchParams.get("tab");
    const [sectionKey, setSectionKey] = useState<SectionKey>(() => sectionFromParam(rawTab));
    const [advancedTab, setAdvancedTab] = useState<AdvancedKey>(() =>
        rawTab === "rollups" || rawTab === "visibility" ? rawTab : "placements",
    );
    const [flowOpen, setFlowOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div className="process-config-page min-h-0 flex-1" data-adminv2-analytics-settings="true">
            <ConfigurationContext
                title="Operational Calculations"
                subtitle="Define the measurements — Lead Count, Tour Conversion, Needs Attention, Revenue. Compose them into cards in Surfaces; they render in the runtime."
                actions={canMutate ? <ConfigurationPrimaryButton onClick={() => setFlowOpen(true)}>+ New calculation</ConfigurationPrimaryButton> : null}
            />
            <ConfigurationShell
                testId="operational-calculations-shell"
                queueColumn={
                    <ConfigurationQueue title="Operational Calculations" summary="Define · place in Surfaces · render in runtime">
                        {SECTIONS.map((s) => (
                            <ConfigurationQueueItem
                                key={s.key}
                                active={sectionKey === s.key}
                                title={s.label}
                                subtitle={s.sub}
                                onClick={() => setSectionKey(s.key)}
                                testId={`operational-calculations-section-${s.key}`}
                            />
                        ))}
                    </ConfigurationQueue>
                }
            >
                <div key={refreshKey}>
                    {sectionKey === "calculations" ? (
                        <MetricBuilderPanel canEdit={canMutate} />
                    ) : sectionKey === "sources-targets" ? (
                        <KpiTargetsPanel canEdit={canMutate} />
                    ) : sectionKey === "displays" ? (
                        <VisualizationBuilderPanel canEdit={canMutate} />
                    ) : sectionKey === "snapshots" ? (
                        <SnapshotsWorkspace />
                    ) : (
                        <AdvancedWorkspace tab={advancedTab} setTab={setAdvancedTab} canEdit={canMutate} />
                    )}
                </div>
            </ConfigurationShell>

            <MetricSetupFlow open={flowOpen} onClose={() => setFlowOpen(false)} onComplete={() => setRefreshKey((k) => k + 1)} />
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
