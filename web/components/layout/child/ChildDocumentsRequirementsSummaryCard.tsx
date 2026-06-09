"use client";

import { FileText } from "lucide-react";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
};

function readDocuments(record: ProofRuntimeRecord): unknown[] {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    const docs = record.documents ?? overview.documents ?? record._documents_preview;
    return Array.isArray(docs) ? docs : [];
}

export default function ChildDocumentsRequirementsSummaryCard({ record }: Props) {
    const docs = readDocuments(record);
    if (docs.length === 0) {
        return <p className="text-[11px] text-alloy-midnight/45">No documents yet</p>;
    }
    const missing = docs.filter((d) => {
        const row = d as Record<string, unknown>;
        const status = String(row.status ?? row.requirement_status ?? "").toLowerCase();
        return status.includes("missing") || status.includes("required");
    }).length;
    const label =
        missing > 0 ? `${missing} requirement${missing === 1 ? "" : "s"} missing`
        : `${docs.length} document${docs.length === 1 ? "" : "s"}`;
    return (
        <div className="flex min-h-0 flex-col gap-0.5" data-child-documents-requirements-summary-card="true">
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-alloy-midnight/80">{label}</p>
        </div>
    );
}

export function ChildDocumentsRequirementsSummaryCardShell({ record }: Props) {
    const docs = readDocuments(record);
    const hasContent = docs.length > 0;
    return (
        <LeadOperatingSummaryCard
            title="Documents"
            icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
            accent={hasContent ? "attention" : "muted"}
            minimized={!hasContent}
            widgetKey="documents_requirements"
        >
            <ChildDocumentsRequirementsSummaryCard record={record} />
        </LeadOperatingSummaryCard>
    );
}
