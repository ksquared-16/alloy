"use client";

import { LIFECYCLE_PRIMARY_ENTITIES } from "@/lib/lifecycle/lifecycleConfiguration";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

export default function LifecycleWorkbenchHeader({
    activeProcess,
    stages,
    activeStageKey,
    showLifecyclePicker,
    savedLifecycles,
    onStageSelect,
    onSwitchLifecycle,
    onStartNew,
    onBackToLanding,
}: {
    activeProcess: LifecycleBuilderProcessRecord;
    stages: LifecycleBuilderStageRecord[];
    activeStageKey: string;
    showLifecyclePicker: boolean;
    savedLifecycles: LifecycleBuilderProcessRecord[];
    onStageSelect: (stageKey: string) => void;
    onSwitchLifecycle: (processId: string) => void;
    onStartNew: () => void;
    onBackToLanding: () => void;
}) {
    const primaryLabel =
        LIFECYCLE_PRIMARY_ENTITIES.find((e) => e.key === activeProcess.primary_entity)?.label ??
        activeProcess.primary_entity;

    return (
        <header className="space-y-3" data-testid="lifecycle-workbench-header">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-alloy-forge/12 bg-white/70 px-4 py-3">
                <div>
                    <h2 className="text-base font-semibold text-alloy-midnight" data-testid="lifecycle-workbench-name">
                        {activeProcess.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/55">
                        Primary record: <span className="font-medium">{primaryLabel}</span>
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded-md border border-alloy-forge/20 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                        onClick={onStartNew}
                        data-testid="lifecycle-workbench-start-new"
                    >
                        Start new lifecycle
                    </button>
                    {savedLifecycles.length > 1 || showLifecyclePicker ? (
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/20 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            onClick={onBackToLanding}
                            data-testid="lifecycle-workbench-open-existing"
                        >
                            Open existing lifecycle
                        </button>
                    ) : null}
                </div>
            </div>

            {showLifecyclePicker && savedLifecycles.length > 1 ? (
                <label className="flex max-w-xs flex-col gap-1 text-xs font-medium text-alloy-midnight/70">
                    Switch lifecycle
                    <select
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-sm"
                        value={activeProcess.id}
                        onChange={(e) => onSwitchLifecycle(e.target.value)}
                        data-testid="lifecycle-process-select"
                    >
                        {savedLifecycles.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}

            {stages.length > 0 ? (
                <div className="flex flex-wrap gap-1" role="tablist" aria-label="Stages" data-testid="lifecycle-stage-tabs">
                    {stages.map((stage) => (
                        <button
                            key={stage.id}
                            type="button"
                            role="tab"
                            aria-selected={stage.key === activeStageKey}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                stage.key === activeStageKey
                                    ? "bg-alloy-pine text-white"
                                    : "bg-alloy-stone/15 text-alloy-midnight/70 hover:bg-alloy-stone/25"
                            }`}
                            onClick={() => onStageSelect(stage.key)}
                            data-testid={`lifecycle-stage-tab-${stage.key}`}
                        >
                            {stage.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </header>
    );
}
