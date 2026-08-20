/**
 * Process-wide Map storage for server-side caches.
 *
 * WHY THIS EXISTS
 *
 * `const FOO_CACHE = new Map()` at module scope is NOT a process cache in a Next production
 * build. Route entrypoints get their own module registries, so each server route holds a separate
 * copy, and a value written while serving one route is invisible while serving the next. The
 * cache still "works" inside a single route — which is exactly why this survives review — and
 * silently does nothing across the fan-out of requests a real page makes.
 *
 * Measured on a cold Work Unit load before this existed:
 *
 *   jwks.json fetch                    167-196ms x6   (one per route, 100% miss)
 *   org_settings.metadata_for_timezone ~481ms   x1 per load, inside a 90s TTL
 *   status_definitions.org_select      ~490ms   x1 per load, inside a 90s TTL
 *
 * A cache whose whole purpose is to span requests must live somewhere that spans requests.
 *
 * This changes ONLY where the Map lives. TTL, key shape, eviction and invalidation stay with the
 * caller — `processMap` hands back a plain Map, so existing `.get`/`.set`/`.delete`/`.keys` logic
 * is untouched.
 *
 * Not for per-request state: entries outlive the request. Cache only what is safe to share
 * between requests, and keep the tenant in the key — every existing caller keys by `orgId`.
 */

type CacheRegistry = Map<string, Map<unknown, unknown>>;

const g = globalThis as typeof globalThis & { __alloyProcessCaches?: CacheRegistry };
const registry: CacheRegistry = (g.__alloyProcessCaches ??= new Map());

/**
 * Returns the process-wide Map registered under `name`, creating it on first use.
 * `name` must be unique per cache — collisions silently merge two caches into one.
 */
export function processMap<K, V>(name: string): Map<K, V> {
    let m = registry.get(name);
    if (!m) {
        m = new Map();
        registry.set(name, m);
    }
    return m as Map<K, V>;
}
