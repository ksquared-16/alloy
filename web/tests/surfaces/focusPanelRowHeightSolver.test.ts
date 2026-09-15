/**
 * THE PUBLISHED COMPOSITION OWNS CARD HEIGHT; THE CARD OWNS ITS CONTENT.
 *
 * Measured on the deployed Work Unit panel: Enrollment 237px beside Financials 325px, both in
 * the same authored band. CSS could not fix it — the composed canvas positions every area
 * absolutely from JS-computed left/width/top, and `align-items` is inert on absolutely
 * positioned children. Injecting `stretch` on the canvas and on the area changed nothing.
 *
 * So the height has to be SOLVED. These cases are the solver's contract.
 *
 * Nothing here names a card type. `solveRowHeights` reads `rowStart`, `rowSpan` and measured
 * heights, and would behave identically for cards that do not exist yet.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { solveRowHeights, bandsCovered } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights";

const area = (card: string, rowStart: number, rowSpan = 1) => ({ card, rowStart, rowSpan });
const heights = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("cards sharing an authored band share its height", () => {
    it("gives both cards the taller one's height — the measured defect, as a unit", () => {
        const { assigned } = solveRowHeights({
            areas: [area("enrollment", 1), area("financials", 1)],
            intrinsic: heights({ enrollment: 237, financials: 325 }),
            gapPx: 12,
        });
        expect(assigned.get("enrollment")).toBe(325);
        expect(assigned.get("financials")).toBe(325);
    });

    it("solves each band independently — a tall band never inflates the next", () => {
        const { assigned } = solveRowHeights({
            areas: [area("a", 1), area("b", 1), area("c", 2), area("d", 2)],
            intrinsic: heights({ a: 400, b: 120, c: 90, d: 110 }),
            gapPx: 12,
        });
        expect(assigned.get("a")).toBe(400);
        expect(assigned.get("b")).toBe(400);
        // Row 2 is settled by row 2 alone.
        expect(assigned.get("c")).toBe(110);
        expect(assigned.get("d")).toBe(110);
    });

    it("leaves a lone card in its band at its own height — no global normalization", () => {
        const { assigned } = solveRowHeights({
            areas: [area("a", 1), area("b", 2)],
            intrinsic: heights({ a: 400, b: 90 }),
            gapPx: 12,
        });
        expect(assigned.get("b")).toBe(90);
    });
});

describe("a spanning card covers the bands it was authored across", () => {
    it("equals the stacked cards plus the gap between them", () => {
        // A(150) over B(160) on the left; C spans both on the right. 150 + 12 + 160 = 322.
        const { assigned } = solveRowHeights({
            areas: [area("a", 1), area("b", 2), area("c", 1, 2)],
            intrinsic: heights({ a: 150, b: 160, c: 300 }),
            gapPx: 12,
        });
        expect(assigned.get("a")! + 12 + assigned.get("b")!).toBe(assigned.get("c"));
        expect(assigned.get("c")).toBe(322);
    });

    it("expands the bands deterministically when the spanning card is taller", () => {
        // C needs 400 but the bands offer 322 — the 78px shortfall splits evenly.
        const { assigned, bandHeights } = solveRowHeights({
            areas: [area("a", 1), area("b", 2), area("c", 1, 2)],
            intrinsic: heights({ a: 150, b: 160, c: 400 }),
            gapPx: 12,
        });
        expect(bandHeights.get(1)).toBe(150 + 39);
        expect(bandHeights.get(2)).toBe(160 + 39);
        expect(assigned.get("c")).toBe(400);
        expect(assigned.get("a")! + 12 + assigned.get("b")!).toBe(400);
    });

    it("does not expand anything when the spanning card is shorter than its bands", () => {
        const { assigned } = solveRowHeights({
            areas: [area("a", 1), area("b", 2), area("c", 1, 2)],
            intrinsic: heights({ a: 150, b: 160, c: 50 }),
            gapPx: 12,
        });
        expect(assigned.get("a")).toBe(150);
        expect(assigned.get("b")).toBe(160);
        // It still covers its authored bands — that is what spanning means.
        expect(assigned.get("c")).toBe(322);
    });

    it("settles when two spanning cards share a band", () => {
        // Satisfying one span can leave the other short, so the solver runs to a fixed point.
        const { assigned } = solveRowHeights({
            areas: [area("x", 1, 2), area("y", 2, 2), area("a", 1), area("b", 2), area("c", 3)],
            intrinsic: heights({ x: 500, y: 500, a: 10, b: 10, c: 10 }),
            gapPx: 12,
        });
        expect(assigned.get("x")).toBeGreaterThanOrEqual(500);
        expect(assigned.get("y")).toBeGreaterThanOrEqual(500);
        // Bounded, not merely finished: no band ran away satisfying the other.
        expect(assigned.get("x")).toBeLessThan(900);
    });
});

describe("what the solver refuses to invent", () => {
    it("lets an unmeasured card constrain nothing", () => {
        const { assigned } = solveRowHeights({
            areas: [area("measured", 1), area("pending", 1)],
            intrinsic: heights({ measured: 200 }),
            gapPx: 12,
        });
        // The band is the one real measurement, not a guess averaged with it.
        expect(assigned.get("measured")).toBe(200);
        expect(assigned.get("pending")).toBe(200);
    });

    it("shrinks when content shrinks — a solved height is never a floor", () => {
        const tall = solveRowHeights({
            areas: [area("a", 1), area("b", 1)],
            intrinsic: heights({ a: 237, b: 325 }),
            gapPx: 12,
        });
        expect(tall.assigned.get("a")).toBe(325);
        // The same layout, after B's roster collapses. Nothing remembers 325.
        const short = solveRowHeights({
            areas: [area("a", 1), area("b", 1)],
            intrinsic: heights({ a: 237, b: 90 }),
            gapPx: 12,
        });
        expect(short.assigned.get("a")).toBe(237);
        expect(short.assigned.get("b")).toBe(237);
    });

    it("is a pure function of its inputs — the same input always solves the same", () => {
        const run = () => solveRowHeights({
            areas: [area("a", 1), area("b", 1, 2), area("c", 2)],
            intrinsic: heights({ a: 100, b: 400, c: 100 }),
            gapPx: 12,
        }).assigned;
        expect([...run()]).toEqual([...run()]);
    });

    /*
     * THE CONVERGENCE REQUIREMENT, AS A UNIT.
     *
     * Feeding a solved height back in as if it were intrinsic is the failure this canvas
     * already shipped once. Here that is spelled out: re-solving with the ASSIGNED heights
     * as input must not grow the answer. The renderer's half of this guarantee — measuring
     * the card, never the box drawn around it — is asserted separately.
     */
    it("does not grow when its own output is fed back as intrinsic", () => {
        const areas = [area("a", 1), area("b", 1)];
        const first = solveRowHeights({ areas, intrinsic: heights({ a: 237, b: 325 }), gapPx: 12 });
        let current = first.assigned;
        for (let i = 0; i < 5; i += 1) {
            const next = solveRowHeights({ areas, intrinsic: new Map(current), gapPx: 12 });
            expect(next.assigned.get("a")).toBe(325);
            expect(next.assigned.get("b")).toBe(325);
            current = next.assigned;
        }
    });

    it("names no card, archetype or process anywhere in its source", () => {
        // The solver must be as true for a card invented tomorrow as for today's.
        const src = readFileSync(
            resolve(__dirname, "../../lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights.ts"),
            "utf8",
        );
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        for (const name of ["financials", "enrollment", "business_process", "current_work", "children"]) {
            expect(code.toLowerCase()).not.toContain(name);
        }
    });
});

describe("bandsCovered", () => {
    it("lists every band an authored span touches", () => {
        expect(bandsCovered({ card: "c", rowStart: 2, rowSpan: 3 })).toEqual([2, 3, 4]);
    });
    it("treats a degenerate span as one band", () => {
        expect(bandsCovered({ card: "c", rowStart: 5, rowSpan: 0 })).toEqual([5]);
    });
});
