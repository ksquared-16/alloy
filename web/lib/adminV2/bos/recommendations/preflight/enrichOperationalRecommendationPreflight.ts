import { evaluateEffectiveRequirements } from "@/lib/completion/evaluateEffectiveRequirements";
import { effectiveRequirementsToValidationResult } from "@/lib/completion/evaluateEffectiveRequirements";
import { readinessResultFromEffectiveRequirements } from "@/lib/completion/evaluateOperationalReadiness";
import { toBosCompletionRequirementPayload } from "@/lib/completion/bosIntegration";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { mapCatalogKeyToCanonicalActionKey } from "@/lib/adminV2/bos/recommendations/preflight/mapCatalogKeyToCanonicalActionKey";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { BosCompletionRequirementPayload } from "@/lib/completion/enforcePersonCompletionOnPatch";

export type BosRecommendedActionPreflightV1 = {
    key: string;
    label: string;
    preflight: BosCompletionRequirementPayload;
    executable: boolean;
    readiness?: ReadinessResult;
};

/**
 * Attach shared requirement evaluation to a canonical operational recommendation (sync / row snapshot).
 */
export function enrichOperationalRecommendationWithActionPreflight(
    recommendation: OperationalRecommendationV1,
    opportunityRow: Record<string, unknown>
): OperationalRecommendationV1 & { recommended_action_preflight?: BosRecommendedActionPreflightV1 } {
    const canonicalKey = mapCatalogKeyToCanonicalActionKey(recommendation.recommended_action.key);
    if (!canonicalKey) return recommendation;

    const opportunityId = String(opportunityRow.id ?? "").trim();
    if (!opportunityId) return recommendation;

    const effective = evaluateEffectiveRequirements({
        org_id: String(opportunityRow.org_id ?? "").trim() || undefined,
        entity_type: "opportunity",
        entity_id: opportunityId,
        status: opportunityRow.status_key != null ? String(opportunityRow.status_key) : null,
        action_key: canonicalKey,
        trigger: "bos_scan",
        record: opportunityRow,
    });

    const validation = effectiveRequirementsToValidationResult(effective);
    const readiness = readinessResultFromEffectiveRequirements(effective, {
        trigger: "action_execute",
        subject: { entity_type: "opportunity", entity_id: opportunityId },
        context: {
            org_id: String(opportunityRow.org_id ?? "").trim() || "unknown",
            action_key: canonicalKey,
        },
    });
    const preflight = { ...toBosCompletionRequirementPayload(validation), readiness };

    return {
        ...recommendation,
        recommended_action: {
            ...recommendation.recommended_action,
            key: canonicalKey,
        },
        recommended_action_preflight: {
            key: canonicalKey,
            label: recommendation.recommended_action.label,
            preflight,
            executable: effective.ok,
            readiness,
        },
    };
}
