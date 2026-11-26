/**
 * Recover per-field GEOMETRY from native-layout extraction.
 *
 * The layout extractor already computes exact coordinates for every text run
 * (`LayoutTextItem.x/y/w/h`), and `detectLayoutStructure` was throwing all of it away — it kept only
 * `page`. That is why the Detailed Questions document canvas had nothing to draw: `computePageMaps`
 * skips any field without `page` + `bbox`, so a Configuration Discovery draft (which always comes
 * from the native-layout path) produced zero regions.
 *
 * Nothing here detects or infers anything new. It is pure projection of coordinates that extraction
 * already produced, so a highlight can only ever point at text the detector genuinely read.
 *
 * All boxes are PDF user space, bottom-left origin: [x0, y0, x1, y1].
 */

import type { LayoutLine, LayoutPage, LayoutTextItem } from "./pdfLayoutTypes";

export type LayoutBbox = [number, number, number, number];

/** Glyph box for one run. `h` is the glyph height; `fh` is the more reliable font height. */
function itemBox(it: LayoutTextItem): { top: number; bottom: number } {
    const h = it.h || it.fh || 10;
    // Baseline sits above the descender: approximate the visual box around it rather than using the
    // baseline as an edge, which would clip every highlight through the middle of the text.
    return { bottom: it.y - h * 0.25, top: it.y + h * 0.9 };
}

/** The full visual box of a line. */
export function lineBbox(line: LayoutLine): LayoutBbox {
    let bottom = Infinity;
    let top = -Infinity;
    for (const it of line.items) {
        const b = itemBox(it);
        if (b.bottom < bottom) bottom = b.bottom;
        if (b.top > top) top = b.top;
    }
    if (!Number.isFinite(bottom) || !Number.isFinite(top)) {
        const fh = line.fhMax || 10;
        bottom = line.y - fh * 0.25;
        top = line.y + fh * 0.9;
    }
    return [line.xStart, bottom, line.xEnd, top];
}

/**
 * Map a character range of `line.text` back to an x-range.
 *
 * `line.text` is the reconstructed text — runs joined by single spaces — so walking the items while
 * tracking that same reconstruction gives an exact character→x mapping. This is what lets several
 * labels detected on ONE line ("Last Name: ____  First Name: ____") each get their own highlight
 * instead of all sharing the whole line and stacking into an unusable pile.
 */
export function xRangeForCharRange(line: LayoutLine, start: number, end: number): { x0: number; x1: number } | null {
    if (start < 0 || end <= start || line.items.length === 0) return null;

    let cursor = 0;
    let x0: number | null = null;
    let x1: number | null = null;

    for (let i = 0; i < line.items.length; i += 1) {
        const it = line.items[i]!;
        const runStart = cursor;
        const runEnd = cursor + it.s.length;

        // Overlap between this run and the requested range.
        if (runEnd > start && runStart < end) {
            const fracStart = Math.max(0, (start - runStart) / Math.max(1, it.s.length));
            const fracEnd = Math.min(1, (end - runStart) / Math.max(1, it.s.length));
            const runX0 = it.x + it.w * fracStart;
            const runX1 = it.x + it.w * fracEnd;
            if (x0 === null || runX0 < x0) x0 = runX0;
            if (x1 === null || runX1 > x1) x1 = runX1;
        }

        cursor = runEnd;
        // The reconstruction inserts a single space between runs.
        if (i < line.items.length - 1) cursor += 1;
    }

    if (x0 === null || x1 === null || x1 <= x0) return null;
    return { x0, x1 };
}

/**
 * Box for one label detected on a line.
 *
 * `occurrence` disambiguates a label that appears more than once on the same line. Falls back to the
 * whole line when the label cannot be located — an approximate highlight is far more useful to an
 * operator than none, and it is still confined to the line the detector actually read.
 */
export function labelBbox(line: LayoutLine, label: string, occurrence = 0): LayoutBbox {
    const full = lineBbox(line);
    const needle = label.trim();
    if (!needle) return full;

    // Locate the requested occurrence in the reconstructed line text.
    let idx = -1;
    let from = 0;
    for (let n = 0; n <= occurrence; n += 1) {
        idx = line.text.indexOf(needle, from);
        if (idx < 0) break;
        from = idx + 1;
    }
    if (idx < 0) {
        // Labels are cleaned before this point (trailing colons, blank runs), so try a looser match
        // on the first few words before giving up on the line.
        const head = needle.split(/\s+/).slice(0, 3).join(" ");
        idx = head ? line.text.indexOf(head) : -1;
        if (idx < 0) return full;
        const range = xRangeForCharRange(line, idx, idx + head.length);
        return range ? [range.x0, full[1], range.x1, full[3]] : full;
    }

    const range = xRangeForCharRange(line, idx, idx + needle.length);
    return range ? [range.x0, full[1], range.x1, full[3]] : full;
}

/**
 * Page geometry in the shape the draft already stores (`StoredFormDraftPreview.pdf_pages`).
 *
 * The AcroForm path has always produced this; the native-layout path never did, which is the second
 * half of why the canvas was empty — without page dimensions the projection cannot place anything.
 */
export function layoutPageContexts(pages: readonly LayoutPage[]): Array<{
    page: number;
    width: number;
    height: number;
    texts: Array<{ str: string; x: number; y: number }>;
}> {
    return pages.map((p) => ({
        page: p.page,
        width: p.width,
        height: p.height,
        texts: p.lines.flatMap((l) => l.items.map((it) => ({ str: it.s, x: it.x, y: it.y }))),
    }));
}
