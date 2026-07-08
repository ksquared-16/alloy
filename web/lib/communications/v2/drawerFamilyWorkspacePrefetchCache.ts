/**
 * Drawer / entity-scoped warm cache for Family Communication Workspace VM.
 * Mirrors commandCenterPrefetchCache so Focus Panel Activity can render comms without a cold fetch.
 */
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import type { ComposerChannel, FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";
import { markDrawerFamilyWorkspaceTiming } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchTiming";

const CACHE_TTL_MS = 90_000;

export type DrawerFamilyWorkspacePrefetchParams = {
    customerId?: string;
    entityType?: string;
    entityId?: string;
    composerChannel?: ComposerChannel;
    threadId?: string | null;
};

type CacheEntry = {
    workspace: FamilyCommunicationWorkspaceVM;
    fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FamilyCommunicationWorkspaceVM | null>>();
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((l) => l());
}

/** Stable cache key: entity or customer scope + composer channel + optional thread. */
export function drawerFamilyWorkspaceCacheKey(params: DrawerFamilyWorkspacePrefetchParams): string | null {
    const channel = params.composerChannel ?? "email";
    const threadPart = params.threadId ? `:thread:${params.threadId}` : "";
    if (params.customerId?.trim()) {
        return `customer:${params.customerId.trim()}:${channel}${threadPart}`;
    }
    const entityType = params.entityType?.trim();
    const entityId = params.entityId?.trim();
    if (entityType && entityId) {
        return `entity:${entityType}:${entityId}:${channel}${threadPart}`;
    }
    return null;
}

function buildFetchQuery(params: DrawerFamilyWorkspacePrefetchParams): string | null {
    const base = new URLSearchParams();
    if (params.customerId?.trim()) {
        base.set("customer_id", params.customerId.trim());
    } else if (params.entityType?.trim() && params.entityId?.trim()) {
        base.set("entity_type", params.entityType.trim());
        base.set("entity_id", params.entityId.trim());
    } else {
        return null;
    }
    base.set("composer_channel", params.composerChannel ?? "email");
    if (params.threadId) base.set("thread_id", params.threadId);
    return base.toString();
}

export function getDrawerFamilyWorkspaceWarm(
    params: DrawerFamilyWorkspacePrefetchParams
): FamilyCommunicationWorkspaceVM | null {
    const key = drawerFamilyWorkspaceCacheKey(params);
    if (!key) return null;
    const entry = cache.get(key);
    if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.workspace;
}

export function subscribeDrawerFamilyWorkspaceCache(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Drop cached entries for one entity/customer (all channels/threads) or the entire cache. */
export function invalidateDrawerFamilyWorkspaceCache(scope?: {
    customerId?: string;
    entityType?: string;
    entityId?: string;
}): void {
    if (!scope) {
        cache.clear();
        notify();
        return;
    }
    const prefix =
        scope.customerId?.trim()
            ? `customer:${scope.customerId.trim()}:`
            : scope.entityType?.trim() && scope.entityId?.trim()
              ? `entity:${scope.entityType.trim()}:${scope.entityId.trim()}:`
              : null;
    if (!prefix) return;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
    notify();
}

async function fetchAndStore(
    params: DrawerFamilyWorkspacePrefetchParams
): Promise<FamilyCommunicationWorkspaceVM | null> {
    const qs = buildFetchQuery(params);
    if (!qs) return null;
    markDrawerFamilyWorkspaceTiming("prefetch_fetch_started", {
        entity_id: params.entityId,
        entity_type: params.entityType,
        customer_id: params.customerId,
        channel: params.composerChannel ?? "email",
    });
    const fetchStarted = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
        const res = await fetch(`/api/admin/communications/family-workspace?${qs}`, { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
            workspace?: FamilyCommunicationWorkspaceVM;
            error?: string;
        };
        const fetchDone = typeof performance !== "undefined" ? performance.now() : Date.now();
        markDrawerFamilyWorkspaceTiming("prefetch_fetch_done", {
            entity_id: params.entityId,
            entity_type: params.entityType,
            ok: res.ok && Boolean(data.workspace),
            fetch_ms: Math.round(fetchDone - fetchStarted),
        });
        if (!res.ok || !data.workspace) return getDrawerFamilyWorkspaceWarm(params);
        const key = drawerFamilyWorkspaceCacheKey(params);
        if (key) {
            cache.set(key, { workspace: data.workspace, fetchedAt: Date.now() });
            notify();
        }
        return data.workspace;
    } catch {
        markDrawerFamilyWorkspaceTiming("prefetch_fetch_done", {
            entity_id: params.entityId,
            entity_type: params.entityType,
            ok: false,
        });
        return getDrawerFamilyWorkspaceWarm(params);
    }
}

/**
 * Prefetch family-workspace VM for a drawer entity. Dedupes in-flight requests per cache key.
 */
export async function prefetchDrawerFamilyWorkspace(
    params: DrawerFamilyWorkspacePrefetchParams,
    opts?: { force?: boolean }
): Promise<FamilyCommunicationWorkspaceVM | null> {
    if (!isCommsV2FlagEnabled("comms_v2_live_workspace")) return null;

    const key = drawerFamilyWorkspaceCacheKey(params);
    if (!key) return null;

    const fresh = !opts?.force ? getDrawerFamilyWorkspaceWarm(params) : null;
    if (fresh) return fresh;

    const existing = inflight.get(key);
    if (existing && !opts?.force) return existing;

    const promise = fetchAndStore(params).finally(() => {
        inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
}

/** In-flight warm request for the same entity/channel (join instead of duplicate fetch). */
export function getDrawerFamilyWorkspaceInflight(
    params: DrawerFamilyWorkspacePrefetchParams
): Promise<FamilyCommunicationWorkspaceVM | null> | null {
    const key = drawerFamilyWorkspaceCacheKey(params);
    if (!key) return null;
    return inflight.get(key) ?? null;
}

/**
 * Start family-workspace prefetch immediately for the active Focus Panel record.
 * Does not idle-defer — intended for the selected drawer entity only.
 */
export function prefetchActiveDrawerFamilyWorkspace(
    entityType: string,
    entityId: string,
    composerChannel: ComposerChannel = "email"
): void {
    if (!isCommsV2FlagEnabled("comms_v2_live_workspace") || !isCommsV2FlagEnabled("comms_v2_record_tab")) {
        return;
    }
    const params: DrawerFamilyWorkspacePrefetchParams = { entityType, entityId, composerChannel };
    if (getDrawerFamilyWorkspaceWarm(params)) return;
    if (getDrawerFamilyWorkspaceInflight(params)) return;

    markDrawerFamilyWorkspaceTiming("prefetch_scheduled", {
        entity_type: entityType,
        entity_id: entityId,
        channel: composerChannel,
        immediate: true,
    });
    void prefetchDrawerFamilyWorkspace(params);
}

/** Test-only reset. */
export function resetDrawerFamilyWorkspacePrefetchCacheForTests(): void {
    cache.clear();
    inflight.clear();
    listeners.clear();
}
