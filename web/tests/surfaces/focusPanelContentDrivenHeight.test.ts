/**
 * WIDTH IS AUTHORED. HEIGHT IS THE CONTENT'S.
 *
 * The Surface configuration owns horizontal placement — `colStart`, `colSpan`, and the
 * ordering relationship `rowStart` encodes. It does not own vertical extent. A Children
 * card holding two children is short; the same card holding seventeen is tall; and the
 * cards beneath it move by exactly that difference.
 *
 * The engine used to take `Math.max(measured, rowSpan * 76 + gutters)`, which made the
 * authored span a FLOOR. Two consequences, both visible in operator QA:
 *
 *   - phantom whitespace: a two-row card held open to a four-row span, and every card
 *     beneath it inheriting the difference;
 *   - a card that could never shrink, because the runtime also read its own imposed
 *     `min-height` back out of the DOM as if it were a measurement.
 *
 * The fixture is the published Waitlist composition (`entity_layouts` v143), whose
 * columns deliberately overlap — business_process spans 1-8 while children and household
 * start at 7 — because that is the shape that forces the `grid` strategy this engine
 * serves.
 */

import { describe, expect, it } from "vitest";

import {
    columnsOverlap,
    packOrder,
    resolveColumnAwareLayout,
    type ColumnAwareBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type {
    FocusPanelGridArea,
    FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const GUTTER = 10;
const WIDTH = 1200;

/** The published Waitlist Surface, verbatim geometry. */
const LAYOUT: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
        { card: "financials", colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 2 },
        { card: "attendance", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
        { card: "health_safety", colStart: 1, colSpan: 6, rowStart: 4, rowSpan: 2 },
        { card: "children", colStart: 7, colSpan: 6, rowStart: 5, rowSpan: 4 },
        { card: "household", colStart: 7, colSpan: 6, rowStart: 6, rowSpan: 4 },
    ] as FocusPanelGridArea[],
};

/** The first-paint placeholder — deliberately large, so any leak into a measured card shows. */
const unmeasuredHeightFor = (a: { rowSpan: number }) => a.rowSpan * 76 + (a.rowSpan - 1) * GUTTER;

function resolve(heights: Record<string, number>, width = WIDTH) {
    return resolveColumnAwareLayout({
        layout: LAYOUT,
        heights: new Map(Object.entries(heights)),
        width,
        gapPx: GUTTER,
        unmeasuredHeightFor,
    });
}

const boxOf = (r: { boxes: ColumnAwareBox[] }, card: string) => r.boxes.find((b) => b.card === card)!;
const areaOf = (card: string) => LAYOUT.areas.find((a) => a.card === card)!;

/** Content heights for a realistic subject; Children scales with its roster. */
function subject(children: number, over: Record<string, number> = {}) {
    return {
        business_process: 180,
        financials: 240,
        attendance: 150,
        health_safety: 96,
        children: 64 + children * 58,
        household: 210,
        ...over,
    };
}

describe("the authored span never prescribes height", () => {
    it("uses the measured height even when it is far below the authored span", () => {
        // health_safety is authored rowSpan 2 → a 162px placeholder. Its content is 40px.
        const r = resolve(subject(2, { health_safety: 40 }));
        expect(boxOf(r, "health_safety").height).toBe(40);
    });

    it("uses the measured height when it is far above the authored span", () => {
        const r = resolve(subject(17));
        expect(boxOf(r, "children").height).toBe(64 + 17 * 58);
    });

    it("falls back to the placeholder ONLY for a card never measured", () => {
        const r = resolve({ business_process: 180 });
        expect(boxOf(r, "business_process").height).toBe(180);
        expect(boxOf(r, "children").height).toBe(areaOf("children").rowSpan * 76 + (areaOf("children").rowSpan - 1) * GUTTER);
    });

    it("lets a card shrink back — the ratchet is gone", () => {
        const tall = boxOf(resolve(subject(17)), "children").height;
        const short = boxOf(resolve(subject(2)), "children").height;
        expect(short).toBeLessThan(tall);
        expect(short).toBe(64 + 2 * 58);
    });
});

describe("a card stacks from its overlapping predecessors, and nothing else", () => {
    it("puts Health immediately under Attendance, at exactly one gutter", () => {
        const r = resolve(subject(17)); // Household/Children tall on the right
        const attendance = boxOf(r, "attendance");
        const health = boxOf(r, "health_safety");
        expect(columnsOverlap(areaOf("attendance"), areaOf("health_safety"))).toBe(true);
        expect(health.top).toBe(attendance.top + attendance.height + GUTTER);
    });

    it("gives the right-hand column no vote over the left-hand stack", () => {
        // Household is in columns 7-12; Health is in 1-6. They never touch.
        expect(columnsOverlap(areaOf("household"), areaOf("health_safety"))).toBe(false);
        const lean = resolve(subject(2));
        const heavy = resolve(subject(17));
        // Growing the RIGHT column moves nothing on the left.
        for (const card of ["attendance", "health_safety"]) {
            expect(boxOf(lean, card).top, card).toBe(boxOf(heavy, card).top);
        }
    });

    it("starts a card in disjoint columns at the top rather than under its neighbour", () => {
        const r = resolve(subject(4));
        // financials (9-12) does not overlap business_process (1-8).
        expect(columnsOverlap(areaOf("business_process"), areaOf("financials"))).toBe(false);
        expect(boxOf(r, "business_process").top).toBe(0);
        expect(boxOf(r, "financials").top).toBe(0);
    });

    it("clears EVERY overlapping predecessor, not merely the previous one", () => {
        const r = resolve(subject(6));
        const children = boxOf(r, "children");
        // children (7-12) overlaps business_process (1-8) and financials (9-12).
        const bottoms = ["business_process", "financials"].map((c) => {
            const b = boxOf(r, c);
            return b.top + b.height;
        });
        expect(children.top).toBe(Math.max(...bottoms) + GUTTER);
    });
});

describe("flow is forward only", () => {
    const ROSTERS = [0, 1, 2, 5, 9, 17, 40];

    it("never moves a predecessor as a later card grows", () => {
        let previous = resolve(subject(ROSTERS[0]!));
        for (const n of ROSTERS.slice(1)) {
            const next = resolve(subject(n));
            // Everything packed before children is fixed against its roster size.
            for (const card of ["business_process", "financials", "attendance", "health_safety"]) {
                expect(boxOf(next, card).top, `${card} @ ${n}`).toBe(boxOf(previous, card).top);
            }
            previous = next;
        }
    });

    it("moves what sits beneath a growing card, by exactly the growth", () => {
        const lean = resolve(subject(2));
        const heavy = resolve(subject(17));
        const grew = boxOf(heavy, "children").height - boxOf(lean, "children").height;
        expect(grew).toBeGreaterThan(0);
        expect(boxOf(heavy, "household").top - boxOf(lean, "household").top).toBe(grew);
    });
});

describe("the composition holds for every content state", () => {
    /** Empty, minimal, populated and overflowing — per card, in combination. */
    const STATES: Record<string, number[]> = {
        business_process: [0, 120, 400],
        financials: [0, 90, 520],
        attendance: [0, 60, 640],
        health_safety: [0, 40, 480],
        children: [0, 122, 1050],
        household: [0, 70, 430],
    };

    function everyCombination(): Record<string, number>[] {
        const keys = Object.keys(STATES);
        let out: Record<string, number>[] = [{}];
        for (const k of keys) {
            out = out.flatMap((acc) => STATES[k]!.map((v) => ({ ...acc, [k]: v })));
        }
        return out;
    }

    it("never overlaps, in any combination of card content states", () => {
        const combos = everyCombination();
        expect(combos.length).toBe(3 ** 6);
        for (const heights of combos) {
            const r = resolve(heights);
            for (const a of r.boxes) {
                for (const b of r.boxes) {
                    if (a.card === b.card) continue;
                    if (!columnsOverlap(areaOf(a.card), areaOf(b.card))) continue;
                    const disjointVertically = a.top + a.height <= b.top || b.top + b.height <= a.top;
                    expect(disjointVertically, `${a.card} vs ${b.card} :: ${JSON.stringify(heights)}`).toBe(true);
                }
            }
        }
    });

    it("leaves exactly one gutter between a card and its nearest overlapping predecessor", () => {
        for (const heights of everyCombination().slice(0, 200)) {
            const r = resolve(heights);
            const order = packOrder(LAYOUT.areas).map((a) => a.card);
            for (const card of order.slice(1)) {
                const me = boxOf(r, card);
                const priors = order.slice(0, order.indexOf(card))
                    .filter((c) => columnsOverlap(areaOf(c), areaOf(card)))
                    .map((c) => boxOf(r, c));
                if (priors.length === 0) {
                    expect(me.top, card).toBe(0);
                    continue;
                }
                const required = Math.max(...priors.map((p) => p.top + p.height)) + GUTTER;
                expect(me.top, `${card} :: ${JSON.stringify(heights)}`).toBe(required);
            }
        }
    });

    it("settles deterministically — the same content always resolves the same geometry", () => {
        const heights = subject(17);
        const once = resolve(heights);
        for (let i = 0; i < 5; i += 1) {
            expect(resolve(heights)).toEqual(once);
        }
    });

    it("re-resolving from its own output changes nothing (no drift, no loop)", () => {
        // Feeding measured heights back in is what the runtime does every frame.
        let r = resolve(subject(17));
        for (let i = 0; i < 5; i += 1) {
            const fedBack = Object.fromEntries(r.boxes.map((b) => [b.card, b.height]));
            const again = resolve(fedBack);
            expect(again.boxes).toEqual(r.boxes);
            r = again;
        }
    });

    it("keeps the canvas exactly as tall as its lowest card", () => {
        for (const n of [0, 2, 17]) {
            const r = resolve(subject(n));
            expect(r.contentHeight).toBe(Math.max(...r.boxes.map((b) => b.top + b.height)));
        }
    });

    it("re-flows on a width change without disturbing vertical stacking", () => {
        const heights = subject(9);
        const wide = resolve(heights, 1440);
        const narrow = resolve(heights, 900);
        expect(boxOf(narrow, "children").width).toBeLessThan(boxOf(wide, "children").width);
        // Heights are content's, so the vertical composition is identical at any width.
        for (const b of wide.boxes) expect(boxOf(narrow, b.card).top, b.card).toBe(b.top);
    });
});
