import {
    bustCommunicationsBindingsFetchDedupe,
    dedupeAdminFetchWithTtl,
} from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export const COMMUNICATIONS_BINDINGS_CACHE_TTL_MS = 90_000;

const BINDINGS_URL = "/api/admin/communications/bindings";

export type CommunicationsBindingsPayload = {
    channels_available?: string[];
    bindings?: unknown[];
    error?: string;
};

export type CommunicationsBindingsResult = {
    ok: boolean;
    status: number;
    json: CommunicationsBindingsPayload;
};

type CacheEntry = {
    atMs: number;
    result: CommunicationsBindingsResult;
};

let cached: CacheEntry | null = null;
let inflight: Promise<CommunicationsBindingsResult> | null = null;

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
    return Boolean(entry && Date.now() - entry.atMs < COMMUNICATIONS_BINDINGS_CACHE_TTL_MS);
}

async function fetchBindingsNetwork(
    init?: RequestInit,
    signal?: AbortSignal
): Promise<CommunicationsBindingsResult> {
    const res = await dedupeAdminFetchWithTtl(
        BINDINGS_URL,
        { ...workspaceDataFetchInit(), ...init, signal },
        COMMUNICATIONS_BINDINGS_CACHE_TTL_MS
    );
    const json = (await res.json().catch(() => ({}))) as CommunicationsBindingsPayload;
    return { ok: res.ok, status: res.status, json };
}

/**
 * Org-scoped communications bindings — TTL + in-flight dedupe across drawer, modal, and settings reads.
 */
export async function fetchCommunicationsBindingsCached(options?: {
    init?: RequestInit;
    signal?: AbortSignal;
    force?: boolean;
}): Promise<CommunicationsBindingsResult> {
    if (!options?.force && isFresh(cached)) {
        void fetchBindingsNetwork(options?.init, options?.signal)
            .then((result) => {
                cached = { atMs: Date.now(), result };
            })
            .catch(() => {
                /* stale-while-revalidate */
            });
        return cached.result;
    }

    if (!options?.force && inflight) {
        return inflight;
    }

    inflight = fetchBindingsNetwork(options?.init, options?.signal)
        .then((result) => {
            cached = { atMs: Date.now(), result };
            return result;
        })
        .finally(() => {
            inflight = null;
        });

    return inflight;
}

export function peekCommunicationsBindingsCached(): CommunicationsBindingsResult | null {
    return isFresh(cached) ? cached.result : null;
}

/**
 * Invalidate BOTH caches in front of this endpoint.
 *
 * This module's `cached`/`inflight` are only the first layer; `dedupeAdminFetchWithTtl`
 * keeps its own 90s entry underneath. Clearing one and not the other is how a save
 * appeared to do nothing — the forced refetch was answered from the lower cache with
 * pre-save data, for up to a minute.
 */
export function invalidateCommunicationsBindingsCache(): void {
    cached = null;
    inflight = null;
    bustCommunicationsBindingsFetchDedupe();
}

/** Drawer prefetch slot shape — channels list only. */
export async function fetchCommunicationsBindingsChannelsCached(options?: {
    signal?: AbortSignal;
    force?: boolean;
}): Promise<{ channels: string[]; error: string | null }> {
    const { ok, status, json } = await fetchCommunicationsBindingsCached({
        signal: options?.signal,
        force: options?.force,
    });
    if (!ok) {
        return { channels: [], error: json.error ?? `HTTP ${status}` };
    }
    const ch = json.channels_available;
    return { channels: Array.isArray(ch) ? ch : [], error: null };
}

/** Test-only reset. */
export function resetCommunicationsBindingsCacheForTests(): void {
    cached = null;
    inflight = null;
}
