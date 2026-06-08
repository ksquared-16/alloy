/**
 * Layout resolution cache — keyed by org / entity / surface (+ queue context).
 *
 * The resolved {@link ExtendedLayoutResolution} for a given (org, entityType,
 * surface, queueContext) is stable between publishes, so we cache it with a short
 * TTL to avoid re-querying `entity_layouts` on every drawer/queue open. The cached
 * entry carries the resolved layout `version`/`source` (the "...by version" part of
 * the doctrine) for observability and targeted invalidation.
 *
 * Freshness ("settings layout changes reflect in runtime"): a short default TTL
 * bounds staleness, and {@link invalidateLayoutResolution} is called on publish so
 * changes surface immediately within the same process.
 */

import type { ExtendedLayoutResolution } from "./layoutResolver";
import type { LayoutSurface } from "./layoutV2";
import type { QueueLayoutContextRequest } from "./queueLayoutContext";

export const DEFAULT_LAYOUT_RESOLUTION_TTL_MS = 30_000;

export type LayoutResolutionCacheKeyParts = {
    orgId: string;
    entityType: string;
    surface: LayoutSurface;
    queueContext?: QueueLayoutContextRequest;
    /** Distinguishes registry-only resolution from the published-fetch path. */
    fetchPublishedLayouts?: boolean;
};

type CacheEntry = {
    value: ExtendedLayoutResolution;
    /** Resolved layout version captured at insert time (informational). */
    version: number | null;
    expiresAt: number;
};

const store = new Map<string, CacheEntry>();

function queueContextSignature(ctx: QueueLayoutContextRequest | undefined): string {
    if (!ctx) return "";
    // Stable, order-independent signature of the populated context keys.
    return Object.keys(ctx)
        .sort()
        .map((k) => `${k}=${String((ctx as Record<string, unknown>)[k] ?? "")}`)
        .filter((pair) => !pair.endsWith("="))
        .join("&");
}

export function buildLayoutResolutionCacheKey(parts: LayoutResolutionCacheKeyParts): string {
    return [
        parts.orgId,
        parts.entityType,
        parts.surface,
        parts.fetchPublishedLayouts ? "published" : "registry",
        queueContextSignature(parts.queueContext),
    ].join("::");
}

function resolutionVersion(value: ExtendedLayoutResolution): number | null {
    return value.record?.version ?? null;
}

/** Read a non-expired cached resolution, or null. `now` is injectable for tests. */
export function getCachedLayoutResolution(
    key: string,
    now: number = Date.now(),
): ExtendedLayoutResolution | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
        store.delete(key);
        return null;
    }
    return entry.value;
}

/** Store a resolution with a TTL. ttlMs <= 0 disables caching (no-op). */
export function setCachedLayoutResolution(
    key: string,
    value: ExtendedLayoutResolution,
    ttlMs: number = DEFAULT_LAYOUT_RESOLUTION_TTL_MS,
    now: number = Date.now(),
): void {
    if (ttlMs <= 0) return;
    store.set(key, { value, version: resolutionVersion(value), expiresAt: now + ttlMs });
}

/**
 * Invalidate cached resolutions. Without a predicate, clears everything; with one,
 * drops only matching keys. Called on publish so authored changes reflect at once.
 */
export function invalidateLayoutResolution(predicate?: (key: string) => boolean): void {
    if (!predicate) {
        store.clear();
        return;
    }
    for (const key of [...store.keys()]) {
        if (predicate(key)) store.delete(key);
    }
}

/** Invalidate every cached surface for one org+entity (both registry + published keys). */
export function invalidateLayoutResolutionForEntity(orgId: string, entityType: string): void {
    const prefix = `${orgId}::${entityType}::`;
    invalidateLayoutResolution((key) => key.startsWith(prefix));
}

export function clearLayoutResolutionCache(): void {
    store.clear();
}
