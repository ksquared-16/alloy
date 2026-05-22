/**
 * Deterministic urgency + confidence resolution (Phase 1 / Card 1.3).
 */

import type { OperationalRecommendationCatalogEntryV1 } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type { GroundingSignalV1, UrgencyBandV1, ConfidenceLevelV1 } from "@/lib/adminV2/bos/recommendations/types";

export function resolveUrgencyBand(args: {
    catalog: OperationalRecommendationCatalogEntryV1;
    normalized_signals: GroundingSignalV1[];
}): UrgencyBandV1 {
    const hasBreached = args.normalized_signals.some((s) => s.sla_tier === "breached");
    const hasCritical = args.normalized_signals.some((s) => s.severity === "critical");
    if (hasBreached || hasCritical || args.catalog.catalog_key === "sla_breach") {
        return "p0_urgent";
    }
    if (args.catalog.default_urgency_band) return args.catalog.default_urgency_band;
    return "p2_soon";
}

export function resolveConfidence(args: {
    catalog: OperationalRecommendationCatalogEntryV1;
    normalized_signals: GroundingSignalV1[];
    secondary_factor_count: number;
    template_values: { timing_phrase?: string | null };
}): { confidence_level: ConfidenceLevelV1; confidence_reason: string } {
    const lowClock = args.normalized_signals.some(
        (s) => s.code.includes("approximate") || s.provenance.includes("activity")
    );
    const breached = args.normalized_signals.some((s) => s.sla_tier === "breached");
    const multi = args.secondary_factor_count > 0 || args.normalized_signals.length > 3;

    if (lowClock && !args.template_values.timing_phrase?.trim()) {
        return {
            confidence_level: "low",
            confidence_reason: "Timing approximate · based on latest record activity",
        };
    }
    if (multi || breached) {
        return {
            confidence_level: "medium",
            confidence_reason: breached
                ? "Multiple operational factors or SLA breach in play"
                : "Multiple attention factors on this record",
        };
    }
    if (args.catalog.default_confidence_level === "high" && args.normalized_signals.length <= 2) {
        return {
            confidence_level: "high",
            confidence_reason: "Grounded in resolver attention and explicit operational dates",
        };
    }
    return {
        confidence_level: args.catalog.default_confidence_level,
        confidence_reason: "Derived from configured attention rules and record timing",
    };
}
