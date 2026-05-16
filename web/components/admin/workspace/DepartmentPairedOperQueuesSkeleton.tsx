"use client";

import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";
import { WorkUnitQueueCompactRowSkeletonList } from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";

/** Dual-panel placeholder until pipeline lanes + attention preview both settle. */
export function DeptPairedOperQueuesSkeleton(props: { throughputTitle: string }) {
    const { throughputTitle } = props;
    return (
        <WorkspacePairedOperPanelsGrid>
            <WorkspacePairedOperPanel tone="throughput" ariaLabel={throughputTitle} title={throughputTitle}>
                <WorkUnitQueueCompactRowSkeletonList count={4} variant="throughput" ariaLabel="Loading work unit queues" />
            </WorkspacePairedOperPanel>
            <WorkspacePairedOperPanel
                tone="attention"
                ariaLabel="Needs Attention"
                title="Needs Attention"
                titleClassName="adminv2-ws-queue-title--section-primary-type"
            >
                <WorkUnitQueueCompactRowSkeletonList count={3} variant="attention" ariaLabel="Loading needs attention queues" />
            </WorkspacePairedOperPanel>
        </WorkspacePairedOperPanelsGrid>
    );
}
