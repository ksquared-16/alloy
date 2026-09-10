/**
 * PUBLISHED SURFACE GEOMETRY = RUNTIME GEOMETRY.
 *
 * The /surfaces Focus Panel composer and the /work-unit Focus Panel are two views of one
 * persisted composition. They stopped being that when the planner grew a strategy hint: the
 * composer rendered `<FocusPanelCardGrid publishedLayout={…}>` and got the `grid` reading,
 * while the Work Unit passed `preferLanesFromGrid` and got a `lanes` reading that bucketed the
 * authored areas by `colStart` and gave every card in a bucket the bucket's widest span.
 *
 * Measured on the running application, one published document, one 1680px viewport:
 *
 *   authored     financials  colStart 7  colSpan 2   (beside two six-wide cards)
 *   /surfaces    published-grid    financials rendered 165px
 *   /work-unit   published-lanes   financials rendered 554px
 *
 * These tests hold the contract at the seam the defect lived in: what publishes is what plans,
 * for every consumer, and there is no second reading of an authored grid to fall into.
 */

import { describe, expect, it } from "vitest";

import {
    buildPublishedLayoutFromGrid,
    gridFromPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import {
    planPublishedLayout,
    readFocusPanelPublishedLayout,
    PUBLISHED_LAYOUT_MIN_PX,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { resolveColumnAwareLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";

/**
 * The composition the operator asked for, and the one that used to diverge: two clean columns,
 * with one card authored NARROWER than the column it sits in.
 *
 *   LEFT  (1-6)                RIGHT (7-12)
 *   Enrollment                 Financials  (7-8 only — two columns wide)
 *   Attendance                 Children
 *   Health & Safety            Household
 */
const AUTHORED: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "business_process", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
        { card: "financials", colStart: 7, colSpan: 2, rowStart: 1, rowSpan: 2 },
        { card: "attendance", colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 2 },
        { card: "children", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 4 },
        { card: "health_safety", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
        { card: "household", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 4 },
    ],
};

/** The whole authority chain: composer grid -> publish -> stored metadata -> runtime read. */
function publishAndRead(grid: FocusPanelGridLayout) {
    const layout = buildPublishedLayoutFromGrid(grid);
    const metadata = withPublishedLayoutMetadata(null, layout);
    const readBack = readFocusPanelPublishedLayout({ metadata });
    expect(readBack, "publish must not drop the composition").not.toBeNull();
    return readBack!;
}

const rect = (plan: ReturnType<typeof planPublishedLayout>) =>
    plan.areas.map((a) => [a.card, a.colStart, a.colSpan, a.rowStart, a.rowSpan]);

describe("the authored composition survives publication unchanged", () => {
    it("keeps every rectangle through publish and read-back", () => {
        const plan = planPublishedLayout(publishAndRead(AUTHORED), 1440);
        expect(plan.strategy).toBe("grid");
        expect(rect(plan)).toEqual(
            AUTHORED.areas.map((a) => [a.card, a.colStart, a.colSpan, a.rowStart, a.rowSpan]),
        );
    });

    it("keeps a span NARROWER than its column band — the width the runtime used to widen", () => {
        const plan = planPublishedLayout(publishAndRead(AUTHORED), 1440);
        expect(plan.areas.find((a) => a.card === "financials")!.colSpan).toBe(2);
        // And it is not the band's widest span borrowed from a neighbour.
        expect(plan.areas.find((a) => a.card === "children")!.colSpan).toBe(6);
    });

    it("round-trips through the composer's own grid conversion without moving a card", () => {
        const readBack = publishAndRead(AUTHORED);
        const backToGrid = gridFromPublishedLayout(readBack);
        expect(
            [...backToGrid.areas].sort((a, b) => a.card.localeCompare(b.card))
                .map((a) => [a.card, a.colStart, a.colSpan]),
        ).toEqual(
            [...AUTHORED.areas].sort((a, b) => a.card.localeCompare(b.card))
                .map((a) => [a.card, a.colStart, a.colSpan]),
        );
    });
});

describe("one composition has one reading", () => {
    it("plans identically however many consumers ask", () => {
        const layout = publishAndRead(AUTHORED);
        // The composer measures a narrower canvas than the Work Unit. Width changes the pixels
        // the renderer computes; it must not change the composition the planner returns.
        const composer = planPublishedLayout(layout, 1069);
        const runtime = planPublishedLayout(layout, 1118);
        expect(composer.strategy).toBe(runtime.strategy);
        expect(rect(composer)).toEqual(rect(runtime));
    });

    it("offers no way to ask for a different one", () => {
        // `planPublishedLayout` takes a layout and a width. A third argument was the fork.
        expect(planPublishedLayout.length).toBe(2);
    });

    it("does not fall back to a default when a valid published composition exists", () => {
        const plan = planPublishedLayout(publishAndRead(AUTHORED), 1440);
        expect(plan.areas.map((a) => a.card)).toEqual(AUTHORED.areas.map((a) => a.card));
        expect(plan.lanes).toEqual([]);
    });
});

describe("different card heights do not open holes the composition does not contain", () => {
    it("gives a short card the top of its own column, whatever its neighbour's height", () => {
        const plan = planPublishedLayout(publishAndRead(AUTHORED), 1440);
        // Enrollment renders very tall; Financials beside it renders short. Neither may inherit
        // the other's height, because they share no column.
        const heights = new Map<string, number>([
            ["business_process", 700],
            ["financials", 120],
            ["attendance", 140],
            ["children", 260],
            ["health_safety", 150],
            ["household", 270],
        ]);
        const resolved = resolveColumnAwareLayout({
            layout: { columns: plan.gridColumns, areas: plan.areas },
            heights,
            width: 1120,
            gapPx: 10,
            unmeasuredHeightFor: (a) => a.rowSpan * 76,
        });
        const box = (card: string) => resolved.boxes.find((b) => b.card === card)!;
        // Both columns start at the top — a 700px card on the left does not push the right down.
        expect(box("business_process").top).toBe(0);
        expect(box("financials").top).toBe(0);
        // Inside a column, each card sits directly under the one above it, gap and no more.
        expect(box("children").top).toBe(box("financials").top + 120 + 10);
        expect(box("household").top).toBe(box("children").top + 260 + 10);
        expect(box("attendance").top).toBe(700 + 10);
        // And the narrow card keeps its authored width in pixels, not its column band's.
        expect(box("financials").width).toBeLessThan(box("children").width);
    });
});

describe("compatibility with layouts published before the grid model", () => {
    const ROWS_ONLY = {
        rows: [
            { cells: [{ width: "half" as const, cards: ["business_process"] }, { width: "half" as const, cards: ["financials"] }] },
            { cells: [{ width: "half" as const, cards: ["attendance"] }, { width: "half" as const, cards: ["children"] }] },
        ],
    };

    it("keeps rendering a rows-only layout as lanes — it carries no coordinates to honour", () => {
        const metadata = withPublishedLayoutMetadata(null, ROWS_ONLY as never);
        const readBack = readFocusPanelPublishedLayout({ metadata })!;
        const plan = planPublishedLayout(readBack, 1440);
        expect(plan.strategy).toBe("lanes");
        expect(plan.lanes.map((l) => l.cards.map((c) => c.key))).toEqual([
            ["business_process", "attendance"],
            ["financials", "children"],
        ]);
    });

    it("still collapses to one readable column below the min width, in reading order", () => {
        const plan = planPublishedLayout(publishAndRead(AUTHORED), PUBLISHED_LAYOUT_MIN_PX - 1);
        expect(plan.collapsed).toBe(true);
        expect(plan.rows.flatMap((r) => r.cells.flatMap((c) => c.cards))).toEqual([
            "business_process",
            "financials",
            "attendance",
            "children",
            "health_safety",
            "household",
        ]);
    });
});
