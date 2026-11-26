import { describe, expect, it } from "vitest";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import {
    classifyReviewQuestionMapping,
    expandQuestionsForDraftSave,
    PROCESSING_NEEDS_DESTINATION_DESCRIPTION,
    UNRESOLVED_AT_GENERATE_EVIDENCE,
    type ReviewQuestionInput,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import {
    countReviewMappingDispositions,
    summarizeGenerateIncludedFields,
} from "@/lib/pos/processingCase/formDraft/generateStepPresentation";
import { parseProcessingIntentFromMetadata } from "@/lib/pos/processingImportIntent";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

function question(partial: Partial<ReviewQuestionInput> & Pick<ReviewQuestionInput, "id">): ReviewQuestionInput {
    return {
        evidenceLabel: "Source label",
        displayLabel: "Display label",
        type: "text",
        section: "Section A",
        ...partial,
    };
}

describe("processingFormWorkflowFinish", () => {
    it("parseProcessingIntentFromMetadata reads persisted intent", () => {
        expect(parseProcessingIntentFromMetadata({ processing_intent: "generate_form" })).toBe("generate_form");
        expect(parseProcessingIntentFromMetadata({ import_purpose: "store_document" })).toBe("store_document");
        expect(parseProcessingIntentFromMetadata({})).toBeNull();
    });

    it("classifies mapped, form field only, unresolved, and ignored", () => {
        expect(classifyReviewQuestionMapping(question({ id: "i", ignored: true }))).toBe("ignored");
        expect(
            classifyReviewQuestionMapping(question({ id: "f", questionSubject: "processing_only" }))
        ).toBe("form_field_only");
        expect(
            classifyReviewQuestionMapping(
                question({
                    id: "m",
                    questionSubject: "child",
                    destinationFieldId: "child_first_name",
                })
            )
        ).toBe("mapped");
        expect(
            classifyReviewQuestionMapping(question({ id: "u", questionSubject: "enrollment", displayLabel: "Notes" }))
        ).toBe("unresolved");
    });

    it("generate anyway preserves unresolved provenance as form-only fields", () => {
        const unresolved = question({
            id: "notes",
            displayLabel: "Notes",
            questionSubject: "enrollment",
        });
        const expanded = expandQuestionsForDraftSave([unresolved], { generateAnyway: true });
        expect(expanded).toHaveLength(1);
        expect(expanded[0]?.field_source).toBeUndefined();
        expect(expanded[0]?.evidence).toBe(UNRESOLVED_AT_GENERATE_EVIDENCE);
        expect(expanded[0]?.description).toBe(PROCESSING_NEEDS_DESTINATION_DESCRIPTION);
    });

    it("summarize generate step groups by section with human destinations", () => {
        const rows = summarizeGenerateIncludedFields([
            question({
                id: "a",
                displayLabel: "Child first name",
                questionSubject: "child",
                destinationFieldId: "child_first_name",
            }),
            question({ id: "b", displayLabel: "Notes", questionSubject: "enrollment" }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.fields).toHaveLength(2);
        expect(countReviewMappingDispositions([question({ id: "b", questionSubject: "enrollment" })]).unresolved).toBe(1);
    });

    it("draftFormToFormSchemaV1 prefers generated_form_name and flags unresolved fields", () => {
        const draft: StoredFormDraftPreview = {
            generated_form_name: "Enrollment Application 2026",
            source_document_id: "doc-1",
            title: "Source PDF Title",
            title_from_text: true,
            extracted_text_available: true,
            sections: [{ id: "s1", title: "Main", field_ids: ["f1"] }],
            fields: [
                {
                    id: "f1",
                    label: "Notes",
                    type: "text",
                    required: false,
                    confidence: "medium",
                    evidence: UNRESOLVED_AT_GENERATE_EVIDENCE,
                    description: PROCESSING_NEEDS_DESTINATION_DESCRIPTION,
                },
            ],
            warnings: [],
            diagnostics: {
                extracted_text_length: 100,
                extracted_text_preview: "",
                section_count: 1,
                field_count: 1,
            },
            generated_at: "2026-07-10T00:00:00Z",
            generator_version: "test",
        };
        const schema = draftFormToFormSchemaV1(draft);
        expect(schema.title).toBe("Enrollment Application 2026");
        expect(schema.fields[0]?.field_source).toBeUndefined();
        expect(schema.fields[0]?.description).toBe(PROCESSING_NEEDS_DESTINATION_DESCRIPTION);
    });
});
