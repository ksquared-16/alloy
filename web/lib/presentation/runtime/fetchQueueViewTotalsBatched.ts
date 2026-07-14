/**
 * Batched canonical Work View totals client (Trust Closure). Sends ALL targets in ONE POST to the
 * grouped endpoint, replacing the per-view HTTP fan-out — the browser issues exactly one request
 * regardless of how many pills a work unit has. The hook falls back to the per-view path on failure.
 */

import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type QueueViewTotalTargetInput = { workUnitId: string; queueKey: string; workViewId: string };

/** Map key — identical to `workViewTotalKey(workUnitId, viewId)`, so consumers read one namespace. */
function totalsKey(workUnitId: string, workViewId: string): string {
    return `${workUnitId}::${workViewId}`;
}

/**
 * One request → a `Map` of `workUnitId::workViewId` → count (null when the server reports the count
 * as not known, so the caller shows no badge rather than a wrong number). Throws on transport/HTTP
 * failure so the caller can fall back to the per-view path.
 */
export async function fetchQueueViewTotalsBatched(args: {
    targets: readonly QueueViewTotalTargetInput[];
    selectedSiteId: string | null;
    fetchImpl?: typeof fetch;
}): Promise<Map<string, number | null>> {
    const fetchImpl = args.fetchImpl ?? fetch;
    const init = workspaceDataFetchInit() ?? {};
    const res = await fetchImpl("/api/admin/queue-view-totals", {
        ...init,
        method: "POST",
        headers: { ...(init.headers ?? {}), "content-type": "application/json" },
        body: JSON.stringify({ targets: args.targets, selectedSiteId: args.selectedSiteId }),
    });
    if (!res.ok) throw new Error(`queue-view-totals ${res.status}`);
    const json = (await res.json()) as {
        totals?: Array<{ workUnitId: string; workViewId: string; count: number | null; known: boolean }>;
    };
    const map = new Map<string, number | null>();
    for (const t of json.totals ?? []) {
        map.set(totalsKey(t.workUnitId, t.workViewId), t.known ? t.count : null);
    }
    return map;
}
