/**
 * Phase 7 Stage B — governed, contained server-side OCR for scanned / image-based sources.
 *
 * Dependencies (all WASM, fully self-contained — no external OCR service, no CDN, works offline):
 *  - `tesseract.js` for OCR (core `tesseract.js-core` in node_modules; English model in-repo at
 *    `ocr-data/eng.traineddata`, loaded via a LOCAL `langPath`).
 *  - `mupdf` to rasterize scanned PDFs to page images (chosen over pdf.js, which throws under Next's
 *    server runtime once bundled — see scannedPageImagesFromPdf).
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
    /** How the OCR input was obtained: a directly-uploaded image, or a rasterized scanned PDF. */
    sourceKind: "image" | "scanned_pdf";
    /** Pages OCR'd (1 for a single image; N for a scanned PDF). */
    pageCount: number;
    /** True when the document had more pages than the OCR page cap and the tail was skipped. */
    truncated: boolean;
};

const LANG_PATH = path.join(process.cwd(), "ocr-data");

/**
 * Deployment bounds (production deployment verification). OCR is CPU/memory heavy, so a scanned
 * document is capped: pages beyond the cap are skipped (and flagged as `truncated`), and inputs
 * over the byte cap are refused before any work. These are deliberately conservative for the
 * inline/serverless path; a dedicated async worker could raise them.
 */
export const OCR_MAX_PDF_PAGES = 8;
export const OCR_MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25MB

/** Minimal shape of a tesseract.js worker — kept local so this module never hard-depends on the type. */
type TesseractWorker = {
    recognize: (image: Buffer) => Promise<{ data: { text?: string; confidence?: number; words?: Array<{ text?: string; confidence?: number; bbox?: { x0?: number; y0?: number; x1?: number; y1?: number } }> } }>;
    terminate: () => Promise<unknown>;
};

/**
 * Create a single OCR worker. Callers MUST terminate it (worker lifecycle/cleanup) — the multi-page
 * PDF path reuses ONE worker across all pages rather than spawning one per page. Dynamic import keeps
 * tesseract.js out of the main server bundle (loaded only when OCR actually runs).
 */
async function createOcrWorker(): Promise<TesseractWorker> {
    const moduleName = "tesseract.js";
    const { createWorker } = (await import(moduleName)) as typeof import("tesseract.js");
    return (await createWorker("eng", 1, { langPath: LANG_PATH, gzip: false, cacheMethod: "none" })) as unknown as TesseractWorker;
}

/** Recognize one image buffer on an existing worker. Pure over the worker; caller owns lifecycle. */
async function recognizeOne(worker: TesseractWorker, image: Buffer): Promise<{ text: string; confidence: number; words: OcrWord[] }> {
    const { data } = await worker.recognize(image);
    const confidence = Math.max(0, Math.min(100, Math.round(data.confidence ?? 0)));
    const words: OcrWord[] = (data.words ?? []).map((w) => ({
        text: w.text ?? "",
        confidence: Math.round(w.confidence ?? 0),
        bbox: { x0: w.bbox?.x0 ?? 0, y0: w.bbox?.y0 ?? 0, x1: w.bbox?.x1 ?? 0, y1: w.bbox?.y1 ?? 0 },
    }));
    return { text: data.text ?? "", confidence, words };
}

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
    if (bytes.byteLength > OCR_MAX_INPUT_BYTES) {
        console.warn(`[ocrExtract] image exceeds ${OCR_MAX_INPUT_BYTES} bytes — skipping OCR`);
        return null;
    }
    let worker: TesseractWorker | null = null;
    try {
        worker = await createOcrWorker();
        const { text, confidence, words } = await recognizeOne(worker, Buffer.from(bytes));
        return {
            text,
            confidence,
            method: OCR_METHOD,
            words,
            lowConfidence: confidence < OCR_LOW_CONFIDENCE_THRESHOLD,
            sourceKind: "image",
            pageCount: 1,
            truncated: false,
        };
    } catch (e) {
        console.warn("[ocrExtract] image OCR failed:", e instanceof Error ? e.message : e);
        return null;
    } finally {
        if (worker) await worker.terminate().catch(() => {});
    }
}

/** Render scale → ~144 DPI (PDF user space is 72 DPI). Enough for printed-text OCR, bounded memory. */
const OCR_PDF_RENDER_SCALE = 2;

