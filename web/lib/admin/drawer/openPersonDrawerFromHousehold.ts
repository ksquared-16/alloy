import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import { logPersonDrawerOpen } from "@/lib/admin/drawer/personDrawerPerfLogs";
import {
    applyPersonDrawerOpenSeed,
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { personDrawerOpenSeedFromPersonRecord } from "@/lib/admin/drawer/personDrawerOpenSeedFromPersonRecord";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import {
    PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
    PERSON_DRAWER_PARENT_OPEN_SOURCE,
} from "@/lib/admin/person/personDrawerParentChrome";
import { putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import {
    isPersonDrawerSnapshotWarm,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

export const PERSON_DRAWER_HOUSEHOLD_CHILD_OPEN_SOURCE = "person_household_child";

export type OpenDrawerFromHouseholdFn = (params: OpenDrawerParams) => void;

/** Household link navigation — typed open seed + cache-first paint. */
export function openPersonDrawerFromHousehold(args: {
    openDrawer: OpenDrawerFromHouseholdFn;
    personId: string;
    fromRecord: Record<string, unknown>;
    parentOpportunityId?: string | null;
}): boolean {
    const personId = args.personId.trim();
    if (!personId) return false;

    const seed = personDrawerOpenSeedFromPersonRecord(args.fromRecord, personId);
    const childOpen = seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS;
    const parentOpen = seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS;
    const openSource = childOpen
        ? PERSON_DRAWER_HOUSEHOLD_CHILD_OPEN_SOURCE
        : parentOpen
          ? PERSON_DRAWER_PARENT_OPEN_SOURCE
          : "person_household_link";

    const cacheHit = isPersonDrawerSnapshotWarm(personId);
    const openStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (childOpen && seed) {
        cachePersonDrawerChildOpenSeed(personId, seed);
    } else if (parentOpen && seed) {
        cachePersonDrawerParentOpenSeed(personId, seed);
    } else if (!cacheHit && seed) {
        const seedRecord = applyPersonDrawerOpenSeed(personId, seed);
        if (seedRecord) {
            putDrawerEntitySnapshot("persons", personId, seedRecord);
        }
    }

    const parentOpp = args.parentOpportunityId?.trim();
    args.openDrawer({
        type: "persons",
        id: personId,
        source: openSource,
        parent: parentOpp ? { type: "opportunities", id: parentOpp } : undefined,
        personDrawerOpenSeed: seed ?? null,
    });

    logPersonDrawerOpen({
        personId,
        cacheHit,
        timeToVisibleMs: Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - openStartedAt
        ),
        source: openSource,
    });

    if (!cacheHit) {
        try {
            prefetchPersonDrawerSnapshot(personId, { source: "click", openSeed: seed ?? undefined });
        } catch {
            /* non-fatal */
        }
    }

    return true;
}
