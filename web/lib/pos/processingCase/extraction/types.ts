/**
 * POS-FP10 (intake-aligned) — Extraction types for POS document Processing Cases.
 *
 * POS does NOT own an extraction/proposal model. It reuses the shared Intake Engine
 * contracts (`web/lib/intake/types`): `IntakeSourceEnvelope`, `IntakeFact[]`, and the
 * shared `IntakeFieldCandidate[]`. The only POS-owned shape is the thin stored
 * envelope that links a (source, facts, candidates) result to a Processing Case.
 *
 * These are PROPOSED values only — no record update, no matching, no commit.
 */

import type { IntakeFact, IntakeFieldCandidate, IntakeSourceEnvelope } from "@/lib/intake/types";
import type { ProcessingClassificationKey } from "../classification/types";

export type { DocumentSignals } from "./documentFacts";

/** Output of the shared pipeline for one document case (pre-persistence). */
export interface ProcessingExtractionResult {
    /** The classification the candidates were mapped for — lets the UI detect stale candidates. */
    classification_key: ProcessingClassificationKey;
    source: IntakeSourceEnvelope;
    facts: IntakeFact[];
    candidates: IntakeFieldCandidate[];
    review_warnings: string[];
    extractor_version: string;
}

/** What lands in `processing_cases.metadata.extraction` (result + persistence stamp). */
export interface StoredProcessingExtraction extends ProcessingExtractionResult {
    extracted_at: string;
}