/**
 * Rasterize a scanned PDF's pages to PNG buffers using **mupdf** (self-contained WASM). Bounded by
 * `maxPages`. Returns [] on failure.
 *
 * Why mupdf and NOT pdf.js (`unpdf.renderPageAsImage` / `extractImages`): every pdf.js image path
 * throws "Cannot transfer object of unsupported type" under Next's server runtime — its worker/transfer
 * path breaks once bundled, working only in raw node/tsx, so it cannot ship. mupdf is single-threaded
 * WASM with no worker, no native addon, and no canvas dependency — it runs identically in local dev and
 * serverless, and emits PNG directly (`pixmap.asPNG()`). Dynamic import keeps the WASM off every
 * non-scanned upload.
 */
async function scannedPageImagesFromPdf(bytes: Uint8Array, maxPages: number): Promise<{ pages: Buffer[]; totalPages: number }> {
    const mupdfName = "mupdf";
    const mupdfMod = (await import(mupdfName)) as unknown as { default?: typeof import("mupdf") } & typeof import("mupdf");
    const mupdf = (mupdfMod.default ?? mupdfMod) as typeof import("mupdf");
    if (!mupdf?.Document || !mupdf?.Matrix || !mupdf?.ColorSpace) {
        return { pages: [], totalPages: 0 };
    }
    let doc: import("mupdf").Document | null = null;
    try {
        doc = mupdf.Document.openDocument(bytes, "application/pdf");
        const totalPages = doc.countPages();
        const limit = Math.min(totalPages, maxPages);
        const matrix = mupdf.Matrix.scale(OCR_PDF_RENDER_SCALE, OCR_PDF_RENDER_SCALE);
        const pages: Buffer[] = [];
        for (let i = 0; i < limit; i++) {
            const page = doc.loadPage(i);
            try {
                // alpha=false so the background is white (better OCR contrast than transparent).
                const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
                try {
                    pages.push(Buffer.from(pixmap.asPNG()));
                } finally {
                    pixmap.destroy();
                }
            } catch (e) {
                console.warn(`[ocrExtract] rasterize page ${i + 1} failed:`, e instanceof Error ? e.message : e);
            } finally {
                page.destroy();
            }
        }
        return { pages, totalPages };
    } catch (e) {
        console.warn("[ocrExtract] mupdf open/rasterize failed:", e instanceof Error ? e.message : e);
        return { pages: [], totalPages: 0 };
    } finally {
        try {
            doc?.destroy();
        } catch {
            /* best-effort cleanup */
        }
    }
}

/**
 * OCR a scanned (no-native-text) PDF: rasterize each page then OCR it, reusing ONE worker across all
 * pages. Text is joined with page markers; per-page words carry region provenance. Overall confidence
 * is the page-average. Returns null on any failure (caller keeps the document + shows an honest state).
 */
export async function ocrPdfBytes(bytes: Uint8Array): Promise<OcrResult | null> {
    if (bytes.byteLength > OCR_MAX_INPUT_BYTES) {
        console.warn(`[ocrExtract] scanned PDF exceeds ${OCR_MAX_INPUT_BYTES} bytes — skipping OCR`);
        return null;
    }
    let worker: TesseractWorker | null = null;
    try {
        const { pages, totalPages } = await scannedPageImagesFromPdf(bytes, OCR_MAX_PDF_PAGES);
        if (pages.length === 0) return null;

        worker = await createOcrWorker();
        const perPage: Array<{ text: string; confidence: number; words: OcrWord[] }> = [];
        for (const png of pages) {
            perPage.push(await recognizeOne(worker, png));
        }

        const text = perPage
            .map((pg, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\n${pg.text}` : pg.text))
            .join("\n\n")
            .trim();
        const confidence = perPage.length
            ? Math.round(perPage.reduce((sum, pg) => sum + pg.confidence, 0) / perPage.length)
            : 0;
        const words = perPage.flatMap((pg) => pg.words);
        return {
            text,
            confidence,
            method: OCR_METHOD,
            words,
            lowConfidence: confidence < OCR_LOW_CONFIDENCE_THRESHOLD,
            sourceKind: "scanned_pdf",
            pageCount: perPage.length,
            truncated: totalPages > perPage.length,
        };
    } catch (e) {
        console.warn("[ocrExtract] scanned-PDF OCR failed:", e instanceof Error ? e.message : e);
        return null;
    } finally {
        if (worker) await worker.terminate().catch(() => {});
    }
}
