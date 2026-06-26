"use client";

import LifecycleStagePresentationCard from "@/components/adminV2/settings/lifecycle/LifecycleStagePresentationCard";
import LifecycleTrackStageNav from "@/components/adminV2/settings/lifecycle/LifecycleTrackStageNav";
import LifecycleStageNav from "@/components/adminV2/settings/lifecycle/LifecycleStageNav";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";

export default function BusinessProcessPresentationWorkspace({
    businessProcessKey,
    stageKey,
    stageLabel,
    processTracks,
    builderProcess,
    navStages,
    onSelectStage,
    onAddStageClick,
    onReorderStage,
    reorderBusy,
}: {
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
    processTracks: ProcessTracksV1 | null;
    builderProcess: LifecycleBuilderProcessRecord | null;
    navStages: LifecycleBuilderStageRecord[];
    onSelectStage: (stage: LifecycleBuilderStageRecord) => void;
    onAddStageClick?: () => void;
    onReorderStage?: (stageId: string, direction: "up" | "down") => void | Promise<void>;
    reorderBusy?: boolean;
}) {
    return (
        <div className="space-y-5" data-testid="business-process-presentation-workspace">
            <header className="config-runtime-hero px-5 py-4">
                <h3 className="text-xl font-semibold text-alloy-midnight">Presentation</h3>
                <p className="mt-2 text-sm leading-relaxed text-alloy-midnight/65">
                    Assign queue and Focus Panel layouts for each stage. Layout content is authored in Experience Builder.
                </p>
            </header>

            <div data-testid="presentation-stage-nav">
                {processTracks && builderProcess ?
                    <LifecycleTrackStageNav
                        tracks={processTracks}
                        builderProcess={builderProcess}
                        activeStageKey={stageKey}
                        onSelect={onSelectStage}
                        onAddStageClick={onAddStageClick ?? (() => {})}
                        onReorderStage={onReorderStage}
                        reorderBusy={reorderBusy}
                    />
                :   <LifecycleStageNav
                        stages={navStages}
                        activeStageKey={stageKey}
                        onSelect={onSelectStage}
                        onAddStageClick={onAddStageClick ?? (() => {})}
                        onReorderStage={onReorderStage}
                        reorderBusy={reorderBusy}
                    />
                }
            </div>

            {stageKey.trim() ?
                <div className="config-runtime-operational-card p-5">
                    <LifecycleStagePresentationCard
                        businessProcessKey={businessProcessKey}
                        stageKey={stageKey}
                        stageLabel={stageLabel}
                    />
                </div>
            :   <p className="text-sm text-alloy-midnight/50">Select a stage to configure presentation.</p>}
        </div>
    );
}
