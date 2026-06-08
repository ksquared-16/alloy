/**
 * Resolve opportunity queue row layout for visible runtime rendering.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLayoutForOrg } from "../resolveLayoutRuntime";
import { buildLayoutRuntimePlan } from "./layoutRuntimePlan";
import {
    buildOpportunityQueueLayoutContext,
    opportunityQueueLayoutEntityType,
    type OpportunityQueueLaneContextInput,
} from "./queue/buildOpportunityQueueLayoutContext";
import { isLayoutDocRenderableForProduction } from "./isLayoutDocRenderableForProduction";
import type { LayoutDoc } from "../layoutV2";
import { resolveEffectiveProductionLayoutDoc } from "./resolveEffectiveProductionLayoutDoc";

export type OpportunityQueueLayoutRuntimeResult =
    | {
          ok: true;
          doc: LayoutDoc;
          entityType: string;
          layoutSource: string;
          layoutKey?: string;
          matchTier?: string;
          layoutFallbackReason?: string;
      }
    | { ok: false; reason: string };

export async function evaluateOpportunityQueueLayoutRuntime(input: {
    orgId: string;
    supabase: SupabaseClient;
    lane: OpportunityQueueLaneContextInput;
}): Promise<OpportunityQueueLayoutRuntimeResult> {
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

    if (!isLayoutDocRenderableForProduction(resolution.doc)) {
        const effective = resolveEffectiveProductionLayoutDoc({
            doc: resolution.doc,
            source: resolution.source,
            layoutKey: resolution.layoutKey,
            entityType,
            surface: "queue",
            isWaitlist,
        });
        if (!isLayoutDocRenderableForProduction(effective.doc)) {
            return { ok: false, reason: "layout_not_resolved" };
        }
        const plan = buildLayoutRuntimePlan(effective.doc);
        return {
            ok: true,
            doc: effective.doc,
            entityType,
            layoutSource: effective.source,
            layoutKey: effective.layoutKey ?? plan.layoutKey,
            matchTier: resolution.matchTier,
            layoutFallbackReason: effective.fallbackReason,
        };
    }

    const effective = resolveEffectiveProductionLayoutDoc({
        doc: resolution.doc,
        source: resolution.source,
        layoutKey: resolution.layoutKey,
        entityType,
        surface: "queue",
        isWaitlist,
    });

    const plan = buildLayoutRuntimePlan(effective.doc);

    return {
        ok: true,
        doc: effective.doc,
        entityType,
        layoutSource: effective.usedFallback ? effective.source : resolution.source,
        layoutKey: effective.layoutKey ?? resolution.layoutKey ?? plan.layoutKey,
        matchTier: resolution.matchTier,
        layoutFallbackReason: effective.usedFallback ? effective.fallbackReason : undefined,
    };
}
