"use client";

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

export default function LifecycleStageNav({
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
        <div
            className="flex flex-wrap items-center gap-1 border-b border-alloy-forge/10 pb-2"
            role="tablist"
            aria-label="Stages"
            data-testid="lifecycle-stage-tabs"
        >
            {stages.map((stage) => {
                const active = stage.key === activeStageKey;
                return (
                    <button
                        key={stage.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            active
                                ? "bg-alloy-pine text-white"
                                : "bg-alloy-stone/15 text-alloy-midnight/70 hover:bg-alloy-stone/25"
                        }`}
                        onClick={() => onSelect(stage)}
                        data-testid={`lifecycle-stage-tab-${stage.key}`}
                    >
                        {stage.label}
                    </button>
                );
            })}
            <button
                type="button"
                className="rounded-md border border-alloy-forge/20 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/75 hover:bg-alloy-stone/10"
                onClick={onAddStageClick}
                data-testid="lifecycle-stage-tab-add"
            >
                {addingStage ? "Adding…" : "+ Add Stage"}
            </button>
        </div>
    );
}
