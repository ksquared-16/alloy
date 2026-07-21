/**
 * Location concern-scoped caches — Checkpoint C.
 *
 * Owns Tours setup flags, Access members snapshot, and Placement policy
 * payloads for warm concern transitions. Not authoritative business truth.
 * Collection hierarchy/programs/schedules remain in locationsCollectionCache.
 */

import { publishConfigurationInvalidation } from "@/lib/configRuntime/configurationInvalidation";

export const LOCATION_CONCERN_CACHE_TTL_MS = 60_000;

export type LocationOwnedSetupSnapshot = {
    orgId: string;
    locationId: string;
    toursConfigured: boolean | null;
    accessConfigured: boolean | null;
    fetchedAtMs: number;
};

export type LocationAccessMembersSnapshot = {
    orgId: string;
    locationId: string;
    authorized: boolean;
    members: Array<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        role_keys: string[];
        department_scope: "all" | "restricted";
        department_ids: string[];
        site_scope: "all" | "restricted";
        site_location_ids: string[];
    }>;
    siteLocationIds: string[];
    fetchedAtMs: number;
};

export type LocationPlacementPolicySnapshot = {
    orgId: string;
    workUnits: Array<{
        id: string;
        key: string;
        name: string;
        department_id?: string | null;
        metadata?: unknown;
        queue_definition?: unknown;
    }>;
    processNames: Record<string, string>;
    fetchedAtMs: number;
};

type CacheBucket<T> = {
    value: T;
    fetchedAtMs: number;
};

const ownedSetupCache = new Map<string, CacheBucket<LocationOwnedSetupSnapshot>>();
const ownedSetupInflight = new Map<string, Promise<LocationOwnedSetupSnapshot>>();

const accessCache = new Map<string, CacheBucket<LocationAccessMembersSnapshot>>();
const accessInflight = new Map<string, Promise<LocationAccessMembersSnapshot>>();

const placementCache = new Map<string, CacheBucket<LocationPlacementPolicySnapshot>>();
const placementInflight = new Map<string, Promise<LocationPlacementPolicySnapshot>>();

function ownedSetupKey(orgId: string, locationId: string): string {
    return `loc-owned-setup:v1:${orgId.trim()}:${locationId.trim()}`;
}

function accessKey(orgId: string, locationId: string): string {
    return `loc-access:v1:${orgId.trim()}:${locationId.trim()}`;
}

function placementKey(orgId: string): string {
    return `loc-placement:v1:${orgId.trim()}`;
}

function isFresh(fetchedAtMs: number, nowMs = Date.now()): boolean {
    return nowMs - fetchedAtMs <= LOCATION_CONCERN_CACHE_TTL_MS;
}

export function peekLocationOwnedSetup(
    orgId: string,
    locationId: string,
): LocationOwnedSetupSnapshot | null {
    const hit = ownedSetupCache.get(ownedSetupKey(orgId, locationId));
    return hit?.value ?? null;
}

export function peekLocationAccessMembers(
    orgId: string,
    locationId: string,
): LocationAccessMembersSnapshot | null {
    const hit = accessCache.get(accessKey(orgId, locationId));
    return hit?.value ?? null;
}

export function peekLocationPlacementPolicy(orgId: string): LocationPlacementPolicySnapshot | null {
    const hit = placementCache.get(placementKey(orgId));
    return hit?.value ?? null;
}

