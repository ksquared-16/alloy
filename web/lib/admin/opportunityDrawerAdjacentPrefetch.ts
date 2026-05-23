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

let activeGeneration = -1;

/** Drop in-flight adjacent prefetches when queue order/rows change. */
export function bumpOpportunityDrawerAdjacentPrefetchGeneration(): number {
    activeGeneration += 1;
    return activeGeneration;
}

export function opportunityDrawerAdjacentPrefetchGeneration(): number {
    return activeGeneration;
}

/**
 * Prefetch drawer_primary (+ bootstrap) for previous and next records in the loaded queue page only.
 */
export function prefetchAdjacentOpportunityDrawers(params: {
    navigator: OpportunityDrawerQueueNavigator;
    currentRecordId: string;
    workspaceContext: OpportunityDrawerIntentContext;
}): void {
    const gen = params.navigator.generation;
    activeGeneration = gen;

    const pos = resolveOpportunityQueueNavigatorPosition(params.currentRecordId, params.navigator);
    if (!pos) {
        logPrefetchAdminV2("drawer_primary", "skipped", {
            reason: "queue_adjacent_no_position",
            record_id: params.currentRecordId,
            queue_key: params.navigator.queue_key,
        });
        return;
    }

    const adjacent = [pos.prev_id, pos.next_id].filter((id): id is string => Boolean(id?.trim()));
    if (!adjacent.length) {
        logPrefetchAdminV2("drawer_primary", "skipped", {
            reason: "queue_adjacent_none",
            record_id: params.currentRecordId,
            queue_key: params.navigator.queue_key,
        });
        return;
    }

    logPrefetchAdminV2("drawer_primary", "start", {
        reason: "queue_adjacent",
        record_id: params.currentRecordId,
        adjacent_ids: adjacent,
        queue_key: params.navigator.queue_key,
        generation: gen,
        loaded_count: opportunityDrawerQueueNavigatorRecordIds(params.navigator).length,
    });

    for (const id of adjacent) {
        if (gen !== params.navigator.generation) return;
        const seed = previewSeedForQueueNavigatorRecord(params.navigator, id) ?? null;
        prefetchOpportunityDrawerOnRowIntent(id, params.workspaceContext, seed);
    }
}
