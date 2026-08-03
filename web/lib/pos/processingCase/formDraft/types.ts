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
    layout_width?: "full" | "half" | "third" | "quarter";
    description?: string;
    confidence: DraftFieldConfidence;
    /** Where this field came from in the source document (provenance, not promoted). */
    evidence?: string;
    /** PDF AcroForm provenance (when the field came from a real widget): page + bbox. */
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
    /** Canonical binding (operator-reviewed or auto-suggested) — persisted to the form. */
    field_source?: import("@/lib/forms/schema").FormFieldSource;
}

export interface DraftFormSection {
    id: string;
    title: string;
    description?: string;
    /** Ordered ids into the flat `fields[]` (mirrors FormSchemaV1 section.field_ids). */
    field_ids: string[];
    /**
     * Operator-classified intent of this section (Phase 7 §3). Defaults to a recommendation from
     * `recommendSectionDisposition`; the operator confirms/overrides before publish. Omitted === "fields".
     */
    disposition?: import("./sectionDisposition").SectionDisposition;
    /**
     * Preserved instructional / consent / signature prose that field-extraction alone would discard.
     * Carried into the published form as a `text_block` so the document's meaning is never lost.
     */
    static_text?: string | null;
}

/** Debug visibility into what Alloy saw — so operators can understand zero-field results. */
export interface FormDraftDiagnostics {
    extracted_text_length: number;
    extracted_text_preview: string;
    section_count: number;
    field_count: number;
}

/** What lands in `processing_cases.metadata.form_draft_preview`. Preview only — no form created. */
export interface StoredFormDraftPreview {
    /** Operator-confirmed native form name — separate from source document display title. */
    generated_form_name?: string | null;
    source_document_id: string | null;
    title: string;
    /** True when the title was derived from real document text (vs filename/classification fallback). */
    title_from_text: boolean;
    extracted_text_available: boolean;
    sections: DraftFormSection[];
    fields: DraftFormField[];
    warnings: string[];
    diagnostics: FormDraftDiagnostics;
    /** PDF page dimensions + text context for the review schematic (AcroForm drafts only). */
    pdf_pages?: import("../structure/pdfAcroForm").PdfPageContext[];
    /**
     * OCR provenance when the draft was built from OCR text (scanned / image source). Preserved into the
     * published form for source→OCR→correction→published lineage, and drives the OCR-derived review state.
     */
    ocr?: {
        derived: true;
        method: string;
        /** Overall confidence 0–100. */
        confidence: number;
        low_confidence: boolean;
        /** Whether OCR read a directly-uploaded image or a rasterized scanned PDF. */
        source_kind?: "image" | "scanned_pdf";
    } | null;
    /**
     * Configuration Discovery (POS-FP16): the concept-level operating-model proposal derived from the
     * native-layout structure — business concepts + governed configuration proposals + summary. The
     * concept-first review renders this; Forms is one consumer of the approved concepts. Present only
     * for native-layout drafts. Operator decisions are layered on separately (never overwrite reruns).
     */
    configuration_discovery?: import("@/lib/pos/discovery/contracts").ConfigurationDiscoveryResult;
    generated_at: string;
    generator_version: string;
}
