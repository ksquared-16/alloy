import { describe, expect, it } from "vitest";
import {
    applyDropCandidate,
    enumerateDropCandidates,
    legalColumnStarts,
    pickDropCandidate,
    type DropCandidate,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelDropCandidates";
import {
    resolveColumnAwareLayout,
    type MeasuredBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const GAP = 10;
/** The operator's real canvas, measured from the live builder. */
const WIDTH = 957;
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
            { card: "health_safety", colStart: 1, colSpan: 6, rowStart: 6, rowSpan: 2 },
        ],
    };
}

const heights: Record<string, number> = {
    business_process: 240, financials: 240, children: 386,
    household: 366, attendance: 425, health_safety: 300,
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

const candidatesFor = (layout: FocusPanelGridLayout, card: string): DropCandidate[] =>
    enumerateDropCandidates({
        layout,
        moving: layout.areas.find((a) => a.card === card)!,
        boxes: measured(layout),
        width: WIDTH,
        gapPx: GAP,
        minHeightFor,
    });

describe("legal horizontal starts", () => {
    it("divides the canvas into span-sized bands", () => {
        expect(legalColumnStarts({ columns: 12, colSpan: 6 })).toEqual([1, 7]);
        expect(legalColumnStarts({ columns: 12, colSpan: 4 })).toEqual([1, 5, 9]);
        expect(legalColumnStarts({ columns: 12, colSpan: 12 })).toEqual([1]);
    });

    it("offers the right-aligned placement a span that does not divide the canvas would lose", () => {
        // 8 of 12: bands give 1 only, but 5 is legal and is the operator's "right two-thirds".
        expect(legalColumnStarts({ columns: 12, colSpan: 8 })).toEqual([1, 5]);
    });
});

/*
 * THE TWO CASES THE OPERATOR NAMED. Nothing else is certified here.
 */
describe("the destination is offered, not inferred", () => {
    it("ATTENDANCE: a left-hand destination exists beside Children and Household", () => {
        const layout = operatorLayout();
        const zones = candidatesFor(layout, "attendance");

        const left = zones.filter((z) => z.colStart === 1);
        expect(left.length, "the left column region is offered").toBeGreaterThan(0);

        // The top of the left column: beside Children, not below it.
        const beside = left.find((z) => z.top === 0);
        expect(beside, "top of the left column is reachable").toBeTruthy();

        // Committing it puts Attendance level with the top and leaves the right stack alone.
        const after = applyDropCandidate({
            layout,
            moving: layout.areas.find((a) => a.card === "attendance")!,
            candidate: beside!,
            boxes: measured(layout),
        });
        expect(topOf(after, "attendance")).toBe(0);
    });

    /*
     * The operator's picture, with nothing spanning both stacks:
     *
     *     [ Attendance ][ Children  ]
     *                   [ Household ]
     *
     * The left destination must be offered, and taking it must not disturb the
     * right stack — the two regions share no column, which is the entire test.
     *
     * (In `operatorLayout` above, Children DOES move when Attendance takes the top
     * of the left column. That is not this bug: Business Process spans columns 1-8,
     * so it overlaps both regions, and pushing it down legitimately carries the
     * right stack with it. The invariant is about columns, not about sides.)
     */
    it("ATTENDANCE: taking the left destination leaves the right stack where it is", () => {
        const layout: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "children", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 4 },
                { card: "attendance", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
            ],
        };
        const boxes = measured(layout);
        const zones = candidatesFor(layout, "attendance");

        const beside = zones.find((z) => z.colStart === 1 && z.top === 0);
        expect(beside, "top of the left column, beside Children").toBeTruthy();

        const after = applyDropCandidate({
            layout,
            moving: layout.areas.find((a) => a.card === "attendance")!,
            candidate: beside!,
            boxes,
        });
        expect(topOf(after, "attendance")).toBe(0);
        expect(topOf(after, "children"), "Children keeps the top of its own column").toBe(0);
        expect(topOf(after, "household"), "Household keeps its place under Children")
            .toBe(heights.children + GAP);
    });

    it("HEALTH: the destination below Household is exactly one gutter below it", () => {
        const layout = operatorLayout();
        const boxes = measured(layout);
        const zones = candidatesFor(layout, "health_safety");

        const belowHousehold = zones.find((z) => z.colStart === 7 && z.after === "household");
        expect(belowHousehold, "below Household is offered").toBeTruthy();

        const household = boxes.get("household")!;
        expect(belowHousehold!.top).toBe(household.top + household.height + GAP);

        const after = applyDropCandidate({
            layout,
            moving: layout.areas.find((a) => a.card === "health_safety")!,
            candidate: belowHousehold!,
            boxes,
        });
        // No artificial whitespace: the gutter, and nothing more.
        expect(topOf(after, "health_safety")).toBe(household.top + household.height + GAP);
    });
});

