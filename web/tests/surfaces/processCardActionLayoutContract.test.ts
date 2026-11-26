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

describe("process card commands form one compact region, and hide nothing", () => {
    /*
     * THE CONTRACT CHANGED TWICE; THE FAILURE IT GUARDS AGAINST NEVER DID.
     *
     * Three rules have stood here, each correct at the width it was designed against:
     *
     *   1. `nowrap` + `overflow-x: auto` — CLIPPED. Measured `scrollWidth 409` against
     *      `clientWidth 300` on a deployed Waitlist card, hidden scrollbar, no signal the command
     *      existed. Six of six sampled cards.
     *   2. `flex-wrap: wrap`, content-sized — every command reachable, lines of differing width.
     *   3. one row of equal columns — consistent, and at the authored Business Process width it
     *      ellipsized labels mid-word. Legible clipping is still clipping, and equal columns CAUSE
     *      it: four commands take a quarter of the track each whether their labels fit or not.
     *
     * So wrapping returns, deliberately. The stagger objection that removed it was overruled by
     * product: a second line costs an operator nothing, a truncated label costs them the command.
     * Consistency is height and padding, never width.
     *
     * Every hiding mechanism the earlier rules forbade is still forbidden below. Only the means of
     * fitting changed, and geometry itself is proven where geometry exists —
     * `playwright/geometry/processCommandRegion.spec.ts` measures real boxes at 300/340/420/560/700px.
     */
    it("lays the commands out as a wrapping region, not a fixed row", () => {
        const rule = processActionRowRule();
        expect(rule).toMatch(/display:\s*flex/);
        expect(rule).toMatch(/flex-wrap:\s*wrap/);
    });

    it("does not restore the equal-column grid that forced truncation", () => {
        const rule = processActionRowRule();
        expect(rule).not.toMatch(/grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
        expect(rule).not.toMatch(/grid-auto-flow:\s*column/);
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
});

describe("process card commands size to their labels", () => {
    /*
     * `flex: 0 0 auto` keeps a command's own label whole instead of absorbing a neighbour's
     * overflow — the behaviour that produced "hange lead locatio". A command too wide for what is
     * left of the line takes the next line whole rather than being compressed into a truncation.
     *
     * The ellipsis below is NOT the sizing rule: bounded by `max-width: 100%`, it engages only when
     * a SINGLE label is wider than the entire region, which no configured command is today. Without
     * it such a label would render outside the card.
     */
    it("sizes to its label and never shrinks", () => {
        const rule = processActionItemRule();
        expect(rule).toMatch(/flex:\s*0 0 auto/);
        expect(rule).toMatch(/width:\s*auto/);
    });

    it("does not stretch every command to the same width", () => {
        // `(?<!-)` so `max-width: 100%` — the last-resort bound asserted below — does not match.
        expect(processActionItemRule()).not.toMatch(/(?<!-)width:\s*100%/);
    });

    it("stays inside the card even when one label exceeds the whole region", () => {
        const rule = processActionItemRule();
        expect(rule).toMatch(/max-width:\s*100%/);
        expect(rule).toMatch(/text-overflow:\s*ellipsis/);
        expect(rule).toMatch(/overflow:\s*hidden/);
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
