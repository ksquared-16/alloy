/**
 * POS-FP16/FP17 — map detected AcroForm field rectangles (and optional page text context)
 * into a drawable, page-grouped schematic for the Template Setup "field map".
 *
 * We can't reliably overlay <div>s on the browser's NATIVE PDF viewer (it's an opaque
 * embed). So we draw our own SVG: the AcroForm fields carry `page` + `bbox` in PDF points
 * (bottom-left origin), and — when available — the page DIMENSIONS + a sample of TEXT
 * ITEMS give the form's context (labels/headers) behind the highlight boxes. PDF space is
 * bottom-left origin; SVG is top-left, so the Y axis is flipped here. Pure + deterministic.
 *
 * The schematic also exposes its transform (`originX`, `topInPdf`) so a rectangle drawn on
 * it can be inverted back to a real PDF bbox — that's how manual mapping works.
 */

import type { PdfPageContext } from "./pdfAcroForm";

export interface FieldWithRegion {
    id: string;
    label: string;
    type: string;
    confidence?: string;
    page?: number;
    bbox?: [number, number, number, number];
}

export interface MappedRect {
    id: string;
    label: string;
    type: string;
    confidence?: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface MappedText {
    x: number;
    y: number;
    str: string;
}

export interface PageMap {
    page: number;
    /** SVG viewBox width/height. */
    width: number;
    height: number;
    /** True when drawn in the REAL page coordinate space (page dims known). */
    hasPageDims: boolean;
    /** Transform back to PDF points: pdfX = svgX + originX; pdfY = topInPdf - svgY. */
    originX: number;
    topInPdf: number;
    rects: MappedRect[];
    /** Page text context (labels/headers), already projected into SVG space. */
    texts: MappedText[];
}

const PAD_RATIO = 0.04;
const MAX_TEXTS_PER_PAGE = 160;

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Group fields with a page+bbox and project them (and optional page context) into SVG space. */
export function computePageMaps(fields: FieldWithRegion[], contexts?: PdfPageContext[] | null): PageMap[] {
    const byPage = new Map<number, FieldWithRegion[]>();
    for (const f of fields) {
        if (typeof f.page !== "number" || !Array.isArray(f.bbox) || f.bbox.length < 4) continue;
        if (f.bbox.some((n) => typeof n !== "number" || Number.isNaN(n))) continue;
        if (!byPage.has(f.page)) byPage.set(f.page, []);
        byPage.get(f.page)!.push(f);
    }
    const ctxByPage = new Map<number, PdfPageContext>();
    for (const c of contexts ?? []) if (c && typeof c.page === "number") ctxByPage.set(c.page, c);

    const pages: PageMap[] = [];
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
        const fs = byPage.get(page)!;
        const ctx = ctxByPage.get(page);

        let originX: number;
        let topInPdf: number;
        let width: number;
        let height: number;
        let hasPageDims = false;

        if (ctx && ctx.width > 0 && ctx.height > 0) {
            // Real page space — boxes + text sit where they do on the page.
            originX = 0;
            topInPdf = ctx.height;
            width = ctx.width;
            height = ctx.height;
            hasPageDims = true;
        } else {
            // Fallback: the padded extent of the detected field boxes.
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const f of fs) {
                const [x0, y0, x1, y1] = f.bbox!;
                minX = Math.min(minX, x0, x1);
                maxX = Math.max(maxX, x0, x1);
                minY = Math.min(minY, y0, y1);
                maxY = Math.max(maxY, y0, y1);
            }
            const extentW = Math.max(1, maxX - minX);
            const extentH = Math.max(1, maxY - minY);
            const padX = extentW * PAD_RATIO;
            const padY = extentH * PAD_RATIO;
            originX = minX - padX;
            topInPdf = maxY + padY;
            width = extentW + padX * 2;
            height = extentH + padY * 2;
        }

        const rects: MappedRect[] = fs.map((f) => {
            const [x0, y0, x1, y1] = f.bbox!;
            const left = Math.min(x0, x1);
            const right = Math.max(x0, x1);
            const bottom = Math.min(y0, y1);
            const top = Math.max(y0, y1);
            return {
                id: f.id,
                label: f.label,
                type: f.type,
                confidence: f.confidence,
                x: round(left - originX),
                y: round(topInPdf - top),
                w: round(right - left),
                h: round(top - bottom),
            };
        });

        const texts: MappedText[] = (ctx?.texts ?? [])
            .filter((t) => t && typeof t.x === "number" && typeof t.y === "number" && t.str && t.str.trim())
            .slice(0, MAX_TEXTS_PER_PAGE)
            .map((t) => ({ x: round(t.x - originX), y: round(topInPdf - t.y), str: t.str }));

        pages.push({ page, width: round(width), height: round(height), hasPageDims, originX: round(originX), topInPdf: round(topInPdf), rects, texts });
    }
    return pages;
}

/** True when any field carries a drawable PDF region. */
export function hasFieldRegions(fields: FieldWithRegion[]): boolean {
    return fields.some((f) => typeof f.page === "number" && Array.isArray(f.bbox) && f.bbox.length >= 4);
}

/** Invert a rectangle drawn on a page schematic back into a real PDF bbox [x0,y0,x1,y1]. */
export function svgRectToPdfBbox(
    rect: { x: number; y: number; w: number; h: number },
    page: Pick<PageMap, "originX" | "topInPdf">
): [number, number, number, number] {
    const x0 = round(rect.x + page.originX);
    const x1 = round(rect.x + rect.w + page.originX);
    const pdfTop = round(page.topInPdf - rect.y);
    const pdfBottom = round(page.topInPdf - (rect.y + rect.h));
    return [Math.min(x0, x1), Math.min(pdfTop, pdfBottom), Math.max(x0, x1), Math.max(pdfTop, pdfBottom)];
}

/** Project a PDF bbox into SVG viewBox coordinates for overlay rendering. */
export function pdfBboxToSvgRect(
    bbox: [number, number, number, number],
    page: Pick<PageMap, "originX" | "topInPdf">
): { x: number; y: number; w: number; h: number } {
    const [x0, y0, x1, y1] = bbox;
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const bottom = Math.min(y0, y1);
    const top = Math.max(y0, y1);
    return {
        x: round(left - page.originX),
        y: round(page.topInPdf - top),
        w: round(right - left),
        h: round(top - bottom),
    };
}
