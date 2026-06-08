import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    TRUST_READINESS_LABELS,
    resolveDrawerReadinessChrome,
    resolveHandoffTrustNote,
    resolveQueuePreviewTrustChrome,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationTrustChrome";
import {
    getRecommendationHandoff,
    resolveDrawerReadinessChromeForOverview,
    resolveQueueOperationalReadPreview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

describe("recommendationTrustChrome / Card 2.6", () => {
    it("stays quiet when guidance is current", () => {
        expect(
            resolveDrawerReadinessChrome({
                isStale: false,
                confidenceLabel: null,
                hasActivitySignal: false,
                hasSupportingDetail: false,
            }).trustLines
        ).toEqual([]);
        expect(resolveQueuePreviewTrustChrome(false).staleCueLabel).toBeNull();
        expect(resolveHandoffTrustNote({ isStale: false, confidenceLabel: null })).toBeNull();
    });

    it("uses restrained stale and timing language", () => {
        const drawer = resolveDrawerReadinessChrome({
            isStale: true,
            confidenceLabel: "Approximate timing",
            hasActivitySignal: true,
            hasSupportingDetail: true,
        });
        expect(drawer.trustLines).toEqual([
            TRUST_READINESS_LABELS.needsRefresh,
            TRUST_READINESS_LABELS.approximateTiming,
            TRUST_READINESS_LABELS.basedOnAvailableActivity,
            TRUST_READINESS_LABELS.supportingDetailAvailable,
        ]);
        expect(drawer.trustLines.join(" ")).not.toMatch(/AI confidence|model believes|critical warning|99%/i);
    });

    it("exposes compact queue stale cue without extra lines", () => {
        expect(resolveQueuePreviewTrustChrome(true).staleCueLabel).toBe(TRUST_READINESS_LABELS.needsRefresh);
    });

    it("resolves handoff readiness note only when stale or approximate", () => {
        expect(resolveHandoffTrustNote({ isStale: true })).toBe(TRUST_READINESS_LABELS.needsRefresh);
        expect(resolveHandoffTrustNote({ confidenceLabel: "Approximate timing" })).toBe(
            TRUST_READINESS_LABELS.approximateTiming
        );
    });

    it("resolveDrawerReadinessChromeForOverview prefers canonical stale state over long banner text", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.render.drawer_strip.is_stale = true;
        rec.render.drawer_strip.stale_banner = "Record changed — refresh for updated guidance.";
        rec.render.drawer_strip.confidence_label = "Approximate timing";

        const chrome = resolveDrawerReadinessChromeForOverview(
            { _operational_recommendation: rec },
            { hasSupportingDetail: true, hasActivitySignal: true }
        );
        expect(chrome.trustLines).toContain(TRUST_READINESS_LABELS.needsRefresh);
        expect(chrome.trustLines).toContain(TRUST_READINESS_LABELS.approximateTiming);
        expect(chrome.trustLines).toContain(TRUST_READINESS_LABELS.supportingDetailAvailable);
        expect(chrome.trustLines.join(" ")).not.toContain("Record changed");
    });

    it("passes queue is_stale into preview trust chrome", () => {
        const resolved = resolveQueueOperationalReadPreview({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response",
                why_line: "New inquiries lose momentum when delayed.",
                urgency_band: "p1_today",
                recommendation_type: "communication",
                is_stale: true,
            },
        });
        expect(resolved?.staleCue).toBe(TRUST_READINESS_LABELS.needsRefresh);
    });

    it("includes readiness note on canonical handoff when stale", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.render.drawer_strip.is_stale = true;
        const handoff = getRecommendationHandoff({ _operational_recommendation: rec });
        expect(handoff?.readinessNote).toBe(TRUST_READINESS_LABELS.needsRefresh);
    });
});
