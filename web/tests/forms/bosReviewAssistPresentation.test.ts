import { describe, expect, it } from "vitest";
import {
    deriveBosPacketReviewAssist,
    deriveBosSubmissionReviewAssist,
} from "@/lib/forms/review/bosReviewAssistPresentation";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

describe("bosReviewAssistPresentation", () => {
    it("derives needs_attention readiness when warnings and linkage exist", () => {
        const model = deriveBosPacketReviewAssist(fixtureRollup());
        expect(model.readinessKey).toBe("needs_attention");
        expect(model.readinessLabel).toBe("Needs attention");
        expect(model.keyChanges.length).toBeGreaterThan(0);
        expect(model.attentionItems.length).toBeGreaterThan(0);
        expect(model.reviewPaths).toContain("Investigate linkage and intake flags");
        expect(model.reviewPaths).toContain("Review what changed against records");
    });

    it("derives ready_for_review when completed without flags", () => {
        const rollup = fixtureRollup();
        const clean = {
            ...rollup,
            operator_review: { ...rollup.operator_review, warnings: [] },
            linkage_summary: {
                any_intake_needs_review: false,
                steps_missing_crm_fk: 0,
                steps: [],
            },
            steps: rollup.steps.map((s) => ({
                ...s,
                intake_meta: { intake_needs_review: false, intake_review_reason: null, intake_resolution_path: null },
            })),
        };
        const model = deriveBosPacketReviewAssist(clean);
        expect(model.readinessKey).toBe("ready_for_review");
        expect(model.readinessLabel).toBe("Ready for review");
        expect(model.attentionItems).toHaveLength(0);
        expect(model.suggestedFocus).toContain("approve");
    });

    it("derives submission assist from linkage context", () => {
        const model = deriveBosSubmissionReviewAssist({
            status: "submitted",
            formTitle: "Intake Form",
            linkageAttention: true,
            linkageReasons: ["Customer link missing"],
            intakeStatusLabel: "Needs review",
            linkedDocumentsCount: 0,
            recommendedActions: ["Link this submission to the correct CRM record before generating a document."],
        });
        expect(model.readinessKey).toBe("needs_attention");
        expect(model.keyChanges).toContain("Customer link missing");
        expect(model.suggestedFocus).toContain("CRM record");
    });
});
