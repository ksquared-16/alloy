"use client";

import {
    BUSINESS_PROCESS_CATALOG_BACK,
} from "@/lib/lifecycle/businessProcessUiLabels";

export default function LifecycleProcessWorkspaceHeader({
    processName,
    description,
    trackCount,
    stageCount,
    queueCount,
    onBack,
}: {
    processName: string;
    description?: string | null;
    trackCount: number;
    stageCount: number;
    queueCount: number;
    onBack?: () => void;
}) {
    const stats: string[] = [];
    if (trackCount > 0) stats.push(`${trackCount} Track${trackCount === 1 ? "" : "s"}`);
    if (stageCount > 0) stats.push(`${stageCount} Stage${stageCount === 1 ? "" : "s"}`);
    if (queueCount > 0) stats.push(`${queueCount} Queue${queueCount === 1 ? "" : "s"}`);

    return (
        <header
            className="rounded-xl border border-alloy-forge/12 bg-white/90 px-4 py-3 shadow-sm"
            data-testid="lifecycle-process-workspace-header"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {onBack ? (
                        <button
                            type="button"
                            className="mb-1 text-[10px] font-medium text-alloy-midnight/45 hover:text-alloy-pine"
                            onClick={onBack}
                            data-testid="lifecycle-process-back"
                        >
                            ← {BUSINESS_PROCESS_CATALOG_BACK}
                        </button>
                    ) : null}
                    <h2 className="text-base font-semibold text-alloy-midnight">{processName}</h2>
                    {description?.trim() ? (
                        <p className="mt-0.5 text-xs text-alloy-midnight/55">{description.trim()}</p>
                    ) : null}
                    {stats.length ? (
                        <p className="mt-2 text-[11px] font-medium text-alloy-midnight/60" data-testid="lifecycle-process-stats">
                            {stats.join(" · ")}
                        </p>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
