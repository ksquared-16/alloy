/**
 * Business Process Layout Assignment — resolution (pure + async record lookup).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { getLayoutById, listDefaultLayouts, listOrgLayouts } from "@/lib/layout/entityLayoutsRepo";
import type {
    BusinessProcessLayoutAssignmentRecord,
    LayoutAssignmentContext,
    LayoutAssignmentMatchTier,
    LayoutAssignmentResolution,
    LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { listBusinessProcessLayoutAssignments } from "@/lib/layout/businessProcessLayoutAssignmentsRepo";

const TIER_RANK: Record<LayoutAssignmentMatchTier, number> = {
    process_stage_status: 4,
    process_stage: 3,
    process_status: 2,
    process_surface_default: 1,
    none: 0,
};

function classifyAssignmentTier(
    assignment: BusinessProcessLayoutAssignmentRecord,
    ctx: LayoutAssignmentContext,
): LayoutAssignmentMatchTier | null {
    if (assignment.businessProcessKey !== ctx.businessProcessKey) return null;

    const stage = assignment.stageKey?.trim() || null;
    const status = assignment.statusKey?.trim() || null;
    const ctxStage = ctx.stageKey?.trim() || null;
    const ctxStatus = ctx.statusKey?.trim() || null;

    if (stage && status) {
        if (stage === ctxStage && status === ctxStatus) return "process_stage_status";
        return null;
    }
    if (stage && !status) {
        if (stage === ctxStage) return "process_stage";
        return null;
    }
    if (status && !stage) {
        if (status === ctxStatus) return "process_status";
        return null;
    }
    if (!stage && !status) return "process_surface_default";
    return null;
}

export function matchBusinessProcessLayoutAssignment(
    assignments: BusinessProcessLayoutAssignmentRecord[],
    surfaceKey: LayoutAssignmentSurfaceKey,
    ctx: LayoutAssignmentContext,
): LayoutAssignmentResolution | null {
    const candidates = assignments.filter((a) => a.isActive && a.surfaceKey === surfaceKey);
    if (candidates.length === 0) return null;

    const matches: LayoutAssignmentResolution[] = [];
    for (const assignment of candidates) {
        const tier = classifyAssignmentTier(assignment, ctx);
        if (tier) matches.push({ assignment, tier });
    }

    if (matches.length === 0) {
        const bpDefault = candidates.find((a) => !a.stageKey && !a.statusKey);
        if (bpDefault) return { assignment: bpDefault, tier: "process_surface_default" };
        return null;
    }

    matches.sort((a, b) => {
        const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
        if (tierDiff !== 0) return tierDiff;
        return b.assignment.priority - a.assignment.priority;
    });

    return matches[0] ?? null;
}

export function layoutAssignmentSurfaceKeyForRuntime(input: {
    entityType: string;
    surface: "drawer" | "queue";
    isWaitlist?: boolean;
}): LayoutAssignmentSurfaceKey | null {
    if (input.surface === "drawer") {
        if (input.entityType === "opportunities") return "opportunity_drawer";
        if (input.entityType === "person") return "person_drawer";
        if (input.entityType === "child") return "child_drawer";
        return null;
    }
    if (input.isWaitlist || input.entityType === "placement_candidate") return "waitlist_queue_record";
    if (input.entityType === "opportunities") return "queue_record";
    return null;
}

function latestPublishedForKey(
    records: EntityLayoutRecord[],
    layoutKey: string,
): EntityLayoutRecord | null {
    const published = records
        .filter((r) => r.status === "published" && r.layoutKey === layoutKey)
        .sort((a, b) => b.version - a.version);
    return published[0] ?? null;
}

/** Resolve entity_layouts row from an assignment (pinned id or latest published layout_key). */
export async function resolveEntityLayoutRecordFromAssignment(
    supabase: SupabaseClient,
    orgId: string,
    assignment: BusinessProcessLayoutAssignmentRecord,
): Promise<EntityLayoutRecord | null> {
    if (assignment.entityLayoutId) {
        const pinned = await getLayoutById(supabase, assignment.entityLayoutId);
        if (pinned && pinned.status === "published") return pinned;
    }

    const [orgRecords, defaultRecords] = await Promise.all([
        listOrgLayouts(supabase, orgId, assignment.entityType, assignment.surface),
        listDefaultLayouts(supabase, assignment.entityType, assignment.surface),
    ]);

    return (
        latestPublishedForKey(orgRecords, assignment.layoutKey)
        ?? latestPublishedForKey(defaultRecords, assignment.layoutKey)
    );
}

export type BusinessProcessLayoutAssignmentResolveResult = {
    record: EntityLayoutRecord;
    assignment: BusinessProcessLayoutAssignmentRecord;
    tier: LayoutAssignmentMatchTier;
};

/** Full assignment resolution: match + load published layout record. */
export async function resolveLayoutFromBusinessProcessAssignment(input: {
    supabase: SupabaseClient;
    orgId: string;
    surfaceKey: LayoutAssignmentSurfaceKey;
    assignmentContext: LayoutAssignmentContext;
    assignments?: BusinessProcessLayoutAssignmentRecord[];
}): Promise<BusinessProcessLayoutAssignmentResolveResult | null> {
    const assignments =
        input.assignments
        ?? (await listBusinessProcessLayoutAssignments(
            input.supabase,
            input.orgId,
            input.assignmentContext.businessProcessKey,
        ));

    const match = matchBusinessProcessLayoutAssignment(
        assignments,
        input.surfaceKey,
        input.assignmentContext,
    );
    if (!match) return null;

    const record = await resolveEntityLayoutRecordFromAssignment(
        input.supabase,
        input.orgId,
        match.assignment,
    );
    if (!record) return null;

    return { record, assignment: match.assignment, tier: match.tier };
}
