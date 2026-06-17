/**
 * POS-FP12 — Document → Form Template (Workflow A) draft types.
 *
 * This recreates a document's STRUCTURE as a draft Alloy form (title, sections,
 * fields, types, required, basic layout) for the operator to review and then edit in
 * the existing Forms builder. It is NOT data extraction (Workflow B) and creates NO
 * form, publishes nothing, writes no records.
 *
 * The draft is shaped to mirror `FormSchemaV1` (flat `fields[]` + `sections` that
 * reference field ids) so it converts cleanly into the real schema — see
 * `draftFormToFormSchemaV1.ts`. Only field types that are valid WITHOUT extra config
 * are used (no `select`/`multiselect`, which need options) so the converted schema
 * always validates.
 */

/** Field types we draft. A subset of FormFieldType that needs no extra config to be valid. */
export type DraftFormFieldType = "text" | "number" | "date" | "boolean" | "file_ref" | "signature";

export type DraftFieldConfidence = "high" | "medium" | "low";

export interface DraftFormField {
    id: string;
    label: string;
    type: DraftFormFieldType;
    required: boolean;
    /** Basic layout hint: "half" pairs with the next half into a 2-up row (FormSchemaV1 layout_width). */
    layout_width?: "full" | "half";
    description?: string;
    confidence: DraftFieldConfidence;
    /** Where this field came from in the source document (provenance, not promoted). */
    evidence?: string;
}

export interface DraftFormSection {
    id: string;
    title: string;
    description?: string;
    /** Ordered ids into the flat `fields[]` (mirrors FormSchemaV1 section.field_ids). */
    field_ids: string[];
}

/** What lands in `processing_cases.metadata.form_draft_preview`. Preview only — no form created. */
export interface StoredFormDraftPreview {
    source_document_id: string | null;
    title: string;
    /** True when the title was derived from real document text (vs filename/classification fallback). */
    title_from_text: boolean;
    extracted_text_available: boolean;
    sections: DraftFormSection[];
    fields: DraftFormField[];
    warnings: string[];
    generated_at: string;
    generator_version: string;
}
