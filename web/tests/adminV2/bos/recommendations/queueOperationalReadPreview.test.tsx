import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    getRecommendationQueuePreview,
    queueUrgencyChipLabel,
    resolveQueueOperationalReadPreview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { buildEnrollmentCrmRowSemanticSlots } from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";
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
        expect(resolved?.line).toContain("Send a warm first response");
        expect(resolved?.line).toContain("lose momentum");
        expect(resolved?.urgencyChipLabel).toBe("Today");
    });

    it("falls back to legacy _attention_suggestion_preview", () => {
        const resolved = resolveQueueOperationalReadPreview({
            _attention_suggestion_preview: {
                next_label: "Respond to new request",
                why_line: "Operational attention: New inquiry is stale.",
            },
        });
        expect(resolved?.source).toBe("legacy_queue_preview");
        expect(resolved?.line).toContain("Respond to new request");
    });

    it("falls back to why_line only", () => {
        const resolved = resolveQueueOperationalReadPreview({
            why_line: "Follow up today on tour scheduling.",
        });
        expect(resolved?.source).toBe("legacy_why_line");
        expect(resolved?.line).toBe("Follow up today on tour scheduling.");
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

    it("shows chip for P0/P1/P2", () => {
        expect(queueUrgencyChipLabel("p0_urgent")).toBe("Urgent");
        expect(queueUrgencyChipLabel("p2_soon")).toBe("Soon");
    });
});

describe("buildEnrollmentCrmRowSemanticSlots queue compression", () => {
    it("suppresses duplicate attention lines when operational read is present", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const preview = projectOperationalRecommendationQueuePreview(rec);
        const row = {
            ...baseRow(),
            _operational_recommendation_preview: preview,
            _operational_summary_preview: {
                headline: "Stale inquiry — draft ready for review.",
                risk_urgency_hint: "medium",
            },
        } as Record<string, unknown>;

        const slots = buildEnrollmentCrmRowSemanticSlots(row as never, {
            workUnitKey: "needs_attention",
        });

        expect(slots.operationalReadPreview?.line).toBeTruthy();
        expect(slots.attentionReason).toBeNull();
        expect(slots.operationalSummaryPreview).toBeNull();
        expect(slots.queuePriorityExplanation).toBeNull();
        expect(slots.operationalNextHint).toBeNull();
        expect(slots.attentionSuggestionPreview).toBeNull();
    });
});

describe("CrmCompactQueuePreview operational read L0", () => {
    it("renders one operational read line without Alloy suggestion", () => {
        const preview = getRecommendationQueuePreview({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response",
                why_line: "New inquiries lose momentum when delayed.",
                urgency_band: "p1_today",
            },
        });
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                slots={{
                    primaryIdentity: "Patel family",
                    childName: null,
                    childrenLines: null,
                    stageLabel: "New",
                    statusLabel: "Inquiry",
                    nextStep: null,
                    lastActivity: null,
                    commercialValue: null,
                    contactSnippet: null,
                    programContext: null,
                    roomContext: null,
                    ageContext: "",
                    attentionReason: null,
                    operationalReadPreview: preview
                        ? {
                              line: `${preview.nextLabel} — ${preview.whyLine}`,
                              urgencyChipLabel: "Today",
                              urgencyBand: "p1_today",
                              source: preview.source,
                          }
                        : null,
                    operationalNextHint: null,
                }}
            />,
        );
        expect(html).toContain('data-queue-preview-slot="operational_read"');
        expect(html).toContain("Operational read:");
        expect(html).toContain("Send a warm first response");
        expect(html).toContain("lose momentum");
        expect(html).toContain('data-testid="queue-operational-read-urgency-chip"');
        expect(html).toContain("Today");
        expect(html).toContain("Preview");
        expect(html).not.toContain("Alloy suggestion");
        expect(html).not.toContain("Suggested next step");
        expect(html).not.toContain('data-queue-preview-slot="attention_suggestion"');
    });
});
