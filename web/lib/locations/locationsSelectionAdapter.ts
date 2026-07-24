/**
 * Locations ↔ Configuration Continuity selection adapter (Checkpoint B).
 *
 * Single projection contract for selected Location identity.
 * Precedence (Locations doctrine: never invent a first-item default):
 *   1. valid route/query locationId
 *   2. valid retained Continuity selection (when route omits locationId)
 *   3. no selection (landing)
 *
 * Invalid route IDs fail closed to no selection with an error message.
 */

export type LocationsSelectionSource = "route" | "retained" | "none";

export type LocationsSelectionResolution = {
    locationId: string | null;
    source: LocationsSelectionSource;
    /** Set when route pointed at an unavailable Location. */
    error: string | null;
    /** True when URL should be replace()-synced to the resolved id (retained restore). */
    shouldSyncRoute: boolean;
};

export function resolveLocationsSelection(args: {
    routeLocationId: string | null | undefined;
    retainedLocationId: string | null | undefined;
    validSiteIds: ReadonlySet<string> | readonly string[];
    /** When false, skip retained restore (explicit landing-only). Default true. */
    allowRetainedRestore?: boolean;
}): LocationsSelectionResolution {
    const routeId = String(args.routeLocationId ?? "").trim() || null;
    const retainedId = String(args.retainedLocationId ?? "").trim() || null;
    const allowRetained = args.allowRetainedRestore !== false;
    const valid =
        args.validSiteIds instanceof Set ?
            args.validSiteIds
        :   new Set(Array.from(args.validSiteIds, (id) => String(id)));

    if (routeId) {
        if (valid.has(routeId)) {
            return {
                locationId: routeId,
                source: "route",
                error: null,
                shouldSyncRoute: false,
            };
        }
        return {
            locationId: null,
            source: "none",
            error: "Location not found or unavailable.",
            shouldSyncRoute: false,
        };
    }

    if (allowRetained && retainedId && valid.has(retainedId)) {
        return {
            locationId: retainedId,
            source: "retained",
            error: null,
            shouldSyncRoute: true,
        };
    }

    return {
        locationId: null,
        source: "none",
        error: null,
        shouldSyncRoute: false,
    };
}

/**
 * Resolve nested concern tab/item from URL vs local state.
 * URL wins when the page receives new searchParams (Back/Forward / deep link).
 */
export function resolveLocationsConcernState<T extends string>(args: {
    routeTab: T;
    routeItemId: string | null;
    localTab: T;
    localItemId: string | null;
    routeLocationId: string | null;
    localLocationId: string | null;
}): { tab: T; itemId: string | null; locationChanged: boolean } {
    const routeLocationId = String(args.routeLocationId ?? "").trim() || null;
    const localLocationId = String(args.localLocationId ?? "").trim() || null;
    const locationChanged = routeLocationId !== localLocationId;
    if (locationChanged || args.routeTab !== args.localTab) {
        return {
            tab: args.routeTab,
            itemId: args.routeItemId,
            locationChanged,
        };
    }
    return {
        tab: args.localTab,
        itemId: args.localItemId,
        locationChanged: false,
    };
}
