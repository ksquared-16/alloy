/**
 * POS-FP15 — native-layout PDF detection: positional types.
 *
 * The flat-text detector (`detectDocumentStructure`) sees only a string and re-imposes
 * "layout" by splitting on newlines / double-spaces. That flattening is the root cause of
 * instruction→label bleed and lost section boundaries. This layout path instead keeps the
 * per-item geometry (x/y/width/font-height, per page) that PDF text extraction actually
 * carries, groups items into visual LINES, and lets the detector reason about position and
 * font size — the real structural signals a Word-generated PDF exposes.
 *
 * These types are the seam between extraction (`pdfPositionalExtract`) and detection
 * (`detectLayoutStructure`). Pure data; no PDF-library imports here so both the runtime
 * extractor and deterministic fixtures produce the same shape.
 */

/** One text run from PDF extraction, in PDF user space (origin bottom-left). */
export interface LayoutTextItem {
    /** The run's text. */
    s: string;
    /** Left edge (PDF x). */
    x: number;
    /** Baseline y (PDF y; larger = higher on the page). */
    y: number;
    /** Run width in points. */
    w: number;
    /** Glyph height in points. */
    h: number;
    /** Font height (‖transform‖ of the vertical scale) — the reliable size signal. */
    fh: number;
}

/** A visual line: items sharing a baseline, ordered left→right, with derived text + metrics. */
export interface LayoutLine {
    page: number;
    /** Baseline y of the line. */
    y: number;
    /** Left edge of the first item. */
    xStart: number;
    /** Right edge of the last item. */
    xEnd: number;
    /** Largest font height on the line (heading signal). */
    fhMax: number;
    /** Reconstructed line text (single spaces between runs; underscores preserved). */
    text: string;
    items: LayoutTextItem[];
}

export interface LayoutPage {
    page: number;
    width: number;
    height: number;
    lines: LayoutLine[];
}

export interface LayoutDocument {
    pageCount: number;
    pages: LayoutPage[];
    /** Extraction provenance / failure reason (never throws; honest about availability). */
    ok: boolean;
    reason: string | null;
}
