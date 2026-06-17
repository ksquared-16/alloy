/**
 * POS-FP11b — lightweight, TEXT-ONLY PDF text extraction (no OCR, no image parsing).
 *
 * Dependency: `unpdf` — a serverless-friendly, dependency-light PDF text extractor
 * (bundles pdf.js; no native bindings; works in the Next.js Node runtime). Chosen
 * because it is the smallest acceptable text-only option and needs no system packages.
 * Declared in `serverExternalPackages` so Next loads it from node_modules at runtime.
 *
 * The import is dynamic + guarded: if the package is missing or extraction fails, this
 * returns an honest null result with a reason and NEVER throws — the upload path must
 * never fail because text extraction failed. Scanned/image-only PDFs simply yield no
 * text (reason `no_text_found`); we never fabricate text and never attempt OCR.
 */

export interface PdfTextResult {
    text: string | null;
    pageCount: number | null;
    /** null on success; otherwise a machine reason (e.g. "no_text_found", "extractor_unavailable"). */
    error: string | null;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
    try {
        if (!bytes || bytes.length === 0) return { text: null, pageCount: null, error: "empty_input" };

        // Variable specifier so this typechecks/builds even when the package isn't installed
        // locally; resolved from node_modules at runtime (see serverExternalPackages).
        const moduleName = "unpdf";
        const mod = (await import(moduleName)) as {
            getDocumentProxy?: (data: Uint8Array) => Promise<unknown>;
            extractText?: (pdf: unknown, opts?: { mergePages?: boolean }) => Promise<{ totalPages?: number; text?: string | string[] }>;
        };
        if (typeof mod.getDocumentProxy !== "function" || typeof mod.extractText !== "function") {
            return { text: null, pageCount: null, error: "extractor_unavailable" };
        }

        const pdf = await mod.getDocumentProxy(bytes);
        const out = await mod.extractText(pdf, { mergePages: true });
        const rawText = Array.isArray(out?.text) ? out.text.join("\n") : out?.text;
        const text = typeof rawText === "string" ? rawText.trim() : "";
        const pageCount = typeof out?.totalPages === "number" ? out.totalPages : null;

        if (!text) return { text: null, pageCount, error: "no_text_found" };
        return { text, pageCount, error: null };
    } catch (e) {
        // Missing module, malformed/encrypted PDF, etc. — degrade honestly.
        return { text: null, pageCount: null, error: e instanceof Error ? `extract_failed:${e.message}` : "extract_failed" };
    }
}

/** True when a file looks like a PDF (mime or filename). Cheap gate before attempting extraction. */
export function looksLikePdf(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
    if ((mimeType ?? "").toLowerCase().includes("pdf")) return true;
    return /\.pdf$/i.test(fileName ?? "");
}

export interface DocumentTextUpdate {
    extracted_text: string | null;
    extraction_status: "extracted" | "no_text" | "failed";
    extraction_provider: string;
    extraction_error: string | null;
    extracted_at: string;
    extracted_data: { page_count: number | null };
}

/** Pure: map an extraction result to the `documents` row update (the storage shape). */
export function buildDocumentTextUpdate(result: PdfTextResult, now: Date = new Date()): DocumentTextUpdate {
    const base = {
        extraction_provider: "unpdf",
        extracted_at: now.toISOString(),
        extracted_data: { page_count: result.pageCount },
    };
    if (result.text) {
        return { ...base, extracted_text: result.text, extraction_status: "extracted", extraction_error: null };
    }
    return {
        ...base,
        extracted_text: null,
        extraction_status: result.error === "no_text_found" ? "no_text" : "failed",
        extraction_error: result.error,
    };
}
