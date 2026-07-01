import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
    getRecommendationHandoff,
    getRecommendationQueuePreview,
    resolveQueueOperationalReadPreview,
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
        expect(display?.doNext).toBe(rec.recommended_action.label);
        expect(display?.whyNow).toBe(rec.render.drawer_strip.why_line);
        expect(display?.whyNow).not.toContain("Operational attention:");
        expect(display?.operationalRead).toBe(rec.render.drawer_strip.title);
        expect(display?.urgencyLabel).toBe("Soon");
        expect(display?.urgencyBand).toBe("p2_soon");
        expect(display?.urgencyReason).toMatch(/Response window/i);
        expect(display?.signalLabels?.length).toBeGreaterThan(0);
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
        expect(display?.doNext).toBe("Respond to new request");
    });

    it("returns null when canonical and legacy data are missing", () => {
        expect(getRecommendationDrawerStrip({})).toBeNull();
    });
});

describe("resolveQueueOperationalReadPreview", () => {
    it("splits do-next and why for L0 scan lines", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const line = resolveQueueOperationalReadPreview({
            _operational_recommendation_preview: rec.render.queue,
        });
        expect(line?.operationalRead).toContain("Send a warm first response");
        expect(line?.whyNow).toMatch(/Response window|inquiry was created/i);
        expect(line?.operationalRead).not.toContain("—");
    });
});

describe("getRecommendationHandoff", () => {
    it("prefers canonical handoff projection with review-assist fields", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const handoff = getRecommendationHandoff({ _operational_recommendation: rec });
        expect(handoff).not.toBeNull();
        expect(handoff!.eyebrow).toBe("Review assist");
        expect(handoff!.operationalRead).toBe(rec.render.handoff.primary_recommendation);
        expect(handoff!.whyNow).toBe(rec.render.handoff.operational_reason);
        expect(handoff!.doNext).toBe(rec.recommended_action.label);
        expect(handoff!.likelyOutcome).toBeTruthy();
        expect(handoff!.ctaLabel).toBe("Continue in Orchestrator");
    });

    it("returns null when canonical handoff is absent", () => {
        expect(getRecommendationHandoff({})).toBeNull();
    });
});

describe("getRecommendationDetailSummary / Card 2.4", () => {
    it("returns null when no signals, factors, or provenance exist", () => {
        expect(getRecommendationDetailSummary({})).toBeNull();
    });

    it("builds collapsed summary from canonical strip and detail signal labels", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const detail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        expect(detail).not.toBeNull();
        expect(detail!.collapsedSummary).toMatch(/More detail · \d+ signal/);
        expect(detail!.displaySignalLabels.length).toBeGreaterThan(0);
        expect(detail!.displaySignalLabels.length).toBeLessThanOrEqual(3);
    });

    it("caps display signal labels at three while preserving full signal count", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.render.drawer_strip.signal_labels = ["One", "Two", "Three", "Four"];
        const detail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        expect(detail!.signalCount).toBe(4);
        expect(detail!.displaySignalLabels).toEqual(["One", "Two", "Three"]);
    });

    it("uses human-safe factor labels only for legacy suggestion factors", () => {
        const detail = getRecommendationDetailSummary({
            _attention_suggestion: {
                version: 1,
                agent_key: "needs_attention_suggestion",
                suggestion_id: "b".repeat(48),
                target: { entity_type: "opportunities", entity_id: "opp-1" },
                source: {
                    resolver: "opportunity_attention",
                    resolver_version: 2,
                    primary_reason_code: "stale_new_inquiry",
                    reason_codes: ["stale_new_inquiry"],
                },
                next_action: {
                    key: "respond",
                    label: "Respond",
                    action_family: "follow_up",
                    confidence: "deterministic",
                },
                reasoning: {
                    summary: "Stale",
                    factors: [
                        {
                            code: "stale_new_inquiry",
                            label: "New inquiry is stale",
                            severity: "medium",
                            sla_tier: "breached",
                        },
                    ],
                },
                generated_at_iso: "2026-05-21T12:00:00.000Z",
            },
        });
        expect(detail?.primaryFactorLabel).toBe("New inquiry is stale");
        expect(detail?.collapsedSummary).toContain("1 factor");
    });
});
