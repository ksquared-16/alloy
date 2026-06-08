/**
 * C4 foundation — resolve opportunity queue row layout for shadow/proof evaluation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLayoutForOrg } from "../../resolveLayoutRuntime";
import { buildLayoutRuntimePlan } from "../layoutRuntimePlan";
import { captureLayoutRuntimeDrawerStructure } from "../shadow/captureLayoutRuntimeDrawerStructure";
import {
    buildOpportunityQueueLayoutContext,
    opportunityQueueLayoutEntityType,
    type OpportunityQueueLaneContextInput,
} from "./buildOpportunityQueueLayoutContext";
import type { QueueLayoutContextRequest } from "../../queueLayoutContext";

export type OpportunityQueueRowLayoutShadowResult = {
    ok: true;
    entityType: string;
    layoutSource: string;
    layoutKey?: string;
    matchTier?: string;
    queueContext: QueueLayoutContextRequest;
    nodeCount: number;
    sectionCount: number;
};

export type OpportunityQueueRowLayoutShadowFailure = {
    ok: false;
    reason: string;
};

export async function evaluateOpportunityQueueRowLayoutShadow(input: {
    orgId: string;
    supabase: SupabaseClient;
    lane: OpportunityQueueLaneContextInput;
}): Promise<OpportunityQueueRowLayoutShadowResult | OpportunityQueueRowLayoutShadowFailure> {
    const isWaitlist = Boolean(input.lane.isWaitlistCandidate);
    const entityType = opportunityQueueLayoutEntityType(isWaitlist);
    const queueContext = buildOpportunityQueueLayoutContext(input.lane);

    const resolution = await resolveLayoutForOrg({
        orgId: input.orgId,
        entityType,
        surface: "queue",
        queueContext,
        supabase: input.supabase,
        fetchPublishedLayouts: true,
    });

    if (!resolution.doc?.sections?.length) {
        return { ok: false, reason: "layout_not_resolved" };
    }

    const plan = buildLayoutRuntimePlan(resolution.doc);
    const structure = captureLayoutRuntimeDrawerStructure({ doc: resolution.doc, plan });

    return {
        ok: true,
        entityType,
        layoutSource: resolution.source,
        layoutKey: resolution.layoutKey,
        matchTier: resolution.matchTier,
        queueContext,
        nodeCount: structure.nodes.length,
        sectionCount: resolution.doc.sections.length,
    };
}
