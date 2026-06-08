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

export type OpportunityQueueLayoutRuntimeResult =
    | {
          ok: true;
          doc: LayoutDoc;
          entityType: string;
          layoutSource: string;
          layoutKey?: string;
          matchTier?: string;
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
        return { ok: false, reason: "layout_not_resolved" };
    }

    const plan = buildLayoutRuntimePlan(resolution.doc!);

    return {
        ok: true,
        doc: resolution.doc!,
        entityType,
        layoutSource: resolution.source,
        layoutKey: resolution.layoutKey ?? plan.layoutKey,
        matchTier: resolution.matchTier,
    };
}
