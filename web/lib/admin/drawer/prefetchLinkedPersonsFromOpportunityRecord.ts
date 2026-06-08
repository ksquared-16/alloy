import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";
import {
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
    personDrawerSeedFromOpportunityRecord,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
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
        const seed = personDrawerSeedFromOpportunityRecord(record, personId);
        if (seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
            cachePersonDrawerChildOpenSeed(personId, seed);
        } else if (seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
            cachePersonDrawerParentOpenSeed(personId, seed);
        }
        prefetchPersonDrawerSnapshot(personId, { source, openSeed: seed ?? undefined });
    }
    return ids;
}
