/**
 * Shared deterministic build path for entity attach + queue preview (Phase 1).
 */

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import { buildOperationalRecommendationAttachInput } from "@/lib/adminV2/bos/recommendations/adapters/extractGroundingSignalsFromAttention";
import { mapAttentionReasonToCatalogKey } from "@/lib/adminV2/bos/recommendations/adapters/mapAttentionReasonToCatalogKey";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/builders/buildOperationalRecommendationV1";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { OperationalContextSourceSurfaceV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

export type BuildOperationalRecommendationFromAttentionInput = {
    orgId: string;
    opportunityRow: Record<string, unknown>;
    attention: OpportunityAttentionResult;
    activity: ActivitySignalResult | null | undefined;
    workUnitId?: string | null;
    nowMs?: number;
    sourceSurface?: OperationalContextSourceSurfaceV1;
};

/**
 * Build a full OperationalRecommendationV1 from existing attention context.
 * Fail-soft: returns null when unsupported or builder preconditions are not met.
 */
export function tryBuildOperationalRecommendationFromAttention(
    input: BuildOperationalRecommendationFromAttentionInput
): OperationalRecommendationV1 | null {
    try {
        if (!input.attention.needs_attention || !input.attention.primary_reason) {
            return null;
        }

        const catalogKey = mapAttentionReasonToCatalogKey({
            attention: input.attention,
            activity: input.activity,
        });
        if (!catalogKey) {
            return null;
        }

        const builderInput = buildOperationalRecommendationAttachInput({
            orgId: input.orgId,
            opportunityRow: input.opportunityRow,
            attention: input.attention,
            activity: input.activity,
            catalogKey,
            workUnitId: input.workUnitId,
            nowMs: input.nowMs,
            sourceSurface: input.sourceSurface ?? "entity_get",
        });

        return buildOperationalRecommendationV1(builderInput);
    } catch {
        return null;
    }
}
