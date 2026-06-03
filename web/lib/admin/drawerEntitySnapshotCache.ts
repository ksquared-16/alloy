/** Short-lived drawer entity snapshot cache — restores stack back navigation without a loading shell. */

import { drawerSurfaceRank } from "@/lib/admin/drawer/drawerSurfaceRank";

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
    data: Record<string, unknown> | null | undefined,
    opts?: { replace?: boolean }
): void {
    if (!type?.trim() || !id?.trim() || id === "new" || data == null) return;
    const key = drawerEntitySnapshotKey(type, id);
    // Card 3 — monotonic snapshots: never downgrade a higher paint-completeness surface (e.g. `full`)
    // to a lower one (e.g. `drawer_primary`) within the TTL window. Unranked surfaces (person seeds,
    // generic records without `_record_surface`) are unaffected — their writes always apply.
    // `{ replace: true }` forces a write (authoritative refresh / post-mutation rewrite).
    if (!opts?.replace) {
        const existing = cache.get(key);
        if (existing && Date.now() - existing.fetchedAt <= TTL_MS) {
            const existingRank = drawerSurfaceRank(existing.data);
            const incomingRank = drawerSurfaceRank(data);
            if (existingRank != null && incomingRank != null && incomingRank < existingRank) {
                return;
            }
        }
    }
    cache.set(key, { data, fetchedAt: Date.now() });
}

export function clearDrawerEntitySnapshot(type: string, id: string): void {
    cache.delete(drawerEntitySnapshotKey(type, id));
}

/** @internal test helper */
export function __clearDrawerEntitySnapshotCacheForTests(): void {
    cache.clear();
}
