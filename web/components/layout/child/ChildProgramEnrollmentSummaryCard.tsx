"use client";

import { GraduationCap } from "lucide-react";
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

export default function ChildProgramEnrollmentSummaryCard({ record }: Props) {
    const program = pickLine(
        record["inquiry_child.program"],
        record["inquiry_child.desired_program_type"],
        record.program_label,
    );
    const status = pickLine(
        record["inquiry_child.outcome_status_key"],
        record["child.status"],
        record.outcome_status_label,
    );
    if (!program && !status) {
        return <p className="text-[11px] text-alloy-midnight/45">No program linked</p>;
    }
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-child-program-enrollment-summary-card="true">
            {program ?
                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/80">{program}</p>
            :   null}
            {status ?
                <p className="text-[10px] text-alloy-midnight/45">{status}</p>
            :   null}
        </div>
    );
}

export function ChildProgramEnrollmentSummaryCardShell({ record }: Props) {
    return (
        <LeadOperatingSummaryCard
            title="Program"
            icon={<GraduationCap className="h-3.5 w-3.5" aria-hidden />}
            accent="work"
            widgetKey="program_enrollment"
        >
            <ChildProgramEnrollmentSummaryCard record={record} />
        </LeadOperatingSummaryCard>
    );
}
