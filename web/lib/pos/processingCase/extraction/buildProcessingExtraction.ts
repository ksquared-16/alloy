/**
 * POS-FP10 (intake-aligned) — pure orchestrator of the shared intake pipeline for a
 * document Processing Case:
 *
 *   IntakeSourceEnvelope → IntakeFact[] → grouped candidates → IntakeFieldCandidate[]
 *   (+ review_warnings)
 *
 * No POS-specific extraction/proposal model: it composes the shared contracts and the
 * POS mapping profile. Deterministic given the envelope; review-only (no commit).
 */

import type { IntakeSourceEnvelope } from "@/lib/intake/types";
import type { ProcessingClassificationKey } from "../classification/types";
import { extractFactsFromDocument } from "./documentFacts";
import { mapProcessingFactsToCandidates } from "./mapProcessingCandidates";
import type { ProcessingExtractionResult } from "./types";

export const EXTRACTOR_VERSION = "fp10.2-intake";

export function buildProcessingExtraction(input: {
    envelope: IntakeSourceEnvelope;
    classificationKey: ProcessingClassificationKey;
}): ProcessingExtractionResult {
    const extraction = extractFactsFromDocument(input.envelope);
    const mapping = mapProcessingFactsToCandidates({
        extraction,
        classificationKey: input.classificationKey,
    });
    return {
        classification_key: input.classificationKey,
        source: input.envelope,
        facts: extraction.facts,
        candidates: mapping.candidates,
        review_warnings: mapping.review_warnings,
        extractor_version: EXTRACTOR_VERSION,
    };
}
