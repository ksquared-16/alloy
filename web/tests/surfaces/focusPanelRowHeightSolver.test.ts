/**
 * ROWSTART IS A PLACEMENT COORDINATE, NOT A VISUAL ROW.
 *
 * PR #989 equalised cards whose `rowStart` matched, and on the live Firefly panel that
 * equalised nothing: column-aware placement advances each column independently, so the
 * operator's side-by-side pair is published as
 *
 *     business_process  colStart 1  colSpan 8   rowStart 1  rowSpan 2
 *     financials        colStart 9  colSpan 4   rowStart 2  rowSpan 2
 *
 * Two different `rowStart` values for one visual band. The measured result was 325px
 * beside 299px, and every same-rowStart test in the suite stayed green through it.
 *
 * So the fixture below is that exact published shape, and the rule under test is the
 * authored BAND, not the coordinate.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { solveRowHeights } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights";
import {
    columnChains,
    deriveVisualBands,
    type BandArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelVisualBands";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const readSrc = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const GAP = 10;
const area = (card: string, colStart: number, colSpan: number, rowStart: number, rowSpan: number): BandArea =>
    ({ card, colStart, colSpan, rowStart, rowSpan });

/** The published composition read off the live Work Unit panel that exposed the defect. */
const LIVE_FIREFLY: BandArea[] = [
    area("business_process", 1, 8, 1, 2),
    area("financials", 9, 4, 2, 2),
    area("attendance", 1, 6, 4, 2),
    area("children", 7, 6, 4, 4),
    area("health_safety", 1, 6, 6, 2),
    area("household", 7, 6, 8, 4),
];

const solve = (areas: BandArea[], heights: Record<string, number>) =>
    solveRowHeights({ areas, intrinsic: new Map(Object.entries(heights)), gapPx: GAP }).assigned;

describe("1 — same rowStart, same visual band", () => {
    it("draws both cards at the taller one's height", () => {
        const assigned = solve(
            [area("left", 1, 6, 1, 4), area("right", 7, 6, 1, 4)],
            { left: 237, right: 325 },
        );
        expect(assigned.get("left")).toBeCloseTo(325, 5);
        expect(assigned.get("right")).toBeCloseTo(325, 5);
    });
});

describe("2 — DIFFERENT rowStart, same visual band (the live failure)", () => {
    it("equalises business_process and financials even though rowStart is 1 and 2", () => {
        const assigned = solve(LIVE_FIREFLY, {
            business_process: 325,
            financials: 299,
            attendance: 124,
            children: 276,
            health_safety: 142,
            household: 267,
        });
        expect(assigned.get("business_process")).toBeCloseTo(325, 5);
        expect(assigned.get("financials")).toBeCloseTo(325, 5);
    });

    it("puts them in ONE band despite the staggered coordinate", () => {
        const [first] = deriveVisualBands(LIVE_FIREFLY);
        expect(first.areas.map((a) => a.card).sort()).toEqual(["business_process", "financials"]);
    });

    it("fails the way the shipped defect did if bands are read as rowStart equality", () => {
        // The disproof: grouping this fixture by literal rowStart yields two groups of one,
        // which is precisely why 325 stood beside 299 on the live surface.
        const byRowStart = new Set(LIVE_FIREFLY.slice(0, 2).map((a) => a.rowStart));
        expect(byRowStart.size).toBe(2);
    });
});

describe("3 — different visual bands stay independent", () => {
    it("never equalises across bands, so no card pays for a row it does not occupy", () => {
        const assigned = solve(
            [area("upper", 1, 12, 1, 2), area("lower", 1, 12, 3, 2)],
            { upper: 100, lower: 400 },
        );
        expect(assigned.get("upper")).toBeCloseTo(100, 5);
        expect(assigned.get("lower")).toBeCloseTo(400, 5);
    });

    it("keeps the 268px whitespace defect from returning — bands never span unoccupied rows", () => {
        const bands = deriveVisualBands([area("a", 1, 6, 1, 2), area("b", 1, 6, 3, 2)]);
        expect(bands).toHaveLength(2);
        expect(bands[0].rowEnd).toBe(3);
    });
});

