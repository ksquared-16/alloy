/**
 * Server-side render projections for OperationalRecommendationV1 (Phase 1 / Card 1.3).
 */

import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";
import { OPERATIONAL_RECOMMENDATION_MAX_LENGTHS } from "@/lib/adminV2/bos/recommendations/types";
import type {
    ConfidenceLevelV1,
    GroundingSignalV1,
    OperationalRecommendationRenderBundleV1,
    OperationalRecommendationV1,
    RecommendationFactorV1,
    RecommendationTypeV1,
    UrgencyBandV1,
} from "@/lib/adminV2/bos/recommendations/types";
import {
    MAX_DETAIL_SIGNAL_LABELS_V1,
    MAX_DRAWER_STRIP_SIGNAL_LABELS_V1,
} from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";

function truncate(text: string, max: number): string {
    const t = text.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}

const URGENCY_LABELS: Record<UrgencyBandV1, string> = {
    p0_urgent: "Urgent",
    p1_today: "Today",
    p2_soon: "Soon",
    p3_fyi: "FYI",
};

function handoffCtaLabel(actionFamily: AttentionSuggestionActionFamily): string {
    switch (actionFamily) {
        case "follow_up":
        case "send_message":
        case "schedule":
            return "Review next step";
        case "review":
        case "update_record":
        case "workflow":
            return "Open recommendation";
        default:
            return "Review in Orchestrator";
    }
}

export function projectOperationalRecommendationRender(args: {
    recommendation_type: RecommendationTypeV1;
    urgency: UrgencyBandV1;
    confidence_level: ConfidenceLevelV1;
    title: string;
    why_it_matters: string;
    urgency_reason: string;
    likely_outcome: string | null;
    recommended_action_label: string;
    action_rationale: string;
    likely_risk: string | null;
    action_family: AttentionSuggestionActionFamily;
    primary_display_name: string | null;
    normalized_signals: GroundingSignalV1[];
    secondary_factors: RecommendationFactorV1[];
    is_stale: boolean;
}): OperationalRecommendationRenderBundleV1 {
    const stale_banner = args.is_stale ? "Record changed — refresh for updated guidance." : null;
    const signal_labels = args.normalized_signals.map((s) => s.label).slice(0, MAX_DRAWER_STRIP_SIGNAL_LABELS_V1);

    const contextName = args.primary_display_name?.trim() || "this inquiry";

    return {
        queue: {
            next_label: truncate(args.recommended_action_label, 60),
            why_line: truncate(args.why_it_matters, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.queue_why_line),
            urgency_band: args.urgency,
            recommendation_type: args.recommendation_type,
            is_stale: args.is_stale,
        },
        drawer_strip: {
            title: truncate(args.title, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.title),
            why_line: truncate(args.why_it_matters, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.drawer_why_line),
            urgency_label: URGENCY_LABELS[args.urgency],
            urgency_reason: truncate(args.urgency_reason, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.urgency_reason),
            outcome_line: args.likely_outcome
                ? truncate(args.likely_outcome, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_outcome)
                : null,
            confidence_label: args.confidence_level === "low" ? "Approximate timing" : null,
            next_action_label: truncate(args.recommended_action_label, 120),
            signal_labels,
            is_stale: args.is_stale,
            stale_banner,
        },
        handoff: {
            eyebrow: "Recommended next step",
            primary_recommendation: truncate(args.title || args.recommended_action_label, 120),
            operational_reason: truncate(
                args.why_it_matters,
                OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.handoff_operational_reason
            ),
            context_line: `Active record · ${truncate(contextName, 200)}`,
            cta_label: handoffCtaLabel(args.action_family),
        },
        detail:
            args.secondary_factors.length > 0
                ? {
                      factors: args.secondary_factors,
                      signal_labels: args.normalized_signals
                          .map((s) => s.label)
                          .slice(0, MAX_DETAIL_SIGNAL_LABELS_V1),
                      action_rationale: truncate(
                          args.action_rationale,
                          OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.action_rationale
                      ),
                      likely_outcome: args.likely_outcome
                          ? truncate(args.likely_outcome, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_outcome)
                          : null,
                      likely_risk: args.likely_risk
                          ? truncate(args.likely_risk, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_risk)
                          : null,
                  }
                : null,
    };
}

export function attachRenderBundle(
    partial: Omit<OperationalRecommendationV1, "render">,
    renderArgs: Parameters<typeof projectOperationalRecommendationRender>[0]
): OperationalRecommendationV1 {
    return {
        ...partial,
        render: projectOperationalRecommendationRender(renderArgs),
    };
}
