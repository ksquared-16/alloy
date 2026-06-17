"use client";

import { useCallback, useState, type MouseEvent } from "react";
import CurrentWorkDetailPopover from "@/components/layout/lead/CurrentWorkDetailPopover";
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

/** Compact KPI Current Work tile — fixed height summary with overlay detail. */
export default function LeadOperatingCurrentWorkSummaryCard({ record, opportunityId, canMutate = true }: Props) {
    const runtime = readStageWorkRuntime(record);
    const summaryLine = resolveCurrentWorkSummaryLine(runtime);
    const itemCount = runtime ? [runtime.primary, ...runtime.additional].filter(Boolean).length : 0;
    const showMoreDetail = itemCount > 0;

    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const closePopover = useCallback(() => {
        setOpen(false);
        setAnchorEl(null);
    }, []);

    const togglePopover = useCallback(
        (el: HTMLElement) => {
            if (!showMoreDetail || !runtime) return;
            setOpen((prev) => {
                if (prev) {
                    setAnchorEl(null);
                    return false;
                }
                setAnchorEl(el);
                return true;
            });
        },
        [runtime, showMoreDetail],
    );

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
            {!open ?
                <>
                    <p className="line-clamp-2 text-[11px] leading-snug text-alloy-midnight/75">{summaryLine}</p>
                    {itemCount > 1 ?
                        <p className="text-[10px] text-alloy-midnight/45">
                            +{itemCount - 1} more item{itemCount - 1 === 1 ? "" : "s"}
                        </p>
                    :   null}
                </>
            :   null}
            {showMoreDetail ?
                <button
                    type="button"
                    className="self-start text-left text-[10px] font-medium text-alloy-midnight/55 underline-offset-2 hover:text-alloy-midnight/75 hover:underline"
                    data-lead-current-work-more-detail="true"
                    aria-expanded={open}
                    onClick={(e) => {
                        stopBubble(e);
                        togglePopover(e.currentTarget);
                    }}
                >
                    {open ? "Hide detail" : "View detail"}
                </button>
            :   null}
            {open && anchorEl && runtime ?
                <CurrentWorkDetailPopover
                    anchorEl={anchorEl}
                    title={summaryLine}
                    opportunityId={opportunityId}
                    runtime={runtime}
                    canMutate={canMutate}
                    onClose={closePopover}
                />
            :   null}
        </div>
    );
}
