/**
 * POS-FP15 — positional PDF text extraction (native text WITH geometry, no OCR).
 *
 * The flat extractor (`pdfTextExtract`) calls unpdf's `extractText({ mergePages: true })`, which
 * returns a single string and discards every coordinate. This extractor instead walks the pdf.js
 * page API that unpdf exposes (`getDocumentProxy` → `page.getTextContent()`) and keeps each text
 * run's x / baseline-y / width / font-height, per page. That geometry is what `detectLayoutStructure`
 * needs to tell a heading from a label, split multi-field rows, and see page boundaries.
 *
 * Same operational contract as the flat extractor: dynamic + guarded import, NEVER throws, honest
 * `{ ok:false, reason }` when unpdf is missing or the PDF can't be read. Native text only — a
 * scanned/image PDF yields no items and falls back to the flat/OCR path upstream.
 */

import { buildLayoutLines } from "./pdfLayoutLines";
import type { LayoutDocument, LayoutTextItem } from "./pdfLayoutTypes";

interface PdfTextRun {
    str?: string;
    transform?: number[]; // [a,b,c,d,e,f] — e=x, f=baseline y
    width?: number;
    height?: number;
}
interface PdfPageProxy {
    getTextContent: () => Promise<{ items: PdfTextRun[] }>;
    getViewport: (o: { scale: number }) => { width: number; height: number };
}
interface PdfDocProxy {
    numPages: number;
    getPage: (n: number) => Promise<PdfPageProxy>;
}

export async function extractPdfPositional(bytes: Uint8Array): Promise<LayoutDocument> {
    const empty = (reason: string): LayoutDocument => ({ pageCount: 0, pages: [], ok: false, reason });
    try {
        if (!bytes || bytes.length === 0) return empty("empty_input");

        const moduleName = "unpdf";
        const mod = (await import(moduleName)) as {
            getDocumentProxy?: (data: Uint8Array) => Promise<PdfDocProxy>;
        };
        if (typeof mod.getDocumentProxy !== "function") return empty("extractor_unavailable");

        const pdf = await mod.getDocumentProxy(bytes);
        const pageCount = typeof pdf.numPages === "number" ? pdf.numPages : 0;
        if (pageCount <= 0) return empty("no_pages");

        const pages = [];
        let totalItems = 0;
        for (let p = 1; p <= pageCount; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: 1 });
            const tc = await page.getTextContent();
            const items: LayoutTextItem[] = [];
            for (const run of tc.items) {
                if (typeof run.str !== "string") continue;
                const tr = run.transform ?? [1, 0, 0, 1, 0, 0];
                const fh = Math.hypot(tr[1] ?? 0, tr[3] ?? 1) || run.height || 0;
                items.push({
                    s: run.str,
                    x: tr[4] ?? 0,
                    y: tr[5] ?? 0,
                    w: run.width ?? 0,
                    h: run.height ?? 0,
                    fh: Math.round(fh * 10) / 10,
                });
            }
            totalItems += items.length;
            pages.push({ page: p, width: vp.width, height: vp.height, lines: buildLayoutLines(items, p) });
        }

        if (totalItems === 0) return empty("no_text_found");
        return { pageCount, pages, ok: true, reason: null };
    } catch (e) {
        return empty(e instanceof Error ? `extract_failed:${e.message}` : "extract_failed");
    }
}
