import { describe, expect, it } from "vitest";

import {
    MUTATION_BOUNDARY_APPLIES_THROUGH_COMMS,
    MUTATION_BOUNDARY_ENHANCED_DRAFT,
    MUTATION_BOUNDARY_PREVIEW_ONLY,
    MUTATION_BOUNDARY_RECOMMENDATION_ONLY,
    MUTATION_BOUNDARY_REVIEW_REQUIRED,
} from "@/lib/adminV2/bos/bosMutationBoundaryCopy";
import { taskAssistDraftMutationBoundaryCopy } from "@/lib/adminV2/bos/taskAssistOperationalProposalPresentation";
import { configProposalMutationBoundaryCopy } from "@/lib/adminV2/bos/configLayoutAssistOperationalProposalPresentation";

describe("bosMutationBoundaryCopy", () => {
    it("uses consistent review and recommendation language", () => {
        expect(MUTATION_BOUNDARY_REVIEW_REQUIRED).toMatch(/Review required/i);
        expect(MUTATION_BOUNDARY_RECOMMENDATION_ONLY).toMatch(/Recommendation only/i);
        expect(MUTATION_BOUNDARY_PREVIEW_ONLY).toMatch(/Preview only/i);
        expect(MUTATION_BOUNDARY_ENHANCED_DRAFT).toMatch(/preview only/i);
        expect(MUTATION_BOUNDARY_APPLIES_THROUGH_COMMS).toMatch(/Communications/i);
    });

    it("task assist draft boundaries align with central copy", () => {
        expect(taskAssistDraftMutationBoundaryCopy({ intent_type: "draft_message" } as never)).toMatch(
            /Nothing sends/
        );
    });

    it("config recommendation-only boundary matches central copy", () => {
        expect(
            configProposalMutationBoundaryCopy({
                isRecommendationOnly: true,
                needsConfirmation: false,
                stateLabel: "Approved",
                statusHint: "",
            })
        ).toBe(MUTATION_BOUNDARY_RECOMMENDATION_ONLY);
    });
});
