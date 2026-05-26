/**
 * Attach `_operational_recommendation` to entity/drawer payloads (Phase 1 / Card 1.4).
 * Read-only, deterministic, fail-soft. Preserves legacy `_attention_suggestion`.
 */

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import { tryBuildOperationalRecommendationFromAttention } from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

export type AttachOperationalRecommendationBundleInput = {
    orgId: string;
    opportunityRow: Record<string, unknown>;
    attention: OpportunityAttentionResult;
    activity: ActivitySignalResult | null | undefined;
    workUnitId?: string | null;
    nowMs?: number;
};

export type AttachOperationalRecommendationBundleResult = {
    _operational_recommendation: OperationalRecommendationV1 | null;
};

/**
 * Derive and attach a canonical operational recommendation from existing attention output.
 * Returns null recommendation when unsupported or builder preconditions are not met.
 */
export function attachOperationalRecommendationBundle(
    input: AttachOperationalRecommendationBundleInput
): AttachOperationalRecommendationBundleResult {
    const recommendation = tryBuildOperationalRecommendationFromAttention({
        ...input,
        sourceSurface: "entity_get",
    });
    return { _operational_recommendation: recommendation };
}
