import { opportunityDrawerPrimaryContractReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import { appendOpportunityDrawerOpenerHintsToUrl } from "@/lib/admin/opportunityDrawerOpenerHints";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { unwrapEntityRecord } from "@/lib/api/unwrapEntityRecord";

const DRAWER_PRIMARY_CACHE_TTL_MS = 8_000;

type DrawerPrimaryCacheEntry = {
    promise: Promise<Record<string, unknown>>;
};

/** Coalesces intent prefetch + coordinator open for the same opportunity id. */
const drawerPrimaryByOpportunityId = new Map<string, DrawerPrimaryCacheEntry>();

export function buildOpportunityDrawerPrimaryUrl(
    opportunityId: string,
    workspaceContext?: OpportunityWorkspaceContext | null,
    queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): string {
    const base = `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId.trim())}?surface=drawer_primary`;
    return appendOpportunityDrawerOpenerHintsToUrl(base, workspaceContext ?? null, queuePreviewSeed ?? null);
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
    init?: RequestInit,
    workspaceContext?: OpportunityWorkspaceContext | null,
    queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): void {
    void fetchOpportunityDrawerPrimaryEntity(opportunityId, init, workspaceContext, queuePreviewSeed).catch(() => {
        /* non-fatal */
    });
}

export async function fetchOpportunityDrawerPrimaryEntity(
    opportunityId: string,
    init?: RequestInit,
    workspaceContext?: OpportunityWorkspaceContext | null,
    queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): Promise<Record<string, unknown>> {
    const cacheKey = drawerPrimaryCacheKey(opportunityId);
    if (!cacheKey) {
        throw new Error("missing_opportunity_id");
    }

    const cached = drawerPrimaryByOpportunityId.get(cacheKey);
    if (cached) {
        return cached.promise;
    }

    const url = buildOpportunityDrawerPrimaryUrl(cacheKey, workspaceContext ?? null, queuePreviewSeed ?? null);
    const promise = dedupeAdminFetch(url, init ?? workspaceDataFetchInit())
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Not found" : "drawer_primary_failed");
            }
            // API contract: { ok, data: { entity }, correlation_id }.
            const json = unwrapEntityRecord(await res.json().catch(() => null));
            if (!json) {
                throw new Error("drawer_primary_invalid");
            }
            if (String(json.id ?? "").trim() !== cacheKey) {
                throw new Error("drawer_primary_id_mismatch");
            }
            if (!opportunityDrawerPrimaryContractReady(json, cacheKey)) {
                throw new Error("drawer_primary_contract_not_ready");
            }
            putDrawerEntitySnapshot("opportunities", cacheKey, json);
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

/** Seed primary warm cache from bootstrap entity when contract-ready — avoids redundant drawer_primary GET. */
export function seedOpportunityDrawerPrimaryFromBootstrap(
    opportunityId: string,
    bootEntity: Record<string, unknown> | null | undefined
): boolean {
    const cacheKey = drawerPrimaryCacheKey(opportunityId);
    if (!cacheKey) return false;
    if (!opportunityDrawerPrimaryContractReady(bootEntity, cacheKey)) return false;

    const primaryFromBootstrap: Record<string, unknown> = {
        ...bootEntity!,
        _record_surface:
            String(bootEntity!._record_surface ?? "").trim() === "drawer_visible"
                ? "drawer_primary"
                : bootEntity!._record_surface,
    };
    putDrawerEntitySnapshot("opportunities", cacheKey, primaryFromBootstrap);

    const promise = Promise.resolve(primaryFromBootstrap);
    drawerPrimaryByOpportunityId.set(cacheKey, { promise });
    void promise.finally(() => {
        setTimeout(() => {
            if (drawerPrimaryByOpportunityId.get(cacheKey)?.promise === promise) {
                drawerPrimaryByOpportunityId.delete(cacheKey);
            }
        }, DRAWER_PRIMARY_CACHE_TTL_MS);
    });
    return true;
}
