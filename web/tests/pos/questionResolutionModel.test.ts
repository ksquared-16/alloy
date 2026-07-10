import { describe, expect, it } from "vitest";
import {
    defaultNameRepresentation,
    defaultSubjectForIntent,
    deriveFieldSources,
    deriveResolutionStatus,
    expandQuestionsForDraftSave,
    inferQuestionIntent,
    seedReviewQuestionFromDraftField,
    storageSummaryLabel,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";

describe("questionResolutionModel", () => {
    it("infers child identity from common enrollment labels", () => {
        expect(inferQuestionIntent("Child's Name")).toBe("child_identity");
        expect(inferQuestionIntent("Date of Birth")).toBe("date_of_birth");
        expect(defaultSubjectForIntent("child_identity")).toBe("child");
        expect(defaultSubjectForIntent("date_of_birth")).toBe("child");
    });

    it("defaults first-name evidence to first+last representation", () => {
        expect(defaultNameRepresentation("child_identity", "Child first name")).toBe("first_last");
        expect(defaultNameRepresentation("child_identity", "Child's Name")).toBe("full_name");
    });

    it("expands first+last child name into two draft fields with canonical bindings", () => {
        const expanded = expandQuestionsForDraftSave([
            {
                id: "q1",
                evidenceLabel: "Child's Name",
                displayLabel: "Child's name",
                type: "text",
                section: "Child",
                questionSubject: "child",
                nameRepresentation: "first_last",
            },
        ]);
        expect(expanded).toHaveLength(2);
        expect(expanded[0].label).toBe("Child first name");
        expect(expanded[0].field_source).toEqual({
            entity_type: "child",
            field_key: "child_first_name",
            shared_value_key: "child_first_name",
        });
        expect(expanded[1].label).toBe("Child last name");
        expect(expanded[1].field_source).toEqual({
            entity_type: "child",
            field_key: "child_last_name",
            shared_value_key: "child_last_name",
        });
    });

    it("skips ignored questions when expanding for save", () => {
        const expanded = expandQuestionsForDraftSave([
            {
                id: "ignored",
                evidenceLabel: "Notes",
                displayLabel: "Internal notes",
                type: "text",
                section: "Other",
                ignored: true,
            },
            {
                id: "active",
                evidenceLabel: "Parent email",
                displayLabel: "Parent email",
                type: "text",
                section: "Parent",
                questionSubject: "parent",
            },
        ]);
        expect(expanded).toHaveLength(1);
        expect(expanded[0].label).toBe("Parent email");
    });

    it("derives human storage summary without exposing raw keys", () => {
        const source = deriveFieldSources({
            subject: "child",
            nameRepresentation: "full_name",
            intent: "child_identity",
            displayLabel: "Child's name",
            type: "text",
        });
        expect(storageSummaryLabel(source)).toMatch(/Child first name|Store on Child/);
        expect(storageSummaryLabel(undefined)).toMatch(/Processing only/i);
    });

    it("marks low-confidence unresolved questions as needs review", () => {
        const status = deriveResolutionStatus({
            id: "q",
            evidenceLabel: "Field 12",
            displayLabel: "Field 12",
            type: "text",
            section: "Form",
            confidence: "low",
            questionSubject: "child",
        });
        expect(status).toBe("needs_review");
    });

    it("seeds review questions from draft fields with inferred subject", () => {
        const seeded = seedReviewQuestionFromDraftField({
            id: "f1",
            label: "Emergency contact",
            type: "text",
            section: "Contacts",
        });
        expect(seeded.evidenceLabel).toBe("Emergency contact");
        expect(seeded.questionSubject).toBe("other_adult");
        expect(inferQuestionIntent(seeded.evidenceLabel)).toBe("emergency_contact");
    });
});
