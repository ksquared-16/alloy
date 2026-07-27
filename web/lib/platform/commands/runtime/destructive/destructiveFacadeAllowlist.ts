/**
 * Exact destructive/replacement capabilities allowed to commit via Command Runtime.
 * Keep this module free of registry/guard imports to avoid cycles.
 */

export const DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST = ["make_primary_contact"] as const;

export type DestructiveFacadeCommitAllowlistKey =
    (typeof DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST)[number];

export function isDestructiveFacadeCommitAllowlisted(capabilityKey: string): boolean {
    const key = (capabilityKey ?? "").trim();
    return (DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST as readonly string[]).includes(key);
}
