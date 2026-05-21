import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const DRAWER_FULL_CACHE_TTL_MS = 8_000;

type DrawerFullCacheEntry = {
    promise: Promise<Record<string, unknown>>;
};

const drawerFullByOpportunityId = new Map<string, DrawerFullCacheEntry>();

export function buildOpportunityDrawerFullUrl(opportunityId: string): string {
    return `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId.trim())}?surface=full`;
}

function drawerFullCacheKey(opportunityId: string): string {
    return opportunityId.trim();
}

export function isOpportunityDrawerFullWarm(opportunityId: string): boolean {
    const key = drawerFullCacheKey(opportunityId);
    return key.length > 0 && drawerFullByOpportunityId.has(key);
}

export function prefetchOpportunityDrawerFull(opportunityId: string, init?: RequestInit): void {
    void fetchOpportunityDrawerFullEntity(opportunityId, init).catch(() => {
        /* non-fatal */
    });
}

export async function fetchOpportunityDrawerFullEntity(
    opportunityId: string,
    init?: RequestInit
): Promise<Record<string, unknown>> {
    const cacheKey = drawerFullCacheKey(opportunityId);
    if (!cacheKey) throw new Error("missing_opportunity_id");

    const cached = drawerFullByOpportunityId.get(cacheKey);
    if (cached) return cached.promise;

    const url = buildOpportunityDrawerFullUrl(cacheKey);
    const promise = dedupeAdminFetch(url, init ?? workspaceDataFetchInit())
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Not found" : "drawer_full_failed");
            }
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (!json || typeof json !== "object") {
                throw new Error("drawer_full_invalid");
            }
            if (String(json.id ?? "").trim() !== cacheKey) {
                throw new Error("drawer_full_id_mismatch");
            }
            const surface = String(json._record_surface ?? "").trim();
            if (surface !== "full") {
                json._record_surface = "full";
            }
            return json;
        })
        .catch((err) => {
            drawerFullByOpportunityId.delete(cacheKey);
            throw err;
        });

    drawerFullByOpportunityId.set(cacheKey, { promise });

    void promise.finally(() => {
        setTimeout(() => {
            if (drawerFullByOpportunityId.get(cacheKey)?.promise === promise) {
                drawerFullByOpportunityId.delete(cacheKey);
            }
        }, DRAWER_FULL_CACHE_TTL_MS);
    });

    return promise;
}
