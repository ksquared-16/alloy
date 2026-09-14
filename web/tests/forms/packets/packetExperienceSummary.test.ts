import { describe, expect, it } from "vitest";

import {
    describeStep,
    familyExperienceLines,
    packetContentSummary,
    packetIsReady,
    packetReadinessRows,
    summarizeFormQuestions,
} from "@/lib/forms/packets/packetExperienceSummary";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema = (fields: unknown[]): FormSchemaV1 => ({ version: 1, fields } as unknown as FormSchemaV1);

const q = (over: Record<string, unknown> = {}) => ({
    id: `f_${Math.random().toString(36).slice(2)}`,
    type: "text",
    label: "A question",
    required: false,
    ...over,
});

describe("summarizeFormQuestions", () => {
    it("counts what a family is actually asked", () => {
        const s = summarizeFormQuestions(
            schema([
                q({ required: true, field_source: { entity_type: "child", field_key: "first_name" } }),
                q({ field_source: { entity_type: "child", field_key: "last_name" } }),
                q({ required: true }),
                q(),
            ]),
        );

        expect(s).toEqual({ questions: 4, connectedToAlloy: 2, formOnly: 2, required: 2, alloyFills: 0 });
    });

    it("does not count a destination Alloy fills as a question", () => {
        // The family never sees a derived field, so counting it would overstate what is being asked.
        const s = summarizeFormQuestions(
            schema([q(), q({ derived: { kind: "canonical", ref: "child.age" } })]),
        );

        expect(s.questions).toBe(1);
        expect(s.alloyFills).toBe(1);
    });

    it("does not count presentation-only text as a question", () => {
        const s = summarizeFormQuestions(schema([q({ type: "text_block" }), q()]));

        expect(s.questions).toBe(1);
    });

    it("treats a field_source with no field_key as form-only", () => {
        const s = summarizeFormQuestions(schema([q({ field_source: { entity_type: "child", field_key: "" } })]));

        expect(s.connectedToAlloy).toBe(0);
        expect(s.formOnly).toBe(1);
    });

    it("is empty, not broken, for a form with no schema", () => {
        expect(summarizeFormQuestions(null).questions).toBe(0);
    });
});

describe("describeStep — collect information", () => {
    const base = {
        kind: "form" as const,
        sequence: 0,
        title: "Admissions Information",
        published: true,
        hasSourceDocument: false,
    };

    it("summarises the questions and promises reuse only when something is connected", () => {
        const facts = describeStep({
            ...base,
            questions: { questions: 80, connectedToAlloy: 4, formOnly: 76, required: 31, alloyFills: 0 },
        });

        expect(facts.obligation).toBe("Collect information");
        expect(facts.facts[0]).toBe("80 questions");
        expect(facts.facts).toContain("4 connected to Alloy");
        expect(facts.facts).toContain("31 required");
        expect(facts.behavior).toMatch(/confirms information it already knows/);
    });

    it("does NOT promise reuse when nothing is connected to Alloy", () => {
        // Describing pre-fill on a form Alloy cannot pre-fill would describe a runtime that is not running.
        const facts = describeStep({
            ...base,
            questions: { questions: 12, connectedToAlloy: 0, formOnly: 12, required: 3, alloyFills: 0 },
        });

        expect(facts.behavior).toMatch(/asks the family for all of this/);
        expect(facts.facts).not.toContain("0 connected to Alloy");
    });

    it("is not ready when the form has no published version", () => {
        const facts = describeStep({
            ...base,
            published: false,
            questions: { questions: 1, connectedToAlloy: 0, formOnly: 1, required: 0, alloyFills: 0 },
        });

        expect(facts.ready).toBe(false);
        expect(facts.readyDetail).toMatch(/no published version/);
    });
});

describe("describeStep — read & acknowledge", () => {
    it("shows the document, its length, and that a signature is required", () => {
        const facts = describeStep({
            kind: "document_acknowledgment",
            sequence: 1,
            title: "Family Handbook",
            documentTitle: "2026–2027 Family Handbook",
            pageCount: 23,
            requiresSignature: true,
        });

        expect(facts.obligation).toBe("Read & acknowledge");
        expect(facts.facts).toContain("2026–2027 Family Handbook");
        expect(facts.facts).toContain("23 pages");
        expect(facts.facts).toContain("Signature required");
        expect(facts.behavior).toMatch(/shown the actual document/);
        expect(facts.ready).toBe(true);
    });

    it("is not ready when no document was chosen for the family to read", () => {
        const facts = describeStep({
            kind: "document_acknowledgment",
            sequence: 1,
            title: "Family Handbook",
            documentTitle: null,
            pageCount: null,
            requiresSignature: true,
        });

        expect(facts.ready).toBe(false);
    });
});

