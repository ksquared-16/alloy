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

describe("process card action row is one row, and hides no command", () => {
    /*
     * THE CONTRACT CHANGED; THE FAILURE IT GUARDS AGAINST DID NOT.
     *
     * This block used to assert `flex-wrap: wrap`. Wrapping was itself a correction — it replaced a
     * `nowrap` + `overflow-x: auto` rail that CLIPPED, measured at `scrollWidth 409` against
     * `clientWidth 300` on a deployed Waitlist card, with a hidden scrollbar and so no signal the
     * command existed. Six of six sampled cards were clipped.
     *
     * Wrapping kept every command reachable and produced a stagger instead: three commands on one
     * line, two on the next, each sized to its own label. Equal columns give one row without
     * bringing the clipping back — a wide set ellipsizes INSIDE each column, which is visible and
     * hoverable, rather than disappearing past an edge.
     *
     * So the assertions below still forbid every hiding mechanism the old rule forbade. Only the
     * means of fitting changed.
     */
    it("lays the commands out as one row of columns", () => {
        const rule = processActionRowRule();
        expect(rule).toMatch(/display:\s*grid/);
        expect(rule).toMatch(/grid-auto-flow:\s*column/);
    });

    it("gives every command the same share, so the row reads as one set", () => {
        expect(processActionRowRule()).toMatch(/grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
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

describe("process card commands fill their column rather than sizing to their labels", () => {
    /*
     * `flex: 0 0 auto` was right for a wrapping flex row: it kept a command's label whole instead of
     * absorbing a neighbour's overflow, the behaviour that produced "hange lead locatio". In a grid
     * of equal columns the column owns the width, so the command fills it and truncates visibly
     * inside its own share — which is the consistency the row was missing.
     */
    it("fills its column", () => {
        expect(processActionItemRule()).toMatch(/width:\s*100%/);
    });

    it("truncates visibly rather than widening its column or spilling", () => {
        const rule = processActionItemRule();
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
