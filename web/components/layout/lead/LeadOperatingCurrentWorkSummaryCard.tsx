"use client";

import { useCallback, useState, type MouseEvent } from "react";
import CurrentWorkRuntimeCard from "@/components/workIntent/CurrentWorkRuntimeCard";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

function readStageWorkRuntime(record: ProofRuntimeRecord): StageWorkRuntimeProjection | null {
    const raw = record._stage_work_runtime;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as StageWorkRuntimeProjection;
}

function resolveCurrentWorkSummaryLine(runtime: StageWorkRuntimeProjection | null): string | null {
    if (!runtime?.primary) return null;
    const primary = runtime.primary;
    const label = primary.label?.trim() || primary.template_key?.trim();
    if (!label) return null;
    const state = primary.state === "open" ? "Open" : primary.state === "completed" ? "Completed" : "Planned";
    return `${label} · ${state}`;
}

type Props = {
    record: ProofRuntimeRecord;
    opportunityId: string;
    canMutate?: boolean;
};

/** Compact KPI Current Work tile — fixed height summary with expandable detail. */
export default function LeadOperatingCurrentWorkSummaryCard({ record, opportunityId, canMutate = true }: Props) {
    const runtime = readStageWorkRuntime(record);
    const summaryLine = resolveCurrentWorkSummaryLine(runtime);
    const itemCount = runtime ? [runtime.primary, ...runtime.additional].filter(Boolean).length : 0;
    const showMoreDetail = itemCount > 0;

    const [expanded, setExpanded] = useState(false);

    const toggle = useCallback(() => {
        if (!showMoreDetail) return;
        setExpanded((prev) => !prev);
    }, [showMoreDetail]);

    const stopBubble = (e: MouseEvent) => {
        e.stopPropagation();
    };

    if (!summaryLine) {
        return <p className="text-[11px] text-alloy-midnight/45">No current work configured for this stage.</p>;
    }

    return (
        <div
            className="flex min-h-0 flex-col gap-1"
            data-lead-current-work-summary-card="true"
            onClick={stopBubble}
        >
            <p className="line-clamp-2 text-[11px] leading-snug text-alloy-midnight/75">{summaryLine}</p>
            {itemCount > 1 ?
                <p className="text-[10px] text-alloy-midnight/45">
                    +{itemCount - 1} more item{itemCount - 1 === 1 ? "" : "s"}
                </p>
            :   null}
            {showMoreDetail ?
                <button
                    type="button"
                    className="self-start text-left text-[10px] font-medium text-alloy-midnight/55 underline-offset-2 hover:text-alloy-midnight/75 hover:underline"
                    data-lead-current-work-more-detail="true"
                    aria-expanded={expanded}
                    onClick={(e) => {
                        stopBubble(e);
                        toggle();
                    }}
                >
                    {expanded ? "Hide detail" : "View detail"}
                </button>
            :   null}
            {expanded ?
                <div className="mt-1 max-h-48 overflow-y-auto border-t border-alloy-stone/10 pt-2">
                    <CurrentWorkRuntimeCard
                        opportunityId={opportunityId}
                        runtime={runtime!}
                        canMutate={canMutate}
                        chromeless
                    />
                </div>
            :   null}
        </div>
    );
}
