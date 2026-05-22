/**
 * Coalesces identical in-flight GETs so mounts that share the same URL
 * (e.g. sidebar + workspace data hook) do not double-hit the API on cold navigation.
 *
 * Important: callers must receive **independent clones** — the Fetch spec allows only one consumer
 * to read each Response body stream. Returning the raw shared Response causes the second `.json()`
 * to fail or yield `{}`, breaking department lookup ("Department not found for this organization").
 */
const inflight = new Map<string, Promise<Response>>();

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
export async function dedupeAdminFetchWithTtl(input: string, init: RequestInit | undefined, ttlMs: number): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = input;
    if (method === "GET" && ttlMs > 0) {
        const hit = shortCache.get(key);
        if (hit && Date.now() - hit.atMs < ttlMs) {
            return new Response(hit.bodyText, { status: hit.status, statusText: hit.statusText, headers: hit.headers });
        }
    }
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
            // bounded growth: clear oldest-ish by size.
            if (shortCache.size > 50) {
                const first = shortCache.keys().next().value;
                if (first) shortCache.delete(first);
            }
        } catch {
            // ignore cache failures (e.g. non-cloneable)
        }
    }
    return res;
}
