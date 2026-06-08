"use client";

/**
 * Production queue row renderer — layout doc + operator-safe record.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";

type Props = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    /** When true, action chips are suppressed — row shell owns open behavior. */
    suppressActions?: boolean;
};

export default function LayoutRuntimeQueueRowView({ doc, record, suppressActions = true }: Props) {
    return (
        <div data-layout-runtime-queue-row="true" className="min-w-0 flex-1">
            <QueueCardProofRenderer
                doc={doc}
                record={record}
                onAction={suppressActions ? () => {} : undefined}
            />
        </div>
    );
}
