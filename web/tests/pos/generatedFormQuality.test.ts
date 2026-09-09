import { describe, expect, it } from "vitest";

import {
    sectionKeepsDetectedFields,
    staticTextWithoutFieldLabels,
} from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import {
    defaultNameRepresentation,
    expandQuestionsForDraftSave,
    inferQuestionIntent,
    labelAsksForPersonName,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { proposeGeneratedFormNameFromSources } from "@/lib/pos/documentInstanceNaming";

/**
 * WHAT A GENERATED FORM LOOKED LIKE, AND WHY IT WAS NOT SHIPPABLE.
 *
 * The Northwind Enrollment application is a fillable PDF with twenty AcroForm widgets and exactly
 * ONE emergency contact — `emergency_contact_name`, `emergency_contact_relationship`,
 * `emergency_contact_phone`. Generating a native form from it produced twenty-three questions
 * opening with a text block that recited every label, and containing "Emergency contact first
 * name" / "Emergency contact last name" three times over with nothing to tell them apart.
 *
 * Both faults are fixed at their cause. These tests pin the causes, not the symptoms.
 */

describe("static content is preserved; a label dump is not static content", () => {
    it("keeps instructions, consent and policy prose untouched", () => {
        const prose =
            "I authorize the Center to secure emergency medical treatment for my child.\n" +
            "Please attach a copy of the child's immunization record.";
        expect(staticTextWithoutFieldLabels(prose, ["Child First Name", "Guardian Signature"])).toBe(prose);
    });

    it("drops a line that merely restates a question asked in the same section", () => {
        const text = "Child First Name\nChild Last Name\nPlease print clearly in blue or black ink.";
        expect(staticTextWithoutFieldLabels(text, ["Child First Name", "Child Last Name"])).toBe(
            "Please print clearly in blue or black ink.",
        );
    });

    it("emits nothing when the static text is only a label dump", () => {
        // The exact shape the Enrollment packet produced: page text that IS the printed labels.
        const labels = ["Child First Name", "Child Last Name", "Guardian Full Name", "Guardian Signature"];
        expect(staticTextWithoutFieldLabels(labels.join("\n"), labels)).toBeNull();
    });

    it("compares on words alone — punctuation and case are presentation", () => {
        expect(staticTextWithoutFieldLabels("Child's First Name:", ["Child First Name"])).toBeNull();
    });

    it("names the dispositions that still ask their detected fields", () => {
        // The overlap between "carries static text" and "keeps its fields" is where the duplication
        // lived. One definition now, so the two sites cannot drift apart again.
        expect(sectionKeepsDetectedFields("signature")).toBe(true);
        expect(sectionKeepsDetectedFields("upload")).toBe(true);
        expect(sectionKeepsDetectedFields("generated")).toBe(true);
        expect(sectionKeepsDetectedFields("fields")).toBe(true);
        expect(sectionKeepsDetectedFields(undefined)).toBe(true);
        // These drop their prompts, so preserving the labels as prose genuinely rescues them.
        expect(sectionKeepsDetectedFields("static_reference")).toBe(false);
        expect(sectionKeepsDetectedFields("acknowledgement")).toBe(false);
        expect(sectionKeepsDetectedFields("initials")).toBe(false);
    });
});

describe("who a question is about is not what it asks for", () => {
    it("still recognises the emergency contact as the subject of all three questions", () => {
        // The subject classification was never wrong and must not be narrowed to fix the split —
        // narrowing it would send the contact's phone number to the PARENT record.
        for (const label of ["Emergency Contact Name", "Emergency Contact Relationship", "Emergency Contact Phone"]) {
            expect(inferQuestionIntent(label)).toBe("emergency_contact");
        }
    });

    it("splits only the name", () => {
        expect(labelAsksForPersonName("Emergency Contact Name")).toBe(true);
        expect(labelAsksForPersonName("Emergency Contact Relationship")).toBe(false);
        expect(labelAsksForPersonName("Emergency Contact Phone")).toBe(false);
        expect(defaultNameRepresentation("emergency_contact", "Emergency Contact Name")).toBe("first_last");
        expect(defaultNameRepresentation("emergency_contact", "Emergency Contact Phone")).toBe("full_name");
        expect(defaultNameRepresentation("emergency_contact", "Emergency Contact Relationship")).toBe("full_name");
    });

    it("does not turn one emergency contact into three identical name pairs", () => {
        const rows = expandQuestionsForDraftSave([
            { displayLabel: "Emergency Contact Name", evidenceLabel: "Emergency Contact Name", type: "text", required: true },
            { displayLabel: "Emergency Contact Relationship", evidenceLabel: "Emergency Contact Relationship", type: "text", required: false },
            { displayLabel: "Emergency Contact Phone", evidenceLabel: "Emergency Contact Phone", type: "text", required: false },
        ] as never);

        const labels = rows.map((r) => r.label);
        // The name splits; the other two attributes survive as themselves.
        expect(labels).toContain("Emergency contact first name");
        expect(labels).toContain("Emergency contact last name");
        expect(labels).toContain("Emergency Contact Relationship");
        expect(labels).toContain("Emergency Contact Phone");
        // Nothing is asked twice.
        expect(new Set(labels).size).toBe(labels.length);
        expect(labels.filter((l) => /first name/i.test(l))).toHaveLength(1);
    });

    it("leaves a guardian's phone and email alone, as it always did", () => {
        const rows = expandQuestionsForDraftSave([
            { displayLabel: "Guardian Mobile Phone", evidenceLabel: "Guardian Mobile Phone", type: "text", required: false },
            { displayLabel: "Guardian Email Address", evidenceLabel: "Guardian Email Address", type: "text", required: false },
        ] as never);
        expect(rows.map((r) => r.label)).toEqual(["Guardian Mobile Phone", "Guardian Email Address"]);
    });

    it("still splits a guardian's name onto the guardian's canonical fields", () => {
        // The fix must not stop legitimate splitting.
        const rows = expandQuestionsForDraftSave([
            { displayLabel: "Parent/Guardian Name", evidenceLabel: "Parent/Guardian Name", type: "text", required: true },
        ] as never);
        expect(rows.map((r) => r.label)).toEqual(["Guardian first name", "Guardian last name"]);
        expect(rows[0].field_source).toMatchObject({ field_key: "guardian_first_name" });
    });
});

describe("an emergency contact is a relationship, not a second guardian", () => {
    it("never writes the contact's details onto the guardian's canonical fields", () => {
        /*
         * `deriveFieldSources` bound EVERY emergency-contact question to
         * `guardian.guardian_first_name` — the phone number included. One person's details became
         * another person's business truth. The canonical owner is the relationship model (POS-FP17),
         * which projects an accepted concept into a collection-bound group; asserting a guardian
         * binding here would pre-empt that owner with a wrong answer.
         */
        const rows = expandQuestionsForDraftSave([
            { displayLabel: "Emergency Contact Name", evidenceLabel: "Emergency Contact Name", type: "text", required: true },
            { displayLabel: "Emergency Contact Phone", evidenceLabel: "Emergency Contact Phone", type: "text", required: false },
            { displayLabel: "Emergency Contact Relationship", evidenceLabel: "Emergency Contact Relationship", type: "text", required: false },
        ] as never);
        for (const row of rows) {
            expect(row.field_source?.field_key ?? null).not.toBe("guardian_first_name");
            expect(row.field_source?.field_key ?? null).not.toBe("guardian_last_name");
        }
    });
});

describe("a generated Form is named after the document, not its classification bucket", () => {
    it("prefers a heading the document itself carries", () => {
        expect(
            proposeGeneratedFormNameFromSources({
                draftTitle: "Northwind Enrollment Application",
                draftTitleFromText: true,
                documentDisplayLabel: "Northwind Enrollment Application v2",
            }),
        ).toBe("Northwind Enrollment Application");
    });

    it("falls back to the display name the administrator sees, not the bucket label", () => {
        /*
         * The regression: with no heading in the text, `deriveDocumentTitle` returns
         * CLASSIFICATION_LABELS.enrollment_document — "Enrollment Packet" — so the generated Form
         * took the name of a Packet it is at most one piece of, and every enrollment document in
         * the org would have generated a Form with that same name.
         */
        expect(
            proposeGeneratedFormNameFromSources({
                draftTitle: "Enrollment Packet",
                draftTitleFromText: false,
                documentDisplayLabel: "Northwind Enrollment Application v2",
            }),
        ).toBe("Northwind Enrollment Application v2");
    });

    it("still yields the bucket label when nothing better exists", () => {
        expect(
            proposeGeneratedFormNameFromSources({ draftTitle: "Enrollment Packet", draftTitleFromText: false }),
        ).toBe("Enrollment Packet");
    });

    it("drops the received-date segment the document display name carries", () => {
        expect(
            proposeGeneratedFormNameFromSources({
                draftTitleFromText: false,
                documentDisplayLabel: "Northwind Enrollment Application v2 — Received 09/09/2026",
            }),
        ).toBe("Northwind Enrollment Application v2");
    });
});
