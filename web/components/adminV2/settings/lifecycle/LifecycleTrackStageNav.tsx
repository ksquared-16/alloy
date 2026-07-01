"use client";

import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import { stagesForTrack } from "@/lib/businessProcesses/businessProcessConfigReader";

function StageChip({
    stage,
    active,
    onSelect,
    onReorderStage,
    reorderBusy,
    canReorderUp,
    canReorderDown,
}: {
    stage: LifecycleBuilderStageRecord;
    active: boolean;
    onSelect: () => void;
    onReorderStage?: (stageId: string, direction: "up" | "down") => void | Promise<void>;
    reorderBusy?: boolean;
    canReorderUp: boolean;
    canReorderDown: boolean;
}) {
    return (
        <div className="flex items-center gap-0.5">
            <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    active
                        ? "bg-alloy-pine text-white"
                        : "bg-alloy-stone/12 text-alloy-midnight/75 hover:bg-alloy-stone/20"
                }`}
                onClick={onSelect}
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
                        disabled={reorderBusy || !canReorderUp}
                        onClick={() => void onReorderStage(stage.id, "up")}
                        data-testid={`lifecycle-stage-reorder-up-${stage.key}`}
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        title="Move stage later"
                        className="rounded px-1 text-[10px] text-alloy-midnight/50 hover:bg-alloy-stone/20 disabled:opacity-30"
                        disabled={reorderBusy || !canReorderDown}
                        onClick={() => void onReorderStage(stage.id, "down")}
                        data-testid={`lifecycle-stage-reorder-down-${stage.key}`}
                    >
                        ↓
                    </button>
                </>
            ) : null}
        </div>
    );
}

/** Track-grouped stage navigation — stages are not presented as one flat list. */
export default function LifecycleTrackStageNav({
    tracks,
    builderProcess,
    activeStageKey,
    onSelect,
    onAddStageClick,
    addingStage,
    onReorderStage,
    reorderBusy = false,
}: {
    tracks: ProcessTracksV1;
    builderProcess: LifecycleBuilderProcessRecord;
    activeStageKey: string;
    onSelect: (stage: LifecycleBuilderStageRecord) => void;
    onAddStageClick: () => void;
    addingStage?: boolean;
    onReorderStage?: (stageId: string, direction: "up" | "down") => void | Promise<void>;
    reorderBusy?: boolean;
}) {
    const sortedTracks = [...tracks.tracks].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <nav
            className="space-y-3 rounded-xl border border-alloy-forge/12 bg-white/60 px-3 py-3"
            aria-label="Process stages by track"
            data-testid="lifecycle-track-stage-nav"
        >
            {sortedTracks.map((track) => {
                const stages = stagesForTrack(builderProcess, track.key);
                if (!stages.length) return null;
                return (
                    <div key={track.key} data-testid={`lifecycle-track-group-${track.key}`}>
                        <p
                            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45"
                            data-testid={`lifecycle-track-label-${track.key}`}
                        >
                            {track.label}
                        </p>
                        <div className="flex flex-wrap gap-1" role="group" aria-label={`${track.label} stages`}>
                            {stages.map((stage, idx) => (
                                <StageChip
                                    key={stage.id}
                                    stage={stage}
                                    active={stage.key === activeStageKey}
                                    onSelect={() => onSelect(stage)}
                                    onReorderStage={onReorderStage}
                                    reorderBusy={reorderBusy}
                                    canReorderUp={idx > 0}
                                    canReorderDown={idx < stages.length - 1}
                                />
                            ))}
                        </div>
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
        </nav>
    );
}
