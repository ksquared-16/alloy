/**
 * Deterministic urgency + confidence resolution (Phase 1 / Card 1.3).
 */

import type {
    CatalogInterpolationValues,
    OperationalRecommendationCatalogEntryV1,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type { GroundingSignalV1, UrgencyBandV1, ConfidenceLevelV1 } from "@/lib/adminV2/bos/recommendations/types";

export function resolveUrgencyBand(args: {
    catalog: OperationalRecommendationCatalogEntryV1;
    normalized_signals: GroundingSignalV1[];
}): UrgencyBandV1 {
    const hasBreached = args.normalized_signals.some((s) => s.sla_tier === "breached");
    const hasCritical = args.normalized_signals.some((s) => s.severity === "critical");
    const hasHigh = args.normalized_signals.some((s) => s.severity === "high");
    if (hasCritical || args.catalog.catalog_key === "sla_breach") {
        return "p0_urgent";
    }
    if (hasHigh && hasBreached) {
        return "p0_urgent";
    }
    if (hasBreached) {
        return "p1_today";
    }
    const defaultBand = args.catalog.default_urgency_band ?? "p2_soon";
    if (defaultBand === "p1_today" && !hasBreached && !hasCritical && !hasHigh) {
        return "p2_soon";
    }
    return defaultBand;
}

export function resolveConfidence(args: {
    catalog: OperationalRecommendationCatalogEntryV1;
    normalized_signals: GroundingSignalV1[];
    secondary_factor_count: number;
    template_values: CatalogInterpolationValues;
}): { confidence_level: ConfidenceLevelV1; confidence_reason: string } {
    const lowClock = args.normalized_signals.some(
        (s) => s.code.includes("approximate") || s.provenance.includes("activity")
    );
    const breached = args.normalized_signals.some((s) => s.sla_tier === "breached");
    const multi = args.secondary_factor_count > 0 || args.normalized_signals.length > 3;

    const timingRaw = args.template_values.timing_phrase;
    const timingPhrase =
        typeof timingRaw === "string" ? timingRaw : timingRaw != null ? String(timingRaw) : "";

    if (lowClock && !timingPhrase.trim()) {
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
