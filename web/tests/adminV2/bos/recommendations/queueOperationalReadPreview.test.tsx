import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    getRecommendationQueuePreview,
    queueUrgencyChipLabel,
    resolveQueueOperationalReadPreview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { resolveQueueOperationalReadSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";

const baseRow = (): Record<string, unknown> => ({
    id: "opp-1",
    name: "Patel family",
    _needs_attention: true,
    _attention_reason_label: "Needs attention: New inquiry is stale",
    _attention_reason: "stale_new_inquiry",
});

describe("resolveQueueOperationalReadPreview", () => {
    it("prefers canonical _operational_recommendation_preview", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const preview = projectOperationalRecommendationQueuePreview(rec);
        const resolved = resolveQueueOperationalReadPreview({
            _operational_recommendation_preview: preview,
        });
        expect(resolved?.source).toBe("canonical_queue_preview");
        expect(resolved?.operationalRead).toContain("Send a warm first response");
        expect(resolved?.whyNow).toContain("Response window exceeded");
        expect(resolved?.operationalRead).not.toContain("lose momentum");
        expect(resolved?.urgencyChipLabel).toBeNull();
    });

    it("falls back to legacy _attention_suggestion_preview", () => {
        const resolved = resolveQueueOperationalReadPreview({
            _attention_suggestion_preview: {
                next_label: "Respond to new request",
                why_line: "Operational attention: New inquiry is stale.",
            },
        });
        expect(resolved?.source).toBe("legacy_queue_preview");
        expect(resolved?.operationalRead).toContain("Respond to new request");
    });

    it("falls back to why_line only", () => {
        const resolved = resolveQueueOperationalReadPreview({
            why_line: "Follow up today on tour scheduling.",
        });
        expect(resolved?.source).toBe("legacy_why_line");
        expect(resolved?.operationalRead).toBe("Follow up today on tour scheduling.");
        expect(resolved?.urgencyChipLabel).toBeNull();
    });

    it("hides urgency chip for P3", () => {
        expect(queueUrgencyChipLabel("p3_fyi")).toBeNull();
        const resolved = resolveQueueOperationalReadPreview({
            _operational_recommendation_preview: {
                next_label: "Check in",
                why_line: "Low priority follow-up.",
                urgency_band: "p3_fyi",
            },
        });
        expect(resolved?.urgencyChipLabel).toBeNull();
    });

    it("shows chip for P0; P1 only when SLA breached or high severity; P2 quiet", () => {
        expect(queueUrgencyChipLabel("p0_urgent")).toBe("Urgent");
        expect(queueUrgencyChipLabel("p2_soon")).toBeNull();
        expect(queueUrgencyChipLabel("p1_today", { primarySeverity: "medium", slaTier: "ok" })).toBeNull();
        expect(queueUrgencyChipLabel("p1_today", { primarySeverity: "high", slaTier: "approaching" })).toBe(
            "Today"
        );
    });
});
