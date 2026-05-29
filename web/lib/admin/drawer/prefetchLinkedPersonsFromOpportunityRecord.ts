import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";
import {
    prefetchPersonDrawerSnapshot,
    type PersonPrefetchSource,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

/** Warm linked person drawer snapshots after opportunity content is stable. */
export function prefetchLinkedPersonsFromOpportunityRecord(
    record: Record<string, unknown>,
    opts?: { source?: PersonPrefetchSource }
): string[] {
    const source = opts?.source ?? "opportunity_drawer_idle";
    const ids = collectLinkedPersonIdsFromOpportunityRecord(record);
    for (const personId of ids) {
        prefetchPersonDrawerSnapshot(personId, { source });
    }
    return ids;
}
