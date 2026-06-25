/**
 * POS-FP11b — PDF text extraction wiring.
 *
 * Proves: the extractor degrades honestly and NEVER throws (so upload can't be blocked);
 * the documents-row update payload is correct per outcome; PDF detection works; and the
 * Document → Form preview uses extracted text when it's available.
 *
 * Note: `unpdf` is not installed in CI here, so `extractPdfText` exercises the graceful
 * fallback path (text:null + reason). The success path is verified manually after
 * `npm install` against a real text PDF.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    extractPdfText,
    buildDocumentTextUpdate,
    looksLikePdf,
    type PdfTextResult,
} from "@/lib/pos/processingCase/structure/pdfTextExtract";
import { maybeBuildDocumentFormPreviewSafe } from "@/lib/pos/processingCase/structure/maybeBuildDocumentFormPreviewSafe";

describe("looksLikePdf", () => {
    it("detects by mime or filename", () => {
        expect(looksLikePdf("application/pdf", null)).toBe(true);
        expect(looksLikePdf(null, "Contract.PDF")).toBe(true);
        expect(looksLikePdf("image/png", "scan.png")).toBe(false);
        expect(looksLikePdf(null, null)).toBe(false);
    });
});

describe("extractPdfText — never throws, honest on failure", () => {
    it("empty input → empty_input, no throw", async () => {
        const r = await extractPdfText(new Uint8Array(0));
        expect(r.text).toBeNull();
        expect(r.error).toBe("empty_input");
    });

    it("non-PDF bytes (or missing extractor) → null text + a reason, never throws", async () => {
        const r = await extractPdfText(new Uint8Array([1, 2, 3, 4, 5]));
        expect(r.text).toBeNull();
        expect(r.error).not.toBeNull();
    });
});

describe("buildDocumentTextUpdate — storage shape", () => {
    const now = new Date("2026-06-17T10:00:00.000Z");
    it("extracted text → status 'extracted' with provider + page count", () => {
        const r: PdfTextResult = { text: "Hello world", pageCount: 3, error: null };
        expect(buildDocumentTextUpdate(r, now)).toEqual({
            extracted_text: "Hello world",
            extraction_status: "extracted",
            extraction_provider: "unpdf",
            extraction_error: null,
            extracted_at: "2026-06-17T10:00:00.000Z",
            extracted_data: { page_count: 3 },
        });
    });

    it("no text found (e.g. scanned PDF) → status 'no_text', null text (never fabricated)", () => {
        const r: PdfTextResult = { text: null, pageCount: 2, error: "no_text_found" };
        const u = buildDocumentTextUpdate(r, now);
        expect(u.extracted_text).toBeNull();
        expect(u.extraction_status).toBe("no_text");
        expect(u.extracted_data).toEqual({ page_count: 2 });
    });

    it("extraction failure → status 'failed' with the error reason", () => {
        const r: PdfTextResult = { text: null, pageCount: null, error: "extract_failed:bad pdf" };
        const u = buildDocumentTextUpdate(r, now);
        expect(u.extraction_status).toBe("failed");
        expect(u.extraction_error).toBe("extract_failed:bad pdf");
    });
});

describe("Document → Form preview uses extracted text when available", () => {
    it("when documents.extracted_text has labelled lines → preview has sections (text available)", async () => {
        const captured: Record<string, unknown>[] = [];
        const supabase = {
            from(table: string) {
                if (table === "documents") {
                    return {
                        select() {
                            return { eq() { return { eq() { return {
                                maybeSingle: async () => ({
                                    data: { extracted_text: "FAMILY INFORMATION\nParent Name: ______\nEmail: ______", mime_type: "application/pdf" },
                                    error: null,
                                }),
                            }; } }; } };
                        },
                    };
                }
                if (table === "processing_cases") {
                    return {
                        select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }; } }; } }; },
                        update(payload: Record<string, unknown>) { captured.push(payload); return { eq() { return { eq: async () => ({ error: null }) }; } }; },
                    };
                }
                throw new Error(`unexpected ${table}`);
            },
        } as unknown as SupabaseClient;

        const stored = await maybeBuildDocumentFormPreviewSafe(supabase, { orgId: "o1", caseId: "c1", documentId: "doc-1" });
        expect(stored?.extracted_text_available).toBe(true);
        expect((stored?.sections.length ?? 0)).toBeGreaterThan(0);
        const fields = stored?.sections.flatMap((s) => s.fields) ?? [];
        expect(fields.map((f) => f.label.toLowerCase())).toContain("parent name");
        // metadata-only write; no form row created
        expect(captured).toHaveLength(1);
        expect(Object.keys(captured[0])).toEqual(["metadata"]);
    });
});
