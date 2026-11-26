/**
 * Legacy queue preview adapter — canonical recommendation → AttentionSuggestionQueuePreviewV1.
 *
 * Queue rows remain preview/selection only. Full recommendation authority stays on entity GET.
 * Enables future replacement of inline `buildNeedsAttentionSuggestion` queue previews.
 *
 * @see docs/sprints/archive/05_2026/bos_operational_recommendation_phase1_execution.md §8.7
 */

import type { AttentionSuggestionQueuePreviewV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type {
    OperationalRecommendationQueuePreviewV1,
    OperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations/types";

function previewFromQueueRender(
    queue: OperationalRecommendationQueuePreviewV1 | null | undefined
): AttentionSuggestionQueuePreviewV1 | null {
    const nextLabel = queue?.next_label?.trim();
    const whyLine = queue?.why_line?.trim();
    if (!nextLabel || !whyLine) return null;
    return { next_label: nextLabel, why_line: whyLine };
}

/**
 * Project canonical queue render fields into legacy `_attention_suggestion_preview` shape.
 */
export function projectRecommendationPreviewToLegacyAttentionSuggestionPreview(
    recommendation: OperationalRecommendationV1
): AttentionSuggestionQueuePreviewV1 | null {
    return previewFromQueueRender(recommendation.render?.queue);
}

/** Accept an already-projected queue preview DTO (strips non-legacy fields). */
export function projectOperationalRecommendationQueuePreviewToLegacyAttentionSuggestionPreview(
    preview: OperationalRecommendationQueuePreviewV1
): AttentionSuggestionQueuePreviewV1 | null {
    return previewFromQueueRender(preview);
}
