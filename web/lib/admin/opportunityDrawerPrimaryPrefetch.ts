import { opportunityDrawerPrimaryContractReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const DRAWER_PRIMARY_CACHE_TTL_MS = 8_000;

type DrawerPrimaryCacheEntry = {
    promise: Promise<Record<string, unknown>>;
};

/** Coalesces intent prefetch + coordinator open for the same opportunity id. */
const drawerPrimaryByOpportunityId = new Map<string, DrawerPrimaryCacheEntry>();

export function buildOpportunityDrawerPrimaryUrl(opportunityId: string): string {
    return `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId.trim())}?surface=drawer_primary`;
}

function drawerPrimaryCacheKey(opportunityId: string): string {
    return opportunityId.trim();
}

export function isOpportunityDrawerPrimaryWarm(opportunityId: string): boolean {
    const key = drawerPrimaryCacheKey(opportunityId);
    return key.length > 0 && drawerPrimaryByOpportunityId.has(key);
}

/** Intent + open — shares in-flight/resolved primary GET with coordinator. */
export function prefetchOpportunityDrawerPrimary(
    opportunityId: string,
    init?: RequestInit
): void {
    void fetchOpportunityDrawerPrimaryEntity(opportunityId, init).catch(() => {
        /* non-fatal */
    });
}

export async function fetchOpportunityDrawerPrimaryEntity(
    opportunityId: string,
    init?: RequestInit
): Promise<Record<string, unknown>> {
    const cacheKey = drawerPrimaryCacheKey(opportunityId);
    if (!cacheKey) {
        throw new Error("missing_opportunity_id");
    }

    const cached = drawerPrimaryByOpportunityId.get(cacheKey);
    if (cached) {
        return cached.promise;
    }

    const url = buildOpportunityDrawerPrimaryUrl(cacheKey);
    const promise = dedupeAdminFetch(url, init ?? workspaceDataFetchInit())
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Not found" : "drawer_primary_failed");
            }
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (!json || typeof json !== "object") {
                throw new Error("drawer_primary_invalid");
            }
            if (String(json.id ?? "").trim() !== cacheKey) {
                throw new Error("drawer_primary_id_mismatch");
            }
            if (!opportunityDrawerPrimaryContractReady(json, cacheKey)) {
                throw new Error("drawer_primary_contract_not_ready");
            }
            return json;
        })
        .catch((err) => {
            drawerPrimaryByOpportunityId.delete(cacheKey);
            throw err;
        });

    drawerPrimaryByOpportunityId.set(cacheKey, { promise });

    void promise.finally(() => {
        setTimeout(() => {
            if (drawerPrimaryByOpportunityId.get(cacheKey)?.promise === promise) {
                drawerPrimaryByOpportunityId.delete(cacheKey);
            }
        }, DRAWER_PRIMARY_CACHE_TTL_MS);
    });

    return promise;
}
