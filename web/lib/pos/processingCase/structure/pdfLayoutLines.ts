/**
 * POS-FP15 — group positional text items into visual lines.
 *
 * Pure + deterministic. Shared by the runtime extractor (`pdfPositionalExtract`) and by
 * test fixtures, so both produce identical `LayoutLine`s from the same items. No PDF library.
 *
 * Grouping rule: items on (approximately) the same baseline form one line. The tolerance is
 * a fraction of the line's font height so tight superscripts / mixed sizes still merge, while
 * distinct rows (here ~22pt apart) never do. Within a line, runs are ordered left→right and
 * the text is reconstructed inserting a single space only across a real horizontal gap — never
 * concatenating an instruction sentence with the next label (the flat-text bleed).
 */

import type { LayoutLine, LayoutTextItem } from "./pdfLayoutTypes";

/** Space width heuristic: a gap wider than this fraction of the run's font height is a word break. */
const GAP_SPACE_RATIO = 0.28;
/** Baseline tolerance as a fraction of font height — items within this Δy join the same line. */
const BASELINE_RATIO = 0.5;

/** Median of a numeric array (0 for empty). */
function median(xs: number[]): number {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Build visual lines from a page's text items. Items are grouped by baseline y (descending,
 * so reading order is top→bottom) and ordered left→right. Empty/whitespace-only items are
 * kept only insofar as they influence spacing — they never seed a line.
 */
export function buildLayoutLines(items: LayoutTextItem[], page: number): LayoutLine[] {
    const meaningful = items.filter((it) => it.s !== "" && it.fh > 0);
    if (meaningful.length === 0) return [];

    const medianFh = median(meaningful.map((it) => it.fh)) || 12;
    const tol = Math.max(2, medianFh * BASELINE_RATIO);

    // Seed lines top→bottom; merge an item into the nearest open line within tolerance.
    const sorted = [...meaningful].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; items: LayoutTextItem[] }[] = [];
    for (const it of sorted) {
        let ln = lines.find((l) => Math.abs(l.y - it.y) <= tol);
        if (!ln) {
            ln = { y: it.y, items: [] };
            lines.push(ln);
        }
        ln.items.push(it);
    }

    return lines.map((ln) => {
        const its = ln.items.slice().sort((a, b) => a.x - b.x);
        let text = "";
        let lastEnd: number | null = null;
        for (const it of its) {
            if (lastEnd !== null) {
                const gap = it.x - lastEnd;
                const threshold = Math.max(1, it.fh * GAP_SPACE_RATIO);
                if (gap > threshold && !/\s$/.test(text) && !/^\s/.test(it.s)) text += " ";
            }
            text += it.s;
            lastEnd = it.x + it.w;
        }
        const fhMax = Math.max(...its.map((i) => i.fh));
        const baseY = its.length ? median(its.map((i) => i.y)) : ln.y;
        return {
            page,
            y: Math.round(baseY * 10) / 10,
            xStart: Math.round(its[0].x * 10) / 10,
            xEnd: Math.round((its[its.length - 1].x + its[its.length - 1].w) * 10) / 10,
            fhMax: Math.round(fhMax * 10) / 10,
            text: text.replace(/[ \t]{2,}/g, " ").trimEnd(),
            items: its,
        };
    });
}
