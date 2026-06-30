/**
 * Coalesces identical in-flight GETs so mounts that share the same URL
 * (e.g. sidebar + workspace data hook) do not double-hit the API on cold navigation.
 *
 * Important: callers must receive **independent clones** — the Fetch spec allows only one consumer
 * to read each Response body stream. Returning the raw shared Response causes the second `.json()`
 * to fail or yield `{}`, breaking department lookup ("Department not found for this organization").
 */
const inflight = new Map<string, Promise<Response>>();

/**
 * TTL for the lifecycle sidebar landing + work-unit sibling-nav fetches (dept work-units, dept
 * work-unit-queue-summaries, lifecycle-catalog). These are session-stable operational signals
 * fetched on every workspace/work-unit mount; sharing them across re-navigations (and across the
 * sidebar landing + the work-unit page, which use the same URLs) collapses the repeated expensive
 * summary calls. Counts may be up to this window stale — acceptable for peripheral sibling signals.
 */
export const LIFECYCLE_SIBLING_FETCH_TTL_MS = 30_000;

const WORKSPACE_DEPARTMENTS_URL = "/api/admin/departments";

/** Bust coalesced / TTL cache for workspace department list after lifecycle create/repair/delete. */
export function bustWorkspaceDepartmentsFetchDedupe(): void {
    inflight.delete(WORKSPACE_DEPARTMENTS_URL);
    shortCache.delete(WORKSPACE_DEPARTMENTS_URL);
}

/** Test-only — clears in-flight and TTL caches between vitest cases. */
export function resetWorkspaceAdminFetchDedupeForTests(): void {
    inflight.clear();
    shortCache.clear();
}

export function dedupeAdminFetch(input: string, init?: RequestInit): Promise<Response> {
    const key = input;
    let p = inflight.get(key);
    if (!p) {
        p = fetch(input, init).finally(() => {
            inflight.delete(key);
        });
        inflight.set(key, p);
    }
    return p.then((res) => res.clone());
}

type CachedResponse = { atMs: number; status: number; statusText: string; headers: [string, string][]; bodyText: string };
const shortCache = new Map<string, CachedResponse>();

/**
 * Like `dedupeAdminFetch`, plus a short TTL response cache keyed by full URL.
 * Intended for config-like GETs (actions/rules/options) during UI mount to avoid repeated roundtrips.
 */
export type AdminFetchDedupeMeta = {
    response: Response;
    /** Response served from short TTL cache (prefetch warmed navigation). */
    cache_hit: boolean;
    /** Joined an in-flight GET started by another caller (same URL). */
    inflight_join: boolean;
};

export async function dedupeAdminFetchWithTtlMeta(
    input: string,
    init: RequestInit | undefined,
    ttlMs: number
): Promise<AdminFetchDedupeMeta> {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = input;
    if (method === "GET" && ttlMs > 0) {
        const hit = shortCache.get(key);
        if (hit && Date.now() - hit.atMs < ttlMs) {
            return {
                response: new Response(hit.bodyText, {
                    status: hit.status,
                    statusText: hit.statusText,
                    headers: hit.headers,
                }),
                cache_hit: true,
                inflight_join: false,
            };
        }
    }
    const inflight_join = inflight.has(key);
    const res = await dedupeAdminFetch(input, init);
    if (method === "GET" && ttlMs > 0) {
        try {
            const clone = res.clone();
            const bodyText = await clone.text();
            shortCache.set(key, {
                atMs: Date.now(),
                status: res.status,
                statusText: res.statusText,
                headers: Array.from(res.headers.entries()),
                bodyText,
            });
            if (shortCache.size > 50) {
                const first = shortCache.keys().next().value;
                if (first) shortCache.delete(first);
            }
        } catch {
            /* ignore cache write failures */
        }
    }
    return { response: res, cache_hit: false, inflight_join };
}

export async function dedupeAdminFetchWithTtl(
    input: string,
    init: RequestInit | undefined,
    ttlMs: number
): Promise<Response> {
    const { response } = await dedupeAdminFetchWithTtlMeta(input, init, ttlMs);
    return response;
}
