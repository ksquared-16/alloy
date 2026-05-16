"use client";

import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";
import { WorkUnitQueueCompactRowSkeletonList } from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";

/** Matched row count for throughput + needs-attention paired panels (stable paired reveal). */
export const DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT = 5;

/** Dual-panel placeholder until pipeline lanes + attention preview both settle. */
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
