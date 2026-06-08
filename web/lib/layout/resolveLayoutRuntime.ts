/**
 * Layout runtime — server read path (Phase 0).
 *
 * Fetches entity_layouts candidates and resolves via resolveLayout().
 * Gated by isLayoutRuntimeReadPathEnabled() — default off; no live renderer calls this yet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listDefaultLayouts, listOrgLayouts } from "./entityLayoutsRepo";
import { isLayoutRuntimeReadPathEnabled } from "./featureFlag";
import { resolveLayout, type ExtendedLayoutResolution, type ResolveLayoutInput } from "./layoutResolver";
import {
    DEFAULT_LAYOUT_RESOLUTION_TTL_MS,
    buildLayoutResolutionCacheKey,
    getCachedLayoutResolution,
    setCachedLayoutResolution,
} from "./layoutResolutionCache";
import type { LayoutSurface } from "./layoutV2";
import type { QueueLayoutContextRequest } from "./queueLayoutContext";

export type ResolveLayoutForOrgInput = {
    orgId: string;
    entityType: string;
    surface: LayoutSurface;
    queueContext?: QueueLayoutContextRequest;
    supabase: SupabaseClient;
    /** When false, skips DB fetch and resolves registry/builtin only. Defaults to feature flag. */
    fetchPublishedLayouts?: boolean;
    /** Resolution cache TTL (ms). 0 disables caching. Defaults to {@link DEFAULT_LAYOUT_RESOLUTION_TTL_MS}. */
    cacheTtlMs?: number;
    /** Skip the resolution cache entirely (always re-fetch + re-resolve). */
    bypassCache?: boolean;
};

export type ResolveLayoutForOrgResult = ExtendedLayoutResolution & {
    runtimeReadPathEnabled: boolean;
    /** True when this result was served from the resolution cache. */
    cacheHit?: boolean;
};

/**
 * Resolve layout for an org — the runtime read-path entry point.
 *
 * When runtime read path is disabled (default), still resolves safely using
 * registry + builtin queue variants without querying entity_layouts.
 *
 * Resolutions are cached by org/entity/surface(/queueContext) with a short TTL
 * (see {@link layoutResolutionCache}) so repeated drawer/queue opens avoid the
 * `entity_layouts` round-trip. Publishing a layout invalidates the cache.
 */
export async function resolveLayoutForOrg(input: ResolveLayoutForOrgInput): Promise<ResolveLayoutForOrgResult> {
    const readPathEnabled = isLayoutRuntimeReadPathEnabled();
    const shouldFetch = input.fetchPublishedLayouts ?? readPathEnabled;
    const ttlMs = input.cacheTtlMs ?? DEFAULT_LAYOUT_RESOLUTION_TTL_MS;
    const useCache = !input.bypassCache && ttlMs > 0;

    const cacheKey = buildLayoutResolutionCacheKey({
        orgId: input.orgId,
        entityType: input.entityType,
        surface: input.surface,
        queueContext: input.queueContext,
        fetchPublishedLayouts: shouldFetch,
    });

    if (useCache) {
        const cached = getCachedLayoutResolution(cacheKey);
        if (cached) {
            return { ...cached, runtimeReadPathEnabled: readPathEnabled, cacheHit: true };
        }
    }

    let orgRecords: ResolveLayoutInput["orgRecords"];
    let defaultRecords: ResolveLayoutInput["defaultRecords"];

    if (shouldFetch) {
        [orgRecords, defaultRecords] = await Promise.all([
            listOrgLayouts(input.supabase, input.orgId, input.entityType, input.surface),
            listDefaultLayouts(input.supabase, input.entityType, input.surface),
        ]);
    }

    const resolution = resolveLayout({
        entityType: input.entityType,
        surface: input.surface,
        orgRecords,
        defaultRecords,
        queueContext: input.queueContext,
    });

    if (useCache) {
        setCachedLayoutResolution(cacheKey, resolution, ttlMs);
    }

    return {
        ...resolution,
        runtimeReadPathEnabled: readPathEnabled,
        cacheHit: false,
    };
}
