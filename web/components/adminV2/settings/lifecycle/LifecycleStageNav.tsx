"use client";

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

export default function LifecycleStageNav({
    stages,
    activeStageKey,
    onSelect,
    onAddStageClick,
    addingStage,
    onReorderStage,
    reorderBusy = false,
}: {
    stages: LifecycleBuilderStageRecord[];
    activeStageKey: string;
    onSelect: (stage: LifecycleBuilderStageRecord) => void;
    onAddStageClick: () => void;
    addingStage?: boolean;
    onReorderStage?: (stageId: string, direction: "up" | "down") => void | Promise<void>;
    reorderBusy?: boolean;
}) {
    return (
        <div
            className="flex flex-wrap items-center gap-1 border-b border-alloy-forge/10 pb-2"
            role="tablist"
            aria-label="Stages"
            data-testid="lifecycle-stage-tabs"
        >
            {stages.map((stage, idx) => {
                const active = stage.key === activeStageKey;
                return (
                    <div key={stage.id} className="flex items-center gap-0.5">
                        <button
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
                        {active && onReorderStage ? (
                            <>
                                <button
                                    type="button"
                                    title="Move stage earlier"
                                    className="rounded px-1 text-[10px] text-alloy-midnight/50 hover:bg-alloy-stone/20 disabled:opacity-30"
                                    disabled={reorderBusy || idx === 0}
                                    onClick={() => void onReorderStage(stage.id, "up")}
                                    data-testid={`lifecycle-stage-reorder-up-${stage.key}`}
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    title="Move stage later"
                                    className="rounded px-1 text-[10px] text-alloy-midnight/50 hover:bg-alloy-stone/20 disabled:opacity-30"
                                    disabled={reorderBusy || idx === stages.length - 1}
                                    onClick={() => void onReorderStage(stage.id, "down")}
                                    data-testid={`lifecycle-stage-reorder-down-${stage.key}`}
                                >
                                    ↓
                                </button>
                            </>
                        ) : null}
                    </div>
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
