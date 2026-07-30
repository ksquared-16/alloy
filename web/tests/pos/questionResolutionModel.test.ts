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

    it("a bare Name takes its subject from the SECTION it sits under", () => {
        // Real forms print "Parent or Guardian #1" as a heading and then a bare "Name:" line. Reading
        // the label alone made that generic -> processing_only, so every guardian name in the
        // document reported "Form field only" and was stored nowhere.
        expect(inferQuestionIntent("Name", "Parent or Guardian #1")).toBe("guardian_identity");
        expect(inferQuestionIntent("Name:", "Emergency Contacts")).toBe("emergency_contact");
        expect(inferQuestionIntent("First Name", "Parent or Guardian #2")).toBe("guardian_identity");
        expect(inferQuestionIntent("Name", "Child Information")).toBe("child_identity");

        // It now binds to the guardian, and splits into first + last.
        const intent = inferQuestionIntent("Name", "Parent or Guardian #1");
        expect(defaultSubjectForIntent(intent)).toBe("parent");
        expect(defaultNameRepresentation(intent, "Name")).toBe("first_last");

        // A section with no person in its title stays generic — the label still has to earn it.
        expect(inferQuestionIntent("Name", "Contact Information")).toBe("generic");
        // An explicit label still wins regardless of section.
        expect(inferQuestionIntent("Child's Name", "Parent or Guardian #1")).toBe("child_identity");
    });

    it("defaults person names to first+last, honouring an explicit full-name request", () => {
        // Deliberate product change: a bare "Name" line on paper used to become ONE full-name field,
        // which operators then had to split by hand. Names now default to separate first + last.
        expect(defaultNameRepresentation("child_identity", "Child first name")).toBe("first_last");
        expect(defaultNameRepresentation("child_identity", "Child's Name")).toBe("first_last");
        expect(defaultNameRepresentation("guardian_identity", "Name")).toBe("first_last");
        expect(defaultNameRepresentation("emergency_contact", "Name")).toBe("first_last");

        // The document still wins when it explicitly asks for one field.
        expect(defaultNameRepresentation("child_identity", "Child's Full Name")).toBe("full_name");
        expect(defaultNameRepresentation("guardian_identity", "Legal name")).toBe("full_name");

        // Intents that are not a person's name are unaffected.
        expect(defaultNameRepresentation("date_of_birth", "Date of Birth")).toBe("full_name");
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
        // Unbound means "no record destination". The copy says so in operator language; the point of
        // the assertion is that it never leaks a raw key.
        expect(storageSummaryLabel(undefined)).toMatch(/not stored on a record/i);
        // And an unbound question whose concept is still pending says so, rather than implying a
        // decision Alloy has not made.
        expect(storageSummaryLabel(undefined, null, { awaitingConceptDecision: true })).toMatch(/not decided yet/i);
        expect(storageSummaryLabel(undefined, null, { relationshipLabel: "guardian" })).toMatch(/collected as guardian/i);
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
