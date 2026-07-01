/**
 * Queue row preview projection for OperationalRecommendationV1 (Phase 1 / Card 1.5).
 * Preview-only — not authoritative for drawer/workflow execution.
 */

import type {
    OperationalRecommendationQueuePreviewV1,
    OperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations/types";

/** Lightweight queue preview from a full recommendation (render.queue only). */
export function projectOperationalRecommendationQueuePreview(
    recommendation: OperationalRecommendationV1
): OperationalRecommendationQueuePreviewV1 {
    return recommendation.render.queue;
}
