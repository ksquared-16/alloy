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
                    className="config-primary-btn config-primary-btn--sm"
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
                            <p className="truncate text-[13px] font-semibold leading-snug text-alloy-midnight">{stage.label}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
