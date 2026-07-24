/**
 * Nested Location concern contract — Checkpoint C.
 *
 * Smallest shared surface for concern routing, registry metadata, and
 * transition projection. Does not own Continuity, collection cache, or
 * domain presentation.
 *
 * @see docs/audits/active/organization-runtime-checkpoint-c-2026-07.md
 */

import {
    LOCATION_WORKSPACE_TABS,
    locationWorkspaceHref,
    locationsLandingHref,
    parseLocationWorkspaceTab,
    type LocationWorkspaceTab,
} from "@/lib/locations/locationWorkspaceModel";
import {
    LOCATION_SETTINGS_PATH,
    ORGANIZATION_LOCATIONS_PATH,
} from "@/lib/admin/canonicalLocationSettingsRoutes";

export type LocationConcernKey = LocationWorkspaceTab;

export type LocationConcernDataStrategy =
    | "collection"
    | "derived"
    | "concern-cache"
    | "none";

export type LocationConcernPrefetchPolicy = "none" | "intent" | "adjacent";

export type LocationConcernDefinition = {
    key: LocationConcernKey;
    label: string;
    /** When true, `itemId` may appear in the URL for nested object selection. */
    supportsItemId: boolean;
    dataStrategy: LocationConcernDataStrategy;
    prefetch: LocationConcernPrefetchPolicy;
    /** Keep DOM mounted after first visit to avoid false empties on return. */
    keepAlive: boolean;
};

/** Canonical registry — order matches operator tabs. */
export const LOCATION_CONCERN_REGISTRY: readonly LocationConcernDefinition[] = [
    {
        key: "overview",
        label: "Overview",
        supportsItemId: false,
        dataStrategy: "derived",
        prefetch: "none",
        keepAlive: false,
    },
    {
        key: "programs",
        label: "Programs",
        supportsItemId: true,
        dataStrategy: "collection",
        prefetch: "adjacent",
        keepAlive: false,
    },
    {
        key: "rooms",
        label: "Rooms",
        supportsItemId: true,
        dataStrategy: "collection",
        prefetch: "adjacent",
        keepAlive: false,
    },
    {
        key: "schedule",
        label: "Schedule",
        supportsItemId: true,
        dataStrategy: "collection",
        prefetch: "adjacent",
        keepAlive: false,
    },
    {
        key: "tours",
        label: "Tours",
        supportsItemId: false,
        dataStrategy: "concern-cache",
        prefetch: "intent",
        keepAlive: true,
    },
    {
        key: "placement",
        label: "Placement",
        supportsItemId: false,
        dataStrategy: "concern-cache",
        prefetch: "intent",
        keepAlive: true,
    },
    {
        key: "access",
        label: "Access",
        supportsItemId: false,
        dataStrategy: "concern-cache",
        prefetch: "intent",
        keepAlive: true,
    },
] as const;

const CONCERN_BY_KEY = new Map(LOCATION_CONCERN_REGISTRY.map((c) => [c.key, c]));

export function getLocationConcernDefinition(key: LocationConcernKey): LocationConcernDefinition {
    return CONCERN_BY_KEY.get(key) ?? LOCATION_CONCERN_REGISTRY[0]!;
}

export function isLocationConcernKey(raw: string | null | undefined): raw is LocationConcernKey {
    const value = String(raw ?? "").trim();
    return LOCATION_WORKSPACE_TABS.some((tab) => tab.key === value);
}

/** Route → active concern. Invalid tabs normalize to overview (replace semantics at caller). */
export function resolveActiveLocationConcern(
    rawTab: string | string[] | null | undefined,
): { concern: LocationConcernKey; normalized: boolean } {
    const value = Array.isArray(rawTab) ? rawTab[0] : rawTab;
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return { concern: "overview", normalized: false };
    if (isLocationConcernKey(trimmed)) return { concern: trimmed, normalized: false };
    return { concern: "overview", normalized: true };
}

export function parseLocationConcernTab(
    raw: string | string[] | null | undefined,
): LocationConcernKey {
    return parseLocationWorkspaceTab(raw);
}

/** Canonical concern href (Organization namespace). */
export function locationConcernHref(
    locationId: string,
    concern: LocationConcernKey = "overview",
    itemId?: string | null,
): string {
    return locationWorkspaceHref(locationId, concern, itemId);
}

export function locationsConcernLandingHref(): string {
    return locationsLandingHref();
}

/** Compatibility Settings-path concern href (same query contract). */
export function locationConcernCompatibilityHref(
    locationId: string,
    concern: LocationConcernKey = "overview",
    itemId?: string | null,
): string {
    const canonical = locationConcernHref(locationId, concern, itemId);
    return canonical.replace(ORGANIZATION_LOCATIONS_PATH, LOCATION_SETTINGS_PATH);
}

export type LocationConcernTransitionKind =
    | "cold"
    | "warm"
    | "refreshing"
    | "ready"
    | "empty"
    | "forbidden"
    | "error";

/**
 * Project loading UI state for a concern. Unloaded ≠ empty.
 * Callers pass whether prior content exists and the latest request outcome.
 */
export function projectLocationConcernTransition(args: {
    hasPriorContent: boolean;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    forbidden?: boolean;
    isEmptyResult?: boolean;
}): LocationConcernTransitionKind {
    if (args.forbidden) return "forbidden";
    if (args.error && !args.hasPriorContent) return "error";
    if (args.loading && !args.hasPriorContent) return "cold";
    if (args.refreshing && args.hasPriorContent) return "refreshing";
    if (args.loading && args.hasPriorContent) return "warm";
    if (args.isEmptyResult) return "empty";
    if (args.error) return "error";
    return "ready";
}

/**
 * Stale-response gate: only apply when request identity still matches.
 * Latest Location + concern generation must win.
 */
export function shouldApplyLocationConcernResponse(args: {
    requestSeq: number;
    latestSeq: number;
    requestLocationId: string;
    activeLocationId: string;
    requestConcern?: LocationConcernKey | null;
    activeConcern?: LocationConcernKey | null;
}): boolean {
    if (args.requestSeq !== args.latestSeq) return false;
    if (args.requestLocationId !== args.activeLocationId) return false;
    if (
        args.requestConcern != null
        && args.activeConcern != null
        && args.requestConcern !== args.activeConcern
    ) {
        return false;
    }
    return true;
}

/** Adjacent concerns for optional prefetch (left/right in registry order). */
export function adjacentLocationConcerns(concern: LocationConcernKey): LocationConcernKey[] {
    const idx = LOCATION_CONCERN_REGISTRY.findIndex((c) => c.key === concern);
    if (idx < 0) return [];
    const out: LocationConcernKey[] = [];
    const prev = LOCATION_CONCERN_REGISTRY[idx - 1];
    const next = LOCATION_CONCERN_REGISTRY[idx + 1];
    if (prev) out.push(prev.key);
    if (next) out.push(next.key);
    return out;
}

export function locationConcernPrefetchTargets(
    concern: LocationConcernKey,
): LocationConcernKey[] {
    const def = getLocationConcernDefinition(concern);
    if (def.prefetch === "none") return [];
    if (def.prefetch === "adjacent") return adjacentLocationConcerns(concern);
    // intent: caller decides; registry marks which concerns accept intent prefetch
    return LOCATION_CONCERN_REGISTRY.filter((c) => c.prefetch === "intent" && c.key !== concern).map(
        (c) => c.key,
    );
}
