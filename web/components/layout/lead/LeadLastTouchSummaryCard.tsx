"use client";

import { MessageSquare, StickyNote, Activity } from "lucide-react";
import type { LeadSummaryLastTouchResolution } from "@/lib/layout/runtime/resolveLeadSummaryLastTouch";

type Props = {
    touch: LeadSummaryLastTouchResolution;
};

export default function LeadLastTouchSummaryCard({ touch }: Props) {
    const icon =
        touch.kind === "note" ? <StickyNote className="h-3.5 w-3.5" aria-hidden />
        : touch.kind === "communication" ? <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        : touch.kind === "activity" ? <Activity className="h-3.5 w-3.5" aria-hidden />
        :   <MessageSquare className="h-3.5 w-3.5 opacity-40" aria-hidden />;

    return (
        <div
            className="flex min-h-0 flex-col gap-1"
            data-lead-last-touch-summary="true"
            data-lead-last-touch-kind={touch.kind}
        >
            <div className="flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 text-alloy-juniper/70">{icon}</span>
                <div className="min-w-0 flex-1">
                    {touch.primaryLine ?
                        <p
                            className={`line-clamp-2 text-[11px] leading-snug ${touch.kind === "empty" ? "text-alloy-midnight/45" : "font-medium text-alloy-midnight/80"}`}
                        >
                            {touch.primaryLine}
                        </p>
                    :   null}
                    {touch.secondaryLine ?
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">
                            {touch.secondaryLine}
                        </p>
                    :   null}
                    {touch.kind === "empty" && touch.emptyHint ?
                        <p className="mt-1 text-[10px] text-alloy-midnight/40" data-lead-last-touch-empty-hint="true">
                            {touch.emptyHint}
                        </p>
                    :   null}
                </div>
            </div>
        </div>
    );
}
