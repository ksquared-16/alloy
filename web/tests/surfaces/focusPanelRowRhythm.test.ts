/**
 * EVERY MODE SHARES THE ROW RHYTHM — INCLUDING WORK.
 *
 * Cards sharing a grid row equalize height, so a two-card row is 50/50 at one height, and where one
 * card spans two rows against two stacked beside it, the stack sums to the tall card. That is how
 * the grid is configured in /surfaces, and it is what the panel is expected to render.
 *
 * Work mode had been excluded — `:not(.alloy-os-focus-panel-grid--work)` on all three rules, on the
 * reasoning that it "evolves on its own cadence". The visible result was Enrollment and Financials,
 * a plain two-card row, sitting at different heights, because `align-items: start` lets every cell
 * size to its own content.
 *
 * THIS IS THE STATIC HALF, AND IT IS DELIBERATELY ONLY THAT. Whether the heights actually match is
 * geometry, and geometry is proven in the browser against the deployed surface — jsdom computes no
 * layout, so a test here asserting equal heights would pass on any CSS at all. What this owns is
 * the architecture contract: no mode may be carved out of the rhythm again without this failing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW = readFileSync(
    resolve(__dirname, "../../app/adminV2/components/alloyOsRuntime.css"),
    "utf8",
);

/*
 * Declarations only. These rules are heavily commented — including comments that quote the very
 * declarations they explain — so matching raw text finds `align-items` inside prose and reports a
 * carve-out that does not exist. The first cut of this test did exactly that.
 */
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

/** The rules that establish the rhythm, as they must appear for every mode. */
const RHYTHM_RULES = [
    ".alloy-os-focus-panel-grid {\n  align-items: stretch;\n}",
    ".alloy-os-focus-panel-grid .alloy-os-focus-panel-grid__cell {\n  display: flex;\n}",
    ".alloy-os-focus-panel-grid .alloy-os-focus-panel-grid__cell > * {\n  width: 100%;\n}",
];

describe("focus panel row rhythm", () => {
    it.each(RHYTHM_RULES)("declares the rhythm unconditionally: %s", (rule) => {
        expect(CSS).toContain(rule);
    });

    it("carves no mode out of it", () => {
        /*
         * The exact regression: the three rhythm rules were each qualified with `:not(--work)`.
         *
         * Asserted against the RHYTHM declarations only. Other `:not(--work)` rules are legitimate
         * and stay — card borders and canvas gutters differ by mode by design. What must never be
         * mode-scoped again is height alignment itself, so the check is "no excluded selector
         * declares `align-items`", not "no excluded selector exists".
         */
        const excludedBlocks = [...CSS.matchAll(/\.alloy-os-focus-panel-grid:not\([^)]*\)[^{]*\{([^}]*)\}/g)]
            .map((m) => m[1]);
        const withAlignment = excludedBlocks.filter((body) => /align-items\s*:/.test(body));
        expect(
            withAlignment,
            "a mode excluded from height alignment renders masonry-staggered cards; excluding work "
            + "mode is what made Enrollment and Financials sit at different heights",
        ).toEqual([]);
    });

    it("does not re-establish `start` on the grid itself", () => {
        // `align-items: start` in the base rule silently wins for any mode the rhythm misses.
        const base = CSS.slice(CSS.indexOf(".alloy-os-focus-panel-grid {"));
        const baseRule = base.slice(0, base.indexOf("}"));
        expect(baseRule).not.toContain("align-items: start");
    });
});
