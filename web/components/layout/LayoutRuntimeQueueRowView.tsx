"use client";

/**
 * Production queue row renderer — layout doc + operator-safe record + VM fallback.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";
import LayoutRuntimeQueueRowErrorBoundary from "@/components/layout/LayoutRuntimeQueueRowErrorBoundary";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import {
    buildLayoutRuntimeQueueRowEvidence,
    logLayoutRuntimeQueueRowEvidence,
} from "@/lib/layout/runtime/layoutRuntimeEvidence";
import { shouldLogLayoutRuntimeEvidence } from "@/lib/layout/runtime/layoutRuntimeEvidenceClient";

type Props = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    item: QueuePreviewItemVm;
    layoutSource?: string | null;
    layoutKey?: string | null;
    workUnitKey?: string | null;
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
    item,
    layoutSource,
    layoutKey,
    workUnitKey,
    vmFallback,
    queueRowKey,
    variant,
    suppressActions = true,
}: Props) {
    const evidence = useMemo(
        () =>
            buildLayoutRuntimeQueueRowEvidence({
                item,
                doc,
                record,
                layoutSource: layoutSource ?? null,
                layoutKey: layoutKey ?? null,
                workUnitKey,
            }),
        [doc, item, layoutKey, layoutSource, record, workUnitKey],
    );

    useEffect(() => {
        if (!shouldLogLayoutRuntimeEvidence()) return;
        logLayoutRuntimeQueueRowEvidence(evidence);
    }, [evidence]);

    return (
        <LayoutRuntimeQueueRowErrorBoundary
            fallback={vmFallback}
            queueRowKey={queueRowKey}
            variant={variant}
        >
            <div
                data-layout-runtime-queue-row="true"
                className="min-w-0 flex-1"
                data-layout-runtime-queue-source={layoutSource ?? ""}
                data-layout-runtime-queue-title={evidence.titleResolution.display ?? ""}
            >
                <QueueCardProofRenderer
                    doc={doc}
                    record={record}
                    onAction={suppressActions ? () => {} : undefined}
                />
            </div>
        </LayoutRuntimeQueueRowErrorBoundary>
    );
}
