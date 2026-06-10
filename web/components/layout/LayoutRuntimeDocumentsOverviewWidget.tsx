"use client";

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { useLayoutRuntimeDrawerHost } from "@/lib/layout/runtime/layoutRuntimeDrawerHostContext";
import {
    PRESENTATION_DATA_VALUE,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

function readDocuments(record: ProofRuntimeRecord): unknown[] {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    const docs = record.documents ?? overview.documents ?? record._documents_preview;
    return Array.isArray(docs) ? docs : [];
}

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
    documentsTabKey?: DrawerTabKey;
};

/** Layout-owned documents overview — compact summary with optional tab navigation. */
export default function LayoutRuntimeDocumentsOverviewWidget({
    record,
    title = "Documents",
    documentsTabKey = "documents",
}: Props) {
    const { onSelectDrawerTab } = useLayoutRuntimeDrawerHost();
    const docs = readDocuments(record);

    if (docs.length === 0) {
        return null;
    }

    const missing = docs.filter((d) => {
        const row = d as Record<string, unknown>;
        const status = String(row.status ?? row.requirement_status ?? "").toLowerCase();
        return status.includes("missing") || status.includes("required");
    }).length;

    const summaryLabel =
        missing > 0 ? `${missing} requirement${missing === 1 ? "" : "s"} missing`
        : `${docs.length} document${docs.length === 1 ? "" : "s"}`;

    const previewNames = docs
        .slice(0, 3)
        .map((d) => {
            const row = d as Record<string, unknown>;
            return String(row.name ?? row.title ?? row.label ?? "").trim();
        })
        .filter(Boolean);

    return (
        <div className="space-y-2" data-layout-runtime-documents-widget="true">
            <p className={PRESENTATION_DATA_VALUE}>{summaryLabel}</p>
            {previewNames.length > 0 ?
                <ul className="flex flex-col gap-1">
                    {previewNames.map((name) => (
                        <li key={name} className={`truncate ${PRESENTATION_SUPPORTING}`}>
                            {name}
                        </li>
                    ))}
                </ul>
            :   null}
            {onSelectDrawerTab ?
                <button
                    type="button"
                    onClick={() => onSelectDrawerTab(documentsTabKey)}
                    className="text-[11px] font-semibold text-alloy-blue hover:underline"
                    data-layout-runtime-documents-view-all="true"
                >
                    View all {title.toLowerCase()}
                </button>
            :   null}
        </div>
    );
}

export function layoutRuntimeDocumentsWidgetHasContent(record: ProofRuntimeRecord): boolean {
    return readDocuments(record).length > 0;
}
