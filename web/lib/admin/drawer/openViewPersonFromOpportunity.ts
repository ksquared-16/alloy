import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import { putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import { logPersonDrawerOpen } from "@/lib/admin/drawer/personDrawerPerfLogs";
import {
    applyPersonDrawerOpenSeed,
    cachePersonDrawerChildOpenSeed,
    cachePersonDrawerParentOpenSeed,
    PERSON_DRAWER_CHILD_OPEN_SOURCE,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import {
    isPersonDrawerSnapshotWarm,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

export type OpenDrawerFromOpportunityFn = (params: OpenDrawerParams) => void;

/** Direct View Person open from opportunity host — cache-first when snapshot is warm. */
export function openViewPersonFromOpportunity(args: {
    openDrawer: OpenDrawerFromOpportunityFn;
    personId: string;
    opportunityId: string;
    source?: string;
    openSeed?: PersonDrawerOpenSeed | null;
}): boolean {
    const personId = args.personId.trim();
    const opportunityId = args.opportunityId.trim();
    if (!personId) return false;

    const openSource = args.source ?? "opportunity_primary_contact";
    const childOpen = openSource === PERSON_DRAWER_CHILD_OPEN_SOURCE;
    const cacheHit = isPersonDrawerSnapshotWarm(personId);
    const openStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (childOpen && args.openSeed) {
        cachePersonDrawerChildOpenSeed(personId, args.openSeed);
    } else if (
        args.openSeed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
    ) {
        cachePersonDrawerParentOpenSeed(personId, args.openSeed);
    } else if (!cacheHit && args.openSeed) {
        const seedRecord = applyPersonDrawerOpenSeed(personId, args.openSeed);
        if (seedRecord) {
            putDrawerEntitySnapshot("persons", personId, seedRecord);
        }
    }

    args.openDrawer({
        type: "persons",
        id: personId,
        source: openSource,
        parent: opportunityId ? { type: "opportunities", id: opportunityId } : undefined,
        personDrawerOpenSeed: args.openSeed ?? null,
    });

    const timeToVisibleMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - openStartedAt
    );
    logPersonDrawerOpen({
        personId,
        cacheHit,
        timeToVisibleMs,
        source: openSource,
    });

    if (!cacheHit) {
        try {
            prefetchPersonDrawerSnapshot(personId, { source: "click" });
        } catch {
            /* prefetch must not block open */
        }
    }

    return true;
}

/** Optional hover warm — never blocks click open. */
export function prefetchViewPersonOnHover(personId: string): void {
    prefetchViewPersonOnPointerDown(personId);
}

/** Pointer/mousedown warm — runs before click handler for faster open. */
export function prefetchViewPersonOnPointerDown(personId: string): void {
    const id = personId.trim();
    if (!id) return;
    try {
        prefetchPersonDrawerSnapshot(id, { source: "hover" });
    } catch {
        /* ignore */
    }
}
