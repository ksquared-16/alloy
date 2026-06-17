/**
 * POS-FP10 — LEGACY SHIM (superseded by the intake-aligned pipeline).
 *
 * Sprint 3 originally exposed a POS-specific `extractProposalsForClassification`.
 * That POS-specific extraction/proposal model has been replaced by the shared Intake
 * Engine contracts (`source → facts → candidates`). This file remains only as a
 * re-export so any lingering import path resolves; new code should import from
 * `./buildProcessingExtraction` and the shared `@/lib/intake/*` modules.
 */

export { buildProcessingExtraction, EXTRACTOR_VERSION } from "./buildProcessingExtraction";
