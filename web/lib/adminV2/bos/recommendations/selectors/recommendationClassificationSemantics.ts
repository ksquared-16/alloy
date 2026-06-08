/**
 * Restrained operational classification labels (BOS Phase 2 / Card 2.5).
 * Selector-only — no UI copy generation in components.
 */

import type { RecommendationTypeV1 } from "@/lib/adminV2/bos/recommendations/types";

export const ESCALATION_CHIP_LABEL = "Needs leadership review";

const RECOMMENDATION_TYPE_LABELS: Record<RecommendationTypeV1, string> = {
    informational: "Informational",
    operational: "Follow-up",
    escalation: "Escalation",
    communication: "Communication",
    conversion: "Conversion",
    risk: "Momentum risk",
    workflow: "Workflow",
};

/** Operator-facing type label for drawer / metadata surfaces. */
export function recommendationTypeLabel(type: RecommendationTypeV1 | null | undefined): string | null {
    if (!type) return null;
    return RECOMMENDATION_TYPE_LABELS[type] ?? null;
}

/**
 * Queue L0 shows at most one quiet type cue when it adds scan meaning beyond urgency.
 * Default follow-up / informational guidance stays embedded in the read line.
 */
export function queueTypeCueLabel(type: RecommendationTypeV1 | null | undefined): string | null {
    if (!type) return null;
    switch (type) {
        case "escalation":
        case "communication":
        case "conversion":
        case "workflow":
        case "risk":
            return RECOMMENDATION_TYPE_LABELS[type];
        default:
            return null;
    }
}

export function resolveEscalationChipLabel(type: RecommendationTypeV1 | null | undefined): string | null {
    return type === "escalation" ? ESCALATION_CHIP_LABEL : null;
}

export function resolveClassificationContextLine(args: {
    recommendationType: RecommendationTypeV1 | null | undefined;
    escalationPolicyBasis?: string | null;
    communicationTimingHint?: string | null;
}): string | null {
    const type = args.recommendationType ?? null;
    if (type === "escalation") {
        const basis = args.escalationPolicyBasis?.trim();
        return basis || null;
    }
    if (type === "communication") {
        const timing = args.communicationTimingHint?.trim();
        return timing ? `Follow-up timing · ${timing}` : null;
    }
    return null;
}

export function shouldShowDrawerTypeLine(type: RecommendationTypeV1 | null | undefined): boolean {
    return Boolean(type && type !== "informational");
}
