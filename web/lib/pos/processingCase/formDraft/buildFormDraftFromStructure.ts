/**
 * POS-FP12 — build a draft form (Workflow A) from a detected document structure.
 *
 * Pure + deterministic. Maps the document structure candidate (sections + labelled
 * fields, from `detectDocumentStructure`) into a FormSchemaV1-shaped draft:
 *   - structure section title → form section
 *   - structure field label + suggested_type → form field (type mapped to a config-free
 *     FormFieldType so the converted schema always validates)
 *
 * Honest: no text / no structure → empty draft + warning, never fabricated fields.
 * Choice-like fields ("select") become text with a warning (options must be added in
 * the builder) — we never invent options.
 */

import type { DocumentStructureCandidate, StructureFieldType } from "../structure/types";
import type { DraftFormField, DraftFormFieldType, DraftFormSection, StoredFormDraftPreview } from "./types";
import { deriveDocumentTitle } from "./deriveDocumentTitle";

export const FORM_DRAFT_GENERATOR_VERSION = "fp12.0";

/** Map structure suggested_type → a draft field type that needs no extra config. */
function mapType(t: StructureFieldType): { type: DraftFormFieldType; warning?: string } {
    switch (t) {
        case "date":
            return { type: "date" };
        case "number":
            return { type: "number" };
        case "checkbox":
            return { type: "boolean" };
        case "signature":
            return { type: "signature" };
        case "file":
            return { type: "file_ref" };
        case "select":
            // No options are known from the document — keep as text and flag for the builder.
            return { type: "text", warning: "choice" };
        case "text":
        case "unknown":
        default:
            return { type: "text" };
    }
}

function slugId(prefix: string, n: number): string {
    return `${prefix}_${n}`;
}

export interface BuildFormDraftInput {
    structure: DocumentStructureCandidate;
    sourceDocumentId: string | null;
    extractedText?: string | null;
    fileName?: string | null;
    classificationKey?: string | null;
    extractedTextAvailable: boolean;
    /**
     * Page dimensions from native-layout extraction. Required to place a field box on a page — the
     * AcroForm path has always supplied this; the layout path never did, so its drafts could not be
     * drawn even once the fields carried a bbox.
     */
    pdfPages?: StoredFormDraftPreview["pdf_pages"];
}

export function buildFormDraftFromStructure(input: BuildFormDraftInput): StoredFormDraftPreview {
    const warnings = [...input.structure.warnings];
    const { title, fromText } = deriveDocumentTitle({
        extractedText: input.extractedText,
        fileName: input.fileName,
        classificationKey: input.classificationKey,
    });

    const fields: DraftFormField[] = [];
    const sections: DraftFormSection[] = [];
    let fieldCounter = 0;
    let choiceFlagged = false;

    input.structure.sections.forEach((sec, si) => {
        const sectionId = slugId("section", si + 1);
        const fieldIds: string[] = [];
        for (const f of sec.fields) {
            fieldCounter += 1;
            const id = slugId("field", fieldCounter);
            const mapped = mapType(f.suggested_type);
            if (mapped.warning === "choice" && !choiceFlagged) {
                warnings.push("Some fields look like choices (select). They were drafted as text — add options in the builder.");
                choiceFlagged = true;
            }
            fields.push({
                id,
                label: f.label,
                type: mapped.type,
                required: Boolean(f.required),
                description: f.evidence ? undefined : undefined,
                confidence: f.confidence === "invalid" ? "low" : f.confidence,
                evidence: f.evidence,
                ...(typeof f.page === "number" ? { page: f.page } : {}),
                // Geometry the native-layout detector recovered. Without it the review canvas has
                // nothing to place, which is why Detailed Questions rendered an empty document.
                ...(Array.isArray(f.bbox) ? { bbox: f.bbox } : {}),
            });
            fieldIds.push(id);
        }
        // Carry the native-layout detector's geometric section classification (signature block,
        // consent/legal prose, output copy) + preserved static text straight onto the draft section,
        // so it drives the operator-facing disposition instead of the label-text heuristic.
        sections.push({
            id: sectionId,
            title: sec.title || `Section ${si + 1}`,
            field_ids: fieldIds,
            ...(sec.disposition ? { disposition: sec.disposition } : {}),
            ...(sec.static_text ? { static_text: sec.static_text } : {}),
        });
    });

    if (fields.length === 0) {
        warnings.push("No fields were drafted — the document had no detectable labelled prompts.");
    }

    const text = (input.extractedText ?? "").trim();
    const preview = text.replace(/\s+\n/g, "\n").slice(0, 600);

    return {
        source_document_id: input.sourceDocumentId,
        title,
        title_from_text: fromText,
        extracted_text_available: input.extractedTextAvailable,
        sections,
        fields,
        warnings: [...new Set(warnings)],
        diagnostics: {
            extracted_text_length: text.length,
            extracted_text_preview: preview,
            section_count: sections.length,
            field_count: fields.length,
        },
        ...(input.pdfPages && input.pdfPages.length > 0 ? { pdf_pages: input.pdfPages } : {}),
        generator_version: FORM_DRAFT_GENERATOR_VERSION,
        generated_at: "", // stamped by the store layer
    };
}
