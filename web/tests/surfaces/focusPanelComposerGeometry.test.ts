/**
 * COMPOSER GRID GEOMETRY — one owner, and it must match the browser's.
 *
 * The drag path had two independent pixel→cell converters and both modelled a
 * 12-column grid as 12 columns of `width / 12`. A CSS grid with a column gap has
 * 12 TRACKS of `(width - 11·gap)/12`, each followed by a gap. The two models
 * agree at column 1 and drift by a further gap-width per column after it, which
 * is why dragging degraded from left to right across the canvas and the ghost
 * showed a landing place the card did not take.
 */
import { describe, expect, it } from "vitest";

import {
    COMPOSER_GRID_GAP_PX,
    COMPOSER_GRID_ROW_UNIT_PX,
    composerCellFromOffset,
    composerGhostBounds,
    composerGridMetrics,
    parseTrackSizes,
    spanBounds,
    trackEdges,
    trackFromOffset,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

const W = 1200;
const COLS = 12;

/** What the browser actually lays out, computed independently of the module. */
function browserTrackStart(col: number, width = W, cols = COLS) {
    const track = (width - (cols - 1) * COMPOSER_GRID_GAP_PX) / cols;
    return (col - 1) * (track + COMPOSER_GRID_GAP_PX);
}

describe("composer grid metrics", () => {
    it("track width excludes the gaps the browser inserts", () => {
        const m = composerGridMetrics(W, COLS);
        expect(m.trackWidth).toBeCloseTo((W - 11 * COMPOSER_GRID_GAP_PX) / COLS, 6);
        expect(m.columnPitch).toBeCloseTo(m.trackWidth + COMPOSER_GRID_GAP_PX, 6);
        // The naive model this replaces. If these ever coincide the gap is zero.
        expect(m.trackWidth).not.toBeCloseTo(W / COLS, 3);
    });

    it("every column's start matches the browser's, not just the first", () => {
        for (let col = 1; col <= COLS; col += 1) {
            const bounds = composerGhostBounds({
                colStart: col, colSpan: 1, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W,
            });
            expect(bounds.left).toBeCloseTo(browserTrackStart(col), 6);
        }
    });

    it("a span covers its own tracks plus the gaps between them, and no trailing gap", () => {
        const m = composerGridMetrics(W, COLS);
        const eight = composerGhostBounds({ colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        const four = composerGhostBounds({ colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        expect(eight.width).toBeCloseTo(8 * m.trackWidth + 7 * COMPOSER_GRID_GAP_PX, 6);
        // 8 + 4 must exactly consume the row: the right edge of the 4 lands on W.
        expect(four.left + four.width).toBeCloseTo(W, 6);
        // …and they must not overlap.
        expect(four.left).toBeGreaterThanOrEqual(eight.left + eight.width);
    });

    it("6 + 6 and 4 + 4 + 4 also consume exactly one row", () => {
        const right6 = composerGhostBounds({ colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        expect(right6.left + right6.width).toBeCloseTo(W, 6);
        const last4 = composerGhostBounds({ colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        expect(last4.left + last4.width).toBeCloseTo(W, 6);
        const mid4 = composerGhostBounds({ colStart: 5, colSpan: 4, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        const first4 = composerGhostBounds({ colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        expect(mid4.left).toBeGreaterThanOrEqual(first4.left + first4.width);
        expect(last4.left).toBeGreaterThanOrEqual(mid4.left + mid4.width);
    });

    it("a full-row card spans the whole canvas", () => {
        const row = composerGhostBounds({ colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, columns: COLS, surfaceWidthPx: W });
        expect(row.left).toBeCloseTo(0, 6);
        expect(row.width).toBeCloseTo(W, 6);
    });

    it("pointer mapping is the exact inverse of the ghost, at every column", () => {
        for (let col = 1; col <= COLS; col += 1) {
            const left = browserTrackStart(col);
            // Just inside the track's leading edge, and just before its trailing gap.
            expect(composerCellFromOffset({ offsetX: left + 1, offsetY: 1, surfaceWidthPx: W, columns: COLS }).col).toBe(col);
            const m = composerGridMetrics(W, COLS);
            expect(
                composerCellFromOffset({ offsetX: left + m.trackWidth - 1, offsetY: 1, surfaceWidthPx: W, columns: COLS }).col,
            ).toBe(col);
        }
    });

    it("rows use the composer's fixed authoring track", () => {
        const m = composerGridMetrics(W, COLS);
        expect(m.rowHeight).toBe(COMPOSER_GRID_ROW_UNIT_PX);
        expect(m.rowPitch).toBe(COMPOSER_GRID_ROW_UNIT_PX + COMPOSER_GRID_GAP_PX);
        for (let row = 1; row <= 6; row += 1) {
            const y = (row - 1) * m.rowPitch + 1;
            expect(composerCellFromOffset({ offsetX: 1, offsetY: y, surfaceWidthPx: W, columns: COLS }).row).toBe(row);
        }
    });

    it("pointer mapping stays inside the grid at both extremes", () => {
        expect(composerCellFromOffset({ offsetX: -400, offsetY: -400, surfaceWidthPx: W, columns: COLS })).toEqual({ col: 1, row: 1 });
        expect(composerCellFromOffset({ offsetX: W + 400, offsetY: 1, surfaceWidthPx: W, columns: COLS }).col).toBe(COLS);
    });

    it("a zero-width canvas cannot produce NaN or an out-of-range cell", () => {
        // Measured before layout — a real state during the composer's first frame.
        const cell = composerCellFromOffset({ offsetX: 10, offsetY: 10, surfaceWidthPx: 0, columns: COLS });
        expect(Number.isFinite(cell.col)).toBe(true);
        expect(cell.col).toBeGreaterThanOrEqual(1);
        expect(cell.col).toBeLessThanOrEqual(COLS);
    });
});


/**
 * MEASURED TRACKS — the geometry that survives content-sized rows.
 *
 * These sizes are the real ones read off the live canvas: a fixed 76px row could
 * not grow, so Financials overflowed its 162px area by 309px and painted over
 * Health & Safety. With content-sized rows there is no constant pitch left to
 * assume, so every conversion has to come from the browser's own resolved tracks.
 */
describe("measured track geometry", () => {
    const GAP = COMPOSER_GRID_GAP_PX;
    // Mixed heights, exactly the case a constant pitch cannot describe.
    const ROWS = [76, 239, 76, 471, 350, 76];

    it("parses a computed track list and ignores anything that is not a length", () => {
        expect(parseTrackSizes("76px 239px 76px")).toEqual([76, 239, 76]);
        expect(parseTrackSizes("")).toEqual([]);
        expect(parseTrackSizes(null)).toEqual([]);
        expect(parseTrackSizes("auto min-content")).toEqual([]);
    });

    it("edges accumulate each track plus the gap that follows it", () => {
        const edges = trackEdges(ROWS, GAP);
        expect(edges[0]).toBe(0);
        expect(edges[1]).toBe(76 + GAP);
        expect(edges[2]).toBe(76 + GAP + 239 + GAP);
        expect(edges).toHaveLength(ROWS.length + 1);
    });

    it("an offset resolves to the track that actually contains it, at every height", () => {
        const edges = trackEdges(ROWS, GAP);
        for (let i = 0; i < ROWS.length; i += 1) {
            const start = edges[i]!;
            expect(trackFromOffset(start + 1, edges, 86)).toBe(i + 1);
            expect(trackFromOffset(start + ROWS[i]! - 1, edges, 86)).toBe(i + 1);
        }
    });

    it("a constant pitch would get the tall rows wrong — which is the defect", () => {
        const edges = trackEdges(ROWS, GAP);
        // The 5th row starts at 76+239+76+471 + 4 gaps = 902.
        const fifthStart = edges[4]!;
        expect(trackFromOffset(fifthStart + 5, edges, 86)).toBe(5);
        // The old constant-pitch model would have called that row 11.
        expect(Math.floor((fifthStart + 5) / 86) + 1).not.toBe(5);
    });

    it("below the last track the index continues, so a card can always be dropped at the end", () => {
        const edges = trackEdges(ROWS, GAP);
        const past = edges[edges.length - 1]! + 200;
        expect(trackFromOffset(past, edges, 86)).toBeGreaterThan(ROWS.length);
    });

    it("a negative or pre-layout offset resolves to the first track, never NaN", () => {
        expect(trackFromOffset(-50, trackEdges(ROWS, GAP), 86)).toBe(1);
        expect(trackFromOffset(10, [0], 86)).toBe(1);
        expect(Number.isFinite(trackFromOffset(10, [], 86))).toBe(true);
    });

    it("a span covers its tracks and the gaps between them, and stops before the next", () => {
        const edges = trackEdges(ROWS, GAP);
        const two = spanBounds(2, 2, edges, GAP, 86);
        expect(two.offset).toBe(edges[1]);
        expect(two.size).toBe(239 + GAP + 76);
        const one = spanBounds(4, 1, edges, GAP, 86);
        expect(one.size).toBe(471);
    });

    it("a span past the measured tracks extrapolates rather than collapsing to zero", () => {
        const edges = trackEdges(ROWS, GAP);
        const beyond = spanBounds(ROWS.length + 3, 2, edges, GAP, 86);
        expect(beyond.size).toBeGreaterThan(0);
        expect(beyond.offset).toBeGreaterThan(edges[edges.length - 1]!);
    });

    it("the ghost and the drop resolve to the same band, at every row", () => {
        // The property that matters: what the operator is shown is where the card lands.
        const edges = trackEdges(ROWS, GAP);
        for (let row = 1; row <= ROWS.length; row += 1) {
            const bounds = spanBounds(row, 1, edges, GAP, 86);
            expect(trackFromOffset(bounds.offset + 1, edges, 86)).toBe(row);
            expect(trackFromOffset(bounds.offset + bounds.size - 1, edges, 86)).toBe(row);
        }
    });
});
