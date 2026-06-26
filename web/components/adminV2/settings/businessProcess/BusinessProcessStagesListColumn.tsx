"use client";

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { BUSINESS_PROCESS_NAV_STAGES } from "@/lib/lifecycle/businessProcessUiLabels";

export default function BusinessProcessStagesListColumn({
    stages,
    activeStageKey,
    onSelect,
    onAddStageClick,
    addingStage,
}: {
    stages: LifecycleBuilderStageRecord[];
    activeStageKey: string;
    onSelect: (stage: LifecycleBuilderStageRecord) => void;
    onAddStageClick: () => void;
    addingStage?: boolean;
}) {
    return (
        <div className="space-y-3" data-testid="business-process-stages-list-column">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h4 className="text-sm font-semibold text-alloy-midnight">{BUSINESS_PROCESS_NAV_STAGES}</h4>
                    <p className="text-[11px] text-alloy-midnight/50">{stages.length} configured</p>
                </div>
                <button
                    type="button"
                    onClick={onAddStageClick}
                    className="rounded-lg border border-alloy-pine/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-pine hover:bg-alloy-pine/[0.05]"
                    data-testid="lifecycle-stage-tab-add"
                >
                    {addingStage ? "Adding…" : "+ Add Stage"}
                </button>
            </div>
            <div className="space-y-2">
                {stages.map((stage) => {
                    const active = stage.key === activeStageKey;
                    return (
                        <button
                            key={stage.id}
                            type="button"
                            onClick={() => onSelect(stage)}
                            className={`process-config-work-view-list-card ${active ? "process-config-work-view-list-card--active" : ""}`}
                            data-testid={`lifecycle-stage-tab-${stage.key}`}
                        >
                            <p className="truncate text-sm font-semibold text-alloy-midnight">{stage.label}</p>
                            <p className="mt-0.5 truncate text-[11px] text-alloy-midnight/50">Stage configuration</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
