"use client";

import { Home } from "lucide-react";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function pickLine(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

type Props = {
    record: ProofRuntimeRecord;
};

export default function PersonHouseholdSummaryCard({ record }: Props) {
    const household = pickLine(
        record["customer.household_name"],
        record._household_name,
        record.household_name,
    );
    const relationship = pickLine(record["person.relationship"], record.relationship_type);
    if (!household && !relationship) {
        return <p className="text-[11px] text-alloy-midnight/45">No household linked</p>;
    }
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-person-household-summary-card="true">
            {household ?
                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/80">{household}</p>
            :   null}
            {relationship ?
                <p className="text-[10px] text-alloy-midnight/45">{relationship}</p>
            :   null}
        </div>
    );
}

export function PersonHouseholdSummaryCardShell({ record }: Props) {
    return (
        <LeadOperatingSummaryCard
            title="Household"
            icon={<Home className="h-3.5 w-3.5" aria-hidden />}
            accent="neutral"
            widgetKey="household"
        >
            <PersonHouseholdSummaryCard record={record} />
        </LeadOperatingSummaryCard>
    );
}
