/**
 * Phase 7 Stage B — governed, contained server-side OCR for scanned / image-based sources.
 *
 * Dependency: `tesseract.js` (WASM, fully self-contained — no external OCR service). The engine core
 * (`tesseract.js-core`) is bundled in node_modules; the English model ships in-repo at `ocr-data/
 * eng.traineddata` and is loaded via a LOCAL `langPath` (no CDN, works offline).
 *
 * Deliberately minimal (per the mandate): printed-text OCR only — NO handwriting recognition, NO
 * complex-table reconstruction. Output is preserved with confidence + provenance and routed through the
 * SAME extraction review-and-correction experience; low-confidence results are flagged and gated.
 *
 * Runtime: OCR is CPU/memory heavy and slow (seconds per page). It runs best-effort and never blocks the
 * upload. Deployment must ship `ocr-data/eng.traineddata` (~4MB) with the server bundle. Production should
 * move OCR to an async worker/queue; this inline path is correct for the governed single-document flow.
 * Failure behavior: any error yields a null result — the document is still stored, and the operator sees
 * an honest "couldn't read" state rather than a silent empty form.
 */

import path from "path";

export const OCR_METHOD = "ocr-tesseract-v5" as const;

/** Below this overall confidence, findings are "low confidence": flagged, and publish is gated. */
export const OCR_LOW_CONFIDENCE_THRESHOLD = 70;

export type OcrWord = {
    text: string;
    confidence: number; // 0–100
    bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrResult = {
    text: string;
    /** Overall confidence 0–100. */
    confidence: number;
    method: typeof OCR_METHOD;
    /** Per-word confidence + bounding boxes (region provenance where available). */
    words: OcrWord[];
    lowConfidence: boolean;
};

const LANG_PATH = path.join(process.cwd(), "ocr-data");

/** Is this upload an image we can OCR directly (no rasterization needed)? */
export function looksLikeImage(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
    const mime = (mimeType ?? "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    const name = (fileName ?? "").toLowerCase();
    return /\.(png|jpe?g|webp|bmp|tiff?|gif)$/.test(name);
}

/** Classify OCR confidence into operator language (mirrors native-extraction confidence tone). */
export function ocrConfidenceTone(confidence: number): "high" | "medium" | "low" {
    if (confidence >= 85) return "high";
    if (confidence >= OCR_LOW_CONFIDENCE_THRESHOLD) return "medium";
    return "low";
}

/**
 * OCR an image's bytes. Returns null on any failure (caller keeps the document + shows an honest state).
 * Dynamic import keeps tesseract.js out of the main server bundle (loaded only when OCR actually runs).
 */
export async function ocrImageBytes(bytes: Uint8Array): Promise<OcrResult | null> {
    try {
        const moduleName = "tesseract.js";
        const { createWorker } = (await import(moduleName)) as typeof import("tesseract.js");
        const worker = await createWorker("eng", 1, { langPath: LANG_PATH, gzip: false, cacheMethod: "none" });
        try {
            const { data } = await worker.recognize(Buffer.from(bytes));
            const confidence = Math.max(0, Math.min(100, Math.round(data.confidence ?? 0)));
            const words: OcrWord[] = (data.words ?? []).map((w) => ({
                text: w.text ?? "",
                confidence: Math.round(w.confidence ?? 0),
                bbox: {
                    x0: w.bbox?.x0 ?? 0,
                    y0: w.bbox?.y0 ?? 0,
                    x1: w.bbox?.x1 ?? 0,
                    y1: w.bbox?.y1 ?? 0,
                },
            }));
            return {
                text: data.text ?? "",
                confidence,
                method: OCR_METHOD,
                words,
                lowConfidence: confidence < OCR_LOW_CONFIDENCE_THRESHOLD,
            };
        } finally {
            await worker.terminate();
        }
    } catch (e) {
        console.warn("[ocrExtract] OCR failed:", e instanceof Error ? e.message : e);
        return null;
    }
}
