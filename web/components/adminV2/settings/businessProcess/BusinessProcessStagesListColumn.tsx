"use client";

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { GRAIN_LABELS, type StageGrain } from "@/lib/lifecycle/stageGrainV1";

const GRAIN_COLORS: Record<StageGrain, { bg: string; text: string }> = {
    family: { bg: "bg-alloy-blue/10", text: "text-alloy-blue" },
    child: { bg: "bg-alloy-juniper/10", text: "text-alloy-juniper" },
    person: { bg: "bg-alloy-pine/10", text: "text-alloy-pine" },
    account: { bg: "bg-alloy-gold/20", text: "text-alloy-gold-dark" },
    work_item: { bg: "bg-alloy-midnight/8", text: "text-alloy-midnight/60" },
};

function StageConfigStatus({ stage }: { stage: LifecycleBuilderStageRecord }) {
    const hasGrain = !!stage.grain;
    const hasQueue = !!stage.queue_membership_v1 || !!stage.status_rollup_v1;
    const hasActions = (stage.action_catalog_v1?.candidate_actions.length ?? 0) > 0;
    const configured = hasGrain && hasQueue;

    if (!configured) {
        return (
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-ember/60" title="Configuration incomplete" />
        );
    }
    if (hasActions) {
        return (
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-juniper" title="Configured" />
        );
    }
    return null;
}

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
                    <h4 className="text-[12px] font-semibold text-alloy-midnight">Stages</h4>
                    <p className="text-[10px] text-alloy-midnight/45">{stages.length} configured</p>
                </div>
                <button
                    type="button"
                    onClick={onAddStageClick}
                    className="config-primary-btn config-primary-btn--sm"
                    data-testid="lifecycle-stage-tab-add"
                >
                    {addingStage ? "Adding…" : "+ Add"}
                </button>
            </div>
            <div className="space-y-1">
                {stages.map((stage, idx) => {
                    const active = stage.key === activeStageKey;
                    const grainStyle = stage.grain ? GRAIN_COLORS[stage.grain] : null;
                    return (
                        <button
                            key={stage.id}
                            type="button"
                            onClick={() => onSelect(stage)}
                            className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                active
                                    ? "border-alloy-juniper/30 bg-alloy-juniper/6 shadow-sm"
                                    : "border-transparent hover:border-alloy-forge/15 hover:bg-alloy-stone/60"
                            }`}
                            data-testid={`lifecycle-stage-tab-${stage.key}`}
                        >
                            <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-alloy-forge/8 text-[10px] font-semibold text-alloy-midnight/50">
                                {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className={`truncate text-[12px] font-semibold leading-snug ${active ? "text-alloy-midnight" : "text-alloy-midnight/80"}`}>
                                    {stage.label}
                                </p>
                                {stage.grain ? (
                                    <span
                                        className={`inline-flex rounded-full px-1.5 py-px text-[9px] font-semibold ${grainStyle?.bg ?? ""} ${grainStyle?.text ?? ""}`}
                                    >
                                        {GRAIN_LABELS[stage.grain]}
                                    </span>
                                ) : (
                                    <span className="inline-flex rounded-full bg-alloy-ember/10 px-1.5 py-px text-[9px] font-semibold text-alloy-ember">
                                        No grain
                                    </span>
                                )}
                            </div>
                            <StageConfigStatus stage={stage} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
