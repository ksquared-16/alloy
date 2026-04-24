/**
 * Coalesces identical in-flight GETs so mounts that share the same URL
 * (e.g. sidebar + workspace data hook) do not double-hit the API on cold navigation.
 */
const inflight = new Map<string, Promise<Response>>();

export function dedupeAdminFetch(input: string, init?: RequestInit): Promise<Response> {
    const key = input;
    let p = inflight.get(key);
    if (!p) {
        p = fetch(input, init).finally(() => {
            inflight.delete(key);
        });
        inflight.set(key, p);
    }
    return p;
}
