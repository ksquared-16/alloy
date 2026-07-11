/**
 * Canonical collection runtime resolution contract.
 *
 * Shared across Forms / Documents and future consumers. Collection resolution
 * returns typed status — empty is not an error; invalid context differs from empty.
 */

export type CanonicalCollectionResolutionStatus =
    | "resolved"
    | "empty"
    | "unavailable"
    | "unsupported"
    | "invalid_context";

export type CanonicalCollectionItem<T extends Record<string, unknown> = Record<string, unknown>> = {
    /** Stable canonical item identity — never array index or display label. */
    item_id: string;
    item_entity_type: string;
    record: T;
    /** Optional relationship metadata — one row per Person in P4 first release. */
    relationship_role_refs?: readonly string[];
};

export type CanonicalCollectionResolution<T extends Record<string, unknown> = Record<string, unknown>> =
    | { status: "resolved"; items: CanonicalCollectionItem<T>[] }
    | { status: "empty"; items: [] }
    | { status: "unavailable"; reason?: string; items: [] }
    | { status: "unsupported"; reason?: string; items: [] }
    | { status: "invalid_context"; reason?: string; items: [] };

export function isResolvedCollection<T extends Record<string, unknown>>(
    resolution: CanonicalCollectionResolution<T>,
): resolution is CanonicalCollectionResolution<T> & { status: "resolved" } {
    return resolution.status === "resolved";
}

export function collectionResolutionFailureReason(
    resolution: CanonicalCollectionResolution,
): string | undefined {
    if (resolution.status === "resolved" || resolution.status === "empty") return undefined;
    return resolution.reason ?? resolution.status;
}
