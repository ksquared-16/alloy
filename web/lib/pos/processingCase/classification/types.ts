/**
 * POS-FP9 — Classification layer types (non-form Processing Case sources).
 *
 * Classification ONLY. It does not extract fields, propose record changes, or
 * commit anything. The result is stored as metadata on the Processing Case (see
 * `processingCaseClassificationDb.ts`) and surfaced read-only.
 */

/** Canonical classification keys (Sprint 2 vocabulary). `unknown` is a valid, honest outcome. */
export type ProcessingClassificationKey =
    | "subsidy_contract"
    | "remittance"
    | "immunization_record"
    | "enrollment_document"
    | "form_like_document"
    | "unknown";

/**
 * - `classified`  — a key matched with at least one signal.
 * - `unknown`     — no signal matched; key is `unknown`, confidence 0.
 * - `unsupported` — the source kind is not classified by this layer (e.g. form_submission;
 *                   forms have their own intake path). Nothing is asserted.
 */
export type ProcessingClassificationStatus = "classified" | "unknown" | "unsupported";

/** A single explainable signal that contributed to the decision. */
export interface ClassificationSignal {
    /** Which input the signal came from, e.g. "filename", "doc_type", "metadata". */
    source: string;
    /** The matched token/keyword (lowercased), e.g. "remittance". */
    value: string;
    /** Contribution toward confidence (0..1). */
    weight: number;
}

/** Deterministic classifier output. Pure — carries no timestamp (the store layer stamps time). */
export interface ProcessingClassificationResult {
    classification_key: ProcessingClassificationKey;
    label: string;
    /** Honest heuristic confidence in [0, 0.95]. Never 1.0 — this is a deterministic heuristic, not proof. */
    confidence: number;
    signals: ClassificationSignal[];
    status: ProcessingClassificationStatus;
    /** Bumped when the rule set changes, so stored results are traceable. */
    classifier_version: string;
}

/** What actually lands in `processing_cases.metadata.classification` (result + persistence stamp). */
export interface StoredProcessingClassification extends ProcessingClassificationResult {
    classified_at: string;
}

/** Signals available to the deterministic classifier. All optional except sourceKind. */
export interface ClassifyNonFormSourceInput {
    sourceKind: string;
    fileName?: string | null;
    mimeType?: string | null;
    docType?: string | null;
    title?: string | null;
    metadata?: Record<string, unknown> | null;
}
