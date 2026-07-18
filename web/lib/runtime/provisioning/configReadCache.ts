/**
 * Server-side CONFIG-read cache for the Provisioning Answer critical path.
 *
 * The composer's biggest cost is not data — it is re-reading published CONFIGURATION on every single
 * answer: the work-unit row, its department config, the queue-row surface layout (~700ms), and the
 * header layout. That config changes only when an admin publishes a surface (rare, off the operational
 * path), yet every operator navigation paid the full DB round-trips again. The composer's own ratified
 * budget is ≤400ms p75 (workUnitProvisioningAnswer.ts) — these reads alone blew ~4× past it.
 *
 * This is a small, TTL'd, **tenant-keyed** in-memory memo. It caches only CONFIG (never the live
 * `opportunities` records — those must reflect every mutation). A short TTL keeps a surface publish
 * visible within seconds while collapsing the repeated reads across a burst of navigation (pill
 * switches, work-unit hops) and across warm re-visits.
 *
 * Correctness rules:
 *  - EVERY key includes the tenant (orgId). A cached config value can never cross a tenant.
 *  - Failures are never cached (a rejecting loader is evicted) — a transient error can't stick.
 *  - Bounded: an LRU-ish cap evicts the oldest on overflow so the map can't grow unbounded.
 *  - Explicit `invalidateConfigReadCache(prefix)` for a publish flow to bust immediately if wired.
 */

/** Default freshness — long enough to collapse a navigation burst, short enough that a publish shows. */
export const CONFIG_READ_TTL_MS = 15_000;
const MAX_ENTRIES = 512;

type Entry = { value: Promise<unknown>; expiresAt: number };

const store = new Map<string, Entry>();

/** Injectable clock for deterministic tests; `Date.now` in production (server code, not the sandbox). */
let clock: () => number = () => Date.now();

/**
 * Read a CONFIG value through the cache. A fresh, non-expired entry for `key` is reused; otherwise the
 * loader runs and its promise is memoised. The promise (not the resolved value) is cached, so N
 * concurrent callers for the same key share ONE in-flight DB read.
 */
export function cachedConfigRead<T>(key: string, loader: () => Promise<T>, ttlMs = CONFIG_READ_TTL_MS): Promise<T> {
    const now = clock();
    const existing = store.get(key);
    if (existing && existing.expiresAt > now) return existing.value as Promise<T>;

    const value = loader();
    store.set(key, { value, expiresAt: now + ttlMs });
    if (store.size > MAX_ENTRIES) evictOldest();

    // Never cache a failure: if this exact promise rejects, drop it so the next read re-fetches.
    void value.catch(() => {
        if (store.get(key)?.value === value) store.delete(key);
    });
    return value;
}

/** Bust cached config — no prefix clears all; a prefix (e.g. `wu:${orgId}:`) clears one tenant/kind. */
export function invalidateConfigReadCache(prefix?: string): void {
    if (!prefix) {
        store.clear();
        return;
    }
    for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

function evictOldest(): void {
    // Map preserves insertion order; the first key is the oldest inserted. Cheap approximate-LRU.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
}

/** @internal test seam. */
export function __setConfigReadCacheClockForTests(fn: () => number): void {
    clock = fn;
}

/** @internal test seam. */
export function __clearConfigReadCacheForTests(): void {
    store.clear();
    clock = () => Date.now();
}
