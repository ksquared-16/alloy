import {
    prefetchOpportunityDrawerOnRowIntent,
    type OpportunityDrawerIntentContext,
} from "@/lib/admin/opportunityDrawerIntentPrefetch";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import {
    opportunityDrawerQueueNavigatorRecordIds,
    previewSeedForQueueNavigatorRecord,
    resolveOpportunityQueueNavigatorPosition,
    type OpportunityDrawerQueueNavigator,
} from "@/lib/admin/opportunityDrawerQueueNavigator";

let adjacentPrefetchToken = 0;

/** Drop in-flight adjacent prefetches when queue order/rows change on the WU page. */
export function bumpOpportunityDrawerAdjacentPrefetchGeneration(): number {
    adjacentPrefetchToken += 1;
    return adjacentPrefetchToken;
}

export function opportunityDrawerAdjacentPrefetchGeneration(): number {
    return adjacentPrefetchToken;
}

/**
 * Prefetch drawer_primary (+ bootstrap) for previous and next records in the loaded queue page only.
 */
export function prefetchAdjacentOpportunityDrawers(params: {
    navigator: OpportunityDrawerQueueNavigator;
    currentRecordId: string;
    workspaceContext: OpportunityDrawerIntentContext;
}): void {
    const token = ++adjacentPrefetchToken;
    const current = params.currentRecordId.trim();

    const pos = resolveOpportunityQueueNavigatorPosition(current, params.navigator);
    if (!pos) {
        logPrefetchAdminV2("drawer_primary", "skipped", {
            reason: "queue_adjacent_no_position",
            record_id: current,
            queue_key: params.navigator.queue_key,
            drawer_nav_generation: params.navigator.drawer_nav_generation ?? null,
        });
        return;
    }

    const adjacent = [pos.prev_id, pos.next_id].filter((id): id is string => Boolean(id?.trim()));
    if (!adjacent.length) {
        logPrefetchAdminV2("drawer_primary", "skipped", {
            reason: "queue_adjacent_none",
            record_id: current,
            queue_key: params.navigator.queue_key,
            position: pos.position,
            total: pos.total,
        });
        return;
    }

    logPrefetchAdminV2("drawer_primary", "start", {
        reason: "queue_adjacent",
        record_id: current,
        prev_id: pos.prev_id,
        next_id: pos.next_id,
        adjacent_ids: adjacent,
        queue_key: params.navigator.queue_key,
        drawer_nav_generation: params.navigator.drawer_nav_generation ?? null,
        queue_generation: params.navigator.generation,
        loaded_count: opportunityDrawerQueueNavigatorRecordIds(params.navigator).length,
        prefetch_token: token,
    });

    for (const id of adjacent) {
        if (token !== adjacentPrefetchToken) return;
        const seed: OpportunityDrawerQueuePreviewSeed | null =
            previewSeedForQueueNavigatorRecord(params.navigator, id) ?? null;
        prefetchOpportunityDrawerOnRowIntent(id, params.workspaceContext, seed);
    }
}