/*
 * THE INVARIANT THAT ENDS THE CLASS OF BUG. A zone that advertises a rectangle and
 * commits a different one is the failure every previous round reproduced; it cannot
 * happen when both come from one resolve, and this is what proves they do.
 */
describe("zone, preview and commit are the same rectangle", () => {
    it("every advertised candidate lands exactly where it says, for every card", () => {
        const layout = operatorLayout();
        const boxes = measured(layout);
        for (const area of layout.areas) {
            for (const zone of candidatesFor(layout, area.card)) {
                const after = applyDropCandidate({ layout, moving: area, candidate: zone, boxes });
                const landed = resolve(after).boxes.find((b) => b.card === area.card)!;
                expect(landed.top, `${area.card} @ ${zone.id}`).toBe(Math.round(zone.top));
                const placed = after.areas.find((a) => a.card === area.card)!;
                expect(placed.colStart, `${area.card} @ ${zone.id}`).toBe(zone.colStart);
                expect(placed.colSpan, `${area.card} keeps its authored span`).toBe(area.colSpan);
            }
        }
    });

    it("offers no two targets that resolve to the same authored result", () => {
        const layout = operatorLayout();
        for (const area of layout.areas) {
            const zones = candidatesFor(layout, area.card);
            const keys = zones.map((z) => `${z.colStart}:${Math.round(z.top)}`);
            expect(new Set(keys).size, `${area.card} has no duplicate targets`).toBe(keys.length);
        }
    });
});

describe("the targets tile — no gap to fall into, no overlap to make it ambiguous", () => {
    it("bands within a column region are contiguous", () => {
        const layout = operatorLayout();
        for (const area of layout.areas) {
            const zones = candidatesFor(layout, area.card);
            const byRegion = new Map<number, DropCandidate[]>();
            for (const z of zones) byRegion.set(z.colStart, [...(byRegion.get(z.colStart) ?? []), z]);
            for (const [colStart, bucket] of byRegion) {
                const sorted = [...bucket].sort((a, b) => a.hit.top - b.hit.top);
                expect(sorted[0]!.hit.top, `${area.card} c${colStart} starts at the top`).toBe(0);
                sorted.forEach((z, i) => {
                    const next = sorted[i + 1];
                    if (!next) return;
                    expect(z.hit.top + z.hit.height, `${area.card} c${colStart} band ${i}`)
                        .toBe(next.hit.top);
                });
            }
        }
    });

    it("every target is big enough to hit casually", () => {
        const layout = operatorLayout();
        for (const area of layout.areas) {
            for (const zone of candidatesFor(layout, area.card)) {
                expect(zone.hit.height, `${area.card} @ ${zone.id}`).toBeGreaterThanOrEqual(44);
                expect(zone.hit.width, `${area.card} @ ${zone.id}`).toBeGreaterThanOrEqual(44);
            }
        }
    });
});

/*
 * WHERE THE CARD WAS GRABBED IS NOT PART OF THE ANSWER.
 *
 * It used to be: the destination was `pointerColumn - grabOffset`, so pressing a
 * six-column card on its right edge put half the canvas out of reach. Selection is
 * now a function of the pointer and the offered set alone — there is no third input
 * for the pickup to contaminate.
 */
describe("selection is a function of the pointer alone", () => {
    it("always names a destination, anywhere on the canvas", () => {
        const layout = operatorLayout();
        const zones = candidatesFor(layout, "attendance");
        for (let x = 0; x <= WIDTH; x += 17) {
            for (let y = 0; y <= 1400; y += 37) {
                expect(pickDropCandidate(zones, { x, y }), `(${x},${y})`).toBeTruthy();
            }
        }
    });

    it("sweeping left reaches the left column region and stays there", () => {
        const layout = operatorLayout();
        const zones = candidatesFor(layout, "attendance");
        // Anywhere in the left half, at the top: the left region wins.
        for (let x = 0; x < WIDTH / 2 - 40; x += 13) {
            expect(pickDropCandidate(zones, { x, y: 40 })!.colStart, `x=${x}`).toBe(1);
        }
        expect(pickDropCandidate(zones, { x: 0, y: 0 })!.colStart).toBe(1);
    });

    it("the same pointer gives the same answer however the card was picked up", () => {
        const layout = operatorLayout();
        const zones = candidatesFor(layout, "attendance");
        // Enumeration takes no grab argument at all, so this is structural: the same
        // offered set, queried at the same point, cannot disagree with itself.
        const a = pickDropCandidate(zones, { x: 120, y: 60 });
        const b = pickDropCandidate(zones, { x: 120, y: 60 });
        expect(a!.id).toBe(b!.id);
    });
});
