/**
 * POS-FP10 — Extraction Proposal types (deterministic, proposal-only).
 *
 * "Given a classified document, what values do we think exist?" — nothing more.
 * These are PROPOSED values only: no record update, no commit, no matching. They are
 * stored as case metadata (mirrors `metadata.classification`) and surfaced read-only.
 *
 * This is NOT a second proposal engine: there is no approval, apply-policy, or risk
 * here (unlike the BOS capability envelope, which is built for applyable config/
 * workflow/operational changes). It is the same lightweight annotation pattern already
 * used for classification.
 */

import type { ProcessingClassificationKey } from "../classification/types";

/** One explainable signal behind a proposed value (same shape as classification signals). */
export interface ExtractionSignal {
    /** Where the value came from, e.g. "metadata.agency_name", "filename". */
    source: string;
    /** The matched/raw token used. */
    value: string;
    /** Contribution toward confidence (0..1). */
    weight: number;
}

/** A single proposed field value. Value is always a string; never fabricated. */
export interface ExtractionFieldProposal {
    field_key: string;
    label: string;
    value: string;
    /** Honest confidence in [0, 0.95] — high for explicit metadata, lower for parsed-from-filename. */
    confidence: number;
    signals: ExtractionSignal[];
}

/** The deterministic extractor output: proposals grouped by the case's classification. */
export interface ExtractionProposalSet {
    classification_key: ProcessingClassificationKey;
    proposals: ExtractionFieldProposal[];
    extractor_version: string;
}

/** What lands in `processing_cases.metadata.extraction` (result + persistence stamp). */
export interface StoredExtractionProposalSet extends ExtractionProposalSet {
    extracted_at: string;
}

/**
 * Signals available to the deterministic extractor. Document TEXT (extractedText /
 * extractedData) is included for honesty/future-proofing — today it's usually empty
 * (no OCR), and when empty the extractor proposes nothing rather than guessing.
 */
export interface ExtractionInput {
    classificationKey: ProcessingClassificationKey;
    fileName?: string | null;
    title?: string | null;
    docType?: string | null;
    metadata?: Record<string, unknown> | null;
    /** Future-proof: structured values already on the document row (e.g. from a prior pass). */
    extractedData?: Record<string, unknown> | null;
    /** Future-proof: raw OCR text if it ever exists. Empty today. */
    extractedText?: string | null;
}
