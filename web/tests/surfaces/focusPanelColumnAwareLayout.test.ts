import { describe, expect, it } from "vitest";
import {
    resolveColumnAwareLayout,
    columnsOverlap,
    packOrder,
    type ColumnAwareBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const WIDTH = 1440;
const GAP = 10;
const minHeightFor = (a: { rowSpan: number }) => a.rowSpan * 76 + (a.rowSpan - 1) * GAP;

const resolve = (layout: FocusPanelGridLayout, heights: Record<string, number>) =>
    resolveColumnAwareLayout({
        layout, heights: new Map(Object.entries(heights)), width: WIDTH, gapPx: GAP, minHeightFor,
    });
const box = (r: { boxes: ColumnAwareBox[] }, card: string) => r.boxes.find((b) => b.card === card)!;

describe("column-aware vertical layout", () => {
    it("the reported composition: a tall left card does not push the right column apart", () => {
        /*
         * The measured failure: Household ended at 1448 and Health began at 1716 —
         * 268px owned by rows occupied only in the LEFT columns. Same composition
         * here, resolved column-aware.
         */
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "attendance", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "health_safety", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
                { card: "readiness_kpi", colStart: 1, colSpan: 4, rowStart: 3, rowSpan: 2 },
            ],
        };
        const r = resolve(layout, {
            attendance: 425, household: 180, health_safety: 180, readiness_kpi: 248,
        });
        // Health sits directly beneath Household — one gutter, nothing else.
        expect(box(r, "health_safety").top).toBe(box(r, "household").top + 180 + GAP);
        // And it is NOT pushed down by the tall card in the other columns.
        expect(box(r, "health_safety").top).toBeLessThan(box(r, "attendance").height);
    });

    it("cards in disjoint columns never move each other", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "left", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "right", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
            ] as never,
        };
        const tall = resolve(layout, { left: 900, right: 120 });
        const short = resolve(layout, { left: 100, right: 120 });
        // The right card starts at the top either way — the left card's height is irrelevant.
        expect(box(tall, "right").top).toBe(0);
        expect(box(short, "right").top).toBe(0);
    });

    it("a card overlapping by a single column still stacks below", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "wide", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "touching", colStart: 6, colSpan: 4, rowStart: 2, rowSpan: 2 },
            ] as never,
        };
        const r = resolve(layout, { wide: 300, touching: 120 });
        expect(box(r, "touching").top).toBe(300 + GAP);
    });

    it("packs upward — no phantom band anywhere in the result", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "a", colStart: 1, colSpan: 12, rowStart: 5, rowSpan: 2 },
                { card: "b", colStart: 1, colSpan: 6, rowStart: 20, rowSpan: 2 },
                { card: "c", colStart: 7, colSpan: 6, rowStart: 30, rowSpan: 2 },
            ] as never,
        };
        const r = resolve(layout, { a: 200, b: 150, c: 90 });
        expect(box(r, "a").top).toBe(0);
        expect(box(r, "b").top).toBe(210);
        expect(box(r, "c").top).toBe(210);
    });

    it("never overlaps two rectangles", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "a", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
                { card: "b", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 2 },
                { card: "c", colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 3 },
                { card: "d", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 2 },
            ] as never,
        };
        const r = resolve(layout, { a: 240, b: 240, c: 400, d: 180 });
        for (let i = 0; i < r.boxes.length; i += 1) {
            for (let j = i + 1; j < r.boxes.length; j += 1) {
                const p = r.boxes[i]!, q = r.boxes[j]!;
                const hOverlap = p.left < q.left + q.width - 1 && q.left < p.left + p.width - 1;
                const vOverlap = p.top < q.top + q.height - 1 && q.top < p.top + p.height - 1;
                expect(hOverlap && vOverlap, `${p.card} vs ${q.card}`).toBe(false);
            }
        }
    });

    it("honours the authored span as a minimum height before content is measured", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [{ card: "a", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 }] as never,
        };
        const r = resolve(layout, {});
        expect(box(r, "a").height).toBe(3 * 76 + 2 * GAP);
    });

    it("computes the same widths the twelve-column canvas always used", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "third", colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 2 },
                { card: "twoThirds", colStart: 5, colSpan: 8, rowStart: 1, rowSpan: 2 },
            ] as never,
        };
        const r = resolve(layout, { third: 100, twoThirds: 100 });
        const track = (WIDTH - 11 * GAP) / 12;
        expect(box(r, "third").width).toBe(Math.round(4 * track + 3 * GAP));
        expect(box(r, "twoThirds").left).toBe(Math.round(4 * (track + GAP)));
        // Side by side, exactly one gutter apart.
        expect(box(r, "twoThirds").left - (box(r, "third").left + box(r, "third").width)).toBe(GAP);
    });

    it("is deterministic and idempotent for a given set of heights", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "a", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "b", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "c", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
            ] as never,
        };
        const heights = { a: 400, b: 150, c: 150 };
        expect(resolve(layout, heights)).toEqual(resolve(layout, heights));
    });

    it("orders by rowStart then colStart — the meaning the persisted field now carries", () => {
        const areas = [
            { card: "c", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
            { card: "a", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
            { card: "b", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 },
        ] as never;
        expect(packOrder(areas).map((a) => a.card)).toEqual(["a", "b", "c"]);
    });

    it("knows which cards share columns", () => {
        expect(columnsOverlap({ colStart: 1, colSpan: 6 }, { colStart: 7, colSpan: 6 })).toBe(false);
        expect(columnsOverlap({ colStart: 1, colSpan: 7 }, { colStart: 7, colSpan: 6 })).toBe(true);
        expect(columnsOverlap({ colStart: 1, colSpan: 12 }, { colStart: 5, colSpan: 4 })).toBe(true);
    });
});
