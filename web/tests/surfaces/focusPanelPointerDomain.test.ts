import { describe, expect, it } from "vitest";
import {
    composerCellFromOffset,
    composerGridMetrics,
    resolveDropPlacement,
    trackEdges,
    trackFromOffset,
    COMPOSER_GRID_GAP_PX,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

/**
 * POINTER-DOMAIN REACHABILITY.
 *
 * The earlier sweep started from a desired cell and asked the resolver for it.
 * That proves the model can honour a request; it cannot prove the POINTER can
 * make the request. Operator QA failed on exactly that gap — dragging further
 * left while the preview stopped moving. These tests start where the operator
 * starts: at a pixel.
 */

const WIDTH = 1440;
const COLUMNS = 12;

describe("pointer → column, across the whole canvas", () => {
    const m = composerGridMetrics(WIDTH, COLUMNS);

    it("reaches every column, including the first and the last", () => {
        const seen = new Set<number>();
        for (let x = -40; x <= WIDTH + 40; x += 2) {
            const { col } = composerCellFromOffset({
                offsetX: x, offsetY: 10, surfaceWidthPx: WIDTH, columns: COLUMNS,
            });
            seen.add(col);
        }
        expect([...seen].sort((a, b) => a - b)).toEqual(
            Array.from({ length: COLUMNS }, (_, i) => i + 1),
        );
    });

    it("never moves the column the wrong way as the pointer sweeps", () => {
        let previous = 0;
        for (let x = -40; x <= WIDTH + 40; x += 1) {
            const { col } = composerCellFromOffset({
                offsetX: x, offsetY: 10, surfaceWidthPx: WIDTH, columns: COLUMNS,
            });
            // Monotonic: moving right can only raise the column, never lower it.
            expect(col).toBeGreaterThanOrEqual(previous);
            previous = col;
        }
    });

    it("has no dead horizontal band — every column owns a real hit region", () => {
        const widths = new Map<number, number>();
        for (let x = 0; x <= WIDTH; x += 1) {
            const { col } = composerCellFromOffset({
                offsetX: x, offsetY: 10, surfaceWidthPx: WIDTH, columns: COLUMNS,
            });
            widths.set(col, (widths.get(col) ?? 0) + 1);
        }
        for (let c = 1; c <= COLUMNS; c += 1) {
            expect(widths.get(c) ?? 0, `column ${c} hit region`).toBeGreaterThan(m.trackWidth / 2);
        }
    });

    it("the left edge — and anything left of it — asks for column 1", () => {
        for (const x of [-200, -40, -1, 0, 4, 20]) {
            const { col } = composerCellFromOffset({
                offsetX: x, offsetY: 10, surfaceWidthPx: WIDTH, columns: COLUMNS,
            });
            expect(col, `offset ${x}`).toBe(1);
        }
    });
});

describe("pointer → placement, through the real resolver", () => {
    /** The grab offset the canvas applies: pointer cell minus the card's own start. */
    const requestFor = (pointerCol: number, grabColOffset: number) => pointerCol - grabColOffset;

    function layout(): FocusPanelGridLayout {
        return {
            columns: COLUMNS,
            areas: [
                { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "attendance", colStart: 1, colSpan: 6, rowStart: 4, rowSpan: 2 },
                { card: "health_safety", colStart: 1, colSpan: 4, rowStart: 6, rowSpan: 2 },
            ],
        };
    }

    it("a pointer sweeping left reaches column 1 from ANY grab point on the card", () => {
        const grid = layout();
        const moving = grid.areas.find((a) => a.card === "attendance")!;
        // Grabbed anywhere across a six-column card.
        for (let grab = 0; grab < moving.colSpan; grab += 1) {
            let reachedColumnOne = false;
            for (let x = WIDTH; x >= -60; x -= 4) {
                const { col } = composerCellFromOffset({
                    offsetX: x, offsetY: 10, surfaceWidthPx: WIDTH, columns: COLUMNS,
                });
                const placement = resolveDropPlacement(grid, moving, requestFor(col, grab), 4);
                if (placement.area.colStart === 1) reachedColumnOne = true;
            }
            expect(reachedColumnOne, `grab offset ${grab} can still reach column 1`).toBe(true);
        }
    });

    it("an open vacancy beside a card is targetable without the card being nearby-preferred", () => {
        // Household holds 7-12 on rows 1-3; columns 1-6 of rows 1-3 are open.
        const grid = layout();
        const health = grid.areas.find((a) => a.card === "health_safety")!;
        const placement = resolveDropPlacement(grid, health, 1, 1);
        expect(placement.area).toMatchObject({ colStart: 1, rowStart: 1 });
        // Household keeps its cells — the vacancy was the target, not the card.
        const household = placement.grid.areas.find((a) => a.card === "household")!;
        expect(household).toMatchObject({ colStart: 7, rowStart: 1 });
    });
});

describe("pointer → row", () => {
    it("never moves the row the wrong way as the pointer sweeps down", () => {
        const rows = [120, 90, 200, 80, 150, 76, 76];
        const edges = trackEdges(rows, COMPOSER_GRID_GAP_PX);
        const total = edges[edges.length - 1]!;
        let previous = 0;
        for (let y = -30; y <= total + 30; y += 1) {
            const row = Math.max(1, trackFromOffset(y, edges, 86));
            expect(row).toBeGreaterThanOrEqual(previous);
            previous = row;
        }
    });

    it("above the canvas asks for the first row", () => {
        const edges = trackEdges([120, 90, 200], COMPOSER_GRID_GAP_PX);
        for (const y of [-200, -20, 0, 5]) {
            expect(Math.max(1, trackFromOffset(y, edges, 86)), `offset ${y}`).toBe(1);
        }
    });
});
