/**
 * THE DATE CONTROL DRAWS ITS GLYPH; IT DOES NOT TYPE ONE.
 *
 * Measured mounted on deployed staging: the Add charge command rendered
 * `SERVICE DATE REQUIRED 📅`. An emoji renders in the platform's emoji font — coloured by the font
 * rather than by `currentColor`, with metrics that differ between macOS, Windows and Linux, and
 * untonable with the control it sits in. Across the 24 canonical workspace controls exactly two
 * drew a control glyph as an emoji, so this is the exception rather than the Alloy idiom.
 *
 * Asserted against CODE with comments stripped: the repair's own comment names the emoji it
 * replaced, and a guard that reads comments would pass on a file that still rendered one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
/** JSX comments and block comments both, or the prose below would answer for the markup. */
const executable = (src: string) =>
    src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

describe("AlloyDateInput", () => {
    const code = executable(read("components/workspace/AlloyDateInput.tsx"));

    it("renders no emoji", () => {
        expect(EMOJI.test(code), "the control's own markup carries no emoji").toBe(false);
    });

    it("draws the calendar as an inline svg that inherits the field's colour", () => {
        const button = code.slice(code.indexOf("alloy-date-input__calendar"));
        expect(button).toMatch(/<svg[\s\S]{0,400}stroke="currentColor"/);
        expect(button, "and it is hidden from assistive tech — the button already has a label").toMatch(
            /aria-hidden/,
        );
    });

    it("keeps the button's accessible name on the button, not on the glyph", () => {
        expect(code).toMatch(/aria-label=\{open \? "Hide date suggestions" : "Show date suggestions"\}/);
    });
});

describe("the surfaces that mount it", () => {
    /*
     * Scope statement, kept as a test so it stops being true silently. AlloyDateInput is shared by
     * name; today every consumer is a Financials surface, which is what made this repair
     * Financials-scoped in practice. A new consumer outside Financials means the next change to it
     * needs a cross-domain classification.
     */
    it("are all Financials today", () => {
        const consumers = [
            "components/admin/focusPanel/cards/FinancialsCard.tsx",
            "components/operationalCards/AddChargeCommand.tsx",
            "app/adminV2/financials/FinancialsResponsibilityPanel.tsx",
        ];
        for (const c of consumers) expect(read(c)).toContain("AlloyDateInput");
    });
});
