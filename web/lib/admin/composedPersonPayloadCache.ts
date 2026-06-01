/**
 * Short-lived "confirmed-ready" marker for composed person drawer payloads.
 *
 * When the composed payload for a specific person + surface + section set has been
 * evaluated as ready (all required sections satisfied), we record that context key
 * here. On the next open of the same person in the same context — even if the component
 * has re-rendered between opens — the composed fetch effect can skip the network round-
 * trip because the system already confirmed this context is renderable.
 *
 * Keyed by the same `personDrawerComposedContextKey` string used in AdminEntityDrawer:
 *   `{personId}|{surface}|{sortedSectionKeys}`
 *
 * TTL is intentionally shorter than the entity snapshot cache (120 s) so stale role/
 * section config changes still trigger a re-evaluation within a reasonable window.
 */

const TTL_MS = 90_000;

type Entry = { ts: number };

const cache = new Map<string, Entry>();

/**
 * Mark a composed-payload context key as confirmed-ready.
 * Call when `personDrawerComposedPayloadIsReady` transitions to true.
 */
export function putComposedPersonPayloadReady(contextKey: string): void {
    if (!contextKey.trim()) return;
    cache.set(contextKey, { ts: Date.now() });
}

/**
 * Returns true if this context key was recently confirmed as composed-ready and has not expired.
 */
export function isComposedPersonPayloadRecentlyReady(contextKey: string | null | undefined): boolean {
    if (!contextKey?.trim()) return false;
    const entry = cache.get(contextKey);
    if (!entry) return false;
    if (Date.now() - entry.ts > TTL_MS) {
        cache.delete(contextKey);
        return false;
    }
    return true;
}

/** @internal test helper */
export function __clearComposedPersonPayloadCacheForTests(): void {
    cache.clear();
}
