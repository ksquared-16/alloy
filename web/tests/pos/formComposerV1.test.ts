import { describe, expect, it } from "vitest";
import { detectionModeHelper, detectionModeLabel, resolveDetectionMode } from "@/lib/pos/processingCase/formDraft/detectionModeLabel";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

function draft(partial: Partial<StoredFormDraftPreview>): StoredFormDraftPreview {
    return {
        title: "Test",
        title_from_text: false,
        source_document_id: "doc-1",
        generator_version: "fp12-text-v1",
        generated_at: "2026-07-07T00:00:00.000Z",
        sections: [],
        fields: [],
        warnings: [],
        diagnostics: {
            extracted_text_length: 0,
            extracted_text_preview: "",
            section_count: 0,
            field_count: 0,
        },
        extracted_text_available: false,
        ...partial,
    };
}

describe("Form Composer V1 helpers", () => {
    it("labels acroform detection distinctly from text-assisted detection", () => {
        const acro = draft({ generator_version: "fp11-acroform-v2", fields: [{ id: "f1", label: "Name", type: "text" }] as StoredFormDraftPreview["fields"] });
        expect(resolveDetectionMode(acro)).toBe("acroform");
        // Operator language (no "AcroForm" jargon leaking to the operator).
        expect(detectionModeLabel(acro)).toMatch(/fillable PDF/i);

        const text = draft({ generator_version: "fp12-text-v1", fields: [{ id: "f1", label: "Name", type: "text" }] as StoredFormDraftPreview["fields"] });
        expect(resolveDetectionMode(text)).toBe("text_assisted");
        expect(detectionModeHelper(text)).toMatch(/verify meaning/i);
    });

    it("surfaces manual setup when no questions were detected", () => {
        const empty = draft({ fields: [], generator_version: "fp12-text-v1" });
        expect(resolveDetectionMode(empty)).toBe("manual_required");
        expect(detectionModeLabel(empty)).toMatch(/could not reliably read/i);
    });
});
