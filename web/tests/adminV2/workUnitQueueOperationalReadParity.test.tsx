import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildEnrollmentCrmRowSemanticSlots } from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

const canonicalPreview = projectOperationalRecommendationQueuePreview(
    buildOperationalRecommendationV1(buildTestOperationalRecommendationInput())
);

describe("work-unit queue operational read parity", () => {
    it("uses canonical preview in semantic slots and suppresses Needs attention headline", () => {
        const slots = buildEnrollmentCrmRowSemanticSlots(
            {
                id: "opp-1",
                name: "Smith",
                status_key: "new_inquiry",
                _needs_attention: true,
                _attention_reason_label: "New inquiry is stale",
                _operational_recommendation_preview: canonicalPreview,
            } as never,
            { workUnitKey: "needs_attention" }
        );
        expect(slots.operationalReadPreview?.operationalRead).toContain("Send a warm first response");
        expect(slots.attentionReason).toBeNull();
        expect(slots.operationalNextHint).toBeNull();
    });

    it("falls back to attention reason when canonical preview is absent", () => {
        const slots = buildEnrollmentCrmRowSemanticSlots(
            {
                id: "opp-2",
                name: "Jones",
                status_key: "new_inquiry",
                _needs_attention: true,
                _attention_reason_label: "New inquiry is stale",
            } as never,
            { workUnitKey: "needs_attention" }
        );
        expect(slots.operationalReadPreview).toBeNull();
        expect(slots.attentionReason).toBeTruthy();
    });

    it("renders one operational read line without duplicate attention headline", () => {
        const slots = buildEnrollmentCrmRowSemanticSlots(
            {
                id: "opp-3",
                name: "Lee",
                status_key: "new_inquiry",
                _needs_attention: true,
                _attention_reason_label: "New inquiry is stale",
                _operational_recommendation_preview: canonicalPreview,
            } as never,
            { workUnitKey: "needs_attention" }
        );
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview scanMode slots={slots} operationalAttentionBadge />
        );
        expect(html).toContain('data-queue-preview-slot="operational_read"');
        expect(html).toContain("Send a warm first response");
        expect(html).not.toContain("Needs attention:");
    });
});
