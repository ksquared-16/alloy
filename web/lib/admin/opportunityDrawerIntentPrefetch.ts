import {
    adminV2DrawerBootstrapEnabled,
    fetchOpportunityDrawerOperationalBootstrap,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { prefetchOpportunityDrawerFull } from "@/lib/admin/opportunityDrawerFullPrefetch";
import { prefetchOpportunityDrawerPrimary } from "@/lib/admin/opportunityDrawerPrimaryPrefetch";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";

export type OpportunityDrawerIntentContext = {
    work_unit_id: string;
    department_id: string;
};

/**
 * Intent-time prefetch (hover / mousedown / focus before click).
 * Warms bootstrap + drawer_primary (open gate) and surface=full (background enrich).
 * Header actions resolve on open (needs primary row for hints).
 */
export function prefetchOpportunityDrawerOnRowIntent(
    opportunityId: string,
    workspaceContext?: OpportunityDrawerIntentContext | null,
    _queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;

    logPrefetchAdminV2("drawer_primary", "start", {
        record_id: id,
        reason: "queue_row_intent",
        work_unit_id: workspaceContext?.work_unit_id ?? null,
    });

    const init = workspaceDataFetchInit();

    if (!adminV2DrawerBootstrapEnabled()) {
        const url = `/api/admin/entity/opportunities/${encodeURIComponent(id)}?surface=drawer_visible`;
        void dedupeAdminFetch(url, init).catch(() => {
            /* non-fatal — drawer open will retry */
        });
        return;
    }

    void fetchOpportunityDrawerOperationalBootstrap(id, workspaceContext ?? null, init).catch(() => {
        /* non-fatal — drawer open will reuse in-flight or retry */
    });
    prefetchOpportunityDrawerPrimary(id, init);
    prefetchOpportunityDrawerFull(id, init);
}
