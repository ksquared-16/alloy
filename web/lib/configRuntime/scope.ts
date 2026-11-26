/**
 * Configuration Runtime — scope and ownership primitives.
 *
 * These types are proven across Fields, Layouts, Programs, and Tuition.
 * Every configuration surface in Alloy operates within one of these scopes.
 */

/** The two configuration scopes in Alloy. */
export type ConfigScope =
    | { kind: "org"; orgId: string }
    | { kind: "location"; orgId: string; locationId: string };

/** Who manages a given configuration value. */
export type ConfigOwner = "org" | "location";
export type ConfigAuthority = "platform" | "org" | "location";

export type ConfigValueLayer<T> = {
    authority: ConfigAuthority;
    /**
     * Presence is explicit so false, null, zero, and an empty string remain
     * valid authored values rather than being mistaken for no layer.
     */
    present: boolean;
    value: T;
};

export type ResolvedConfigLayer<T> = {
    value: T | undefined;
    authority: ConfigAuthority | null;
    isOverride: boolean;
};

/**
 * A resolved configuration value — either an org default or a location override.
 * `isOverride` is true when the value is location-specific and differs from the org default.
 */
export type ResolvedConfigValue<T> = {
    value: T;
    owner: ConfigOwner;
    /** True when this location has an explicit override of the org default. */
    isOverride: boolean;
    /** The org default, if a location-level value overrides it. */
    orgDefault?: T;
};

const AUTHORITY_RANK: Record<ConfigAuthority, number> = {
    platform: 0,
    org: 1,
    location: 2,
};

/**
 * Resolve platform → organization → location configuration using the nearest
 * explicitly present layer. Domains remain responsible for deciding whether
 * the setting is value inheritance or availability.
 */
export function resolveConfigLayers<T>(
    layers: readonly ConfigValueLayer<T>[],
): ResolvedConfigLayer<T> {
    const resolved = [...layers]
        .filter((layer) => layer.present)
        .sort((a, b) => AUTHORITY_RANK[b.authority] - AUTHORITY_RANK[a.authority])[0];
    return {
        value: resolved?.value,
        authority: resolved?.authority ?? null,
        isOverride: resolved?.authority === "location",
    };
}

/** Resolve an inherited config value: location row wins over org default. */
export function resolveInherited<T>(
    orgDefault: T | undefined,
    locationOverride: T | undefined,
): ResolvedConfigValue<T | undefined> {
    const resolved = resolveConfigLayers<T | undefined>([
        { authority: "org", present: orgDefault !== undefined, value: orgDefault },
        { authority: "location", present: locationOverride !== undefined, value: locationOverride },
    ]);
    if (resolved.authority === "location") {
        return {
            value: resolved.value,
            owner: "location",
            isOverride: true,
            orgDefault,
        };
    }
    return {
        value: resolved.value,
        owner: "org",
        isOverride: false,
    };
}

/** Display label for a config scope. */
export function configScopeLabel(scope: ConfigScope): string {
    return scope.kind === "org" ? "Organization default" : "Location override";
}
