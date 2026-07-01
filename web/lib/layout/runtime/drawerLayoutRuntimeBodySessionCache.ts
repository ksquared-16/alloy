/**
 * Session cache for layout runtime drawer body payloads (survives drawer model swap / back nav).
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type DrawerLayoutRuntimeBodyCacheEntry = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    layoutSource: string | null;
    layoutKey: string | null;
    layoutRecordId: string | null;
    layoutVersion: number | null;
    cachedAt: number;
};

export type DrawerLayoutRuntimeBodyPayload = Omit<DrawerLayoutRuntimeBodyCacheEntry, "cachedAt">;

import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";

const DEFAULT_TTL_MS = ADMINV2_UI_SESSION_CACHE_TTL_MS;
const cache = new Map<string, DrawerLayoutRuntimeBodyCacheEntry>();
const inflight = new Map<string, Promise<DrawerLayoutRuntimeBodyPayload | null>>();

export function buildDrawerLayoutRuntimeBodyCacheKey(
    apiPath: string,
    entityId: string,
    queryParamsKey: string,
): string {
    return `${apiPath}:${entityId.trim()}:${queryParamsKey}`;
}

export function serializeDrawerLayoutRuntimeBodyQueryParams(
    queryParams?: Record<string, string | null | undefined>,
): string {
    return JSON.stringify(queryParams ?? {});
}

export function putDrawerLayoutRuntimeBodyCacheEntry(
    key: string,
    entry: DrawerLayoutRuntimeBodyPayload,
): void {
    cache.set(key, { ...entry, cachedAt: Date.now() });
}

export function peekDrawerLayoutRuntimeBodyCacheEntry(
    key: string,
    maxAgeMs: number = DEFAULT_TTL_MS,
): DrawerLayoutRuntimeBodyCacheEntry | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.cachedAt > maxAgeMs) {
        cache.delete(key);
        return null;
    }
    return hit;
}

export function clearDrawerLayoutRuntimeBodySessionCacheForTests(): void {
    cache.clear();
    inflight.clear();
}

/** Drop cached layout body entries for one entity (all query-param variants). */
export function invalidateDrawerLayoutRuntimeBodyCacheForEntity(
    apiPathPrefix: string,
    entityId: string,
): void {
    const id = entityId.trim();
    if (!id) return;
    const needle = `${apiPathPrefix}:${id}:`;
    for (const key of [...cache.keys()]) {
        if (key.startsWith(needle)) cache.delete(key);
    }
    for (const key of [...inflight.keys()]) {
        if (key.startsWith(needle)) inflight.delete(key);
    }
}

/** Drop all cached layout body entries for an API path (after org layout publish). */
export function invalidateDrawerLayoutRuntimeBodyCacheForApiPath(apiPathPrefix: string): void {
    const needle = `${apiPathPrefix}:`;
    for (const key of [...cache.keys()]) {
        if (key.startsWith(needle)) cache.delete(key);
    }
    for (const key of [...inflight.keys()]) {
        if (key.startsWith(needle)) inflight.delete(key);
    }
}

function getPrimaryQueryKey(apiPath: string): string {
    if (apiPath.includes("child-drawer-body")) return "personId";
    if (apiPath.includes("child")) return "childId";
    if (apiPath.includes("person")) return "personId";
    return "opportunityId";
}

function buildDrawerLayoutRuntimeBodyFetchUrl(
    apiPath: string,
    entityId: string,
    queryParams?: Record<string, string | null | undefined>,
): string {
    const qs = new URLSearchParams();
    qs.set(getPrimaryQueryKey(apiPath), entityId);
    Object.entries(queryParams ?? {}).forEach(([key, value]) => {
        if (value != null && String(value).trim()) qs.set(key, String(value).trim());
    });
    return `${apiPath}?${qs.toString()}`;
}

async function fetchDrawerLayoutRuntimeBodyNetwork(params: {
    apiPath: string;
    entityId: string;
    queryParams?: Record<string, string | null | undefined>;
}): Promise<DrawerLayoutRuntimeBodyPayload | null> {
    const id = params.entityId.trim();
    if (!id || typeof fetch !== "function") return null;

    const res = await fetch(buildDrawerLayoutRuntimeBodyFetchUrl(params.apiPath, id, params.queryParams));
    if (!res.ok) return null;

    const json = (await res.json()) as {
        doc?: LayoutDoc;
        record?: ProofRuntimeRecord;
        layoutSource?: string;
        layoutKey?: string;
        layoutRecordId?: string | null;
        layoutVersion?: number | null;
        plan?: { layoutKey?: string };
    };
    if (!json.doc?.sections?.length || !json.record) return null;

    return {
        doc: json.doc,
        record: json.record,
        layoutSource: json.layoutSource ?? null,
        layoutKey: json.layoutKey ?? json.plan?.layoutKey ?? null,
        layoutRecordId: json.layoutRecordId ?? null,
        layoutVersion: json.layoutVersion ?? null,
    };
}

/**
 * Single in-flight request per cache key — prewarm and runtime hook share the same promise.
 */
export function fetchDrawerLayoutRuntimeBodyDeduped(params: {
    apiPath: string;
    entityId: string;
    queryParams?: Record<string, string | null | undefined>;
}): Promise<DrawerLayoutRuntimeBodyPayload | null> {
    const id = params.entityId.trim();
    if (!id) return Promise.resolve(null);

    const queryParamsKey = serializeDrawerLayoutRuntimeBodyQueryParams(params.queryParams);
    const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(params.apiPath, id, queryParamsKey);

    const cached = peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey);
    if (cached) {
        return Promise.resolve({
            doc: cached.doc,
            record: cached.record,
            layoutSource: cached.layoutSource,
            layoutKey: cached.layoutKey,
            layoutRecordId: cached.layoutRecordId,
            layoutVersion: cached.layoutVersion,
        });
    }

    const existing = inflight.get(cacheKey);
    if (existing) return existing;

    const request = fetchDrawerLayoutRuntimeBodyNetwork(params)
        .then((payload) => {
            if (payload) {
                putDrawerLayoutRuntimeBodyCacheEntry(cacheKey, payload);
            }
            return payload;
        })
        .finally(() => {
            inflight.delete(cacheKey);
        });

    inflight.set(cacheKey, request);
    return request;
}

/** Background warm for drawer body alongside VM prewarm — non-blocking. */
export function prefetchDrawerLayoutRuntimeBody(params: {
    apiPath: string;
    entityId: string;
    queryParams?: Record<string, string | null | undefined>;
}): void {
    if (typeof window === "undefined") return;
    void fetchDrawerLayoutRuntimeBodyDeduped(params);
}

/** Test-only: expose in-flight map size. */
export function drawerLayoutRuntimeBodyInflightCountForTests(): number {
    return inflight.size;
}
