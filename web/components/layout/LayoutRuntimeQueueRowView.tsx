"use client";

/**
 * Production queue row renderer — layout doc + operator-safe record + VM fallback.
 */

import type { ReactNode } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";
import LayoutRuntimeQueueRowErrorBoundary from "@/components/layout/LayoutRuntimeQueueRowErrorBoundary";

type Props = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    /** Legacy VM row — used when layout render throws. */
    vmFallback: ReactNode;
    queueRowKey?: string;
    variant?: "pipeline" | "waitlist";
    /** When true, action chips are suppressed — row shell owns open behavior. */
    suppressActions?: boolean;
};

export default function LayoutRuntimeQueueRowView({
    doc,
    record,
    vmFallback,
    queueRowKey,
    variant,
    suppressActions = true,
}: Props) {
    return (
        <LayoutRuntimeQueueRowErrorBoundary
            fallback={vmFallback}
            queueRowKey={queueRowKey}
            variant={variant}
        >
            <div data-layout-runtime-queue-row="true" className="min-w-0 flex-1">
                <QueueCardProofRenderer
                    doc={doc}
                    record={record}
                    onAction={suppressActions ? () => {} : undefined}
                />
            </div>
        </LayoutRuntimeQueueRowErrorBoundary>
    );
}
