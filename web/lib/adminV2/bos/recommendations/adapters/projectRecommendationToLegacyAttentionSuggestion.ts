/**
 * Legacy compatibility adapter — canonical recommendation → AttentionSuggestionV1 (Phase 1 / Card 1.6).
 *
 * Migration doctrine:
 * - `_operational_recommendation` is the canonical server-owned contract.
 * - `_attention_suggestion` remains a compatibility projection for existing consumers.
 * - This adapter enables future migration; visible UI replacement happens in a later UX card.
 * - Do not generate recommendation copy outside the canonical builder + catalog path.
 *
 * @see docs/sprints/05_2026/bos_operational_recommendation_phase1_execution.md §9
 */

import { deterministicSuggestionId } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import {
    NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
    type AttentionSuggestionActionFamily,
    type AttentionSuggestionV1,
} from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";

const VALID_ACTION_FAMILIES = new Set<AttentionSuggestionActionFamily>([
    "follow_up",
    "review",
    "update_record",
    "send_message",
    "schedule",
    "workflow",
    "none",
]);

function legacyReasonSummary(recommendation: OperationalRecommendationV1): string | null {
    const why = recommendation.why_it_matters?.trim();
    if (why) return why;
    const drawerWhy = recommendation.render?.drawer_strip?.why_line?.trim();
    if (drawerWhy) return drawerWhy;
    return recommendation.render?.queue?.why_line?.trim() ?? null;
}

function buildLegacyFactors(recommendation: OperationalRecommendationV1, primaryReasonCode: string | null) {
    const factors = recommendation.secondary_factors.map((f) => ({
        code: f.code,
        label: f.label,
        severity: f.severity,
        sla_tier: f.sla_tier,
    }));

    if (!primaryReasonCode || factors.some((f) => f.code === primaryReasonCode)) {
        return factors;
    }

    const primarySignal = recommendation.grounding_signals.find(
        (s) => s.code === "primary_attention_reason" || s.reason_code === primaryReasonCode
    );
    return [
        {
            code: primaryReasonCode,
            label: primarySignal?.label ?? recommendation.title,
            severity: primarySignal?.severity,
            sla_tier: primarySignal?.sla_tier,
        },
        ...factors,
    ];
}

/**
 * Project a canonical {@link OperationalRecommendationV1} into legacy {@link AttentionSuggestionV1}.
 * Fail-soft: returns null when required recommendation fields are absent.
 * Does not mutate the input recommendation. Does not emit AI/suggested_content bodies.
 */
export function projectRecommendationToLegacyAttentionSuggestion(
    recommendation: OperationalRecommendationV1
): AttentionSuggestionV1 | null {
    try {
        const ctx = recommendation.operational_context;
        const stale = recommendation.stale_state_check?.fingerprint_inputs;
        const entityId = ctx?.entity_id?.trim();
        const actionLabel = recommendation.recommended_action?.label?.trim();
        const actionKey = recommendation.recommended_action?.key?.trim();
        const actionFamily = recommendation.recommended_action?.action_family;
        const summary = legacyReasonSummary(recommendation);

        if (!entityId || !actionLabel || !actionKey || !summary) {
            return null;
        }
        if (!actionFamily || !VALID_ACTION_FAMILIES.has(actionFamily)) {
            return null;
        }

        const primaryReasonCode = stale?.primary_reason_code ?? null;
        const resolverVersion = stale?.resolver_version ?? 2;
        const dayBucketUtc = recommendation.generated_at_iso.slice(0, 10);

        return {
            version: 1,
            agent_key: NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
            suggestion_id: deterministicSuggestionId({
                entity_id: entityId,
                primary_reason_code: primaryReasonCode ?? actionKey,
                resolver_version: resolverVersion,
                day_bucket_utc: dayBucketUtc,
            }),
            target: {
                entity_type: "opportunities",
                entity_id: entityId,
            },
            source: {
                resolver: "opportunity_attention",
                resolver_version: resolverVersion,
                primary_reason_code: primaryReasonCode,
                reason_codes:
                    stale?.reason_codes_sorted?.length
                        ? [...stale.reason_codes_sorted]
                        : primaryReasonCode
                          ? [primaryReasonCode]
                          : [],
                activity_signal_key: stale?.activity_signal_key ?? null,
            },
            next_action: {
                key: actionKey,
                label: actionLabel,
                action_family: actionFamily,
                confidence: "deterministic",
            },
            reasoning: {
                summary,
                factors: buildLegacyFactors(recommendation, primaryReasonCode),
            },
            suggested_content: null,
            generated_at_iso: recommendation.generated_at_iso,
        };
    } catch {
        return null;
    }
}

/** Execution-pack alias for migration grep / future wire cards. */
export const operationalRecommendationToAttentionSuggestionV1 = projectRecommendationToLegacyAttentionSuggestion;
