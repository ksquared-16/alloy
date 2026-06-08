import { collectLinkedPersonIdsFromPersonRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromPersonRecord";
import {
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { personDrawerOpenSeedFromPersonRecord } from "@/lib/admin/drawer/personDrawerOpenSeedFromPersonRecord";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import {
    prefetchPersonDrawerSnapshot,
    type PersonPrefetchSource,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

/** Warm linked person drawer snapshots after parent/child person drawer hydrates. */
export function prefetchLinkedPersonsFromPersonRecord(
    record: Record<string, unknown>,
    opts?: { source?: PersonPrefetchSource }
): string[] {
    const source = opts?.source ?? "person_drawer_idle";
    const ids = collectLinkedPersonIdsFromPersonRecord(record);
    for (const personId of ids) {
        const seed = personDrawerOpenSeedFromPersonRecord(record, personId);
        if (seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
            cachePersonDrawerChildOpenSeed(personId, seed);
        } else if (seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
            cachePersonDrawerParentOpenSeed(personId, seed);
        }
        prefetchPersonDrawerSnapshot(personId, { source, openSeed: seed ?? undefined });
    }
    return ids;
}
