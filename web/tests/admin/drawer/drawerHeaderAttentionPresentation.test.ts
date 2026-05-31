import { describe, expect, it } from "vitest";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import {
    drawerHeaderAttentionSummaryLine,
    hasDrawerReviewAssistBodyGuidance,
    isDrawerHeaderAttentionVisible,
} from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";

describe("drawerHeaderAttentionPresentation", () => {
    const minimalAttention = {
        needs_attention: true,
        reasons: [
            {
                code: "stale_new_inquiry",
                label: "New inquiry is stale",
                severity: "medium",
                sla_tier: "breached",
                sla_clock_confidence: "low",
            },
        ],
        primary_reason: {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "medium",
            sla_tier: "breached",
            sla_clock_confidence: "low",
        },
        waiting: { bucket: "none", since_iso: null, active: false },
        priority_score: 1,
        priority_breakdown: [],
        auxiliary: {},
        resolver_version: 2,
        computed_at_iso: "2026-05-13T12:00:00.000Z",
    };

    it("isDrawerHeaderAttentionVisible when recommendation operational read exists", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(
            isDrawerHeaderAttentionVisible({
                _operational_recommendation: rec,
                _operational_attention: minimalAttention,
            })
        ).toBe(true);
    });

    it("drawerHeaderAttentionSummaryLine prefers doNext over operationalRead", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const vm = resolveDrawerReviewAssistViewModel({
            _operational_recommendation: rec,
            _operational_attention: minimalAttention,
        });
        expect(vm).not.toBeNull();
        const line = drawerHeaderAttentionSummaryLine(vm!.display);
        expect(line).toBeTruthy();
        expect(line).toBe(vm!.display.doNext?.trim() || vm!.display.operationalRead?.trim());
    });

    it("hasDrawerReviewAssistBodyGuidance when why/expansion content exists", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(
            hasDrawerReviewAssistBodyGuidance({
                _operational_recommendation: rec,
                _operational_attention: minimalAttention,
            })
        ).toBe(true);
    });
});
