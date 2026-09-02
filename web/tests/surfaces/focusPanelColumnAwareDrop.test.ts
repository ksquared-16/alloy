import { describe, expect, it } from "vitest";
import {
    resolveColumnAwareDrop,
    resolveColumnAwareLayout,
    type MeasuredBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const GAP = 10;
const WIDTH = 1440;
const minHeightFor = (a: { rowSpan: number }) => a.rowSpan * 76 + (a.rowSpan - 1) * GAP;

/** The operator's surface: Process full width, then two independent stacks. */
function operatorLayout(): FocusPanelGridLayout {
    return {
        columns: 12,
        areas: [
            { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
            { card: "financials", colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 2 },
            { card: "children", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 4 },
            { card: "household", colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 4 },
            { card: "attendance", colStart: 1, colSpan: 6, rowStart: 5, rowSpan: 2 },
        ],
    };
}

const heights = {
    business_process: 240, financials: 240, children: 386, household: 366, attendance: 425,
};

const resolve = (layout: FocusPanelGridLayout) =>
    resolveColumnAwareLayout({
        layout, heights: new Map(Object.entries(heights)), width: WIDTH, gapPx: GAP, minHeightFor,
    });

const measured = (layout: FocusPanelGridLayout): Map<string, MeasuredBox> => {
    const map = new Map<string, MeasuredBox>();
    for (const b of resolve(layout).boxes) map.set(b.card, { top: b.top, height: b.height });
    return map;
};

const topOf = (layout: FocusPanelGridLayout, card: string) =>
    resolve(layout).boxes.find((b) => b.card === card)!.top;

describe("column-local drop — the operator's gesture", () => {
    it("puts Attendance directly under Process in columns 1-6, beside Children", () => {
        const layout = operatorLayout();
        const boxes = measured(layout);
        const moving = layout.areas.find((a) => a.card === "attendance")!;
        // Pointer: left-hand columns, just below Process.
        const pointerY = boxes.get("business_process")!.top + boxes.get("business_process")!.height + 20;

        const drop = resolveColumnAwareDrop({ layout, moving, colStart: 1, pointerY, boxes });
        expect(drop.after, "follows Process in its own columns").toBe("business_process");

        const after = drop.layout;
        // Attendance sits immediately below Process — one gutter, nothing else.
        expect(topOf(after, "attendance"))
            .toBe(topOf(after, "business_process") + heights.business_process + GAP);
        // And Children, in columns 7-12, is NOT pushed below it.
        expect(topOf(after, "children")).toBeLessThan(topOf(after, "attendance") + heights.attendance);
    });

    it("cards in disjoint columns do not constrain the drop at all", () => {
        const layout = operatorLayout();
        const moving = layout.areas.find((a) => a.card === "attendance")!;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 1,
            pointerY: measured(layout).get("business_process")!.height + 20,
            boxes: measured(layout),
        });
        // Household and Children live in columns 7-12; they have no say.
        expect(drop.overlapping).not.toContain("household");
        expect(drop.overlapping).not.toContain("children");
        expect(drop.overlapping).toContain("business_process");
    });

    it("a full-width card overlaps everything, so it does order both stacks", () => {
        const layout = operatorLayout();
        const moving = { card: "attendance", colStart: 1, colSpan: 12, rowStart: 5, rowSpan: 2 } as never;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 1, pointerY: 10_000, boxes: measured(layout),
        });
        for (const card of ["business_process", "financials", "children", "household"]) {
            expect(drop.overlapping).toContain(card);
        }
    });

    it("Health reorders inside the right stack without touching the left", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "attendance", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
                { card: "health_safety", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 2 },
            ],
        };
        const h = { attendance: 425, household: 366, health_safety: 369 };
        const res = (l: FocusPanelGridLayout) => resolveColumnAwareLayout({
            layout: l, heights: new Map(Object.entries(h)), width: WIDTH, gapPx: GAP, minHeightFor,
        });
        const boxes = new Map(res(layout).boxes.map((b) => [b.card, { top: b.top, height: b.height }]));
        const moving = layout.areas.find((a) => a.card === "health_safety")!;

        // Above Household: pointer in the top half of Household.
        const up = resolveColumnAwareDrop({ layout, moving, colStart: 7, pointerY: 10, boxes });
        expect(up.after).toBeNull();
        const upTops = new Map(res(up.layout).boxes.map((b) => [b.card, b.top]));
        expect(upTops.get("health_safety")).toBeLessThan(upTops.get("household")!);
        // The left stack never moved.
        expect(upTops.get("attendance")).toBe(0);

        // Below Household again — aiming against the boxes as they now stand.
        const movedBoxes = new Map(
            res(up.layout).boxes.map((b) => [b.card, { top: b.top, height: b.height }]),
        );
        const hh = movedBoxes.get("household")!;
        const down = resolveColumnAwareDrop({
            layout: up.layout, moving, colStart: 7,
            pointerY: hh.top + hh.height - 5,
            boxes: movedBoxes,
        });
        const downTops = new Map(res(down.layout).boxes.map((b) => [b.card, b.top]));
        expect(downTops.get("health_safety")).toBeGreaterThan(downTops.get("household")!);
        expect(downTops.get("attendance")).toBe(0);
    });

    it("keeps the authored span and the pointer's column", () => {
        const layout = operatorLayout();
        const moving = layout.areas.find((a) => a.card === "attendance")!;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 5, pointerY: 0, boxes: measured(layout),
        });
        const placed = drop.layout.areas.find((a) => a.card === "attendance")!;
        expect(placed.colSpan).toBe(6);
        expect(placed.colStart).toBe(5);
    });

    it("serialises to rowStart with no gaps, so the contract round-trips", () => {
        const layout = operatorLayout();
        const moving = layout.areas.find((a) => a.card === "attendance")!;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 1, pointerY: 300, boxes: measured(layout),
        });
        const rows = drop.layout.areas.map((a) => a.rowStart).sort((a, b) => a - b);
        expect(rows).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("the drop is a rectangle, and only overlapping columns are in it", () => {
    const GAP2 = 10;
    const layout: FocusPanelGridLayout = {
        columns: 12,
        areas: [
            { card: "attendance", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
            { card: "household", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 2 },
            { card: "health_safety", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 2 },
        ],
    };

    /** Household sits at a known Y; Attendance's size is varied to prove it is irrelevant. */
    const boxesWith = (attendanceHeight: number) =>
        new Map<string, MeasuredBox>([
            ["attendance", { top: 0, height: attendanceHeight }],
            ["household", { top: 0, height: 366 }],
            ["health_safety", { top: 376, height: 369 }],
        ]);

    it("Health's destination is literally Household.bottom + one gutter", () => {
        const moving = layout.areas.find((a) => a.card === "health_safety")!;
        const boxes = boxesWith(425);
        const hh = boxes.get("household")!;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 7,
            // Pointer past Household's middle: the card belongs beneath it.
            pointerY: hh.top + hh.height - 20,
            boxes, gapPx: GAP2,
        });
        expect(drop.rect).toEqual({ colStart: 7, colSpan: 6, top: hh.top + hh.height + GAP2 });
        expect(drop.after).toBe("household");
    });

    it("Attendance cannot change that answer, whatever size it is", () => {
        const moving = layout.areas.find((a) => a.card === "health_safety")!;
        const answers = [120, 425, 900, 2000].map((attendanceHeight) => {
            const boxes = boxesWith(attendanceHeight);
            const hh = boxes.get("household")!;
            return resolveColumnAwareDrop({
                layout, moving, colStart: 7,
                pointerY: hh.top + hh.height - 20,
                boxes, gapPx: GAP2,
            }).rect;
        });
        // One answer, whatever the left column is doing.
        expect(new Set(answers.map((r) => JSON.stringify(r))).size).toBe(1);
        expect(answers[0]).toEqual({ colStart: 7, colSpan: 6, top: 376 });
    });

    it("does not even consult a card in disjoint columns", () => {
        const moving = layout.areas.find((a) => a.card === "health_safety")!;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 7, pointerY: 500, boxes: boxesWith(2000), gapPx: GAP2,
        });
        expect(drop.overlapping).toEqual(["household"]);
        expect(drop.overlapping).not.toContain("attendance");
    });

    it("above everything it overlaps means the top of the canvas", () => {
        const moving = layout.areas.find((a) => a.card === "health_safety")!;
        const drop = resolveColumnAwareDrop({
            layout, moving, colStart: 7, pointerY: 5, boxes: boxesWith(425), gapPx: GAP2,
        });
        expect(drop.rect.top).toBe(0);
        expect(drop.after).toBeNull();
    });
});
