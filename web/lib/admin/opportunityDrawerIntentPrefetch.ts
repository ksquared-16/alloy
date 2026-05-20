import {
    adminV2DrawerBootstrapEnabled,
    buildOpportunityDrawerBootstrapUrl,
    operTrustHintsFromQueueSeed,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { scheduleDeferredCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";

export type OpportunityDrawerIntentContext = {
    work_unit_id: string;
    department_id: string;
};

/**
 * Intent-time prefetch for opportunity drawer (row mousedown / focus).
 * Uses in-flight dedupe — drawer open reuses the same GETs when still pending.
 */
export function prefetchOpportunityDrawerOnRowIntent(
    opportunityId: string,
    workspaceContext?: OpportunityDrawerIntentContext | null,
    queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;

    scheduleDeferredCommunicationsDrawerPrefetch("opportunities", id);

    if (!adminV2DrawerBootstrapEnabled()) {
        const url = `/api/admin/entity/opportunities/${encodeURIComponent(id)}?surface=drawer_visible`;
        void dedupeAdminFetch(url, workspaceDataFetchInit()).catch(() => {
            /* non-fatal — drawer open will retry */
        });
        return;
    }

    const trust = operTrustHintsFromQueueSeed(queuePreviewSeed);
    const bootstrapUrl = buildOpportunityDrawerBootstrapUrl(id, workspaceContext ?? null, null, trust);
    void dedupeAdminFetch(bootstrapUrl, workspaceDataFetchInit()).catch(() => {
        /* non-fatal — drawer open will retry */
    });
}
