"use client";

import { GraduationCap } from "lucide-react";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

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
    const programCategoryValue = record["inquiry_child.program_category_id"];
    const program = pickLine(
        record["inquiry_child.program"],
        record["child.program"],
        isOpaqueIdValue(programCategoryValue) ? null : programCategoryValue,
        record.program_label,
    );
    const status = pickLine(
        record["inquiry_child.outcome_status_key"],
        record["child.status"],
        record.outcome_status_label,
    );
    if (!program && !status) {
        return <p className={PRESENTATION_EMPTY_STATE}>No program linked</p>;
    }
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-child-program-enrollment-summary-card="true">
            {program ?
                <p className={`line-clamp-2 ${PRESENTATION_DATA_VALUE_COMPACT}`}>{program}</p>
            :   null}
            {status ?
                <p className={PRESENTATION_SUPPORTING}>{status}</p>
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