describe("4 — two stacked cards against one spanning card", () => {
    const stacked = [area("upper", 1, 6, 1, 2), area("lower", 1, 6, 3, 2), area("tall", 7, 6, 1, 4)];

    it("stretches the spanning card to the full stack: top to top, bottom to bottom", () => {
        const assigned = solve(stacked, { upper: 180, lower: 260, tall: 200 });
        // 180 + gap + 260
        expect(assigned.get("tall")).toBeCloseTo(450, 5);
        expect(assigned.get("upper")).toBeCloseTo(180, 5);
        expect(assigned.get("lower")).toBeCloseTo(260, 5);
    });

    it("stretches the STACK instead when the spanning card is the taller one", () => {
        const assigned = solve(stacked, { upper: 180, lower: 260, tall: 500 });
        expect(assigned.get("tall")).toBeCloseTo(500, 5);
        // 50px short, split equally so the pair still bottoms out with the spanning card.
        expect(assigned.get("upper")).toBeCloseTo(205, 5);
        expect(assigned.get("lower")).toBeCloseTo(285, 5);
        const stackBottom =
            (assigned.get("upper") ?? 0) + GAP + (assigned.get("lower") ?? 0);
        expect(stackBottom).toBeCloseTo(assigned.get("tall") ?? 0, 5);
    });
});

describe("6 — the assignment can never become an intrinsic height", () => {
    it("returns the same answer when re-solved with its own output", () => {
        const heights = { business_process: 325, financials: 299, attendance: 124, children: 276, health_safety: 142, household: 267 };
        let current: Record<string, number> = heights;
        for (let pass = 0; pass < 5; pass += 1) {
            const assigned = solve(LIVE_FIREFLY, current);
            current = Object.fromEntries([...assigned.entries()]);
        }
        expect(current.business_process).toBeCloseTo(325, 5);
        expect(current.financials).toBeCloseTo(325, 5);
    });
});

describe("7 / 8 — the band follows the content, both ways", () => {
    const pair = [area("left", 1, 6, 1, 4), area("right", 7, 6, 2, 4)];

    it("grows the band when a card's content grows", () => {
        expect(solve(pair, { left: 200, right: 240 }).get("left")).toBeCloseTo(240, 5);
        expect(solve(pair, { left: 200, right: 480 }).get("left")).toBeCloseTo(480, 5);
    });

    it("SHRINKS the band when the card that set it shrinks", () => {
        // The seventeen-children-to-two defect: a band that can only grow keeps whitespace
        // nothing needs. `rowSpan` is 4 in both fixtures and prescribes nothing.
        expect(solve(pair, { left: 200, right: 480 }).get("right")).toBeCloseTo(480, 5);
        expect(solve(pair, { left: 90, right: 120 }).get("right")).toBeCloseTo(120, 5);
    });
});

describe("10 — a band is only ever spoken for once every card in it is measured", () => {
    it("assigns nothing to a band holding an unmeasured card", () => {
        const assigned = solve([area("left", 1, 6, 1, 4), area("right", 7, 6, 1, 4)], { left: 237 });
        expect(assigned.has("left")).toBe(false);
        expect(assigned.has("right")).toBe(false);
    });

    it("leaves other bands solvable, so a slow card cannot freeze the panel", () => {
        const assigned = solve(
            [area("a", 1, 6, 1, 2), area("b", 7, 6, 1, 2), area("slow", 1, 12, 4, 2)],
            { a: 100, b: 150 },
        );
        expect(assigned.get("a")).toBeCloseTo(150, 5);
        expect(assigned.has("slow")).toBe(false);
    });
});

