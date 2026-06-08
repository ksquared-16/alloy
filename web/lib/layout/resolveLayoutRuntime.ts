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
};

export type ResolveLayoutForOrgResult = ExtendedLayoutResolution & {
    runtimeReadPathEnabled: boolean;
};

/**
 * Resolve layout for an org — the Phase 0 runtime read path entry point.
 *
 * When runtime read path is disabled (default), still resolves safely using
 * registry + builtin queue variants without querying entity_layouts.
 */
export async function resolveLayoutForOrg(input: ResolveLayoutForOrgInput): Promise<ResolveLayoutForOrgResult> {
    const readPathEnabled = isLayoutRuntimeReadPathEnabled();
    const shouldFetch = input.fetchPublishedLayouts ?? readPathEnabled;

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

    return {
        ...resolution,
        runtimeReadPathEnabled: readPathEnabled,
    };
}
