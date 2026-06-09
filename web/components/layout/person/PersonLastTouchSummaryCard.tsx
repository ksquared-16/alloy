"use client";

import { RotateCcw } from "lucide-react";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { resolvePersonSummaryLastTouch } from "@/lib/layout/runtime/resolvePersonSummaryLastTouch";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
};

export default function PersonLastTouchSummaryCard({ record }: Props) {
    const touch = resolvePersonSummaryLastTouch(record);
    if (touch.kind === "empty") {
        return <p className="text-[11px] text-alloy-midnight/45">{touch.emptyHint}</p>;
    }
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-person-last-touch-summary-card="true">
            {touch.primaryLine ?
                <p className="line-clamp-3 text-[11px] leading-snug text-alloy-midnight/75">{touch.primaryLine}</p>
            :   null}
            {touch.secondaryLine ?
                <p className="text-[10px] text-alloy-midnight/45">{touch.secondaryLine}</p>
            :   null}
        </div>
    );
}

export function PersonLastTouchSummaryCardShell({ record }: Props) {
    const touch = resolvePersonSummaryLastTouch(record);
    const hasContent = touch.kind !== "empty";
    return (
        <LeadOperatingSummaryCard
            title="Last Touch"
            icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
            accent={hasContent ? "neutral" : "muted"}
            minimized={!hasContent}
            widgetKey="last_touch"
        >
            <PersonLastTouchSummaryCard record={record} />
        </LeadOperatingSummaryCard>
    );
}
