import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    getRecommendationDrawerStrip,
    getRecommendationHandoff,
    getRecommendationQueuePreview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

describe("getRecommendationQueuePreview", () => {
    it("prefers canonical _operational_recommendation_preview", () => {
        const preview = getRecommendationQueuePreview({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response",
                why_line: "New inquiries lose momentum when delayed.",
                urgency_band: "p1_today",
                recommendation_type: "communication",
                is_stale: false,
            },
            _attention_suggestion_preview: {
                next_label: "Respond to new request",
                why_line: "Operational attention: New inquiry is stale.",
            },
        });
        expect(preview?.source).toBe("canonical_queue_preview");
        expect(preview?.nextLabel).toBe("Send a warm first response");
        expect(preview?.whyLine).toMatch(/lose momentum/i);
        expect(preview?.urgencyBand).toBe("p1_today");
    });

    it("falls back to legacy _attention_suggestion_preview", () => {
        const preview = getRecommendationQueuePreview({
            _attention_suggestion_preview: {
                next_label: "Respond to new request",
                why_line: "Operational attention: New inquiry is stale.",
            },
        });
        expect(preview?.source).toBe("legacy_queue_preview");
        expect(preview?.nextLabel).toBe("Respond to new request");
    });

    it("falls back to why_line when previews are absent", () => {
        const preview = getRecommendationQueuePreview({
            why_line: "Follow up today on tour scheduling.",
        });
        expect(preview?.source).toBe("legacy_why_line");
        expect(preview?.whyLine).toContain("Follow up today");
    });

    it("returns null when no recommendation data is present", () => {
        expect(getRecommendationQueuePreview({})).toBeNull();
        expect(getRecommendationQueuePreview(null)).toBeNull();
    });
});

describe("getRecommendationDrawerStrip", () => {
    it("prefers canonical drawer strip projection", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const display = getRecommendationDrawerStrip({
            _operational_recommendation: rec,
            _attention_suggestion: {
                version: 1,
                next_action: { label: "Respond to new request", key: "x", action_family: "follow_up", confidence: "deterministic" },
                reasoning: { summary: "Operational attention: legacy.", factors: [] },
            },
        });
        expect(display?.source).toBe("canonical_drawer_strip");
        expect(display?.nextActionLabel).toBe(rec.recommended_action.label);
        expect(display?.whyLine).toBe(rec.render.drawer_strip.why_line);
        expect(display?.whyLine).not.toContain("Operational attention:");
    });

    it("falls back to legacy _attention_suggestion", () => {
        const display = getRecommendationDrawerStrip({
            _attention_suggestion: {
                version: 1,
                agent_key: "needs_attention_suggestion",
                suggestion_id: "abc",
                target: { entity_type: "opportunities", entity_id: "opp-1" },
                source: {
                    resolver: "opportunity_attention",
                    resolver_version: 2,
                    primary_reason_code: "stale_new_inquiry",
                    reason_codes: ["stale_new_inquiry"],
                },
                next_action: {
                    key: "respond_to_new_request",
                    label: "Respond to new request",
                    action_family: "follow_up",
                    confidence: "deterministic",
                },
                reasoning: {
                    summary: "Operational attention: New inquiry is stale.",
                    factors: [],
                },
                generated_at_iso: "2026-05-21T12:00:00.000Z",
            },
        });
        expect(display?.source).toBe("legacy_attention_suggestion");
        expect(display?.nextActionLabel).toBe("Respond to new request");
    });

    it("returns null when canonical and legacy data are missing", () => {
        expect(getRecommendationDrawerStrip({})).toBeNull();
    });
});

describe("getRecommendationHandoff", () => {
    it("prefers canonical handoff projection", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const handoff = getRecommendationHandoff({ _operational_recommendation: rec });
        expect(handoff).not.toBeNull();
        expect(handoff!.primaryRecommendation).toBe(rec.render.handoff.primary_recommendation);
        expect(handoff!.operationalReason).toBe(rec.render.handoff.operational_reason);
    });

    it("returns null when canonical handoff is absent", () => {
        expect(getRecommendationHandoff({})).toBeNull();
    });
});
