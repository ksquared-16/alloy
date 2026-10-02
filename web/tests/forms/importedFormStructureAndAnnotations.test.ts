import { describe, expect, it } from "vitest";

import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { absenceTextFor, suggestedConditionsFor } from "@/lib/pos/formDraft/importedFormAnnotations";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { safeParseFormSchema } from "@/lib/forms/schema";
import type { DraftFormField, StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

describe("an imported document arrives already mapped where it safely can be", () => {
    const draft = buildFormDraftFromStructure({
        sourceDocumentId: "doc-1",
        extractedTextAvailable: true,
        extractedText: "Child Information",
        structure: {
            sections: [
                {
                    title: "Child Information",
                    confidence: "high",
                    fields: [
                        { label: "Child's Date of Birth", suggested_type: "date", required: true, confidence: "high" },
                        { label: "Carpool lane preference", suggested_type: "text", required: false, confidence: "low" },
                    ],
                },
            ],
            warnings: [],
        } as never,
    } as never);

    const byLabel = (label: string): DraftFormField => draft.fields.find((f) => f.label === label)!;

    it("writes the destination the resolver can establish, at import, with nobody asked", () => {
        expect(byLabel("Child's Date of Birth").field_source).toBeTruthy();
    });

    it("writes nothing for a question with no canonical home", () => {
        expect(byLabel("Carpool lane preference").field_source).toBeUndefined();
    });

    it("produces a draft that still converts to a valid published form schema", () => {
        expect(safeParseFormSchema(draftFormToFormSchemaV1(draft)).success).toBe(true);
    });
});

describe("what the schema cannot say, the inspector still shows", () => {
    it("reads an absence answer only from choices the source declared", () => {
        expect(absenceTextFor({ required: false, options: ["Yes", "No known allergies"] })).toBe(
            "Allows “No known allergies”",
        );
        expect(absenceTextFor({ required: false, options: ["Yes", "Nonbinary"] })).toBeNull();
        // A required question has no nothing-to-report answer by definition.
        expect(absenceTextFor({ required: true, options: ["None"] })).toBeNull();
        expect(absenceTextFor({ required: false })).toBeNull();
    });

    it("offers a follow-up relationship the importer noticed, after a yes/no question", () => {
        const fields = [
            { id: "a", label: "Does the child have allergies?", type: "boolean" },
            { id: "b", label: "If yes, please describe", type: "text" },
        ] as DraftFormField[];
        const suggestions = suggestedConditionsFor(fields);
        expect(suggestions.get("b")).toEqual({ triggerFieldId: "a", triggerLabel: "Does the child have allergies?", triggerValue: "Yes" });
    });

    it("offers nothing where the operator has already accepted a condition", () => {
        const fields = [
            { id: "a", label: "Does the child have allergies?", type: "boolean" },
            { id: "b", label: "If yes, please describe", type: "text", visible_when: { field_id: "a", op: "eq", value: true } },
        ] as unknown as DraftFormField[];
        expect(suggestedConditionsFor(fields).has("b")).toBe(false);
    });

    it("does not invent a relationship after a question that is not yes/no", () => {
        const fields = [
            { id: "a", label: "Child name", type: "text" },
            { id: "b", label: "Please describe", type: "text" },
        ] as DraftFormField[];
        expect(suggestedConditionsFor(fields).size).toBe(0);
    });
});

describe("structures the source had stay one concept on the Studio canvas", () => {
    const draft = {
        title: "Packet",
        generated_form_name: "Packet",
        source_document_id: "d",
        sections: [{ id: "s1", title: "Parents", confidence: "high", field_ids: ["p1"] }],
        fields: [{ id: "p1", label: "Parent 1 first name", type: "text", required: false, confidence: "high", suppressed_by_collection: true }],
        collections: [
            {
                id: "c1",
                label: "Parents / Guardians",
                anchor_section_id: "s1",
                collection_provider_ref: "parents_guardians",
                iteration_entity_type: "person",
                nested_fields: [{ id: "n1", label: "First name", type: "text", required: true, source_field_ids: ["p1"] }],
                observed_instance_count: 3,
            },
        ],
        warnings: [],
        diagnostics: {},
        generated_at: "",
        generator_version: "t",
    } as unknown as StoredFormDraftPreview;

    it("emits the repeated people as one collection-bound group, not Parent 1 / 2 / 3", () => {
        const schema = draftFormToFormSchemaV1(draft);
        const group = schema.fields.find((f) => f.type === "group");
        expect(group).toBeTruthy();
        expect(group!.label).toBe("Parents / Guardians");
        // The question the group replaced never ships as a flat question beside it.
        expect(schema.fields.some((f) => f.label === "Parent 1 first name")).toBe(false);
    });
});
