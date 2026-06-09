"use client";

/**
 * Production queue row renderer — layout doc + operator-safe record + VM fallback.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { buildOperationalQueueRecordViewModelFromLayout } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import LayoutRuntimeQueueRowErrorBoundary from "@/components/layout/LayoutRuntimeQueueRowErrorBoundary";
import LayoutRuntimeQueueRowErrorCard from "@/components/layout/LayoutRuntimeQueueRowErrorCard";
import { isLayoutRuntimeHardCutoverActiveClient } from "@/lib/layout/featureFlag";
import type { QueueItemQuickActionVm, QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import {
    buildLayoutRuntimeQueueRowEvidence,
    logLayoutRuntimeQueueRowEvidence,
} from "@/lib/layout/runtime/layoutRuntimeEvidence";
import { shouldLogLayoutRuntimeEvidence } from "@/lib/layout/runtime/layoutRuntimeEvidenceClient";
import type { QueueLayoutDrawerIconHandlers } from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";

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
    drawerIconHandlers?: QueueLayoutDrawerIconHandlers;
    rowActions?: QueueItemQuickActionVm[];
    onRowAction?: (qa: QueueItemQuickActionVm, dispatchId: string) => void;
    rowActionsPending?: boolean;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onOpen?: () => void;
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
    drawerIconHandlers,
    rowActions,
    onRowAction,
    rowActionsPending,
    collapsed,
    onToggleCollapsed,
    onOpen,
}: Props) {
    const queueRecordConfig = useMemo(() => resolveQueueRecordLayoutConfig(doc), [doc]);
    const operationalVm = useMemo(
        () => buildOperationalQueueRecordViewModelFromLayout(doc, record, queueRecordConfig),
        [doc, queueRecordConfig, record],
    );
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

    const errorFallback = isLayoutRuntimeHardCutoverActiveClient() ? (
        <LayoutRuntimeQueueRowErrorCard reason="queue_row_render_failed" queueRowKey={queueRowKey} />
    ) : (
        vmFallback
    );

    return (
        <LayoutRuntimeQueueRowErrorBoundary
            fallback={errorFallback}
            queueRowKey={queueRowKey}
            variant={variant}
        >
            <div
                data-layout-runtime-queue-row="true"
                data-queue-row-runtime-path="layout-runtime-queue-row-view"
                className="min-w-0 flex-1"
                data-layout-runtime-queue-source={layoutSource ?? ""}
                data-layout-runtime-queue-title={evidence.titleResolution.display ?? ""}
            >
                <OperationalQueueRecordRow
                    vm={operationalVm}
                    record={record}
                    config={queueRecordConfig}
                    drawerHandlers={drawerIconHandlers}
                    onOpen={onOpen}
                    rowActions={rowActions}
                    onRowAction={onRowAction}
                    rowActionsPending={rowActionsPending}
                    collapsed={collapsed}
                    onToggleCollapsed={onToggleCollapsed}
                    showAttentionAccent={operationalVm.hasAttention}
                />
            </div>
        </LayoutRuntimeQueueRowErrorBoundary>
    );
}
