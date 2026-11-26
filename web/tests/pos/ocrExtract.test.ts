/**
 * Phase 7 Stage B — governed OCR engine (pure logic + bounds).
 *
 * Classification, operator-facing confidence tones, deployment bounds, and the over-cap guard are
 * asserted here. The real rasterize+OCR chain (unpdf + canvas + tesseract.js) cannot run under the
 * test tooling — pdf.js's page rasterization throws "Cannot transfer object of unsupported type"
 * under both vitest's worker environment and esbuild/tsx transpilation. That deployment-critical
 * chain is therefore certified where it actually ships — in the Next server runtime — by the
 * authenticated Playwright cert (playwright/tests/phase7-document-to-form-ocr.spec.ts), which uploads
 * a scanned image AND a scanned (image-only) PDF and asserts OCR provenance end-to-end.
 */
import { describe, it, expect } from "vitest";
import {
    looksLikeImage,
    ocrConfidenceTone,
    ocrPdfBytes,
    OCR_LOW_CONFIDENCE_THRESHOLD,
    OCR_MAX_PDF_PAGES,
    OCR_MAX_INPUT_BYTES,
} from "@/lib/pos/processingCase/structure/ocrExtract";

describe("ocrExtract — classification + bounds", () => {
    it("detects OCR-able images by mime and by extension", () => {
        expect(looksLikeImage("image/png", null)).toBe(true);
        expect(looksLikeImage("image/jpeg", "scan.jpg")).toBe(true);
        expect(looksLikeImage(null, "scan.TIFF")).toBe(true);
        expect(looksLikeImage("application/pdf", "form.pdf")).toBe(false);
        expect(looksLikeImage(null, "notes.txt")).toBe(false);
    });

    it("maps confidence into operator-facing tones at the documented thresholds", () => {
        expect(ocrConfidenceTone(92)).toBe("high");
        expect(ocrConfidenceTone(85)).toBe("high");
        expect(ocrConfidenceTone(OCR_LOW_CONFIDENCE_THRESHOLD)).toBe("medium");
        expect(ocrConfidenceTone(OCR_LOW_CONFIDENCE_THRESHOLD - 1)).toBe("low");
        expect(ocrConfidenceTone(0)).toBe("low");
    });

    it("exposes conservative deployment bounds", () => {
        expect(OCR_MAX_PDF_PAGES).toBeGreaterThan(0);
        expect(OCR_MAX_INPUT_BYTES).toBeGreaterThan(1024 * 1024);
    });

    it("refuses over-cap input without attempting OCR", async () => {
        const tooBig = new Uint8Array(OCR_MAX_INPUT_BYTES + 1);
        expect(await ocrPdfBytes(tooBig)).toBeNull();
    });
});