describe("describeStep — upload a document", () => {
    it("says the family sends in a document and is NOT asked to type its contents", () => {
        const facts = describeStep({
            kind: "document_upload",
            sequence: 2,
            title: "Immunization record",
            documentTypeKey: "immunization_record",
        });

        expect(facts.obligation).toBe("Upload a document");
        expect(facts.behavior).toMatch(/not asked to type its contents/);
        expect(facts.facts.some((f) => /^Filed as /.test(f))).toBe(true);
        expect(facts.ready).toBe(true);
    });

    it("is not ready when the upload has no filing type", () => {
        const facts = describeStep({
            kind: "document_upload",
            sequence: 2,
            title: "Immunization record",
            documentTypeKey: null,
        });

        expect(facts.ready).toBe(false);
        expect(facts.facts).toContain("No filing type chosen");
    });

    it("never shows a raw classification key", () => {
        const facts = describeStep({
            kind: "document_upload",
            sequence: 2,
            title: "Something",
            documentTypeKey: "some_unmapped_key",
        });

        expect(facts.facts.join(" ")).not.toMatch(/some_unmapped_key/);
    });
});

describe("the packet's family experience", () => {
    const steps = [
        describeStep({
            kind: "form",
            sequence: 0,
            title: "Admissions Information",
            published: true,
            hasSourceDocument: false,
            questions: { questions: 80, connectedToAlloy: 4, formOnly: 76, required: 31, alloyFills: 0 },
        }),
        describeStep({
            kind: "document_acknowledgment",
            sequence: 1,
            title: "Family Handbook",
            documentTitle: "2026–2027 Family Handbook",
            pageCount: 23,
            requiresSignature: true,
        }),
        describeStep({
            kind: "document_upload",
            sequence: 2,
            title: "Immunization record",
            documentTypeKey: "immunization_record",
        }),
    ];

    it("reads as three things a family does, in order", () => {
        const lines = familyExperienceLines(steps);

        expect(lines).toHaveLength(3);
        expect(lines[0]).toMatch(/reusing information it already knows/);
        expect(lines[1]).toMatch(/reads and acknowledges/);
        expect(lines[1]).toMatch(/signs it/);
        expect(lines[2]).toMatch(/uploads/);
    });

    it("mentions no forms, adapters or ids anywhere in the family-facing summary", () => {
        const all = familyExperienceLines(steps).join(" ");

        expect(all).not.toMatch(/form_definition|adapter|packet_item|\bForm\b/i);
    });

    it("is ready only when every obligation is ready", () => {
        expect(packetIsReady(steps)).toBe(true);
        expect(packetReadinessRows(steps).every((r) => r.ok)).toBe(true);

        const broken = [...steps.slice(0, 2), describeStep({
            kind: "document_upload",
            sequence: 2,
            title: "Immunization record",
            documentTypeKey: null,
        })];
        expect(packetIsReady(broken)).toBe(false);
    });

    it("an empty packet is not ready", () => {
        expect(packetIsReady([])).toBe(false);
    });
});

describe("what the packet CONTAINS, not what a family does with it", () => {
    /*
     * "3 forms" sent an administrator looking for the other two in Studio → Forms, where they
     * correctly are not, because they are not Forms. One sentence removes the whole question.
     */
    const form = describeStep({
        kind: "form", sequence: 0, title: "Admissions Information", published: true, hasSourceDocument: false,
        questions: { questions: 80, connectedToAlloy: 4, formOnly: 76, required: 65, alloyFills: 0 },
    });
    const ack = describeStep({
        kind: "document_acknowledgment", sequence: 1, title: "Family Handbook",
        documentTitle: "2026–2027 Family Handbook", pageCount: null, requiresSignature: true,
    });
    const upload = describeStep({
        kind: "document_upload", sequence: 2, title: "Immunization record", documentTypeKey: "immunization_record",
    });

    it("names the real package as one Form and two document obligations", () => {
        expect(packetContentSummary([form, ack, upload])).toBe("1 Form and 2 document obligations");
    });

    it("never calls a document obligation a form", () => {
        expect(packetContentSummary([ack, upload])).toBe("2 document obligations");
        expect(packetContentSummary([ack])).toBe("1 document obligation");
    });

    it("counts Forms as Forms", () => {
        expect(packetContentSummary([form])).toBe("1 Form");
        expect(packetContentSummary([form, form])).toBe("2 Forms");
    });

    it("says so when a packet has nothing yet", () => {
        expect(packetContentSummary([])).toBe("no obligations yet");
    });
});
