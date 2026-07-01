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

/** Resolve an inherited config value: location row wins over org default. */
export function resolveInherited<T>(
    orgDefault: T | undefined,
    locationOverride: T | undefined,
): ResolvedConfigValue<T | undefined> {
    if (locationOverride !== undefined) {
        return {
            value: locationOverride,
            owner: "location",
            isOverride: true,
            orgDefault,
        };
    }
    return {
        value: orgDefault,
        owner: "org",
        isOverride: false,
    };
}

/** Display label for a config scope. */
export function configScopeLabel(scope: ConfigScope): string {
    return scope.kind === "org" ? "Organization default" : "Location override";
}
