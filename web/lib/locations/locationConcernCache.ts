/**
 * Location concern-scoped caches — Checkpoint C.
 *
 * Owns Tours setup flags + rules preview, Access members snapshot, and Placement policy
 * payloads for warm concern transitions. Not authoritative business truth.
 * Collection hierarchy/programs/schedules remain in locationsCollectionCache.
 */

import { publishConfigurationInvalidation } from "@/lib/configRuntime/configurationInvalidation";

export const LOCATION_CONCERN_CACHE_TTL_MS = 60_000;

export type LocationTourRulePreview = {
    id: string;
    location_id: string | null;
    user_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
};

export type LocationOwnedSetupSnapshot = {
    orgId: string;
    locationId: string;
    toursConfigured: boolean | null;
    accessConfigured: boolean | null;
    fetchedAtMs: number;
};

export type LocationTourRulesSnapshot = {
    orgId: string;
    locationId: string;
    rules: LocationTourRulePreview[];
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
        /** W-47: `unset` — no `user_access_profiles` row — is a representable state now. */
        department_scope: "all" | "restricted" | "unset";
        department_ids: string[];
        site_scope: "all" | "restricted" | "unset";
        site_location_ids: string[];
        /** What `ABSENT_PROFILE_ENFORCEMENT` yields for this membership. Use for reach questions. */
        effective_department_scope?: "all" | "restricted";
        effective_site_scope?: "all" | "restricted";
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

const tourRulesCache = new Map<string, CacheBucket<LocationTourRulesSnapshot>>();
const tourRulesInflight = new Map<string, Promise<LocationTourRulesSnapshot>>();

const accessCache = new Map<string, CacheBucket<LocationAccessMembersSnapshot>>();
const accessInflight = new Map<string, Promise<LocationAccessMembersSnapshot>>();

const placementCache = new Map<string, CacheBucket<LocationPlacementPolicySnapshot>>();
const placementInflight = new Map<string, Promise<LocationPlacementPolicySnapshot>>();

function ownedSetupKey(orgId: string, locationId: string): string {
    return `loc-owned-setup:v1:${orgId.trim()}:${locationId.trim()}`;
}

function tourRulesKey(orgId: string, locationId: string): string {
    return `loc-tour-rules:v1:${orgId.trim()}:${locationId.trim()}`;
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

export function peekLocationTourRules(
    orgId: string,
    locationId: string,
): LocationTourRulesSnapshot | null {
    const hit = tourRulesCache.get(tourRulesKey(orgId, locationId));
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

function putTourRulesSnapshot(snapshot: LocationTourRulesSnapshot): void {
    tourRulesCache.set(tourRulesKey(snapshot.orgId, snapshot.locationId), {
        value: snapshot,
        fetchedAtMs: snapshot.fetchedAtMs,
    });
}

async function fetchTourRulesNetwork(
    orgId: string,
    locationId: string,
): Promise<LocationTourRulesSnapshot> {
    const response = await fetch(
        `/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`,
        { credentials: "include" },
    );
    const json = (await response.json().catch(() => ({}))) as {
        rules?: LocationTourRulePreview[];
        error?: string;
    };
    if (!response.ok) {
        throw new Error(json.error ?? "Tour availability could not be loaded.");
    }
    const rules = (json.rules ?? []).filter((rule) => rule.location_id === locationId);
    return {
        orgId,
        locationId,
        rules,
        fetchedAtMs: Date.now(),
    };
}

export async function loadLocationTourRules(
    orgId: string,
    locationId: string,
    options?: { force?: boolean },
): Promise<{ snapshot: LocationTourRulesSnapshot; cacheHit: boolean; inflightJoin: boolean }> {
    const id = orgId.trim();
    const loc = locationId.trim();
    if (!id || !loc) throw new Error("orgId and locationId required for tour rules cache");
    const key = tourRulesKey(id, loc);
    const existing = tourRulesCache.get(key);
    if (!options?.force && existing && isFresh(existing.fetchedAtMs)) {
        return { snapshot: existing.value, cacheHit: true, inflightJoin: false };
    }
    const joined = tourRulesInflight.get(key);
    if (joined) {
        return { snapshot: await joined, cacheHit: false, inflightJoin: true };
    }
    const promise = fetchTourRulesNetwork(id, loc)
        .then((snapshot) => {
            putTourRulesSnapshot(snapshot);
            // Keep owned-setup boolean aligned with the same payload.
            ownedSetupCache.set(ownedSetupKey(id, loc), {
                value: {
                    orgId: id,
                    locationId: loc,
                    toursConfigured: snapshot.rules.some((rule) => rule.is_active !== false),
                    accessConfigured: peekLocationOwnedSetup(id, loc)?.accessConfigured ?? null,
                    fetchedAtMs: snapshot.fetchedAtMs,
                },
                fetchedAtMs: snapshot.fetchedAtMs,
            });
            return snapshot;
        })
        .finally(() => {
            if (tourRulesInflight.get(key) === promise) tourRulesInflight.delete(key);
        });
    tourRulesInflight.set(key, promise);
    return { snapshot: await promise, cacheHit: false, inflightJoin: false };
}

async function fetchOwnedSetupNetwork(
    orgId: string,
    locationId: string,
): Promise<LocationOwnedSetupSnapshot> {
    const [tours, access] = await Promise.all([
        fetchTourRulesNetwork(orgId, locationId)
            .then((snapshot) => {
                putTourRulesSnapshot(snapshot);
                return snapshot.rules.some((rule) => rule.is_active !== false);
            })
            .catch(() => null),
        fetch("/api/admin/settings/users-roles/members", { credentials: "include" })
            .then(async (response) => {
                if (!response.ok) return null;
                const json = (await response.json().catch(() => ({}))) as {
                    members?: {
                        role_keys?: string[];
                        site_scope?: string;
                        effective_site_scope?: string;
                        site_location_ids?: string[];
                    }[];
                };
                // W-47: `site_scope` gained a third value, `unset` — a membership with no access
                // profile row. This question is "does an admin actually reach this location",
                // which is an enforcement question, so it reads `effective_site_scope` (what
                // `ABSENT_PROFILE_ENFORCEMENT` yields) and not the configured value. Reading the
                // configured value here would silently narrow setup-completeness on the same
                // commit that made absence representable.
                return (json.members ?? []).some(
                    (member) =>
                        member.role_keys?.includes("admin")
                        && ((member.effective_site_scope ?? member.site_scope) === "all"
                            || member.site_location_ids?.includes(locationId)),
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
            tourRulesCache.delete(tourRulesKey(id, locationId));
            tourRulesInflight.delete(tourRulesKey(id, locationId));
            return;
        }
        for (const key of [...ownedSetupCache.keys()]) {
            if (key.includes(`:${id}:`)) ownedSetupCache.delete(key);
        }
        for (const key of [...ownedSetupInflight.keys()]) {
            if (key.includes(`:${id}:`)) ownedSetupInflight.delete(key);
        }
        for (const key of [...tourRulesCache.keys()]) {
            if (key.includes(`:${id}:`)) tourRulesCache.delete(key);
        }
        for (const key of [...tourRulesInflight.keys()]) {
            if (key.includes(`:${id}:`)) tourRulesInflight.delete(key);
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
    tourRulesCache.clear();
    tourRulesInflight.clear();
    accessCache.clear();
    accessInflight.clear();
    placementCache.clear();
    placementInflight.clear();
}
