/**
 * Load household placement fact context for a set of placement candidate bundles.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    bulkLoadHouseholdPlacementFactContext,
    type HouseholdPlacementFactContextByCustomerId,
} from "@/lib/orchestration/placement/bulkLoadHouseholdPlacementFactContext";
import type { PlacementCandidatesByOpportunityId } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";

export async function loadPlacementEvaluationHouseholdContext(params: {
    supabase: SupabaseClient;
    orgId: string;
    candidatesByOpportunityId: PlacementCandidatesByOpportunityId;
}): Promise<HouseholdPlacementFactContextByCustomerId> {
    const customerIds: string[] = [];
    for (const bundles of params.candidatesByOpportunityId.values()) {
        for (const bundle of bundles) {
            const cid = (bundle.candidate.customer_id ?? "").trim();
            if (cid) customerIds.push(cid);
        }
    }
    if (!customerIds.length) return new Map();
    return bulkLoadHouseholdPlacementFactContext({
        supabase: params.supabase,
        orgId: params.orgId,
        customerIds,
    });
}
