import { describe, expect, it } from "vitest";
import { recommendSectionDisposition } from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import type { StoredFormDraftPreview, DraftFormField, DraftFormSection } from "@/lib/pos/processingCase/formDraft/types";
import { validateFormSchema } from "@/lib/forms/schema";

function draft(sections: DraftFormSection[], fields: DraftFormField[]): StoredFormDraftPreview {
    return {
        source_document_id: "doc-1",
        title: "Firefly Enrollment",
        title_from_text: true,
        extracted_text_available: true,
        sections,
        fields,
        warnings: [],
        diagnostics: { extracted_text_length: 100, extracted_text_preview: "", section_count: sections.length, field_count: fields.length },
        generated_at: "2026-07-24T00:00:00.000Z",
        generator_version: "test",
    };
}

describe("recommendSectionDisposition", () => {
    it("classifies consent/policy prose as acknowledgement and preserves the text", () => {
        const r = recommendSectionDisposition({
            title: "Consent",
            fieldLabels: [],
            sectionText: "I certify the information above is accurate and I consent to enrollment at Firefly.",
        });
        expect(r.disposition).toBe("acknowledgement");
        expect(r.staticText).toContain("I consent to enrollment");
    });

    it("classifies a signature block as signature", () => {
        const r = recommendSectionDisposition({ title: "Parent / guardian signature", fieldLabels: [], sectionText: "Please sign here." });
        expect(r.disposition).toBe("signature");
    });

    it("classifies an upload request as upload", () => {
        const r = recommendSectionDisposition({ title: "Immunizations", fieldLabels: [], sectionText: "Please attach a copy of your child's immunization record." });
        expect(r.disposition).toBe("upload");
    });

    it("classifies instructional prose with no fields as static reference (preserved, not dropped)", () => {
        const r = recommendSectionDisposition({
            title: "Welcome",
            fieldLabels: [],
            sectionText: "Thank you for choosing Firefly. Please complete every section carefully before returning this form.",
        });
        expect(r.disposition).toBe("static_reference");
        expect(r.staticText).toContain("Thank you for choosing Firefly");
    });

    it("classifies labelled prompts as fields", () => {
        const r = recommendSectionDisposition({ title: "Child", fieldLabels: ["Child name", "Date of birth"], sectionText: "Child name:\nDate of birth:" });
        expect(r.disposition).toBe("fields");
    });

    it("recommendations are overridable defaults with a rationale + confidence", () => {
        const r = recommendSectionDisposition({ title: "Notes", fieldLabels: [], sectionText: "General information about the program." });
        expect(r.rationale.length).toBeGreaterThan(0);
        expect(["high", "medium", "low"]).toContain(r.confidence);
    });
});

