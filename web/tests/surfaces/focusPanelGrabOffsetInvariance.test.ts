import { describe, expect, it } from "vitest";
import {
    snapColumnStart,
    resolveColumnAwareDrop,
    type MeasuredBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * GRAB OFFSET IS NOT PART OF THE DESTINATION.
 *
 * Where inside a card it was picked up used to decide which start columns were
 * reachable. Destination is a function of (pointer, authored span, canvas) — and
 * of nothing else.
 */

const COLUMNS = 12;

describe("snapColumnStart", () => {
    it("a six-column card takes the left half from the left, the right half from the right", () => {
        // The composition an operator means by "put it on the left" / "on the right".
        expect(snapColumnStart({ pointerColumn: 1, colSpan: 6, columns: COLUMNS })).toBe(1);
        expect(snapColumnStart({ pointerColumn: 3, colSpan: 6, columns: COLUMNS })).toBe(1);
        expect(snapColumnStart({ pointerColumn: 9, colSpan: 6, columns: COLUMNS })).toBe(7);
        expect(snapColumnStart({ pointerColumn: 12, colSpan: 6, columns: COLUMNS })).toBe(7);
    });

    it("never returns a start the span cannot legally take", () => {
        for (const colSpan of [4, 6, 8, 12]) {
            const maxStart = COLUMNS - colSpan + 1;
            for (let pointerColumn = -3; pointerColumn <= COLUMNS + 3; pointerColumn += 1) {
                const start = snapColumnStart({ pointerColumn, colSpan, columns: COLUMNS });
                expect(start).toBeGreaterThanOrEqual(1);
                expect(start).toBeLessThanOrEqual(maxStart);
            }
        }
    });

    it("is monotonic — moving right never moves the card left", () => {
        for (const colSpan of [4, 6, 8, 12]) {
            let previous = 0;
            for (let pointerColumn = 1; pointerColumn <= COLUMNS; pointerColumn += 1) {
                const start = snapColumnStart({ pointerColumn, colSpan, columns: COLUMNS });
                expect(start).toBeGreaterThanOrEqual(previous);
                previous = start;
            }
        }
    });

    it("gives every span-sized slot its own band of pointer positions", () => {
        // Halves for a 6-span, thirds for a 4-span — the compositions an operator means.
        const expected: Record<number, number[]> = { 4: [1, 5, 9], 6: [1, 7], 8: [1, 5], 12: [1] };
        for (const colSpan of [4, 6, 8, 12]) {
            const reached = new Set<number>();
            for (let pointerColumn = 1; pointerColumn <= COLUMNS; pointerColumn += 1) {
                reached.add(snapColumnStart({ pointerColumn, colSpan, columns: COLUMNS }));
            }
            expect([...reached].sort((a, b) => a - b), `span ${colSpan}`).toEqual(expected[colSpan]);
        }
    });
});

describe("the same pointer gives the same rectangle, however the card was grabbed", () => {
    const layout: FocusPanelGridLayout = {
        columns: COLUMNS,
        areas: [
            { card: "attendance", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 },
            { card: "household", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
        ],
    };
    const boxes = new Map<string, MeasuredBox>([
        ["attendance", { top: 0, height: 425 }],
        ["household", { top: 435, height: 366 }],
    ]);

    it("grab position cannot change the snapped destination, for any span", () => {
        for (const colSpan of [4, 6, 8, 12]) {
            const moving = { card: "attendance", colStart: 7, colSpan, rowStart: 1, rowSpan: 2 } as never;
            for (let pointerColumn = 1; pointerColumn <= COLUMNS; pointerColumn += 1) {
                /*
                 * The grab used to enter here as `pointerColumn - grabOffset`. Sweeping
                 * every grab position across the card must now change nothing at all.
                 */
                const answers = [0, 1, 2, 3, 4, 5].slice(0, colSpan).map(() =>
                    resolveColumnAwareDrop({
                        layout, moving, colStart: pointerColumn, pointerY: 100, boxes, gapPx: 10,
                    }).rect);
                expect(new Set(answers.map((r) => JSON.stringify(r))).size,
                    `span ${colSpan}, pointer ${pointerColumn}`).toBe(1);
            }
        }
    });

    it("the left half is reachable — the case the grab offset used to forbid", () => {
        const moving = { card: "attendance", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 } as never;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: snapColumnStart({ pointerColumn: 3, colSpan: 6, columns: COLUMNS }),
            pointerY: 0, boxes, gapPx: 10,
        });
        expect(drop.rect.colStart).toBe(1);
        expect(drop.rect.colSpan).toBe(6);
    });

    it("and the right half snaps whole, never straddling the middle", () => {
        const moving = { card: "health_safety", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 } as never;
        for (const pointerColumn of [7, 8, 9, 10, 11, 12]) {
            const start = snapColumnStart({ pointerColumn, colSpan: 6, columns: COLUMNS });
            expect(start, `pointer ${pointerColumn}`).toBe(7);
            const drop = resolveColumnAwareDrop({
                layout, moving, colStart: start, pointerY: 10_000, boxes, gapPx: 10,
            });
            // Household.bottom + one gutter, in the right half — the operator's rule.
            expect(drop.rect).toEqual({ colStart: 7, colSpan: 6, top: 435 + 366 + 10 });
        }
    });
});

describe("the left band, against the real canvas the operator is using", () => {
    /*
     * Operator QA isolated it: left fails, centre and right work, same card. The
     * bands are therefore checked against the MEASURED canvas — 957px wide, twelve
     * columns, 10px gutters, taken from the live layout dump — rather than a
     * synthetic width.
     */
    const WIDTH = 957;

    const bandsFor = (colSpan: number) => {
        const track = (WIDTH - 11 * 10) / 12;
        const pitch = track + 10;
        const seen = new Map<number, [number, number]>();
        for (let x = 0; x <= WIDTH; x += 1) {
            const pointerColumn = Math.min(12, Math.max(1, Math.floor(x / pitch) + 1));
            const start = snapColumnStart({ pointerColumn, colSpan, columns: 12 });
            const band = seen.get(start);
            if (!band) seen.set(start, [x, x]); else band[1] = x;
        }
        return seen;
    };

    it("the left band starts at the canvas edge — no dead strip before it", () => {
        for (const colSpan of [4, 6, 8]) {
            const bands = bandsFor(colSpan);
            expect(bands.get(1)?.[0], `span ${colSpan}`).toBe(0);
        }
    });

    it("the left band is not narrower than the others", () => {
        for (const colSpan of [4, 6]) {
            const bands = [...bandsFor(colSpan).entries()].sort((a, b) => a[0] - b[0]);
            const widths = bands.map(([, [lo, hi]]) => hi - lo);
            const first = widths[0]!;
            for (const w of widths) expect(Math.abs(w - first)).toBeLessThan(24);
        }
    });

    it("sweeping left always ends at colStart 1 and stays there", () => {
        for (const colSpan of [4, 6, 8]) {
            const track = (WIDTH - 11 * 10) / 12;
            const pitch = track + 10;
            let last = 99;
            for (let x = WIDTH; x >= 0; x -= 1) {
                const pointerColumn = Math.min(12, Math.max(1, Math.floor(x / pitch) + 1));
                const start = snapColumnStart({ pointerColumn, colSpan, columns: 12 });
                expect(start).toBeLessThanOrEqual(last);
                last = start;
            }
            expect(last, `span ${colSpan}`).toBe(1);
        }
    });
});
