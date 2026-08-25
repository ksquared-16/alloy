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
    /** 1-based source page (native-layout detector only). */
    page?: number;
    /**
     * Visual box of the text this field was read from — PDF user space, bottom-left origin
     * [x0, y0, x1, y1]. Native-layout only; projected from coordinates extraction already produced,
     * never inferred. This is what lets the review canvas show WHERE a question came from.
     */
    bbox?: [number, number, number, number];
    /** Choice options recognized from the document (select fields; native-layout only). */
    options?: string[];
    /**
     * Set when this destination is one occurrence of a repeating structure the page's geometry
     * declares — a dose column, a table row, a checkbox option. The field remains a real
     * destination; the group is what the operator decides about. @see ./repeatingFieldGroups
     */
    repeat_group_id?: string;
    /** For signature destinations: the initial required signature, or an update / re-sign line. */
    signature_variant?: import("./signatureFieldName").SignatureVariant;
}

export interface DocumentStructureSection {
    title: string;
    confidence: StructureConfidence;
    fields: DocumentStructureField[];
    /**
     * Geometric disposition recommended by the native-layout detector (signature block, static/legal
     * prose, output copy). When present it is the operator-facing recommendation, overriding the
     * label-text heuristic in `recommendSectionDisposition`. Omitted by the flat-text detector.
     */
    disposition?: import("../formDraft/sectionDisposition").SectionDisposition;
    /** Instructional / consent / signature prose to preserve as a text block (not a field). */
    static_text?: string | null;
    /** 1-based source page. */
    page?: number;
    /** True when this section is an output/duplicate copy of information collected earlier (e.g. "Classroom Copy"). */
    duplicate?: boolean;
}

/** A line the detector considered a possible field but rejected, with a machine reason. */
export interface RejectedLabelExample {
    text: string;
    reason: string;
}

/** Detection quality verdict — gates the Template Setup UX (strong / weak / failed). */
export type StructureQuality = "strong" | "weak" | "failed";

/** Deterministic detection diagnostics — explains WHY a document did/didn't yield fields. */
export interface StructureDiagnostics {
    text_length: number;
    line_count: number;
    /** Total field candidates proposed (across all sections). */
    candidate_labels: number;
    /** Section headers the detector recognized (titles). */
    section_headers: string[];
    /** Sample of label-ish lines that were NOT turned into fields, with reasons (capped). */
    rejected_examples: RejectedLabelExample[];
    /** Department / agency / title lines explicitly rejected as fields (never signatures). */
    rejected_headers: string[];
    /** Known gov/childcare/health labels recognized in the text (e.g. "Child's Name"). */
    detected_known_labels: string[];
    /** Field-candidate confidence breakdown. */
    confidence_summary: { high: number; medium: number; low: number };
    /** Overall verdict: failed (0), weak (few/low-confidence), strong (enough good fields). */
    quality: StructureQuality;
}

/** The deterministic detector's output. Never fabricated — empty when no text. */
export interface DocumentStructureCandidate {
    sections: DocumentStructureSection[];
    warnings: string[];
    /**
     * Repeating structures recognized from field geometry (dose schedules, table rows, checkbox
     * groups). Repeated DESTINATIONS are not repeated FACTS: this is how a document that writes one
     * value five times is reviewed once. @see ./repeatingFieldGroups
     */
    repeating_groups?: import("./repeatingFieldGroups").RepeatingFieldGroup[];
    /**
     * Logical artifacts inside this ONE source document — a hosted submission that is really four
     * agreements, a PDF that carries two. Signatures and acknowledgements are scoped to these, so a
     * signature on one cannot satisfy another. @see ./logicalArtifacts
     */
    logical_artifacts?: import("./logicalArtifacts").LogicalArtifact[];
    /**
     * Whether the source is something to fill in or something to read. A reference document yields
     * sections, prose, acknowledgements and evidence obligations — but no participant fields.
     * @see ./documentFillIntent
     */
    fill_intent?: import("./documentFillIntent").FillIntentVerdict;
    /** Detection diagnostics (always present from the detector; optional for back-compat). */
    diagnostics?: StructureDiagnostics;
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
