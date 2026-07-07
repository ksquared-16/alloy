/**
 * Queue row child profile vocabulary — registry-backed fields exposed via Children collection runtime.
 */

/** Child profile refKeys with active queue row runtime resolvers. */
export const QUEUE_ROW_RESOLVER_BACKED_CHILD_PROFILE_FIELD_KEYS = ["child.gender"] as const;

export const QUEUE_ROW_CHILD_PROFILE_PLACEHOLDER_FIELD_CATALOG: readonly {
    fieldKey: string;
    label: string;
    reason?: string;
}[] = [];

export function isQueueRowChildProfileFieldResolverBacked(fieldKey: string): boolean {
    const key = fieldKey.trim();
    return (QUEUE_ROW_RESOLVER_BACKED_CHILD_PROFILE_FIELD_KEYS as readonly string[]).includes(key);
}

export function buildUnavailableChildProfileLibraryEntries(): Array<{
    kind: "unavailable";
    fieldKey: string;
    label: string;
    reason: string;
    category: "child";
}> {
    return QUEUE_ROW_CHILD_PROFILE_PLACEHOLDER_FIELD_CATALOG.filter(
        (entry) => !isQueueRowChildProfileFieldResolverBacked(entry.fieldKey),
    ).map((entry) => ({
        kind: "unavailable" as const,
        fieldKey: entry.fieldKey,
        label: entry.label,
        reason: entry.reason ?? "Not available yet — missing queue row resolver",
        category: "child" as const,
    }));
}
