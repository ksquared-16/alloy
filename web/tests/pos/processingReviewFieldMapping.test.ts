import { describe, expect, it } from "vitest";
import {
    defaultSubjectForIntent,
    deriveFieldSources,
    inferQuestionIntent,
    seedReviewQuestionFromDraftField,
    supportsNameRepresentation,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import {
    eligibleCanonicalFieldsForSubject,
    suggestReviewDestinationField,
} from "@/lib/pos/processingCase/formDraft/processingReviewFieldCatalog";
import { normalizeFieldValue } from "@/lib/pos/processingCase/formDraft/fieldNormalization";

const REPRESENTATIVE_QUESTIONS = [
    { label: "Parent first name", type: "text", subject: "parent" as const, expectedFieldId: "guardian_first_name" },
    { label: "Parent last name", type: "text", subject: "parent" as const, expectedFieldId: "guardian_last_name" },
    { label: "Parent email", type: "text", subject: "parent" as const, expectedFieldId: "parent_email" },
    { label: "Parent phone", type: "text", subject: "parent" as const, expectedFieldId: "parent_phone" },
    { label: "Child first name", type: "text", subject: "child" as const, expectedFieldId: "child_first_name" },
    { label: "Child last name", type: "text", subject: "child" as const, expectedFieldId: "child_last_name" },
    { label: "Birthdate", type: "date", subject: "child" as const, expectedFieldId: "child_date_of_birth" },
    { label: "Desired start date", type: "date", subject: "enrollment" as const, expectedFieldId: "start_date" },
    { label: "Campus/location interest", type: "text", subject: "enrollment" as const, expectedFieldId: "child_site" },
    { label: "Notes", type: "text", subject: "enrollment" as const, expectedFieldId: null },
];

describe("processingReviewFieldMapping representative fixture", () => {
    it("maps Birthdate to child date of birth without name-format controls", () => {
        expect(inferQuestionIntent("Birthdate")).toBe("date_of_birth");
        expect(supportsNameRepresentation("date_of_birth", "date")).toBe(false);
        expect(defaultSubjectForIntent("date_of_birth")).toBe("child");

        const suggestion = suggestReviewDestinationField({
            evidenceLabel: "Birthdate",
            displayLabel: "Birthdate",
            type: "date",
            subject: "child",
        });
        expect(suggestion?.fieldId).toBe("child_date_of_birth");
        expect(suggestion?.confidencePercent).toBeGreaterThanOrEqual(65);

        const eligible = eligibleCanonicalFieldsForSubject("child");
        expect(eligible.some((field) => field.id === "child_date_of_birth")).toBe(true);
        expect(eligible.some((field) => field.id === "child_first_name")).toBe(true);

        const seeded = seedReviewQuestionFromDraftField({
            id: "birthdate",
            label: "Birthdate",
            type: "date",
            section: "Child",
        });
        expect(seeded.destinationFieldId).toBe("child_date_of_birth");
        expect(seeded.questionSubject).toBe("child");
    });

    it("does not map generic Notes to allergy_notes", () => {
        const suggestion = suggestReviewDestinationField({
            evidenceLabel: "Notes",
            displayLabel: "Notes",
            type: "text",
            subject: "enrollment",
        });
        expect(suggestion).toBeNull();

        const allergySource = deriveFieldSources({
            subject: "enrollment",
            intent: inferQuestionIntent("Allergies"),
            displayLabel: "Allergies",
            type: "text",
        });
        // M1 — an allergy is a fact about the CHILD, not about an admission, so a health question
        // asked in an enrollment context now binds at child grain. The deprecated enrollment row
        // still resolves for forms already stamped with it and shares its ask-once identity.
        expect(allergySource?.entity_type).toBe("child");
        expect(allergySource?.field_key).toBe("allergies");
        expect(allergySource?.shared_value_key).toBe("child_allergies");
    });

    it.each(REPRESENTATIVE_QUESTIONS.filter((q) => q.expectedFieldId !== null))(
        "suggests canonical field for $label",
        ({ label, type, subject, expectedFieldId }) => {
        const eligible = eligibleCanonicalFieldsForSubject(subject);
        expect(eligible.length).toBeGreaterThan(0);

        const suggestion = suggestReviewDestinationField({
            evidenceLabel: label,
            displayLabel: label,
            type,
            subject,
        });

        if (expectedFieldId) {
            expect(suggestion?.fieldId).toBe(expectedFieldId);
            expect(suggestion?.confidencePercent).toBeGreaterThan(0);
        }

        const fieldSource = deriveFieldSources({
            subject,
            intent: inferQuestionIntent(label),
            displayLabel: label,
            type,
            destinationFieldId: suggestion?.fieldId,
        });
        expect(fieldSource).toBeTruthy();
    }
    );

    it("leaves generic Notes unresolved without a field source", () => {
        const notes = REPRESENTATIVE_QUESTIONS.find((q) => q.label === "Notes")!;
        const suggestion = suggestReviewDestinationField({
            evidenceLabel: notes.label,
            displayLabel: notes.label,
            type: notes.type,
            subject: notes.subject,
        });
        expect(suggestion).toBeNull();
        expect(
            deriveFieldSources({
                subject: notes.subject,
                intent: inferQuestionIntent(notes.label),
                displayLabel: notes.label,
                type: notes.type,
            })
        ).toBeUndefined();
    });

    it("normalizes common date inputs toward canonical ISO dates", () => {
        for (const sample of ["7/1/22", "July 1, 2022", "2022-07-01"]) {
            const result = normalizeFieldValue(sample, "date");
            expect(result.status).toBe("valid");
            if (result.status === "valid") expect(result.canonicalValue).toBe("2022-07-01");
        }

        expect(normalizeFieldValue("Julyish 2022", "date").status).toBe("ambiguous");
        expect(normalizeFieldValue("ABC", "date").status).toBe("invalid");
    });
});
