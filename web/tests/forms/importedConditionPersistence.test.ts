import { describe, expect, it } from "vitest";

import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    OFFERED_PROCESSING_IMPORT_INTENTS,
    PROCESSING_IMPORT_INTENT_OPTIONS,
    isProcessingImportIntent,
} from "@/lib/pos/processingImportIntent";

/**
 * A condition an operator accepts has to reach the family.
 *
 * The importer could always SEE that "If yes, describe the allergies" follows a yes/no question. What
 * it could not do was carry an accepted relationship through save, promotion and publication — so the
 * published form asked every family to describe allergies they had just said they did not have.
 */
describe("an accepted condition survives the whole way to the published form", () => {
    const draft = {
        title: "Admissions",
        source_document_id: null,
        title_from_text: true,
        extracted_text_available: true,
        warnings: [],
        diagnostics: { extracted_text_length: 0, extracted_text_preview: "", section_count: 1, field_count: 2 },
        generated_at: "2026-10-01T00:00:00.000Z",
        generator_version: "test",
        sections: [{ id: "s1", title: "Health", field_ids: ["gate", "dep"] }],
        fields: [
            { id: "gate", label: "Does the child have allergies?", type: "boolean", required: true, confidence: "high" },
            {
                id: "dep",
                label: "Describe the allergies",
                type: "text",
                required: true,
                confidence: "high",
                visible_when: { field_id: "gate", op: "eq", value: true },
            },
        ],
    } as never;

    it("becomes real visibility on the published field", () => {
        const schema = draftFormToFormSchemaV1(draft);
        const dep = schema.fields.find((f) => f.id === "dep");
        expect(dep?.visibility).toEqual({ all: [{ field_id: "gate", op: "eq", value: true }] });
    });

    it("passes the published schema's own validation, including the field it references", () => {
        // `formSchemaV1Schema` refuses a visibility condition naming a field that does not exist, so a
        // passing parse is also proof the reference survived intact.
        const parsed = validateFormSchema(JSON.parse(JSON.stringify(draftFormToFormSchemaV1(draft))));
        const dep = parsed.fields.find((f) => f.id === "dep");
        expect(dep?.visibility?.all[0]!.field_id).toBe("gate");
    });

    it("leaves a field with no accepted condition always visible", () => {
        const schema = draftFormToFormSchemaV1(draft);
        expect(schema.fields.find((f) => f.id === "gate")?.visibility).toBeUndefined();
    });

    it("survives a draft save, which rebuilds the draft from the posted fields", () => {
        const rebuilt = buildManualFormDraft({
            title: "Admissions",
            sourceDocumentId: null,
            fields: [
                { label: "Does the child have allergies?", type: "boolean", required: true, section: "Health" },
                {
                    label: "Describe the allergies",
                    type: "text",
                    required: true,
                    section: "Health",
                    visible_when: { field_id: "gate", op: "eq", value: true },
                },
            ],
        });
        const dep = rebuilt.fields.find((f) => f.label === "Describe the allergies");
        expect(dep?.visible_when).toEqual({ field_id: "gate", op: "eq", value: true });
    });

    it("does not invent a condition for a field that was saved without one", () => {
        const rebuilt = buildManualFormDraft({
            title: "Admissions",
            sourceDocumentId: null,
            fields: [{ label: "Describe the allergies", type: "text", required: false, section: "Health" }],
        });
        expect(rebuilt.fields[0]!.visible_when).toBeUndefined();
    });
});

/**
 * "Analyze as one packet" asked the operator to understand a second analysis mode in order to do the
 * one thing they came to do. It is no longer a question put to a person; the machinery stays.
 */
describe("the document import chooser", () => {
    it("no longer offers Analyze as one packet", () => {
        const offered = OFFERED_PROCESSING_IMPORT_INTENTS.map((o) => o.label);
        expect(offered).not.toContain("Analyze as one packet");
        expect(offered).toContain("Create a native form");
    });

    it("keeps the packet intent as a valid stored value, so existing cases still read back", () => {
        expect(isProcessingImportIntent("packet_source")).toBe(true);
        expect(PROCESSING_IMPORT_INTENT_OPTIONS.some((o) => o.value === "packet_source")).toBe(true);
    });

    it("offers only form-authoring-relevant outcomes, each with a description", () => {
        expect(OFFERED_PROCESSING_IMPORT_INTENTS.length).toBe(3);
        for (const o of OFFERED_PROCESSING_IMPORT_INTENTS) {
            expect(o.description.trim().length).toBeGreaterThan(0);
            expect(o.available).toBe(true);
        }
    });
});
