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

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, DrawerLayoutRuntimeBodyCacheEntry>();

export function buildDrawerLayoutRuntimeBodyCacheKey(
    apiPath: string,
    entityId: string,
    queryParamsKey: string,
): string {
    return `${apiPath}:${entityId.trim()}:${queryParamsKey}`;
}

export function putDrawerLayoutRuntimeBodyCacheEntry(
    key: string,
    entry: Omit<DrawerLayoutRuntimeBodyCacheEntry, "cachedAt">,
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
}

/** Background warm for drawer body alongside VM prewarm — non-blocking. */
export function prefetchDrawerLayoutRuntimeBody(params: {
    apiPath: string;
    entityId: string;
    queryParams?: Record<string, string | null | undefined>;
}): void {
    if (typeof window === "undefined") return;
    const id = params.entityId.trim();
    if (!id) return;
    const queryParamsKey = JSON.stringify(params.queryParams ?? {});
    const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(params.apiPath, id, queryParamsKey);
    if (peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey)) return;

    const qs = new URLSearchParams();
    const primaryKey = params.apiPath.includes("child-drawer-body")
        ? "personId"
        : params.apiPath.includes("child")
          ? "childId"
          : params.apiPath.includes("person")
            ? "personId"
            : "opportunityId";
    qs.set(primaryKey, id);
    Object.entries(params.queryParams ?? {}).forEach(([key, value]) => {
        if (value != null && String(value).trim()) qs.set(key, String(value).trim());
    });

    void fetch(`${params.apiPath}?${qs.toString()}`)
        .then(async (res) => {
            if (!res.ok) return;
            const json = (await res.json()) as {
                doc?: LayoutDoc;
                record?: ProofRuntimeRecord;
                layoutSource?: string;
                layoutKey?: string;
                layoutRecordId?: string | null;
                layoutVersion?: number | null;
                plan?: { layoutKey?: string };
            };
            if (!json.doc?.sections?.length || !json.record) return;
            putDrawerLayoutRuntimeBodyCacheEntry(cacheKey, {
                doc: json.doc,
                record: json.record,
                layoutSource: json.layoutSource ?? null,
                layoutKey: json.layoutKey ?? json.plan?.layoutKey ?? null,
                layoutRecordId: json.layoutRecordId ?? null,
                layoutVersion: json.layoutVersion ?? null,
            });
        })
        .catch(() => {
            /* best-effort warm */
        });
}