describe("draftFormToFormSchemaV1 — disposition-aware conversion", () => {
    it("acknowledgement → preserved text_block + required boolean, and validates", () => {
        const d = draft(
            [{ id: "s1", title: "Consent", field_ids: [], disposition: "acknowledgement", static_text: "I consent to enrollment." }],
            []
        );
        const schema = draftFormToFormSchemaV1(d);
        const types = schema.fields.map((f) => f.type);
        expect(types).toContain("text_block");
        expect(types).toContain("boolean");
        const block = schema.fields.find((f) => f.type === "text_block") as { content: string };
        expect(block.content).toBe("I consent to enrollment.");
        const bool = schema.fields.find((f) => f.type === "boolean")!;
        expect(bool.required).toBe(true);
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("static_reference → text_block only (no inputs), and validates", () => {
        const d = draft([{ id: "s1", title: "Welcome", field_ids: [], disposition: "static_reference", static_text: "Please read carefully." }], []);
        const schema = draftFormToFormSchemaV1(d);
        expect(schema.fields).toHaveLength(1);
        expect(schema.fields[0]!.type).toBe("text_block");
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("signature → signature field with acknowledgement + preserved consent text, and validates", () => {
        const d = draft([{ id: "s1", title: "Guardian signature", field_ids: [], disposition: "signature", static_text: "By signing you agree." }], []);
        const schema = draftFormToFormSchemaV1(d);
        const sig = schema.fields.find((f) => f.type === "signature") as { signature?: { require_acknowledgment?: boolean } };
        expect(sig).toBeTruthy();
        expect(sig.signature?.require_acknowledgment).toBe(true);
        expect(schema.fields.some((f) => f.type === "text_block")).toBe(true);
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("upload → file_ref requirement, and validates", () => {
        const d = draft([{ id: "s1", title: "Immunizations", field_ids: [], disposition: "upload", static_text: "Attach a copy." }], []);
        const schema = draftFormToFormSchemaV1(d);
        expect(schema.fields.some((f) => f.type === "file_ref")).toBe(true);
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("default (no disposition) preserves prior field behaviour and validates", () => {
        const d = draft(
            [{ id: "s1", title: "Child", field_ids: ["f1", "f2"] }],
            [
                { id: "f1", label: "Child name", type: "text", required: true, confidence: "high" },
                { id: "f2", label: "Date of birth", type: "date", required: false, confidence: "high" },
            ]
        );
        const schema = draftFormToFormSchemaV1(d);
        expect(schema.fields.map((f) => f.id)).toEqual(["f1", "f2"]);
        expect(schema.fields.find((f) => f.id === "f2")!.type).toBe("date");
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("buildManualFormDraft persists disposition + derives static_text from section labels (no data loss)", () => {
        const draft = buildManualFormDraft({
            title: "Enrollment",
            sourceDocumentId: "doc-1",
            fields: [
                { label: "Child name", type: "text", section: "Child" },
                { label: "I consent to the parent handbook policies", section: "Consent" },
            ],
            sectionDispositions: [{ title: "Consent", disposition: "acknowledgement" }],
        });
        const consent = draft.sections.find((s) => s.title === "Consent")!;
        expect(consent.disposition).toBe("acknowledgement");
        // The consent line (which would otherwise become a junk field) is preserved as static text.
        expect(consent.static_text).toContain("I consent to the parent handbook policies");
        const child = draft.sections.find((s) => s.title === "Child")!;
        expect(child.disposition).toBeUndefined(); // default fields — unchanged

        const schema = draftFormToFormSchemaV1(draft);
        // Consent section: preserved text_block + acknowledgement boolean; child field still a text field.
        expect(schema.fields.some((f) => f.type === "text_block")).toBe(true);
        expect(schema.fields.some((f) => f.type === "boolean")).toBe(true);
        expect(schema.fields.some((f) => f.type === "text" && f.label === "Child name")).toBe(true);
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("a mixed real-shaped enrollment draft (fields + upload + acknowledgement + signature) validates end-to-end", () => {
        const d = draft(
            [
                { id: "s1", title: "Child information", field_ids: ["f1", "f2"], disposition: "fields" },
                { id: "s2", title: "Immunization records", field_ids: [], disposition: "upload", static_text: "Attach a copy of the record." },
                { id: "s3", title: "Handbook acknowledgement", field_ids: [], disposition: "acknowledgement", static_text: "I acknowledge the parent handbook." },
                { id: "s4", title: "Guardian signature", field_ids: [], disposition: "signature", static_text: "By signing, I certify the above." },
            ],
            [
                { id: "f1", label: "Child full name", type: "text", required: true, confidence: "high" },
                { id: "f2", label: "Date of birth", type: "date", required: true, confidence: "high" },
            ]
        );
        const schema = draftFormToFormSchemaV1(d);
        expect(schema.sections).toHaveLength(4);
        expect(schema.fields.some((f) => f.type === "file_ref")).toBe(true);
        expect(schema.fields.some((f) => f.type === "boolean")).toBe(true);
        expect(schema.fields.some((f) => f.type === "signature")).toBe(true);
        expect(schema.fields.filter((f) => f.type === "text_block")).toHaveLength(3); // upload, ack, signature prose preserved
        expect(() => validateFormSchema(schema)).not.toThrow();
    });
});
