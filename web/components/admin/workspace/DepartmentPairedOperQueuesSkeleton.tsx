"use client";

import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";
import { WorkUnitQueueCompactRowSkeletonList } from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";

/** Matched row count for throughput + needs-attention paired panels (legacy row-pulse skeleton). */
export const DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT = 5;

/**
 * Row-pulse paired oper skeleton — **not** used for dept route `loading.tsx` or cold shell (see `DeptPairedOperQuietReserve`).
 * Retained for tests and any future explicit pulse loading; dept cold path uses quiet reserve per PERF-A-02.
 */
export function DeptPairedOperQueuesSkeleton(props: { throughputTitle: string }) {
    const { throughputTitle } = props;
    const rowCount = DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT;
    return (
        <WorkspacePairedOperPanelsGrid>
            <WorkspacePairedOperPanel tone="throughput" ariaLabel={throughputTitle} title={throughputTitle}>
                <WorkUnitQueueCompactRowSkeletonList
                    count={rowCount}
                    variant="throughput"
                    ariaLabel="Loading work unit queues"
                />
            </WorkspacePairedOperPanel>
            <WorkspacePairedOperPanel
                tone="attention"
                ariaLabel="Needs Attention"
                title="Needs Attention"
                titleClassName="adminv2-ws-queue-title--section-primary-type"
            >
                <WorkUnitQueueCompactRowSkeletonList
                    count={rowCount}
                    variant="attention"
                    ariaLabel="Loading needs attention queues"
                />
            </WorkspacePairedOperPanel>
        </WorkspacePairedOperPanelsGrid>
    );
}
