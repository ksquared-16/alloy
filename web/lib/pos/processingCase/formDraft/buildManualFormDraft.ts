/**
 * POS-FP14 — build a Document → Form draft from an OPERATOR-REVIEWED field list.
 *
 * When text detection is weak (e.g. the real MO500 blob), the operator sets the form up
 * against the PDF preview: add / edit / remove fields, then create. This pure builder
 * turns that reviewed list into the SAME `StoredFormDraftPreview` shape the detector
 * produces, so the existing create path (`createFormFromCaseDraft`) and the existing
 * persistence (`dbStoreFormDraftPreview`) are reused unchanged — no second form system.
 *
 * Operator-authored fields are "high" confidence by definition (a human chose them).
 */

import type { DraftFormField, DraftFormFieldType, DraftFormSection, StoredFormDraftPreview } from "./types";

export const MANUAL_FORM_DRAFT_VERSION = "manual-1";

const ALLOWED_TYPES: DraftFormFieldType[] = ["text", "number", "date", "boolean", "file_ref", "signature"];

export interface ManualFieldInput {
    label: string;
    type?: string;
    required?: boolean;
    section?: string;
    /** PDF provenance preserved from AcroForm detection or manual mapping (kept through create). */
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
    /** Provenance tag, e.g. "pdf_field" | "manual_pdf_mapping" | "operator". */
    evidence?: string;
    /** Operator-reviewed canonical binding — persisted through to the generated form. */
    field_source?: import("@/lib/forms/schema").FormFieldSource;
}

export interface BuildManualDraftInput {
    title: string;
    sourceDocumentId: string | null;
    fields: ManualFieldInput[];
    extractedTextLength?: number;
    extractedTextAvailable?: boolean;
}

function coerceType(t: string | undefined): DraftFormFieldType {
    const v = (t ?? "").toLowerCase();
    return (ALLOWED_TYPES as string[]).includes(v) ? (v as DraftFormFieldType) : "text";
}

/** Pure: reviewed field list → a valid StoredFormDraftPreview (operator-authored). */
export function buildManualFormDraft(input: BuildManualDraftInput): StoredFormDraftPreview {
    const order: string[] = [];
    const bySection = new Map<string, DraftFormField[]>();
    let counter = 0;

    for (const f of input.fields) {
        const label = (f.label ?? "").trim();
        if (!label) continue;
        counter += 1;
        const sectionTitle = (f.section ?? "").trim() || "Form fields";
        if (!bySection.has(sectionTitle)) {
            bySection.set(sectionTitle, []);
            order.push(sectionTitle);
        }
        const hasRegion = !!f.pdf_field_name || typeof f.page === "number" || Array.isArray(f.bbox);
        const evidence = f.evidence && typeof f.evidence === "string" ? f.evidence : hasRegion ? "pdf_field" : "operator";
        bySection.get(sectionTitle)!.push({
            id: `field_${counter}`,
            label,
            type: coerceType(f.type),
            required: Boolean(f.required),
            confidence: "high",
            evidence,
            ...(f.pdf_field_name ? { pdf_field_name: f.pdf_field_name } : {}),
            ...(typeof f.page === "number" ? { page: f.page } : {}),
            ...(Array.isArray(f.bbox) && f.bbox.length >= 4
                ? { bbox: [f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]] as [number, number, number, number] }
                : {}),
            ...(f.field_source ? { field_source: f.field_source } : {}),
        });
    }

    const sections: DraftFormSection[] = order.map((title, i) => ({
        id: `section_${i + 1}`,
        title,
        field_ids: bySection.get(title)!.map((f) => f.id),
    }));
    const fields: DraftFormField[] = order.flatMap((t) => bySection.get(t)!);

    return {
        source_document_id: input.sourceDocumentId,
        title: input.title.trim() || "Untitled form",
        title_from_text: false,
        extracted_text_available: input.extractedTextAvailable ?? false,
        sections,
        fields,
        warnings: [],
        diagnostics: {
            extracted_text_length: input.extractedTextLength ?? 0,
            extracted_text_preview: "",
            section_count: sections.length,
            field_count: fields.length,
        },
        generator_version: MANUAL_FORM_DRAFT_VERSION,
        generated_at: "",
    };
}
