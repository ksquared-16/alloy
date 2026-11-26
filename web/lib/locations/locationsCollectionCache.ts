/**
 * Locations collection cache — Checkpoint B.
 *
 * One org-scoped snapshot for hierarchy + program categories + schedule patterns.
 * Inflight reuse, stale retention during refresh, Continuity-bus invalidation.
 * Not authoritative business truth — server APIs remain the write/read authority.
 */

import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import {
    fetchLocationProgramCategories,
} from "@/lib/admin/location/fetchLocationProgramCategories";
import {
    fetchSchedulePatternsForOrg,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { publishConfigurationInvalidation } from "@/lib/configRuntime/configurationInvalidation";

/** Soft freshness window — warm navigations reuse; force refresh still allowed. */
export const LOCATIONS_COLLECTION_TTL_MS = 60_000;

export type LocationsCollectionSnapshot = {
    orgId: string;
    rows: LocationHierarchyRow[];
    programCategories: LocationProgramCategoryRow[];
    schedulePatterns: SchedulePatternRow[];
    fetchedAtMs: number;
};

export type LocationsCollectionLoadMeta = {
    cacheHit: boolean;
    inflightJoin: boolean;
    staleReuse: boolean;
};

const cache = new Map<string, LocationsCollectionSnapshot>();
const inflight = new Map<string, Promise<LocationsCollectionSnapshot>>();

function cacheKey(orgId: string): string {
    return `locations-collection:v1:${orgId.trim()}`;
}

export function peekLocationsCollection(orgId: string): LocationsCollectionSnapshot | null {
    const id = orgId.trim();
    if (!id) return null;
    return cache.get(cacheKey(id)) ?? null;
}

export function isLocationsCollectionFresh(
    snapshot: LocationsCollectionSnapshot | null,
    nowMs = Date.now(),
): boolean {
    if (!snapshot) return false;
    return nowMs - snapshot.fetchedAtMs <= LOCATIONS_COLLECTION_TTL_MS;
}

async function fetchLocationsCollectionNetwork(orgId: string): Promise<LocationsCollectionSnapshot> {
    const [locationsRes, programCategories, schedulePatterns] = await Promise.all([
        fetch("/api/admin/locations?include_inactive=true&hierarchy=1", { credentials: "include" }),
        fetchLocationProgramCategories({ credentials: "include" }, { includeInactive: true }),
        fetchSchedulePatternsForOrg(),
    ]);
    const locationsJson = (await locationsRes.json()) as {
        locations?: LocationHierarchyRow[];
        error?: string;
    };
    if (!locationsRes.ok) {
        throw new Error(locationsJson.error ?? `Failed (${locationsRes.status})`);
    }
    return {
        orgId,
        rows: locationsJson.locations ?? [],
        programCategories,
        schedulePatterns,
        fetchedAtMs: Date.now(),
    };
}

/**
 * Load the Locations collection for an org.
 * - Fresh cache hit → return immediately
 * - Inflight → join
 * - Stale or force → refetch; caller may keep displaying peek() during await
 */
export async function loadLocationsCollection(
    orgId: string,
    options?: { force?: boolean },
): Promise<{ snapshot: LocationsCollectionSnapshot; meta: LocationsCollectionLoadMeta }> {
    const id = orgId.trim();
    if (!id) throw new Error("orgId is required for Locations collection cache");

    const key = cacheKey(id);
    const existing = cache.get(key) ?? null;
    const force = options?.force === true;

    if (!force && isLocationsCollectionFresh(existing)) {
        return {
            snapshot: existing!,
            meta: { cacheHit: true, inflightJoin: false, staleReuse: false },
        };
    }

    const joined = inflight.get(key);
    if (joined) {
        const snapshot = await joined;
        return {
            snapshot,
            meta: {
                cacheHit: false,
                inflightJoin: true,
                staleReuse: Boolean(existing) && !isLocationsCollectionFresh(existing),
            },
        };
    }

    const promise = fetchLocationsCollectionNetwork(id)
        .then((snapshot) => {
            cache.set(key, snapshot);
            return snapshot;
        })
        .finally(() => {
            if (inflight.get(key) === promise) inflight.delete(key);
        });
    inflight.set(key, promise);

    const snapshot = await promise;
    return {
        snapshot,
        meta: {
            cacheHit: false,
            inflightJoin: false,
            staleReuse: Boolean(existing) && !force,
        },
    };
}

export function invalidateLocationsCollection(
    orgId: string,
    reason: string,
    options?: { publishBus?: boolean },
): void {
    const id = orgId.trim();
    if (!id) return;
    const key = cacheKey(id);
    cache.delete(key);
    inflight.delete(key);
    if (options?.publishBus !== false) {
        publishConfigurationInvalidation("locations", reason);
    }
}

/** Test-only reset. */
export function resetLocationsCollectionCacheForTests(): void {
    cache.clear();
    inflight.clear();
}
