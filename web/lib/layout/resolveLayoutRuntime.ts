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
import type { LayoutAssignmentContext } from "./businessProcessLayoutAssignmentTypes";
import {
    layoutAssignmentSurfaceKeyForRuntime,
    resolveLayoutFromBusinessProcessAssignment,
} from "./resolveBusinessProcessLayoutAssignment";
import { resolvePinnedEntityLayoutRecord } from "./resolvePinnedEntityLayout";

export type ResolveLayoutForOrgInput = {
    orgId: string;
    entityType: string;
    surface: LayoutSurface;
    queueContext?: QueueLayoutContextRequest;
    assignmentContext?: LayoutAssignmentContext;
    isWaitlist?: boolean;
    supabase: SupabaseClient;
    /** When false, skips DB fetch and resolves registry/builtin only. Defaults to feature flag. */
    fetchPublishedLayouts?: boolean;
    /** Work View / URL pinned layout — highest priority when published. */
    pinnedEntityLayoutId?: string | null;
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

    let assignmentRecord = null;
    let assignmentMatchTier: string | undefined;

    if (shouldFetch) {
        const pinned = await resolvePinnedEntityLayoutRecord(input.supabase, input.pinnedEntityLayoutId);
        if (pinned && pinned.surface === input.surface) {
            assignmentRecord = pinned;
            assignmentMatchTier = "work_view_pinned";
        }
    }

    if (!assignmentRecord && input.assignmentContext && shouldFetch) {
        const surfaceKey = layoutAssignmentSurfaceKeyForRuntime({
            entityType: input.entityType,
            surface: input.surface,
            isWaitlist: input.isWaitlist,
        });
        if (surfaceKey) {
            const bpMatch = await resolveLayoutFromBusinessProcessAssignment({
                supabase: input.supabase,
                orgId: input.orgId,
                surfaceKey,
                assignmentContext: input.assignmentContext,
            });
            if (bpMatch) {
                assignmentRecord = bpMatch.record;
                assignmentMatchTier = bpMatch.tier;
            }
        }
    }

    const resolution = resolveLayout({
        entityType: input.entityType,
        surface: input.surface,
        orgRecords,
        defaultRecords,
        queueContext: input.queueContext,
        assignmentRecord,
        assignmentMatchTier,
    });

    return {
        ...resolution,
        runtimeReadPathEnabled: readPathEnabled,
    };
}