async function fetchOwnedSetupNetwork(
    orgId: string,
    locationId: string,
): Promise<LocationOwnedSetupSnapshot> {
    const [tours, access] = await Promise.all([
        fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`, {
            credentials: "include",
        })
            .then(async (response) => {
                if (!response.ok) return null;
                const json = (await response.json().catch(() => ({}))) as {
                    rules?: { location_id?: string | null; is_active?: boolean }[];
                };
                return (json.rules ?? []).some(
                    (rule) => rule.location_id === locationId && rule.is_active !== false,
                );
            })
            .catch(() => null),
        fetch("/api/admin/settings/users-roles/members", { credentials: "include" })
            .then(async (response) => {
                if (!response.ok) return null;
                const json = (await response.json().catch(() => ({}))) as {
                    members?: {
                        role_keys?: string[];
                        site_scope?: string;
                        site_location_ids?: string[];
                    }[];
                };
                return (json.members ?? []).some(
                    (member) =>
                        member.role_keys?.includes("admin")
                        && (member.site_scope === "all" || member.site_location_ids?.includes(locationId)),
                );
            })
            .catch(() => null),
    ]);
    return {
        orgId,
        locationId,
        toursConfigured: tours,
        accessConfigured: access,
        fetchedAtMs: Date.now(),
    };
}

export async function loadLocationOwnedSetup(
    orgId: string,
    locationId: string,
    options?: { force?: boolean },
): Promise<{ snapshot: LocationOwnedSetupSnapshot; cacheHit: boolean; inflightJoin: boolean }> {
    const id = orgId.trim();
    const loc = locationId.trim();
    if (!id || !loc) throw new Error("orgId and locationId required for owned setup cache");
    const key = ownedSetupKey(id, loc);
    const existing = ownedSetupCache.get(key);
    if (!options?.force && existing && isFresh(existing.fetchedAtMs)) {
        return { snapshot: existing.value, cacheHit: true, inflightJoin: false };
    }
    const joined = ownedSetupInflight.get(key);
    if (joined) {
        const snapshot = await joined;
        return { snapshot, cacheHit: false, inflightJoin: true };
    }
    const promise = fetchOwnedSetupNetwork(id, loc)
        .then((snapshot) => {
            ownedSetupCache.set(key, { value: snapshot, fetchedAtMs: snapshot.fetchedAtMs });
            return snapshot;
        })
        .finally(() => {
            if (ownedSetupInflight.get(key) === promise) ownedSetupInflight.delete(key);
        });
    ownedSetupInflight.set(key, promise);
    const snapshot = await promise;
    return { snapshot, cacheHit: false, inflightJoin: false };
}

async function fetchAccessNetwork(
    orgId: string,
    locationId: string,
): Promise<LocationAccessMembersSnapshot> {
    const response = await fetch("/api/admin/settings/users-roles/members", {
        credentials: "include",
    });
    const json = (await response.json().catch(() => ({}))) as {
        members?: LocationAccessMembersSnapshot["members"];
        site_locations?: { id: string }[];
        error?: string;
    };
    if (!response.ok) {
        return {
            orgId,
            locationId,
            authorized: false,
            members: [],
            siteLocationIds: [],
            fetchedAtMs: Date.now(),
        };
    }
    return {
        orgId,
        locationId,
        authorized: true,
        members: json.members ?? [],
        siteLocationIds: (json.site_locations ?? []).map((site) => site.id),
        fetchedAtMs: Date.now(),
    };
}

export async function loadLocationAccessMembers(
    orgId: string,
    locationId: string,
    options?: { force?: boolean },
): Promise<{ snapshot: LocationAccessMembersSnapshot; cacheHit: boolean; inflightJoin: boolean }> {
    const id = orgId.trim();
    const loc = locationId.trim();
    if (!id || !loc) throw new Error("orgId and locationId required for access cache");
    const key = accessKey(id, loc);
    const existing = accessCache.get(key);
    if (!options?.force && existing && isFresh(existing.fetchedAtMs)) {
        return { snapshot: existing.value, cacheHit: true, inflightJoin: false };
    }
    const joined = accessInflight.get(key);
    if (joined) {
        return { snapshot: await joined, cacheHit: false, inflightJoin: true };
    }
    const promise = fetchAccessNetwork(id, loc)
        .then((snapshot) => {
            accessCache.set(key, { value: snapshot, fetchedAtMs: snapshot.fetchedAtMs });
            return snapshot;
        })
        .finally(() => {
            if (accessInflight.get(key) === promise) accessInflight.delete(key);
        });
    accessInflight.set(key, promise);
    return { snapshot: await promise, cacheHit: false, inflightJoin: false };
}

async function fetchPlacementNetwork(orgId: string): Promise<LocationPlacementPolicySnapshot> {
    const [workUnitsResponse, catalogResponse] = await Promise.all([
        fetch("/api/admin/work-units", { cache: "no-store", credentials: "include" }),
        fetch("/api/admin/lifecycle-catalog", { cache: "no-store", credentials: "include" }),
    ]);
    const json = (await workUnitsResponse.json().catch(() => ({}))) as {
        items?: LocationPlacementPolicySnapshot["workUnits"];
        error?: string;
    };
    if (!workUnitsResponse.ok) {
        throw new Error(json.error ?? "Waitlist ranking policy could not be loaded.");
    }
    const catalog = (await catalogResponse.json().catch(() => ({}))) as {
        items?: { process_id?: string; lifecycle_name?: string }[];
    };
    const processNames = Object.fromEntries(
        (catalogResponse.ok ? (catalog.items ?? []) : [])
            .filter((item) => item.process_id && item.lifecycle_name)
            .map((item) => [item.process_id as string, item.lifecycle_name as string]),
    );
    return {
        orgId,
        workUnits: json.items ?? [],
        processNames,
        fetchedAtMs: Date.now(),
    };
}

export async function loadLocationPlacementPolicy(
    orgId: string,
    options?: { force?: boolean },
): Promise<{ snapshot: LocationPlacementPolicySnapshot; cacheHit: boolean; inflightJoin: boolean }> {
    const id = orgId.trim();
    if (!id) throw new Error("orgId required for placement cache");
    const key = placementKey(id);
    const existing = placementCache.get(key);
    if (!options?.force && existing && isFresh(existing.fetchedAtMs)) {
        return { snapshot: existing.value, cacheHit: true, inflightJoin: false };
    }
    const joined = placementInflight.get(key);
    if (joined) {
        return { snapshot: await joined, cacheHit: false, inflightJoin: true };
    }
    const promise = fetchPlacementNetwork(id)
        .then((snapshot) => {
            placementCache.set(key, { value: snapshot, fetchedAtMs: snapshot.fetchedAtMs });
            return snapshot;
        })
        .finally(() => {
            if (placementInflight.get(key) === promise) placementInflight.delete(key);
        });
    placementInflight.set(key, promise);
    return { snapshot: await promise, cacheHit: false, inflightJoin: false };
}

export type LocationConcernInvalidationTarget =
    | "owned-setup"
    | "access"
    | "placement"
    | "tours"
    | "all-concerns";

export function invalidateLocationConcernCaches(
    orgId: string,
    target: LocationConcernInvalidationTarget,
    options?: { locationId?: string | null; publishBus?: boolean; reason?: string },
): void {
    const id = orgId.trim();
    if (!id) return;
    const locationId = String(options?.locationId ?? "").trim();

    const clearOwned = () => {
        if (locationId) {
            ownedSetupCache.delete(ownedSetupKey(id, locationId));
            ownedSetupInflight.delete(ownedSetupKey(id, locationId));
            return;
        }
        for (const key of [...ownedSetupCache.keys()]) {
            if (key.includes(`:${id}:`)) ownedSetupCache.delete(key);
        }
        for (const key of [...ownedSetupInflight.keys()]) {
            if (key.includes(`:${id}:`)) ownedSetupInflight.delete(key);
        }
    };
    const clearAccess = () => {
        if (locationId) {
            accessCache.delete(accessKey(id, locationId));
            accessInflight.delete(accessKey(id, locationId));
            return;
        }
        for (const key of [...accessCache.keys()]) {
            if (key.includes(`:${id}:`)) accessCache.delete(key);
        }
        for (const key of [...accessInflight.keys()]) {
            if (key.includes(`:${id}:`)) accessInflight.delete(key);
        }
    };
    const clearPlacement = () => {
        placementCache.delete(placementKey(id));
        placementInflight.delete(placementKey(id));
    };

    if (target === "owned-setup" || target === "tours" || target === "all-concerns") clearOwned();
    if (target === "access" || target === "all-concerns") clearAccess();
    if (target === "placement" || target === "all-concerns") clearPlacement();

    if (options?.publishBus !== false) {
        publishConfigurationInvalidation(
            "locations",
            options?.reason ?? `concern:${target}`,
            locationId || null,
        );
    }
}

/** Test-only reset. */
export function resetLocationConcernCachesForTests(): void {
    ownedSetupCache.clear();
    ownedSetupInflight.clear();
    accessCache.clear();
    accessInflight.clear();
    placementCache.clear();
    placementInflight.clear();
}
