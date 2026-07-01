/**
 * Attach `_operational_recommendation_preview` to queue row outputs (Phase 1 / Card 1.5).
 * Preview-only projection — full recommendation remains on entity GET.
 */

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import { tryBuildOperationalRecommendationFromAttention } from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";
import type { OperationalRecommendationQueuePreviewV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

export type AttachOperationalRecommendationQueuePreviewInput = {
    orgId: string;
    opportunityRow: Record<string, unknown>;
    attention: OpportunityAttentionResult;
    activity: ActivitySignalResult | null | undefined;
    workUnitId?: string | null;
    nowMs?: number;
};

export type AttachOperationalRecommendationQueuePreviewResult = {
    _operational_recommendation_preview: OperationalRecommendationQueuePreviewV1 | null;
};

/** Map a queue enrichment row to the opportunity shape used by the shared builder. */
export function queueRowToRecommendationOpportunityRow(input: {
    row: Record<string, unknown>;
    customerName?: string | null;
}): Record<string, unknown> {
    const customerName =
        typeof input.customerName === "string" && input.customerName.trim()
            ? input.customerName.trim()
            : null;
    const rowName = typeof input.row.name === "string" && input.row.name.trim() ? input.row.name.trim() : null;
    return {
        id: input.row.id,
        status_key: input.row.status_key ?? null,
        name: input.row.name ?? null,
        updated_at: input.row.updated_at ?? null,
        metadata: input.row.metadata ?? null,
        _customer_name: customerName ?? rowName,
    };
}

/**
 * Derive queue preview from existing attention output using the canonical builder path.
 * Does not attach full OperationalRecommendationV1 to queue rows.
 */
export function attachOperationalRecommendationQueuePreview(
    input: AttachOperationalRecommendationQueuePreviewInput
): AttachOperationalRecommendationQueuePreviewResult {
    const recommendation = tryBuildOperationalRecommendationFromAttention({
        ...input,
        sourceSurface: "queue_enrich",
    });
    if (!recommendation) {
        return { _operational_recommendation_preview: null };
    }
    return {
        _operational_recommendation_preview: projectOperationalRecommendationQueuePreview(recommendation),
    };
}
