"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { TriangleAlert } from "lucide-react";
import QueueRecordAttentionPopover from "@/components/layout/queueRecord/QueueRecordAttentionPopover";
import {
    layoutRuntimeAttentionHasMoreGuidance,
    mergeLayoutRuntimeAttentionOverview,
    resolveLayoutRuntimeAttentionGuidanceLines,
    resolveLayoutRuntimeAttentionSummaryLine,
} from "@/lib/layout/runtime/resolveLayoutRuntimeAttentionGuidance";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function stopRowOpen(e: MouseEvent) {
    e.stopPropagation();
}

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
};

/** Compact queue-row attention widget — mirrors drawer attention with guidance popover. */
export default function QueueRecordAttentionWidget({ record, title = "Attention" }: Props) {
    const overview = useMemo(() => mergeLayoutRuntimeAttentionOverview(record), [record]);
    const summaryLine = useMemo(() => resolveLayoutRuntimeAttentionSummaryLine(overview), [overview]);
    const guidanceLines = useMemo(
        () => resolveLayoutRuntimeAttentionGuidanceLines(overview, summaryLine),
        [overview, summaryLine],
    );
    const showMoreGuidance = useMemo(
        () => layoutRuntimeAttentionHasMoreGuidance(overview, summaryLine),
        [overview, summaryLine],
    );

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

    if (!summaryLine) {
        return (
            <div
                className="queue-record-widget queue-record-widget--attention queue-record-widget--empty"
                data-queue-attention-widget="true"
                data-queue-row-interactive="true"
                onClick={stopRowOpen}
            >
                <div className="queue-record-widget__label">{title}</div>
                <div className="queue-record-widget__body">
                    <span className="queue-record-widget__empty">No attention items</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="queue-record-widget queue-record-widget--attention"
            data-queue-attention-widget="true"
            data-queue-row-interactive="true"
            onClick={stopRowOpen}
        >
            <div className="queue-record-widget__label">{title}</div>
            <div className="queue-record-widget__body">
            <div className="queue-record-widget__attention-card">
                <div className="queue-record-widget__attention-summary">
                    <TriangleAlert className="queue-record-widget__attention-icon" aria-hidden />
                    <span className="queue-record-widget__attention-text">{summaryLine}</span>
                </div>
                {showMoreGuidance ?
                    <button
                        type="button"
                        className="queue-record-widget__more-guidance"
                        data-queue-attention-more-guidance="true"
                        data-testid="header-attention-more-guidance"
                        aria-expanded={open}
                        onClick={(e) => {
                            stopRowOpen(e);
                            togglePopover(e.currentTarget);
                        }}
                    >
                        More guidance
                    </button>
                :   null}
            </div>
            </div>
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
