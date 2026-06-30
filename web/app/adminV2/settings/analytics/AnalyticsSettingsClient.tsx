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
type SectionKey = "calculations" | "targets" | "sources" | "advanced";
type AdvancedKey = "displays" | "placements" | "rollups" | "snapshots" | "visibility";

const SECTIONS: { key: SectionKey; label: string; sub: string }[] = [
    { key: "calculations", label: "Calculations", sub: "Define what is measured" },
    { key: "targets", label: "Targets", sub: "Goals a metric is judged against" },
    { key: "sources", label: "Sources", sub: "Where values come from" },
    { key: "advanced", label: "Advanced", sub: "Displays, snapshots, internals" },
];

function sectionFromParam(raw: string | null): SectionKey {
    if (raw === "targets") return "targets";
    if (raw === "sources") return "sources";
    if (raw === "displays" || raw === "visualizations" || raw === "snapshots" || raw === "placements" || raw === "rollups" || raw === "visibility") return "advanced";
    return "calculations";
}

function SourcesWorkspace() {
    return (
        <div className="process-config-setup-card overflow-hidden p-5">
            <p className="config-typo-workspace-title">Sources</p>
            <p className="config-typo-sublabel mt-1 max-w-md">
                Data sources are system-provided — each calculation reads from a governed source (OIP adapters, ledger, attendance). More sources are added as Alloy expands.
            </p>
        </div>
    );
}

function AdvancedWorkspace({ tab, setTab, canEdit }: { tab: AdvancedKey; setTab: (t: AdvancedKey) => void; canEdit: boolean }) {
    const items: { key: AdvancedKey; label: string; note: string }[] = [
        { key: "displays", label: "Displays", note: "A metric's default render style. How a card looks is chosen in Surfaces, per card." },
        { key: "snapshots", label: "Snapshots", note: "Capture a point-in-time value for every active calculation — backs prior-period comparison." },
        { key: "placements", label: "Where it appears", note: "Placement lives in the Surface Builder now — this is the raw table." },
        { key: "rollups", label: "Combined scores", note: "Roll several metrics into one health score." },
        { key: "visibility", label: "Experience placement (legacy V1)", note: "Legacy visibility surface." },
    ];
    return (
        <div className="space-y-3" data-analytics-legacy-advanced="true">
            <p className="config-typo-sublabel">Platform internals — not the day-to-day flow. Display treatment and placement happen in Surfaces, per card.</p>
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
                {tab === "displays" ? <VisualizationBuilderPanel canEdit={canEdit} /> :
                 tab === "snapshots" ? <MetricSnapshotButton /> :
                 tab === "placements" ? <PlacementBuilderPanel canEdit={canEdit} /> :
                 tab === "rollups" ? <RollupBuilderPanel canEdit={canEdit} /> :
                 <OipVisibilityPanel canEdit={canEdit} />}
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
        rawTab === "snapshots" || rawTab === "placements" || rawTab === "rollups" || rawTab === "visibility" ? rawTab : "displays",
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
                    ) : sectionKey === "targets" ? (
                        <KpiTargetsPanel canEdit={canMutate} />
                    ) : sectionKey === "sources" ? (
                        <SourcesWorkspace />
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
