/**
 * POS-FP11 — Document structure / form-preview types (review-only foundation).
 *
 * First step toward Document → Form: from document TEXT (when available) we propose
 * a structure outline — sections and field/question candidates — for an operator to
 * review. This is NOT a form schema and creates NO form. It is a preview stored as
 * Processing Case metadata, exactly like classification/extraction.
 *
 * `suggested_type` is a builder-oriented review vocabulary; it maps to the real
 * `FormFieldType` later when a draft is actually generated:
 *   text→text, date→date, number→number, select→select, checkbox→boolean,
 *   signature→signature, file→file_ref, unknown→(operator decides).
 */

export type StructureConfidence = "high" | "medium" | "low" | "invalid";

export type StructureFieldType =
    | "text"
    | "date"
    | "number"
    | "select"
    | "checkbox"
    | "signature"
    | "file"
    | "unknown";

export interface DocumentStructureField {
    label: string;
    suggested_type: StructureFieldType;
    required?: boolean;
    confidence: StructureConfidence;
    evidence?: string;
}

export interface DocumentStructureSection {
    title: string;
    confidence: StructureConfidence;
    fields: DocumentStructureField[];
}

/** The deterministic detector's output. Never fabricated — empty when no text. */
export interface DocumentStructureCandidate {
    sections: DocumentStructureSection[];
    warnings: string[];
}

/** What lands in `processing_cases.metadata.document_form_preview`. Preview only — no form created. */
export interface StoredDocumentFormPreview {
    source_document_id: string | null;
    extracted_text_available: boolean;
    sections: DocumentStructureSection[];
    warnings: string[];
    generated_at: string;
    generator_version: string;
}

/** Result of the (stubbed) text-extraction abstraction. Never throws; honest about availability. */
export interface DocumentTextResult {
    available: boolean;
    text: string | null;
    /** Machine reason when unavailable, e.g. "no_extracted_text" | "no_text_extractor_installed". */
    reason: string | null;
}
