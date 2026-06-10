"use client";

import { MessageSquare, StickyNote, Activity } from "lucide-react";
import type { LeadSummaryLastTouchResolution } from "@/lib/layout/runtime/resolveLeadSummaryLastTouch";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_EMPTY_STATE_SOFT,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

type Props = {
    touch: LeadSummaryLastTouchResolution;
};

export default function LeadLastTouchSummaryCard({ touch }: Props) {
    const icon =
        touch.kind === "note" ? <StickyNote className="h-3.5 w-3.5" aria-hidden />
        : touch.kind === "communication" ? <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        : touch.kind === "activity" ? <Activity className="h-3.5 w-3.5" aria-hidden />
        :   <MessageSquare className="h-3.5 w-3.5 opacity-40" aria-hidden />;

    const isEmpty = touch.kind === "empty";

    return (
        <div
            className="flex min-h-0 flex-col gap-1"
            data-lead-last-touch-summary="true"
            data-lead-last-touch-kind={touch.kind}
        >
            <div className="flex items-start gap-1.5">
                <span className={`mt-0.5 shrink-0 ${isEmpty ? "text-alloy-midnight/35" : "text-alloy-juniper/70"}`}>
                    {icon}
                </span>
                <div className="min-w-0 flex-1">
                    {touch.primaryLine ?
                        <p className={`line-clamp-2 leading-snug ${isEmpty ? PRESENTATION_EMPTY_STATE : PRESENTATION_DATA_VALUE_COMPACT}`}>
                            {touch.primaryLine}
                        </p>
                    :   null}
                    {touch.secondaryLine ?
                        <p className={`mt-0.5 line-clamp-2 ${PRESENTATION_SUPPORTING}`}>
                            {touch.secondaryLine}
                        </p>
                    :   null}
                    {isEmpty && touch.emptyHint ?
                        <p className={`mt-1 ${PRESENTATION_EMPTY_STATE_SOFT}`} data-lead-last-touch-empty-hint="true">
                            {touch.emptyHint}
                        </p>
                    :   null}
                </div>
            </div>
        </div>
    );
}
