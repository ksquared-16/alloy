/**
 * Queue row child profile vocabulary — registry-backed fields not yet exposed on queue rows.
 *
 * Fields like `child.gender` exist in the customer_member field registry and resolve in
 * drawer/profile surfaces, but queue row runtime does not hydrate or resolve them yet.
 */

/** Child profile refKeys catalogued before queue row resolver work lands. */
export const QUEUE_ROW_CHILD_PROFILE_PLACEHOLDER_FIELD_CATALOG: readonly {
    fieldKey: string;
    label: string;
    reason?: string;
}[] = [
    {
        fieldKey: "child.gender",
        label: "Gender",
        reason: "Registered in field registry — queue row resolver not available yet",
    },
];

/** Child profile refKeys with active queue row runtime resolvers. */
export const QUEUE_ROW_RESOLVER_BACKED_CHILD_PROFILE_FIELD_KEYS = [] as const;

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
