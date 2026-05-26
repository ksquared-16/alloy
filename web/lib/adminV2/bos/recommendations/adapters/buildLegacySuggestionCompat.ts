/**
 * Canonical-first legacy suggestion compat (Phase 1 / Card 1.7).
 *
 * Prefer projecting from {@link OperationalRecommendationV1}; fall back to
 * {@link buildNeedsAttentionSuggestion} when canonical build/projection is unavailable.
 * Legacy shapes remain on the wire for existing consumers — compat-only, not authoritative.
 *
 * @see docs/sprints/05_2026/bos_operational_recommendation_phase1_execution.md §9
 */

import {
    buildNeedsAttentionSuggestion,
    type BuildNeedsAttentionSuggestionInput,
} from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import type {
    AttentionSuggestionQueuePreviewV1,
    AttentionSuggestionV1,
} from "@/lib/agent/needsAttentionSuggestion/types";
import { projectOperationalRecommendationQueuePreviewToLegacyAttentionSuggestionPreview } from "@/lib/adminV2/bos/recommendations/adapters/projectRecommendationPreviewToLegacyAttentionSuggestionPreview";
import { projectRecommendationToLegacyAttentionSuggestion } from "@/lib/adminV2/bos/recommendations/adapters/projectRecommendationToLegacyAttentionSuggestion";
import { OPERATIONAL_RECOMMENDATION_MAX_LENGTHS } from "@/lib/adminV2/bos/recommendations/types";
import type {
    OperationalRecommendationQueuePreviewV1,
    OperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations/types";

function truncateQueueWhyLine(text: string, maxChars: number): string {
    const t = text.trim();
    if (t.length <= maxChars) return t;
    if (maxChars < 2) return "…";
    return `${t.slice(0, maxChars - 1)}…`;
}

function legacyQueuePreviewFromSuggestion(
    suggestion: AttentionSuggestionV1,
    maxChars = OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.queue_why_line
): AttentionSuggestionQueuePreviewV1 {
    return {
        next_label: suggestion.next_action.label,
        why_line: truncateQueueWhyLine(suggestion.reasoning.summary, maxChars),
    };
}

export type BuildLegacyAttentionSuggestionCompatInput = {
    /** Canonical recommendation when available (entity GET / queue enrich). */
    recommendation: OperationalRecommendationV1 | null;
    /** Legacy builder input — used only when canonical projection fails or is absent. */
    legacyInput: BuildNeedsAttentionSuggestionInput | null;
};

/**
 * Entity/drawer legacy `_attention_suggestion`: canonical projection first, legacy builder fallback.
 */
export function buildLegacyAttentionSuggestionCompat(
    input: BuildLegacyAttentionSuggestionCompatInput
): AttentionSuggestionV1 | null {
    if (input.recommendation) {
        const projected = projectRecommendationToLegacyAttentionSuggestion(input.recommendation);
        if (projected) return projected;
    }
    if (!input.legacyInput) return null;
    return buildNeedsAttentionSuggestion(input.legacyInput);
}

export type BuildLegacyQueuePreviewCompatInput = {
    /** Canonical queue preview when available. */
    recommendationPreview: OperationalRecommendationQueuePreviewV1 | null;
    /** Full canonical recommendation — optional fallback for queue preview via entity projection. */
    recommendation?: OperationalRecommendationV1 | null;
    /** Legacy builder input — used when canonical preview/projection is unavailable. */
    legacyInput: BuildNeedsAttentionSuggestionInput | null;
    nowMs?: number;
};

/**
 * Queue row legacy `_attention_suggestion_preview`: canonical preview first, legacy builder fallback.
 */
export function buildLegacyQueuePreviewCompat(
    input: BuildLegacyQueuePreviewCompatInput
): AttentionSuggestionQueuePreviewV1 | null {
    if (input.recommendationPreview) {
        const projected = projectOperationalRecommendationQueuePreviewToLegacyAttentionSuggestionPreview(
            input.recommendationPreview
        );
        if (projected) return projected;
    }

    if (input.recommendation) {
        const suggestion = buildLegacyAttentionSuggestionCompat({
            recommendation: input.recommendation,
            legacyInput: input.legacyInput,
        });
        if (suggestion) {
            return legacyQueuePreviewFromSuggestion(suggestion);
        }
    }

    if (!input.legacyInput) return null;
    const legacySuggestion = buildNeedsAttentionSuggestion({
        ...input.legacyInput,
        nowIso: input.legacyInput.nowIso ?? new Date(input.nowMs ?? Date.now()).toISOString(),
    });
    if (!legacySuggestion) return null;
    return legacyQueuePreviewFromSuggestion(legacySuggestion);
}

/** Execution-pack alias. */
export const buildLegacySuggestionCompatFromRecommendation = buildLegacyAttentionSuggestionCompat;

/** Queue preview compat alias. */
export const buildLegacyQueuePreviewCompatFromRecommendation = buildLegacyQueuePreviewCompat;
