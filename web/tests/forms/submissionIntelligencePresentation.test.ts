import { describe, expect, it } from "vitest";
import { deriveSubmissionIntelligence } from "@/lib/forms/submissionIntelligencePresentation";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const row = (overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow => ({
    id: "sub-1",
    status: "submitted",
    created_at: "2026-05-01T10:00:00.000Z",
    submitted_at: "2026-05-02T12:00:00.000Z",
    form_definition_id: "form-1",
    person_id: null,
    customer_id: null,
    payload: { meta: { intake_needs_review: true } },
    ...overrides,
});

describe("submissionIntelligencePresentation OI-2", () => {
    it("flags needs review with medium linkage confidence and ready-after", () => {
        const intel = deriveSubmissionIntelligence(row(), "needsReview");

        expect(intel.readinessLabel).toBe("Needs human review");
        expect(intel.linkageConfidence).toBe("medium");
        expect(intel.readyAfter).toBe("After linkage confirmed");
        expect(intel.missingRequirements).toContain("Operator linkage confirmation");
        expect(intel.accelerationCta.label).toBe("Review now");
        expect(intel.blockerGroups.length).toBeGreaterThan(0);
    });

    it("surfaces missing CRM attach for needs linking lane", () => {
        const intel = deriveSubmissionIntelligence(row({ payload: { meta: {} } }), "needsLinking");

        expect(intel.readinessTone).toBe("blocked");
        expect(intel.linkageConfidence).toBe("low");
        expect(intel.missingRequirements[0]).toContain("CRM attach");
        expect(intel.accelerationCta.kind).toBe("link");
    });

    it("marks recently submitted clear intake as ready", () => {
        const intel = deriveSubmissionIntelligence(
            row({ person_id: "p1", payload: { meta: { intake_needs_review: false } } }),
            "recentlySubmitted"
        );

        expect(intel.readinessTone).toBe("ready");
        expect(intel.linkageConfidence).toBe("high");
        expect(intel.readyAfter).toBeNull();
        expect(intel.readyToFinalize).toBe(true);
        expect(intel.readinessLabel).toBe("Ready to finalize");
        expect(intel.accelerationCta.kind).toBe("finalize");
    });
});
