import { describe, expect, it } from "vitest";
import {
    buildPublishedLayoutFromGrid,
    gridFromPublishedLayout,
    COMPOSER_GRID_GAP_PX,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import {
    resolveColumnAwareLayout,
    type MeasuredBox,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelColumnAwareLayout";
import {
    applyDropCandidate,
    enumerateDropCandidates,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelDropCandidates";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * WHAT THE BUILDER SHOWS IS WHAT THE RUNTIME DRAWS.
 *
 * The composer and the published runtime resolve through one engine
 * (`resolveColumnAwareLayout`, reached by both via `useColumnAwareStack`), so
 * parity is not a matter of keeping two renderers in step — it is a matter of the
 * PERSISTED layout carrying enough to reproduce the geometry. `rowStart` stopped
 * being a global row index and became an ordering key within overlapping columns,
 * which is exactly the sort of redefinition that round-trips wrongly if the
 * serialisation and the resolver disagree about what it means.
 *
 * So: author a composition the way the operator does — by taking an offered drop
 * candidate — then push it through publish and read it back, and require the
 * resolved boxes to be identical. Not similar. Identical.
 */

const GAP = COMPOSER_GRID_GAP_PX;
/** The operator's canvas, measured from the live lane server. */
const WIDTH = 957;
const unmeasuredHeightFor = (a: { rowSpan: number }) => a.rowSpan * 76 + (a.rowSpan - 1) * GAP;

/** The lane's actual surface, with the heights the browser reported for it. */
const heights: Record<string, number> = {
    business_process: 239, financials: 239, readiness_kpi: 248,
    children: 386, billing_preview: 366, household: 366,
    attendance: 425, health_safety: 369,
};

function laneSurface(): FocusPanelGridLayout {
    return {
        columns: 12,
        areas: [
            { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
            { card: "financials", colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 2 },
            { card: "readiness_kpi", colStart: 1, colSpan: 4, rowStart: 3, rowSpan: 3 },
            { card: "children", colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 4 },
            { card: "billing_preview", colStart: 1, colSpan: 6, rowStart: 5, rowSpan: 2 },
            { card: "household", colStart: 7, colSpan: 6, rowStart: 6, rowSpan: 4 },
            { card: "attendance", colStart: 1, colSpan: 6, rowStart: 7, rowSpan: 2 },
            { card: "health_safety", colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 },
        ],
    };
}

const resolve = (layout: FocusPanelGridLayout) =>
    resolveColumnAwareLayout({
        layout, heights: new Map(Object.entries(heights)), width: WIDTH, gapPx: GAP, unmeasuredHeightFor,
    });

const measured = (layout: FocusPanelGridLayout): Map<string, MeasuredBox> =>
    new Map(resolve(layout).boxes.map((b) => [b.card, { top: b.top, height: b.height }]));

/** Publish it and read it back — the round trip the operator's Save performs. */
const roundTrip = (layout: FocusPanelGridLayout) =>
    gridFromPublishedLayout(buildPublishedLayoutFromGrid(layout), layout.columns);

const geometry = (layout: FocusPanelGridLayout) =>
    resolve(layout).boxes
        .map((b) => `${b.card} x${b.left} y${b.top} w${b.width} h${b.height}`)
        .sort();

describe("published runtime parity", () => {
    it("the lane's surface resolves identically after a publish round-trip", () => {
        const authored = laneSurface();
        expect(geometry(roundTrip(authored))).toEqual(geometry(authored));
    });

    it("a composition authored through a drop candidate survives publish unchanged", () => {
        const authored = laneSurface();
        const moving = authored.areas.find((a) => a.card === "health_safety")!;
        const boxes = measured(authored);

        // Author it the way the operator does: take the offered "below Household".
        const zone = enumerateDropCandidates({
            layout: authored, moving, boxes, width: WIDTH, gapPx: GAP, unmeasuredHeightFor,
        }).find((c) => c.after === "household");
        expect(zone, "the below-Household destination is offered").toBeTruthy();

        const composed = applyDropCandidate({ layout: authored, moving, candidate: zone!, boxes });

        // One gutter under Household, in Household's own columns.
        const after = resolve(composed);
        const household = after.boxes.find((b) => b.card === "household")!;
        const health = after.boxes.find((b) => b.card === "health_safety")!;
        expect(health.left, "same column region").toBe(household.left);
        expect(health.top - (household.top + household.height), "exactly one gutter").toBe(GAP);

        // And the runtime draws that same picture from the published document.
        expect(geometry(roundTrip(composed))).toEqual(geometry(composed));
    });

    it("every card in the lane surface sits one gutter below its own predecessor", () => {
        /*
         * The invariant the "excessive whitespace" report was really about. Gaps are
         * a COLUMN-LOCAL property: within one column region every consecutive pair is
         * separated by exactly one gutter, and a taller neighbouring column cannot
         * introduce space that region never asked for.
         */
        const layout = laneSurface();
        const boxes = resolve(layout).boxes;
        const areaOf = (card: string) => layout.areas.find((a) => a.card === card)!;

        for (const box of boxes) {
            const self = areaOf(box.card);
            const above = boxes
                .filter((other) => {
                    if (other.card === box.card) return false;
                    const o = areaOf(other.card);
                    const sharesColumn =
                        o.colStart < self.colStart + self.colSpan
                        && self.colStart < o.colStart + o.colSpan;
                    return sharesColumn && other.top + other.height <= box.top;
                })
                .sort((a, b) => b.top + b.height - (a.top + a.height))[0];

            if (!above) {
                expect(box.top, `${box.card} is first in its columns`).toBe(0);
            } else {
                expect(box.top - (above.top + above.height),
                    `${box.card} follows ${above.card} by one gutter`).toBe(GAP);
            }
        }
    });
});
