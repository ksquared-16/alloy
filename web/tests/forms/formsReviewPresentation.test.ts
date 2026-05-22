import { describe, expect, it } from "vitest";
import {
    FORMS_CASE_FILE_SECTION,
    formatFormsProvenanceLine,
    generationLabelOperatorText,
    generationLabelTone,
    isPacketReviewAwaitingDecision,
    operatorReviewStatusLabel,
    operatorReviewStatusTone,
    packetArtifactKindTone,
    packetSessionStatusLabel,
    packetSessionStatusTone,
    submissionStatusLabel,
    submissionStatusTone,
} from "@/lib/forms/review/formsReviewPresentation";
import { formsReviewBadgeClassName, legacyArtifactKindBadgeClass } from "@/lib/forms/review/formsReviewBadgeStyles";
import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

const provenanceFixture: DocumentProvenanceV1 = {
    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    form_name: "Intake Form",
    form_definition_version_id: "45454545-4545-4545-8545-454545454545",
    version_number: 1,
    form_submission_id: "23232323-2323-4232-8232-232323232323",
    submission_submitted_at: "2026-05-01T10:00:00.000Z",
    generated_at: null,
    template_key: null,
    idempotency_key: null,
    generation_label: "current",
};

describe("formsReviewPresentation", () => {
    it("maps operator review statuses for operators", () => {
        expect(operatorReviewStatusLabel(null)).toBe("Needs review");
        expect(operatorReviewStatusLabel("needs_correction")).toBe("Needs correction");
        expect(operatorReviewStatusTone(null)).toBe("warning");
        expect(operatorReviewStatusTone("approved")).toBe("success");
        expect(operatorReviewStatusTone("rejected")).toBe("error");
    });

    it("maps packet session statuses", () => {
        expect(packetSessionStatusLabel("in_progress")).toBe("In progress");
        expect(packetSessionStatusTone("in_progress")).toBe("info");
        expect(packetSessionStatusLabel("completed")).toBe("Completed");
    });

    it("maps submission statuses", () => {
        expect(submissionStatusLabel("submitted")).toBe("Submitted");
        expect(submissionStatusTone("submitted")).toBe("success");
        expect(submissionStatusLabel("draft")).toBe("Draft");
    });

    it("artifact tones prioritize restraint", () => {
        expect(packetArtifactKindTone("generated_pdf")).toBe("success");
        expect(packetArtifactKindTone("submitted_record")).toBe("info");
        expect(packetArtifactKindTone("pending")).toBe("neutral");
    });

    it("isPacketReviewAwaitingDecision matches review gate", () => {
        expect(isPacketReviewAwaitingDecision("completed", null)).toBe(true);
        expect(isPacketReviewAwaitingDecision("completed", "needs_review")).toBe(true);
        expect(isPacketReviewAwaitingDecision("completed", "approved")).toBe(false);
        expect(isPacketReviewAwaitingDecision("in_progress", null)).toBe(false);
    });

    it("formatFormsProvenanceLine delegates without throwing on sparse provenance", () => {
        const line = formatFormsProvenanceLine({
            ...provenanceFixture,
            form_name: "",
            version_number: 0,
            submission_submitted_at: null,
        });
        expect(line).toContain("From Form");
    });

    it("generation label helpers align with document display", () => {
        expect(generationLabelOperatorText("current")).toBe("Current generated PDF");
        expect(generationLabelTone("also_generated")).toBe("neutral");
    });

    it("exposes stable case-file section ids", () => {
        expect(FORMS_CASE_FILE_SECTION.bosSummary).toBe("bos-review-summary");
        expect(FORMS_CASE_FILE_SECTION.technical).toBe("technical-details");
    });
});

describe("formsReviewBadgeStyles", () => {
    it("legacyArtifactKindBadgeClass uses alloy token classes", () => {
        const pdf = legacyArtifactKindBadgeClass("generated_pdf");
        expect(pdf).toContain("alloy-pine");
        const rec = legacyArtifactKindBadgeClass("submitted_record");
        expect(rec).toContain("alloy-blue");
    });

    it("formsReviewBadgeClassName merges optional className", () => {
        const cls = formsReviewBadgeClassName("warning", "ms-1");
        expect(cls).toContain("ms-1");
        expect(cls).toContain("alloy-ember");
    });
});
