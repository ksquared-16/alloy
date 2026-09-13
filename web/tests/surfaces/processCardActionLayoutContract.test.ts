/**
 * THE PROCESS CARD NEVER CUTS OFF ITS ACTIONS.
 *
 * The card's command row is laid out in CSS, so the contract lives in CSS and this holds the parts
 * of it that can be regressed silently. Geometry itself is proven where geometry exists — the
 * Playwright spec `process-card-action-layout.spec.ts` measures real boxes in a real browser. These
 * assertions exist because the defect they guard against reads as reasonable in review.
 *
 * What happened: the row was set to `flex-wrap: nowrap` with `overflow-x: auto` and the scrollbar
 * hidden, on the reasoning that a wrapped command reads as a separate, lesser group. The result was
 * a command sitting outside the visible box with nothing to say it existed — measured on a deployed
 * card at `scrollWidth 409` against `clientWidth 300`, and every one of six cards sampled across
 * four work units was clipped. A hidden horizontal rail is not a graceful fallback; it is invisible
 * data loss, and it was the normal case rather than an edge case.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS_RAW = readFileSync(
    resolve(__dirname, "../../app/adminV2/components/operationalCardsShared.css"),
    "utf8",
);

/**
 * The sheet with comments removed.
 *
 * Asserting a declaration is ABSENT while the rule's own comment explains why it was removed is a
 * real trap — the prose names `flex-wrap: nowrap` and `overflow-x: auto` precisely because they are
 * gone, and a naive match finds them and fails. Every assertion below reads stripped CSS, so it is
 * testing the rules rather than the reasoning beside them.
 */
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");

/** The Process card's own command-row rule, isolated from the rest of the sheet. */
function processActionRowRule(): string {
    const start = CSS.indexOf(".alloy-os-process__work-actions .alloy-os-currentwork__helpful-row {");
    expect(start, "process card action row rule not found").toBeGreaterThan(-1);
    return CSS.slice(start, CSS.indexOf("}", start) + 1);
}

/** The rule sizing the individual commands inside that row. */
function processActionItemRule(): string {
    const marker = ".alloy-os-process__work-actions .alloy-os-currentwork__helpful-row > .alloy-os-currentwork__helpful-action";
    const start = CSS.indexOf(marker);
    expect(start, "process card action item rule not found").toBeGreaterThan(-1);
    return CSS.slice(start, CSS.indexOf("}", start) + 1);
}

describe("process card action row wraps rather than hiding commands", () => {
    it("wraps", () => {
        expect(processActionRowRule()).toMatch(/flex-wrap:\s*wrap/);
    });

    it("does not restore the nowrap rail", () => {
        expect(processActionRowRule()).not.toMatch(/flex-wrap:\s*nowrap/);
    });

    it("does not scroll horizontally, so no command can sit in a hidden region", () => {
        const rule = processActionRowRule();
        expect(rule).not.toMatch(/overflow-x:\s*auto/);
        expect(rule).not.toMatch(/overflow-x:\s*scroll/);
    });

    it("never hides a scrollbar on this row — an invisible rail is the defect, not the fix", () => {
        // Scoped to this row: other surfaces may legitimately hide their own scrollbars.
        expect(CSS).not.toMatch(
            /\.alloy-os-process__work-actions[^{]*helpful-row::-webkit-scrollbar/,
        );
        expect(processActionRowRule()).not.toMatch(/scrollbar-width:\s*none/);
    });

    it("gives wrapped lines their own row gap so a second line is not flush against the first", () => {
        expect(processActionRowRule()).toMatch(/row-gap:\s*\d/);
    });

    it("keeps the safe alignment guard, because overflow past the start edge is unreachable", () => {
        expect(processActionRowRule()).toMatch(/justify-content:\s*safe\s+flex-end/);
    });
});

describe("process card commands size to their own labels", () => {
    it("sizes to content and never shrinks, so no label absorbs a neighbour's overflow", () => {
        expect(processActionItemRule()).toMatch(/flex:\s*0\s+0\s+auto/);
    });

    it("is bounded by the card, so a single over-wide command cannot render outside it", () => {
        expect(processActionItemRule()).toMatch(/max-width:\s*100%/);
    });

    it("keeps one line per action", () => {
        expect(processActionItemRule()).toMatch(/white-space:\s*nowrap/);
    });
});

describe("the layout carries no process-specific sizing", () => {
    it("names no business process or stage in the action layout rules", () => {
        // The card receives whatever the published process configured. A selector naming one process
        // would make the row correct for that process and quietly wrong for every other.
        //
        // `tour` is deliberately NOT on this list. `[data-work-tour-grouped]` appears in the item
        // rule, but it appears there to give the grouped control the SAME sizing as every other
        // command — the opposite of special-casing. The test below pins that down directly.
        const scoped = (processActionRowRule() + processActionItemRule()).toLowerCase();
        for (const forbidden of ["enrollment", "waitlist", "registration", "admission"]) {
            expect(scoped, `action layout must not special-case "${forbidden}"`).not.toContain(forbidden);
        }
    });

    it("sizes the grouped control identically to a plain command, not specially", () => {
        const rule = processActionItemRule();
        // One rule, three selectors: whatever sizing a plain command gets, the group gets.
        expect(rule).toContain(".alloy-os-currentwork__helpful-action");
        expect(rule).toContain("[data-work-tour-grouped=\"true\"]");
        // And nothing anywhere else in the sheet gives the grouped control its own width.
        const groupedWidthRules = CSS.split("}").filter(
            (block) =>
                block.includes("data-work-tour-grouped")
                && /(?:^|[;{\s])(?:width|min-width|flex-basis)\s*:/.test(block)
                && !block.includes(".alloy-os-currentwork__helpful-action"),
        );
        expect(groupedWidthRules, "grouped tour control must not carry its own width").toEqual([]);
    });

    it("fixes no width to a command count", () => {
        const scoped = processActionRowRule();
        expect(scoped).not.toMatch(/grid-template-columns:\s*repeat\(\s*[2-9]/);
        expect(scoped).not.toMatch(/width:\s*\d+px/);
    });
});
