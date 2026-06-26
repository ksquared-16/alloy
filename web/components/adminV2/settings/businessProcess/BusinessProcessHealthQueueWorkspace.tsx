"use client";

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

export default function BusinessProcessHealthListColumn({
    stages,
    activeStageKey,
    onSelect,
    runtimeSummary,
}: {
    stages: LifecycleBuilderStageRecord[];
    activeStageKey: string;
    onSelect: (stage: LifecycleBuilderStageRecord) => void;
    runtimeSummary: "unknown" | "pass" | "fail";
}) {
    return (
        <div className="space-y-3" data-testid="business-process-health-list-column">
            <div>
                <h4 className="text-sm font-semibold text-alloy-midnight">Health checks</h4>
                <p className="text-[11px] text-alloy-midnight/50">{stages.length} stages</p>
            </div>
            <div className="space-y-2">
                {stages.map((stage) => {
                    const active = stage.key === activeStageKey;
                    const ready = runtimeSummary === "pass";
                    const review = runtimeSummary === "fail" || runtimeSummary === "unknown";
                    return (
                        <button
                            key={stage.id}
                            type="button"
                            onClick={() => onSelect(stage)}
                            className={`process-config-work-view-list-card ${active ? "process-config-work-view-list-card--active" : ""}`}
                            data-testid={`business-process-health-stage-${stage.key}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-alloy-midnight">{stage.label}</p>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                        ready
                                            ? "bg-alloy-pine/10 text-alloy-pine"
                                            : review
                                              ? "bg-amber-500/10 text-amber-800/80"
                                              : "bg-alloy-forge/8 text-alloy-midnight/45"
                                    }`}
                                >
                                    {ready ? "Ready" : review ? "Review" : "Pending"}
                                </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Ready check & recommendations</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
