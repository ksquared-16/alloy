/**
 * Phase 7 Stage B — derive a draft's OCR provenance from the source document's metadata.
 *
 * The document row is the single source of truth for OCR (written once at upload). Both the
 * detector path (buildFormDraftForCaseSafe) and the operator-review save path must stamp the
 * SAME provenance onto the stored draft, so the create step preserves source→OCR→published
 * lineage regardless of which path last wrote the preview. This is that single derivation.
 */

import type { StoredFormDraftPreview } from "./types";

export type OcrDocumentMetaSource = {
    extraction_provider?: string | null;
    metadata?: Record<string, unknown> | null;
};

/** Returns the draft `ocr` provenance for an OCR-derived document, or null when not OCR-derived. */
export function ocrProvenanceFromDocument(doc: OcrDocumentMetaSource): NonNullable<StoredFormDraftPreview["ocr"]> | null {
    const md = doc.metadata ?? {};
    if (md.ocr_derived !== true) return null;
    const sourceKind = md.ocr_source_kind;
    return {
        derived: true,
        method: typeof doc.extraction_provider === "string" ? doc.extraction_provider : (md.ocr_method as string) ?? "ocr",
        confidence: typeof md.ocr_confidence === "number" ? md.ocr_confidence : 0,
        low_confidence: md.ocr_low_confidence === true,
        ...(sourceKind === "image" || sourceKind === "scanned_pdf" ? { source_kind: sourceKind } : {}),
    };
}
