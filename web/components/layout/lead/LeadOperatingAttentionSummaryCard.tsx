"use client";

import { useCallback, useState, type MouseEvent } from "react";
import QueueRecordAttentionPopover from "@/components/layout/queueRecord/QueueRecordAttentionPopover";
import {
    layoutRuntimeAttentionHasMoreGuidance,
    mergeLayoutRuntimeAttentionOverview,
    resolveLayoutRuntimeAttentionGuidanceLines,
    resolveLayoutRuntimeAttentionSummaryLine,
} from "@/lib/layout/runtime/resolveLayoutRuntimeAttentionGuidance";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
};

/** Compact lead summary-strip attention card with More guidance parity to drawer header. */
export default function LeadOperatingAttentionSummaryCard({ record }: Props) {
    const overview = mergeLayoutRuntimeAttentionOverview(record);
    const summaryLine = resolveLayoutRuntimeAttentionSummaryLine(overview);
    const guidanceLines = resolveLayoutRuntimeAttentionGuidanceLines(overview, summaryLine);
    const showMoreGuidance = layoutRuntimeAttentionHasMoreGuidance(overview, summaryLine);

    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const closePopover = useCallback(() => {
        setOpen(false);
        setAnchorEl(null);
    }, []);

    const togglePopover = useCallback(
        (el: HTMLElement) => {
            if (!showMoreGuidance) return;
            setOpen((prev) => {
                if (prev) {
                    setAnchorEl(null);
                    return false;
                }
                setAnchorEl(el);
                return true;
            });
        },
        [showMoreGuidance],
    );

    const stopBubble = (e: MouseEvent) => {
        e.stopPropagation();
    };

    if (!summaryLine) {
        return <p className="text-[11px] text-alloy-midnight/45">No attention needed</p>;
    }

    return (
        <div
            className="flex min-h-0 flex-col gap-1"
            data-lead-attention-summary-card="true"
            onClick={stopBubble}
        >
            <p className="line-clamp-3 text-[11px] leading-snug text-alloy-midnight/75">{summaryLine}</p>
            {showMoreGuidance ?
                <button
                    type="button"
                    className="self-start text-left text-[10px] font-medium text-alloy-midnight/55 underline-offset-2 hover:text-alloy-midnight/75 hover:underline"
                    data-lead-attention-more-guidance="true"
                    data-testid="header-attention-more-guidance"
                    aria-expanded={open}
                    onClick={(e) => {
                        stopBubble(e);
                        togglePopover(e.currentTarget);
                    }}
                >
                    More guidance
                </button>
            :   null}
            {open && anchorEl ?
                <QueueRecordAttentionPopover
                    anchorEl={anchorEl}
                    title={summaryLine}
                    lines={guidanceLines}
                    onClose={closePopover}
                />
            :   null}
        </div>
    );
}