describe("11 — one band interpretation, shared", () => {
    it("derives bands and chains from the placement engine's own primitives", () => {
        const src = readSrc("lib/adminV2/runtime/focusPanel/composition/focusPanelVisualBands.ts");
        expect(src).toContain("columnsOverlap");
        expect(src).toContain("packOrder");
        expect(src).toContain("focusPanelColumnAwareLayout");
    });

    it("gives builder and Work Unit one planner, because both resolve through one hook", () => {
        const hook = readSrc("components/admin/focusPanel/useColumnAwareStack.ts");
        expect(hook).toContain("solveRowHeights");
        // The grid is the only consumer of the hook, and both surfaces render the grid.
        const grid = readSrc("components/admin/focusPanel/FocusPanelCardGrid.tsx");
        expect(grid).toContain("useColumnAwareStack");
    });

    it("keeps the planner to ONE consumer, so a second reading cannot be introduced", () => {
        /*
         * PR #809 removed a fork where the builder read the published grid one way and the
         * Work Unit read it as lanes. This is the vertical equivalent, locked: band identity
         * reaches the product through exactly one chain.
         *
         *     focusPanelVisualBands + focusPanelRowHeights
         *         -> useColumnAwareStack        (the only importer)
         *             -> FocusPanelCardGrid     (the only caller)
         *                 -> builder AND runtime
         *
         * A second importer anywhere on that chain is a second interpretation, whatever it
         * computes, so it fails here rather than on a tenant's panel.
         */
        const roots = ["components", "app", "lib"];
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(resolve(repoRoot, dir), { withFileTypes: true })) {
                if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
                const rel = `${dir}/${entry.name}`;
                if (entry.isDirectory()) walk(rel);
                else if (/\.tsx?$/.test(entry.name)) files.push(rel);
            }
        };
        for (const root of roots) walk(root);

        const importersOf = (needle: string, self: string) =>
            files.filter((rel) => !rel.endsWith(self) && readSrc(rel).includes(needle));

        expect(importersOf("focusPanelVisualBands", "focusPanelVisualBands.ts")).toEqual([
            "lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights.ts",
        ]);
        expect(importersOf("solveRowHeights", "focusPanelRowHeights.ts")).toEqual([
            "components/admin/focusPanel/useColumnAwareStack.ts",
        ]);
        expect(importersOf("useColumnAwareStack", "useColumnAwareStack.ts")).toEqual([
            "components/admin/focusPanel/FocusPanelCardGrid.tsx",
        ]);
    });
});

describe("12 — the planner knows nothing about any card", () => {
    it("names no card, archetype or tenant", () => {
        for (const rel of [
            "lib/adminV2/runtime/focusPanel/composition/focusPanelVisualBands.ts",
            "lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights.ts",
        ]) {
            const body = readSrc(rel)
                .split("\n")
                .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("/*") && !line.trimStart().startsWith("//"))
                .join("\n");
            for (const name of ["financials", "business_process", "enrollment", "children", "household", "attendance"]) {
                expect(body.toLowerCase(), `${rel} mentions ${name}`).not.toContain(name);
            }
        }
    });

    it("keeps rowSpan out of the height, so an authored span prescribes nothing", () => {
        const wide = solve([area("only", 1, 12, 1, 12)], { only: 80 });
        expect(wide.get("only")).toBeCloseTo(80, 5);
    });
});

describe("column chains", () => {
    it("couples cards that share a column and separates cards that do not", () => {
        const chains = columnChains([area("a", 1, 6, 4, 2), area("b", 7, 6, 4, 4), area("c", 1, 6, 6, 2)]);
        const keyed = chains.map((chain) => chain.map((entry) => entry.card).sort().join("+")).sort();
        expect(keyed).toEqual(["a+c", "b"]);
    });

    it("folds two chains together when a later card bridges them", () => {
        const chains = columnChains([area("left", 1, 4, 1, 2), area("right", 9, 4, 1, 2), area("wide", 1, 12, 3, 2)]);
        expect(chains).toHaveLength(1);
    });
});
