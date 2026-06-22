/**
 * POS-FP16 — map detected AcroForm field rectangles into a drawable, page-grouped
 * schematic for the Template Setup "field map".
 *
 * We can't reliably overlay <div>s on the browser's NATIVE PDF viewer (it's an opaque
 * embed — no access to its scroll/zoom/coordinate system). But the AcroForm fields carry
 * `page` + `bbox` in PDF points, so we can draw a faithful SCHEMATIC of where each field
 * sits relative to the others, as an SVG we fully control. PDF space is bottom-left
 * origin; SVG is top-left, so the Y axis is flipped here. Pure + deterministic.
 *
 * This is a review aid, not the official PDF raster — it preserves the relative layout so
 * the operator can see what was detected (and the gaps = what was missed) and click a
 * region to select its field row.
 */

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

export interface PageMap {
    page: number;
    /** SVG viewBox width/height (PDF-point units of the padded field extent). */
    width: number;
    height: number;
    rects: MappedRect[];
}

const PAD_RATIO = 0.04;

/** Group fields with a page+bbox and project them into per-page, top-left-origin rects. */
export function computePageMaps(fields: FieldWithRegion[]): PageMap[] {
    const byPage = new Map<number, FieldWithRegion[]>();
    for (const f of fields) {
        if (typeof f.page !== "number" || !Array.isArray(f.bbox) || f.bbox.length < 4) continue;
        if (f.bbox.some((n) => typeof n !== "number" || Number.isNaN(n))) continue;
        if (!byPage.has(f.page)) byPage.set(f.page, []);
        byPage.get(f.page)!.push(f);
    }

    const pages: PageMap[] = [];
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
        const fs = byPage.get(page)!;
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
        const originX = minX - padX;
        const topInPdf = maxY + padY; // top edge of the viewBox, in PDF coords
        const width = extentW + padX * 2;
        const height = extentH + padY * 2;

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
                y: round(topInPdf - top), // flip Y
                w: round(right - left),
                h: round(top - bottom),
            };
        });

        pages.push({ page, width: round(width), height: round(height), rects });
    }
    return pages;
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

/** True when any field carries a drawable PDF region. */
export function hasFieldRegions(fields: FieldWithRegion[]): boolean {
    return fields.some((f) => typeof f.page === "number" && Array.isArray(f.bbox) && f.bbox.length >= 4);
}
