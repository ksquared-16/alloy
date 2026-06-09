"use client";

import { Baby } from "lucide-react";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { summarizePersonDrawerChildrenStrip } from "@/lib/layout/runtime/personOverviewComposition";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
};

export default function PersonConnectedChildrenSummaryCard({ record }: Props) {
    const summary = summarizePersonDrawerChildrenStrip(record);
    if (summary.count === 0) {
        return <p className="text-[11px] text-alloy-midnight/45">{summary.label}</p>;
    }
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-person-connected-children-summary-card="true">
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/80">{summary.label}</p>
            {summary.statusSummary ?
                <p className="text-[10px] text-alloy-midnight/45">{summary.statusSummary}</p>
            :   null}
        </div>
    );
}

export function PersonConnectedChildrenSummaryCardShell({ record }: Props) {
    return (
        <LeadOperatingSummaryCard
            title="Children"
            icon={<Baby className="h-3.5 w-3.5" aria-hidden />}
            accent="work"
            widgetKey="connected_children"
        >
            <PersonConnectedChildrenSummaryCard record={record} />
        </LeadOperatingSummaryCard>
    );
}
