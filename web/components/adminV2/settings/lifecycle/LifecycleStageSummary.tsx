"use client";

import type { EnrollmentStatusStageRow } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

export default function LifecycleStageSummary({
    stageLabel,
    stageMeaning,
    statusRows,
}: {
    stageLabel: string;
    stageMeaning?: string;
    statusRows: EnrollmentStatusStageRow[];
}) {
    const labels = statusRows.map((s) => s.status_label);

    return (
        <div
            className="rounded-xl border border-alloy-pine/15 bg-alloy-pine/[0.04] px-4 py-3"
            data-testid="lifecycle-stage-summary"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">{stageLabel}</h2>
                    {stageMeaning ? (
                        <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-alloy-midnight/60">
                            {stageMeaning}
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="mt-2" data-testid="lifecycle-stage-summary-statuses">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Statuses in this stage
                </p>
                {labels.length ? (
                    <p className="mt-1 text-xs text-alloy-midnight/80">{labels.join(" · ")}</p>
                ) : (
                    <p className="mt-1 text-xs text-alloy-midnight/50">
                        No opportunity statuses assigned yet — add them in the Statuses card below.
                    </p>
                )}
            </div>
        </div>
    );
}
