import { describe, expect, it } from "vitest";
import {
    COMPOSER_GRID_GAP_PX,
    composerGridMetrics,
    parseTrackSizes,
    trackEdges,
    trackFromOffset,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

const W = 1200;
const COLS = 12;

/*
 * WHAT IS LEFT HERE, AND WHY.
 *
 * The ghost/pointer conversions this file used to cover — `composerGhostBounds`,
 * `composerCellFromOffset`, `spanBounds` — are gone with the inference that needed
 * them. The composer no longer converts a pointer into a row and a column; it
 * offers rectangles and the pointer picks one. Only the primitives the RENDERER
 * still uses remain: reading the browser's resolved tracks, which is how the
 * canvas measures itself.
 */
describe("composer grid metrics", () => {
    it("track width excludes the gaps the browser inserts", () => {
        const m = composerGridMetrics(W, COLS);
        expect(m.trackWidth).toBeCloseTo((W - 11 * COMPOSER_GRID_GAP_PX) / COLS, 6);
        expect(m.columnPitch).toBeCloseTo(m.trackWidth + COMPOSER_GRID_GAP_PX, 6);
        // The naive model this replaces. If these ever coincide the gap is zero.
        expect(m.trackWidth).not.toBeCloseTo(W / COLS, 3);
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

});
