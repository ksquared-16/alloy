"use client";

import { Users } from "lucide-react";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { summarizeChildDrawerFamilyStrip } from "@/lib/layout/runtime/childOverviewComposition";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
};

export default function ChildFamilySummaryCard({ record }: Props) {
    const summary = summarizeChildDrawerFamilyStrip(record);
    if (summary.count === 0) {
        return <p className="text-[11px] text-alloy-midnight/45">{summary.label}</p>;
    }
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-child-family-summary-card="true">
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/80">{summary.label}</p>
            {summary.roleSummary ?
                <p className="text-[10px] text-alloy-midnight/45">{summary.roleSummary}</p>
            :   null}
        </div>
    );
}

export function ChildFamilySummaryCardShell({ record }: Props) {
    return (
        <LeadOperatingSummaryCard
            title="Family"
            icon={<Users className="h-3.5 w-3.5" aria-hidden />}
            accent="neutral"
            widgetKey="family"
        >
            <ChildFamilySummaryCard record={record} />
        </LeadOperatingSummaryCard>
    );
}
