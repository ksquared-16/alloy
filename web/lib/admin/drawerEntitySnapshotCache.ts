/** Short-lived drawer entity snapshot cache — restores stack back navigation without a loading shell. */

const TTL_MS = 120_000;

type CacheEntry = {
    data: Record<string, unknown>;
    fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

export function drawerEntitySnapshotKey(type: string, id: string): string {
    return `${type}:${id}`;
}

export function peekDrawerEntitySnapshot(
    type: string | null | undefined,
    id: string | null | undefined
): Record<string, unknown> | null {
    if (!type?.trim() || !id?.trim() || id === "new") return null;
    const ent = cache.get(drawerEntitySnapshotKey(type, id));
    if (!ent) return null;
    if (Date.now() - ent.fetchedAt > TTL_MS) {
        cache.delete(drawerEntitySnapshotKey(type, id));
        return null;
    }
    return ent.data;
}

export function putDrawerEntitySnapshot(
    type: string | null | undefined,
    id: string | null | undefined,
    data: Record<string, unknown> | null | undefined
): void {
    if (!type?.trim() || !id?.trim() || id === "new" || data == null) return;
    cache.set(drawerEntitySnapshotKey(type, id), { data, fetchedAt: Date.now() });
}

export function clearDrawerEntitySnapshot(type: string, id: string): void {
    cache.delete(drawerEntitySnapshotKey(type, id));
}

/** @internal test helper */
export function __clearDrawerEntitySnapshotCacheForTests(): void {
    cache.clear();
}
